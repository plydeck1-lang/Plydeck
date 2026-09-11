-- PLYDECK deployment fixes. Run once AFTER 003_whatsapp_notifications.sql.
-- Existing records and previous migrations are preserved.
begin;
alter table public.whatsapp_messages add column retryable boolean not null default true;
alter table public.whatsapp_messages add column dedupe_key text;
drop index if exists public.whatsapp_message_event_once;
create unique index whatsapp_dedupe_key on public.whatsapp_messages(dedupe_key) where dedupe_key is not null;

create or replace function public.queue_whatsapp_event(p_order uuid,p_pool uuid,p_user uuid,p_purpose text,p_template text,p_vars jsonb) returns void language plpgsql security definer set search_path=public as $$
declare prof profiles;tmpl whatsapp_templates;phone text;event_key text;begin
 select * into prof from profiles where id=p_user;
 if prof.id is null or not prof.whatsapp_opt_in then return;end if;
 select * into tmpl from whatsapp_templates where name=p_template and enabled;
 if tmpl.name is null then return;end if;
 phone=regexp_replace(prof.phone,'[^0-9]','','g');
 if length(phone)=10 then phone='91'||phone;end if;
 if phone !~ '^91[6-9][0-9]{9}$' then return;end if;
 event_key=md5(coalesce(p_order::text,'')||':'||coalesce(p_pool::text,'')||':'||p_user::text||':'||p_purpose||':'||coalesce(p_vars,'{}'::jsonb)::text);
 insert into whatsapp_messages(order_id,pool_id,user_id,recipient_phone,purpose,template_name,template_language,variables,dedupe_key)
 values(p_order,p_pool,p_user,phone,p_purpose,p_template,tmpl.language,coalesce(p_vars,'{}'::jsonb),event_key)
 on conflict(dedupe_key) where dedupe_key is not null do nothing;
end;$$;

create or replace function public.queue_order_whatsapp_events() returns trigger language plpgsql security definer set search_path=public as $$
declare p pools;booking bigint;confirmation bigint;total bigint;begin
 select * into p from pools where id=new.pool_id;
 booking=(new.quote->'stages'->>'booking')::bigint;confirmation=(new.quote->'stages'->>'confirmation')::bigint;total=(new.quote->>'total')::bigint;
 if tg_op='UPDATE' and old.paid_amount < booking and new.paid_amount >= booking then
  perform queue_whatsapp_event(new.id,new.pool_id,new.user_id,'booking_received','plydeck_booking_received',jsonb_build_object('order_ref',left(new.id::text,8),'pool_code',p.code,'amount',to_char(booking/100.0,'FM999999990.00')));
 end if;
 if tg_op='UPDATE' and old.paid_amount < booking+confirmation and new.paid_amount >= booking+confirmation then
  perform queue_whatsapp_event(new.id,new.pool_id,new.user_id,'confirmation_received','plydeck_confirmation_received',jsonb_build_object('order_ref',left(new.id::text,8),'city',p.city,'delivery_date',coalesce(to_char(p.delivery_target at time zone 'Asia/Kolkata','DD Mon YYYY'),'to be scheduled')));
 end if;
 if tg_op='UPDATE' and old.paid_amount < total and new.paid_amount >= total then
  perform queue_whatsapp_event(new.id,new.pool_id,new.user_id,'payment_received','plydeck_payment_received',jsonb_build_object('order_ref',left(new.id::text,8),'amount',to_char((new.paid_amount-old.paid_amount)/100.0,'FM999999990.00'),'outstanding','₹0'));
 end if;
 if tg_op='UPDATE' and old.status is distinct from new.status and new.status='dispatched' then
  perform queue_whatsapp_event(new.id,new.pool_id,new.user_id,'dispatched','plydeck_dispatched',jsonb_build_object('order_ref',left(new.id::text,8),'city',p.city));
 end if;
 if tg_op='UPDATE' and old.default_notice_at is null and new.default_notice_at is not null then
  perform queue_whatsapp_event(new.id,new.pool_id,new.user_id,'default_notice','plydeck_default_notice',jsonb_build_object('order_ref',left(new.id::text,8),'amount',to_char(greatest((case when p.status='confirming' then booking+confirmation else total end)-new.paid_amount,0)/100.0,'FM999999990.00'),'due_at',to_char((new.default_notice_at+interval '48 hours') at time zone 'Asia/Kolkata','DD Mon YYYY HH24:MI')||' IST'));
 end if;
 if tg_op='UPDATE' and old.status is distinct from new.status and new.status='defaulted' then
  perform queue_whatsapp_event(new.id,new.pool_id,new.user_id,'order_defaulted','plydeck_order_defaulted',jsonb_build_object('order_ref',left(new.id::text,8)));
 end if;
 return new;
