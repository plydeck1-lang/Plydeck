-- PLYDECK direct slot booking overlay.
-- Existing payment/refund tables are retained for historical audit, but no active
-- workflow creates payment attempts, charges, holds or refunds.
begin;

create or replace function public.reserve_slots(
  p_user uuid,
  p_pool uuid,
  p_slots integer[],
  p_primary integer,
  p_secondary integer,
  p_quote jsonb,
  p_version timestamptz
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  p pools;
  s shipments;
  o orders;
  prof profiles;
  n integer;
  replacement_booking boolean := false;
begin
  select * into p from pools where id=p_pool for update;
  if p.id is null then raise exception 'Pool not found.'; end if;
  select * into s from shipments where id=p.shipment_id for update;
  if p.updated_at is distinct from p_version then raise exception 'Pool changed. Refresh the quotation.'; end if;
  replacement_booking := p.status='qc_ready';
  if not replacement_booking and (p.status<>'live' or p.closes_at<=now()) then
    raise exception 'Pool is closed for new bookings.';
  end if;
  select * into prof from profiles where id=p_user;
  if prof.id is null then raise exception 'Complete your GST and billing details first.'; end if;
  n := coalesce(array_length(p_slots,1),0);
  if n<1 or n>p.total_slots or (select count(distinct v) from unnest(p_slots) v)<>n
     or exists(select 1 from unnest(p_slots) v where v<1 or v>p.total_slots) then
    raise exception 'Invalid slot selection.';
  end if;
  if p_primary<>70 or p_secondary<>30
     or p_primary<>(p.config->>'default_primary')::int
     or p_secondary<>(p.config->>'default_secondary')::int then
    raise exception 'This pool accepts only the fixed 100-sheet slot composition.';
  end if;
  if exists(select 1 from slot_allocations where pool_id=p_pool and slot_no=any(p_slots)) then
    raise exception 'A selected slot was just reserved. Choose another slot.';
  end if;
  if exists(select 1 from waitlist where pool_id=p_pool and offered_slot=any(p_slots)
            and status='offered' and user_id<>p_user) then
    raise exception 'A selected slot is held for a waiting-list offer.';
  end if;
  if replacement_booking and (n<>1 or not exists(
    select 1 from waitlist w join vacated_slots v on v.pool_id=w.pool_id and v.slot_no=w.offered_slot
    where w.pool_id=p.id and w.user_id=p_user and w.status='offered'
      and w.offered_slot=p_slots[1] and v.primary_qty=70 and v.secondary_qty=30
  )) then
    raise exception 'A valid waiting-list offer for the fixed slot is required.';
  end if;
  if (p_quote->>'slot_count')::int<>n
     or (p_quote->>'primary_qty')::int<>70
     or (p_quote->>'secondary_qty')::int<>30
     or (p_quote->>'sheets')::int<>(100*n)
     or p_quote->>'terms_version'<>'2026-09-direct-1' then
    raise exception 'Quotation mismatch.';
  end if;
  insert into orders(pool_id,user_id,slot_numbers,primary_qty,secondary_qty,quote,profile_snapshot,
                     paid_amount,expires_at,replacement,payment_due_at,status)
  values(p_pool,p_user,p_slots,70,30,p_quote,to_jsonb(prof),0,null,replacement_booking,null,'booked')
  returning * into o;
  insert into slot_allocations(pool_id,slot_no,order_id)
    select p_pool,v,o.id from unnest(p_slots) v;
  if projected_weight(s.id)>s.payload_kg then
    raise exception 'The fixed slots exceed the shared truck payload.';
  end if;
  update waitlist set status='accepted',offer_expires_at=null
    where pool_id=p_pool and user_id=p_user and status='offered' and offered_slot=any(p_slots);
  insert into audit_log(actor,action,entity_id,payload)
    values(p_user,'reserve_slots',o.id,jsonb_build_object('pool_id',p_pool,'slots',p_slots));
  return to_jsonb(o);
end;$$;

create or replace function public.transition_pool(p_admin uuid,p_pool uuid,p_event text,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools; n integer;
begin
  if not exists(select 1 from admins where user_id=p_admin) then raise exception 'Administrator required.'; end if;
  select * into p from pools where id=p_pool for update;
  if p.id is null then raise exception 'Pool not found.'; end if;
  select count(*) into n from slot_allocations where pool_id=p.id;
  if p_event='publish' then
    if p.status<>'draft' or p.closes_at<=now() then raise exception 'Only a current draft can be published.'; end if;
    if (p.config->>'bond') ilike '%pending%' or (p.config->>'tolerance') ilike '%pending%'
       or (p.config->>'specification') ilike '%pending%' then raise exception 'Replace pending factory specifications before publishing.'; end if;
    if not exists(select 1 from categories where id=p.category_id and active) then raise exception 'Choose a visible category.'; end if;
    if projected_weight(p.shipment_id)>(select payload_kg from shipments where id=p.shipment_id) then raise exception 'Shipment is overweight.'; end if;
    update pools set status='live',updated_at=clock_timestamp() where id=p.id;
  elsif p_event in('confirm','request_confirmation') then
    if p.status not in('live','confirming') or n<>p.total_slots then raise exception 'Every slot must be directly reserved before pool confirmation.'; end if;
    update pools set status='confirmed',confirmed_at=coalesce(confirmed_at,now()),delivery_target=coalesce(delivery_target,now()+interval '7 days'),payment_due_at=null,updated_at=clock_timestamp() where id=p.id;
  elsif p_event='qc' then
    if p.status<>'confirmed' or length(trim(p_note))<20 then raise exception 'A confirmed pool and detailed QC report are required.'; end if;
    update pools set status='qc_ready',qc_report=p_note,payment_due_at=null,updated_at=clock_timestamp() where id=p.id;
  elsif p_event='dispatch' then
    if p.status<>'qc_ready' or n<>p.total_slots then raise exception 'QC and all slots are required before dispatch.'; end if;
    update pools set status='dispatched',updated_at=clock_timestamp() where id=p.id;
    update orders set status='dispatched',payment_due_at=null where pool_id=p.id and status not in('cancelled','expired');
  elsif p_event='cancel' then
    if p.status in('cancelled','dispatched') or length(trim(p_note))<3 then raise exception 'This pool cannot be cancelled or cancellation reason is missing.'; end if;
    update pools set status='cancelled',payment_due_at=null,updated_at=clock_timestamp() where id=p.id;
    update orders set status='cancelled',payment_due_at=null where pool_id=p.id and status not in('cancelled','expired');
    delete from slot_allocations where pool_id=p.id;
    update waitlist set status='expired',offer_expires_at=null where pool_id=p.id and status in('waiting','offered');
  else raise exception 'Unknown pool action.';
  end if;
  insert into audit_log(actor,action,entity_id,payload) values(p_admin,p_event,p.id,jsonb_build_object('note',p_note));
  return jsonb_build_object('updated',true);
end;$$;

create or replace function public.cancel_order(p_user uuid,p_order uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o orders; p pools;
begin
  select * into o from orders where id=p_order and user_id=p_user for update;
  if o.id is null then raise exception 'Order not found.'; end if;
  select * into p from pools where id=o.pool_id for update;
  if o.status in('cancelled','expired','dispatched') then raise exception 'Order is already closed.'; end if;
  if p.status in('live','confirming') then
    update orders set status='cancelled',payment_due_at=null where id=o.id;
    delete from slot_allocations where order_id=o.id;
    if p.status='confirming' then
      update pools set status='live',updated_at=clock_timestamp() where id=p.id;
    end if;
  else
    update orders set status='cancellation_requested' where id=o.id;
  end if;
  insert into audit_log(actor,action,entity_id,payload) values(p_user,'cancel_order',o.id,jsonb_build_object('pool_id',p.id));
  return jsonb_build_object('requested',true);
end;$$;

-- Direct booking notifications. Keep templates/tables for audit and optional WhatsApp,
-- but disable payment/default/refund notices and remove stage-dependent trigger logic.
update whatsapp_templates set enabled=false,updated_at=now()
 where purpose in('confirmation_due','confirmation_received','qc_due','payment_received','default_notice','order_defaulted','refund_update');
update whatsapp_templates set body_preview='PLYDECK reservation {{1}} confirmed for {{2}}. Order value including GST: INR {{3}}. Your selected slots are locked.',updated_at=now()
 where name='plydeck_booking_received';
update whatsapp_templates set body_preview='Pool {{1}} is confirmed for order {{2}} in {{3}}. Target hub delivery: {{4}}.',updated_at=now()
 where name='plydeck_pool_confirmed';
update whatsapp_templates set body_preview='Order {{1}} has completed QC for pool {{2}}. We will share dispatch details next.',updated_at=now()
 where name='plydeck_qc_due';
update whatsapp_templates set body_preview='Order {{1}} for {{2}} has been dispatched. Contact PLYDECK for handoff details.',updated_at=now()
 where name='plydeck_dispatched';
update whatsapp_templates set body_preview='Pool {{1}} was cancelled because {{3}}. Your reservation has been released.',updated_at=now()
 where name='plydeck_pool_cancelled';

create or replace function public.queue_order_whatsapp_events() returns trigger
language plpgsql security definer set search_path=public as $$
declare p pools; total bigint;
begin
  select * into p from pools where id=new.pool_id;
  if tg_op='INSERT' and new.status='booked' then
    total=coalesce((new.quote->>'total')::bigint,0);
    perform queue_whatsapp_event(new.id,new.pool_id,new.user_id,'booking_received','plydeck_booking_received',jsonb_build_object('order_ref',left(new.id::text,8),'pool_code',p.code,'amount',to_char(total/100.0,'FM999999990.00')));
  elsif tg_op='UPDATE' and old.status is distinct from new.status and new.status='dispatched' then
    perform queue_whatsapp_event(new.id,new.pool_id,new.user_id,'dispatched','plydeck_dispatched',jsonb_build_object('order_ref',left(new.id::text,8),'city',p.city));
  end if;
  return new;
end;$$;
drop trigger if exists queue_order_whatsapp on public.orders;
create trigger queue_order_whatsapp after insert or update of status on public.orders for each row execute function public.queue_order_whatsapp_events();

create or replace function public.queue_pool_whatsapp_events() returns trigger
language plpgsql security definer set search_path=public as $$
declare o record; total bigint;
begin
  if old.status is not distinct from new.status then return new; end if;
  for o in select distinct orders.* from orders join slot_allocations a on a.order_id=orders.id where orders.pool_id=new.id loop
    if new.status='confirmed' then
      perform queue_whatsapp_event(o.id,new.id,o.user_id,'pool_confirmed','plydeck_pool_confirmed',jsonb_build_object('order_ref',left(o.id::text,8),'pool_code',new.code,'city',new.city,'delivery_date',to_char(new.delivery_target,'DD Mon YYYY')));
    elsif new.status='qc_ready' then
      perform queue_whatsapp_event(o.id,new.id,o.user_id,'qc_ready','plydeck_qc_due',jsonb_build_object('order_ref',left(o.id::text,8),'pool_code',new.code));
    elsif new.status='cancelled' then
      perform queue_whatsapp_event(o.id,new.id,o.user_id,'pool_cancelled','plydeck_pool_cancelled',jsonb_build_object('order_ref',left(o.id::text,8),'pool_code',new.code,'reason','supplier, QC or demand conditions'));
    end if;
  end loop;
  return new;
end;$$;
drop trigger if exists queue_pool_whatsapp on public.pools;
create trigger queue_pool_whatsapp after update of status on public.pools for each row execute function public.queue_pool_whatsapp_events();

do $$declare fn record;begin
  for fn in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in('prepare_payment','apply_payment','prepare_refund','finish_refund') loop
    execute format('revoke all on function %s from public,anon,authenticated',fn.sig);
  end loop;
end;$$;
revoke all on function public.reserve_slots(uuid,uuid,integer[],integer,integer,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.reserve_slots(uuid,uuid,integer[],integer,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.transition_pool(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.cancel_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_slots(uuid,uuid,integer[],integer,integer,jsonb,timestamptz) to service_role;
grant execute on function public.transition_pool(uuid,uuid,text,text) to service_role;
grant execute on function public.cancel_order(uuid,uuid) to service_role;
commit;
