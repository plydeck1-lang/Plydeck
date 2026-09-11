-- PLYDECK Phase 2: consent-based WhatsApp notification outbox.
-- Templates must be created and approved in Meta with the same names.
alter table public.profiles add column if not exists whatsapp_opt_in boolean not null default false;

create table if not exists public.whatsapp_templates(
 name text primary key,
 purpose text unique not null,
 language text not null default 'en_US',
 enabled boolean not null default true,
 body_preview text not null,
 variables text[] not null default '{}',
 updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages(
 id uuid primary key default gen_random_uuid(),
 order_id uuid references public.orders(id) on delete set null,
 pool_id uuid references public.pools(id) on delete set null,
 user_id uuid references auth.users(id) on delete set null,
 recipient_phone text not null,
 purpose text not null,
 template_name text not null references public.whatsapp_templates(name),
 template_language text not null default 'en_US',
 variables jsonb not null default '{}'::jsonb,
 status text not null default 'queued' check(status in('queued','sending','sent','delivered','read','failed','skipped')),
 provider_message_id text unique,
 error_code text,
 error_message text,
 attempts integer not null default 0,
 last_attempt_at timestamptz,
 sent_at timestamptz,
 delivered_at timestamptz,
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists whatsapp_messages_user on public.whatsapp_messages(user_id,created_at desc);
create index if not exists whatsapp_messages_status on public.whatsapp_messages(status,created_at);
create unique index if not exists whatsapp_message_event_once on public.whatsapp_messages(order_id,purpose) where order_id is not null and status not in('failed','skipped');

create table if not exists public.whatsapp_webhook_events(
 event_hash text primary key,
 payload jsonb not null,
 created_at timestamptz not null default now()
);
create table if not exists public.whatsapp_inbound_messages(
 id uuid primary key default gen_random_uuid(),
 provider_message_id text unique not null,
 user_id uuid references auth.users(id) on delete set null,
 sender_phone text not null,
 message_type text not null,
 body text,
 payload jsonb not null,
 created_at timestamptz not null default now()
);

alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_webhook_events enable row level security;
alter table public.whatsapp_inbound_messages enable row level security;
create policy own_whatsapp_messages on public.whatsapp_messages for select to authenticated using(user_id=auth.uid());
grant select on public.whatsapp_messages to authenticated;
grant all on public.whatsapp_templates,public.whatsapp_messages,public.whatsapp_webhook_events,public.whatsapp_inbound_messages to service_role;

insert into public.whatsapp_templates(name,purpose,language,body_preview,variables) values
 ('plydeck_booking_received','booking_received','en_US','PLYDECK booking {{order_ref}} received for {{pool_code}}. {{amount}} is paid. We will notify you when the pool reaches confirmation.','{order_ref,pool_code,amount}'),
 ('plydeck_confirmation_due','confirmation_due','en_US','Pool {{pool_code}} is confirmed for your order {{order_ref}}. The 40% confirmation instalment of {{amount}} is due by {{due_at}}.','{order_ref,pool_code,amount,due_at}'),
 ('plydeck_confirmation_received','confirmation_received','en_US','40% payment received for {{order_ref}}. Target delivery to {{city}} is {{delivery_date}}, subject to QC and final payment.','{order_ref,city,delivery_date}'),
 ('plydeck_pool_confirmed','pool_confirmed','en_US','Good news: pool {{pool_code}} is confirmed. Your order {{order_ref}} is in production for {{city}}. Target hub delivery: {{delivery_date}}.','{order_ref,pool_code,city,delivery_date}'),
 ('plydeck_qc_due','qc_due','en_US','QC is complete for {{pool_code}} / {{order_ref}}. The final 50% instalment of {{amount}} is due by {{due_at}} before dispatch.','{order_ref,pool_code,amount,due_at}'),
 ('plydeck_payment_received','payment_received','en_US','Payment received for {{order_ref}}. Amount received: {{amount}}. Outstanding balance: {{outstanding}}.','{order_ref,amount,outstanding}'),
 ('plydeck_dispatched','dispatched','en_US','Order {{order_ref}} has been dispatched from the {{city}} hub. Our team will share the delivery handoff details separately.','{order_ref,city}'),
 ('plydeck_pool_cancelled','pool_cancelled','en_US','Pool {{pool_code}} was cancelled because {{reason}}. Any eligible amount collected for order {{order_ref}} is in the refund review queue.','{order_ref,pool_code,reason}'),
 ('plydeck_refund_update','refund_update','en_US','Refund update for {{order_ref}}: {{amount}} is marked {{status}}. The original payment method may take additional bank settlement time.','{order_ref,amount,status}'),
 ('plydeck_waitlist_offer','waitlist_offer','en_US','A PLYDECK slot is available for you: {{pool_code}}, slot {{slot}}. Offer expires {{expires_at}}. Log in to review and reserve.','{pool_code,slot,expires_at}'),
 ('plydeck_default_notice','default_notice','en_US','Action needed for order {{order_ref}}: {{amount}} remains due by {{due_at}}. Please log in or contact PLYDECK before the cure period ends.','{order_ref,amount,due_at}'),
 ('plydeck_order_defaulted','order_defaulted','en_US','Order {{order_ref}} was released after the payment cure period. Please contact PLYDECK for the recorded refund or recovery decision.','{order_ref}')
on conflict(name) do update set body_preview=excluded.body_preview,variables=excluded.variables,updated_at=now();

create or replace function public.queue_whatsapp_event(p_order uuid,p_pool uuid,p_user uuid,p_purpose text,p_template text,p_vars jsonb) returns void language plpgsql security definer set search_path=public as $$
declare prof profiles;tmpl whatsapp_templates;phone text;begin
 select * into prof from profiles where id=p_user;
 if prof.id is null or coalesce(prof.whatsapp_opt_in,false) is not true or nullif(trim(prof.phone),'') is null then return;end if;
 select * into tmpl from whatsapp_templates where name=p_template and enabled;
 if tmpl.name is null then return;end if;
 phone=regexp_replace(prof.phone,'[^0-9]','','g');
 if length(phone)=10 then phone='91'||phone;end if;
 if phone !~ '^[1-9][0-9]{9,14}$' then return;end if;
 insert into whatsapp_messages(order_id,pool_id,user_id,recipient_phone,purpose,template_name,template_language,variables)
 values(p_order,p_pool,p_user,phone,p_purpose,p_template,coalesce(tmpl.language,'en_US'),coalesce(p_vars,'{}'::jsonb))
 on conflict (order_id,purpose) where order_id is not null and status not in('failed','skipped') do nothing;
end;$$;

create or replace function public.queue_order_whatsapp_events() returns trigger language plpgsql security definer set search_path=public as $$
declare p pools;booking bigint;confirmation bigint;total bigint;begin
 select * into p from pools where id=new.pool_id;
 booking=(new.quote->'stages'->>'booking')::bigint;confirmation=(new.quote->'stages'->>'confirmation')::bigint;total=(new.quote->>'total')::bigint;
 if tg_op='UPDATE' and old.paid_amount < booking and new.paid_amount >= booking then
  perform queue_whatsapp_event(new.id,new.pool_id,new.user_id,'booking_received','plydeck_booking_received',jsonb_build_object('order_ref',left(new.id::text,8),'pool_code',p.code,'amount',to_char(booking/100.0,'FM999999990.00')));
 end if;
 if tg_op='UPDATE' and old.paid_amount < booking+confirmation and new.paid_amount >= booking+confirmation then
  perform queue_whatsapp_event(new.id,new.pool_id,new.user_id,'confirmation_received','plydeck_confirmation_received',jsonb_build_object('order_ref',left(new.id::text,8),'city',p.city,'delivery_date',coalesce(to_char(p.delivery_target,'DD Mon YYYY'),'to be scheduled')));
 end if;
 if tg_op='UPDATE' and old.paid_amount < total and new.paid_amount >= total then
  perform queue_whatsapp_event(new.id,new.pool_id,new.user_id,'payment_received','plydeck_payment_received',jsonb_build_object('order_ref',left(new.id::text,8),'amount',to_char((new.paid_amount-old.paid_amount)/100.0,'FM999999990.00'),'outstanding','₹0'));
 end if;
 if tg_op='UPDATE' and old.status is distinct from new.status and new.status='dispatched' then
  perform queue_whatsapp_event(new.id,new.pool_id,new.user_id,'dispatched','plydeck_dispatched',jsonb_build_object('order_ref',left(new.id::text,8),'city',p.city));
 end if;
 if tg_op='UPDATE' and old.default_notice_at is null and new.default_notice_at is not null then
  perform queue_whatsapp_event(new.id,new.pool_id,new.user_id,'default_notice','plydeck_default_notice',jsonb_build_object('order_ref',left(new.id::text,8),'amount',to_char(greatest(total-new.paid_amount,0)/100.0,'FM999999990.00'),'due_at',to_char(new.default_notice_at+interval '48 hours','DD Mon YYYY HH24:MI')));
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
   amount=greatest(0,booking+confirmation-o.paid_amount);
   perform queue_whatsapp_event(o.id,new.id,o.user_id,'confirmation_due','plydeck_confirmation_due',jsonb_build_object('order_ref',left(o.id::text,8),'pool_code',new.code,'amount',to_char(amount/100.0,'FM999999990.00'),'due_at',to_char(new.payment_due_at,'DD Mon YYYY HH24:MI')));
  elsif new.status='confirmed' then
   perform queue_whatsapp_event(o.id,new.id,o.user_id,'pool_confirmed','plydeck_pool_confirmed',jsonb_build_object('order_ref',left(o.id::text,8),'pool_code',new.code,'city',new.city,'delivery_date',to_char(new.delivery_target,'DD Mon YYYY')));
  elsif new.status='qc_ready' then
   amount=greatest(0,(o.quote->'stages'->>'dispatch')::bigint-o.paid_amount);
   perform queue_whatsapp_event(o.id,new.id,o.user_id,'qc_due','plydeck_qc_due',jsonb_build_object('order_ref',left(o.id::text,8),'pool_code',new.code,'amount',to_char(amount/100.0,'FM999999990.00'),'due_at',to_char(new.payment_due_at,'DD Mon YYYY HH24:MI')));
  elsif new.status='cancelled' then
   perform queue_whatsapp_event(o.id,new.id,o.user_id,'pool_cancelled','plydeck_pool_cancelled',jsonb_build_object('order_ref',left(o.id::text,8),'pool_code',new.code,'reason','supplier, QC or demand conditions'));
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
 perform queue_whatsapp_event(o.id,o.pool_id,o.user_id,'refund_update','plydeck_refund_update',jsonb_build_object('order_ref',left(o.id::text,8),'amount',to_char(new.amount/100.0,'FM999999990.00'),'status',new.status));
 return new;
end;$$;
drop trigger if exists queue_refund_whatsapp on public.refunds;
create trigger queue_refund_whatsapp after update of status on public.refunds for each row execute function public.queue_refund_whatsapp_events();

create or replace function public.queue_waitlist_whatsapp_events() returns trigger language plpgsql security definer set search_path=public as $$
declare p pools;begin
 if new.status<>'offered' or old.status='offered' then return new;end if;
 select * into p from pools where id=new.pool_id;
 perform queue_whatsapp_event(null,new.pool_id,new.user_id,'waitlist_offer','plydeck_waitlist_offer',jsonb_build_object('pool_code',p.code,'slot',coalesce(new.offered_slot,0)::text,'expires_at',to_char(new.offer_expires_at,'DD Mon YYYY HH24:MI')));
 return new;
end;$$;
drop trigger if exists queue_waitlist_whatsapp on public.waitlist;
create trigger queue_waitlist_whatsapp after update of status on public.waitlist for each row execute function public.queue_waitlist_whatsapp_events();

create or replace function public.claim_whatsapp_messages(p_limit integer default 20) returns setof public.whatsapp_messages language plpgsql security definer set search_path=public as $$
begin
 return query
 with candidates as (select id from whatsapp_messages where status in('queued','failed') and attempts<5 and (last_attempt_at is null or last_attempt_at<now()-interval '5 minutes') order by created_at for update skip locked limit greatest(1,least(p_limit,100)))
 update whatsapp_messages m set status='sending',attempts=m.attempts+1,last_attempt_at=now() from candidates c where m.id=c.id returning m.*;
end;$$;

revoke all on function public.queue_whatsapp_event(uuid,uuid,uuid,text,text,jsonb),public.claim_whatsapp_messages(integer) from public,anon,authenticated;
grant execute on function public.queue_whatsapp_event(uuid,uuid,uuid,text,text,jsonb),public.claim_whatsapp_messages(integer) to service_role;