end;$$;

drop trigger if exists queue_order_whatsapp on public.orders;
create trigger queue_order_whatsapp after update of paid_amount,status,default_notice_at on public.orders for each row execute function public.queue_order_whatsapp_events();

create or replace function public.queue_pool_whatsapp_events() returns trigger language plpgsql security definer set search_path=public as $$
declare o record;booking bigint;confirmation bigint;amount bigint;begin
 if old.status is not distinct from new.status then return new;end if;
 for o in select distinct orders.* from orders join slot_allocations a on a.order_id=orders.id where orders.pool_id=new.id loop
  booking=(o.quote->'stages'->>'booking')::bigint;confirmation=(o.quote->'stages'->>'confirmation')::bigint;
  if new.status='confirming' then
   amount=greatest(0,booking+confirmation-o.paid_amount);if amount=0 then continue;end if;
   perform queue_whatsapp_event(o.id,new.id,o.user_id,'confirmation_due','plydeck_confirmation_due',jsonb_build_object('order_ref',left(o.id::text,8),'pool_code',new.code,'amount',to_char(amount/100.0,'FM999999990.00'),'due_at',to_char(new.payment_due_at at time zone 'Asia/Kolkata','DD Mon YYYY HH24:MI')||' IST'));
  elsif new.status='confirmed' then
   perform queue_whatsapp_event(o.id,new.id,o.user_id,'pool_confirmed','plydeck_pool_confirmed',jsonb_build_object('order_ref',left(o.id::text,8),'pool_code',new.code,'city',new.city,'delivery_date',to_char(new.delivery_target at time zone 'Asia/Kolkata','DD Mon YYYY')));
  elsif new.status='qc_ready' then
   amount=greatest(0,(o.quote->>'total')::bigint-o.paid_amount);if amount=0 then continue;end if;
   perform queue_whatsapp_event(o.id,new.id,o.user_id,'qc_due','plydeck_qc_due',jsonb_build_object('order_ref',left(o.id::text,8),'pool_code',new.code,'amount',to_char(amount/100.0,'FM999999990.00'),'due_at',to_char(new.payment_due_at at time zone 'Asia/Kolkata','DD Mon YYYY HH24:MI')||' IST'));
  elsif new.status='cancelled' then
   perform queue_whatsapp_event(o.id,new.id,o.user_id,'pool_cancelled','plydeck_pool_cancelled',jsonb_build_object('order_ref',left(o.id::text,8),'pool_code',new.code,'reason','cancellation recorded by PLYDECK; contact support for the recorded reason'));
  end if;
 end loop;
 return new;
end;$$;

drop trigger if exists queue_pool_whatsapp on public.pools;
create trigger queue_pool_whatsapp after update of status on public.pools for each row execute function public.queue_pool_whatsapp_events();

create or replace function public.queue_refund_whatsapp_events() returns trigger language plpgsql security definer set search_path=public as $$
declare o orders;begin
 if new.status is not distinct from old.status then return new;end if;
 select * into o from orders where id=new.order_id;
 perform queue_whatsapp_event(o.id,o.pool_id,o.user_id,'refund_update:'||new.id::text||':'||new.status,'plydeck_refund_update',jsonb_build_object('order_ref',left(o.id::text,8),'amount',to_char(new.amount/100.0,'FM999999990.00'),'status',replace(new.status,'_',' ')));
 return new;
end;$$;
drop trigger if exists queue_refund_whatsapp on public.refunds;
create trigger queue_refund_whatsapp after update of status on public.refunds for each row execute function public.queue_refund_whatsapp_events();

create or replace function public.queue_waitlist_whatsapp_events() returns trigger language plpgsql security definer set search_path=public as $$
declare p pools;begin
 if new.status<>'offered' or old.status='offered' then return new;end if;
 select * into p from pools where id=new.pool_id;
 perform queue_whatsapp_event(null,new.pool_id,new.user_id,'waitlist_offer','plydeck_waitlist_offer',jsonb_build_object('pool_code',p.code,'slot',coalesce(new.offered_slot,0)::text,'expires_at',to_char(new.offer_expires_at at time zone 'Asia/Kolkata','DD Mon YYYY HH24:MI')||' IST'));
 return new;
end;$$;
drop trigger if exists queue_waitlist_whatsapp on public.waitlist;
create trigger queue_waitlist_whatsapp after update of status on public.waitlist for each row execute function public.queue_waitlist_whatsapp_events();


-- Stops withdrawn consent, changed phones and stale payment prompts at send time.
create function public.whatsapp_sendable(p_id uuid) returns boolean language plpgsql stable security definer set search_path=public as $$
declare m whatsapp_messages;o orders;p pools;prof profiles;begin
 select * into m from whatsapp_messages where id=p_id;
 if m.id is null then return false;end if;
 select * into prof from profiles where id=m.user_id;
 if prof.id is null or not prof.whatsapp_opt_in or '91'||prof.phone<>m.recipient_phone then return false;end if;
 if not exists(select 1 from whatsapp_templates where name=m.template_name and enabled) then return false;end if;
 select * into p from pools where id=m.pool_id;
 if m.purpose='waitlist_offer' then
  return exists(select 1 from waitlist w where w.pool_id=m.pool_id and w.user_id=m.user_id and w.status='offered' and w.offer_expires_at>now() and w.offered_slot::text=m.variables->>'slot');
 end if;
 if m.purpose in('confirmation_due','qc_due','default_notice') then
  select * into o from orders where id=m.order_id;
  if o.status not in('booked','confirmed','paid') or not exists(select 1 from slot_allocations where order_id=o.id) then return false;end if;
  if m.purpose='confirmation_due' then return p.status='confirming' and o.paid_amount<(o.quote->'stages'->>'booking')::bigint+(o.quote->'stages'->>'confirmation')::bigint;end if;
  if m.purpose='qc_due' then return p.status='qc_ready' and o.paid_amount<(o.quote->>'total')::bigint;end if;
  return (p.status='confirming' and o.paid_amount<(o.quote->'stages'->>'booking')::bigint+(o.quote->'stages'->>'confirmation')::bigint) or (p.status='qc_ready' and o.paid_amount<(o.quote->>'total')::bigint);
 end if;
 return true;
end;$$;

create or replace function public.claim_whatsapp_messages(p_limit integer default 20) returns setof public.whatsapp_messages language plpgsql security definer set search_path=public as $$
begin
 -- A timed-out send may already have reached Meta: do not automatically resend it.
 update whatsapp_messages set status='failed',retryable=false,error_code='delivery_unknown',error_message='Interrupted send. Check Meta before retrying to avoid a duplicate.' where status='sending' and last_attempt_at<now()-interval '10 minutes';
 update whatsapp_messages set status='skipped',retryable=false,error_code='no_longer_eligible',error_message='Consent withdrawn, phone changed, template disabled or payment/offer no longer due.' where status in('queued','failed') and retryable and not whatsapp_sendable(id);
 return query
 with candidates as (select id from whatsapp_messages where status in('queued','failed') and retryable and attempts<5 and (last_attempt_at is null or last_attempt_at<now()-interval '5 minutes') order by created_at for update skip locked limit greatest(1,least(p_limit,20)))
 update whatsapp_messages m set status='sending',attempts=m.attempts+1,last_attempt_at=now() from candidates c where m.id=c.id returning m.*;
end;$$;

-- Correct notices queued by the earlier QC calculation; do not change sent messages.
update whatsapp_messages m set variables=jsonb_set(m.variables,'{amount}',to_jsonb(to_char(greatest(0,(o.quote->>'total')::bigint-o.paid_amount)/100.0,'FM999999990.00'))) from orders o where m.order_id=o.id and m.purpose='qc_due' and m.status in('queued','failed');

-- Atomic webhook application: either every status/inbound record is persisted,
-- or no event hash is committed, so provider retries can safely recover.
create function public.apply_whatsapp_webhook(p_hash text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare e jsonb;c jsonb;s jsonb;m jsonb;msg whatsapp_messages;stamp timestamptz;body_text text;uid uuid;inserted integer;begin
 insert into whatsapp_webhook_events(event_hash,payload) values(p_hash,p_payload) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return jsonb_build_object('received',true,'duplicate',true);end if;
 for e in select value from jsonb_array_elements(coalesce(p_payload->'entry','[]'::jsonb)) loop
  for c in select value from jsonb_array_elements(coalesce(e->'changes','[]'::jsonb)) loop
   for s in select value from jsonb_array_elements(coalesce(c->'value'->'statuses','[]'::jsonb)) loop
    if s->>'status' not in('sent','delivered','read','failed') then continue;end if;
    select * into msg from whatsapp_messages where provider_message_id=s->>'id' or (id::text=s->>'biz_opaque_callback_data' and provider_message_id is null) for update;
    if msg.id is null then continue;end if;
    stamp=case when coalesce(s->>'timestamp','') ~ '^[0-9]{1,12}$' then to_timestamp((s->>'timestamp')::double precision) else now() end;
    update whatsapp_messages set provider_message_id=coalesce(provider_message_id,s->>'id'),
      status=case when msg.status='read' then 'read' when msg.status='delivered' and s->>'status'<>'read' then 'delivered' else s->>'status' end,
      sent_at=coalesce(sent_at,stamp),
      delivered_at=case when s->>'status' in('delivered','read') then coalesce(delivered_at,stamp) else delivered_at end,
      read_at=case when s->>'status'='read' then coalesce(read_at,stamp) else read_at end,
      retryable=false,
      error_code=case when s->>'status'='failed' and msg.status not in('delivered','read') then coalesce(s->'errors'->0->>'code','provider_error') else null end,
      error_message=case when s->>'status'='failed' and msg.status not in('delivered','read') then coalesce(s->'errors'->0->>'title','Delivery failed; review in Meta.') else null end
    where id=msg.id;
   end loop;
   for m in select value from jsonb_array_elements(coalesce(c->'value'->'messages','[]'::jsonb)) loop
    if nullif(m->>'id','') is null or nullif(m->>'from','') is null then continue;end if;
    uid=null;
    if (select count(*) from profiles where '91'||phone=m->>'from')=1 then select id into uid from profiles where '91'||phone=m->>'from';end if;
    body_text=coalesce(m->'text'->>'body',m->'button'->>'text',m->'interactive'->'button_reply'->>'title');
    insert into whatsapp_inbound_messages(provider_message_id,user_id,sender_phone,message_type,body,payload) values(m->>'id',uid,m->>'from',coalesce(m->>'type','unknown'),body_text,m) on conflict(provider_message_id) do nothing;
    if upper(trim(coalesce(body_text,''))) in('STOP','UNSUBSCRIBE') then update profiles set whatsapp_opt_in=false,updated_at=now() where '91'||phone=m->>'from';end if;
   end loop;
  end loop;
 end loop;
 return jsonb_build_object('received',true);
end;$$;

-- Trigger functions are server-only, as are all notification RPCs.
do $$declare fn record;begin for fn in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('queue_whatsapp_event','queue_order_whatsapp_events','queue_pool_whatsapp_events','queue_refund_whatsapp_events','queue_waitlist_whatsapp_events','claim_whatsapp_messages','whatsapp_sendable','apply_whatsapp_webhook')loop execute format('revoke all on function %s from public,anon,authenticated',fn.sig);execute format('grant execute on function %s to service_role',fn.sig);end loop;end;$$;

update whatsapp_templates set body_preview='PLYDECK booking {{1}} received for {{2}}. INR {{3}} is paid. Open My orders in the PLYDECK app for your payment milestones.',updated_at=now() where name='plydeck_booking_received';
update whatsapp_templates set body_preview='Order {{1}} in pool {{2}} has reached the confirmation payment stage. INR {{3}} is due by {{4}}. Log in to PLYDECK and open My orders to pay.',updated_at=now() where name='plydeck_confirmation_due';
update whatsapp_templates set body_preview='40% payment received for order {{1}}. Hub: {{2}}. Delivery target: {{3}}. Final pool confirmation is shown in My orders.',updated_at=now() where name='plydeck_confirmation_received';
update whatsapp_templates set body_preview='Order {{1}} in pool {{2}} is confirmed for {{3}}. Target hub delivery: {{4}}. QC and cleared final payment are required before dispatch.',updated_at=now() where name='plydeck_pool_confirmed';
update whatsapp_templates set body_preview='Order {{1}} in pool {{2}} has completed QC. INR {{3}} is due by {{4}} before dispatch. Log in to PLYDECK to review QC and pay.',updated_at=now() where name='plydeck_qc_due';
update whatsapp_templates set body_preview='Payment received for order {{1}}: INR {{2}}. Outstanding balance: {{3}}. See My orders in PLYDECK.',updated_at=now() where name='plydeck_payment_received';
update whatsapp_templates set body_preview='Order {{1}} for {{2}} has been marked dispatched. Contact PLYDECK for handoff details.',updated_at=now() where name='plydeck_dispatched';
update whatsapp_templates set body_preview='Order {{1}} in pool {{2}}: {{3}}. Amounts collected for undelivered goods are refundable. Contact PLYDECK for the refund status.',updated_at=now() where name='plydeck_pool_cancelled';
update whatsapp_templates set body_preview='Refund update for order {{1}}: INR {{2}}, status {{3}}. Review and processing do not mean bank settlement is complete.',updated_at=now() where name='plydeck_refund_update';
update whatsapp_templates set body_preview='A slot is available in pool {{1}}: slot {{2}}. Offer expires {{3}}. Log in to PLYDECK to review and reserve.',updated_at=now() where name='plydeck_waitlist_offer';
update whatsapp_templates set body_preview='Action needed for order {{1}}. INR {{2}} remains due by {{3}}. Log in or contact PLYDECK before the cure period ends.',updated_at=now() where name='plydeck_default_notice';
update whatsapp_templates set body_preview='Order {{1}} was released after the recorded payment cure period. Contact PLYDECK for the refund or recovery decision.',updated_at=now() where name='plydeck_order_defaulted';
commit;
