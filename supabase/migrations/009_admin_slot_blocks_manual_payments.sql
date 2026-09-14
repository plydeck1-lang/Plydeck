-- Admin slot controls and offline/manual payment confirmations.
-- No payment gateway is used. Every receipt is recorded by an administrator.
begin;

create table if not exists public.blocked_slots(
  pool_id uuid not null references public.pools(id) on delete cascade,
  slot_no integer not null check(slot_no between 1 and 100),
  reason text not null,
  blocked_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(pool_id,slot_no)
);

create table if not exists public.manual_payments(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  stage text not null check(stage in('booking','confirmation','final')),
  amount bigint not null check(amount>0),
  method text not null check(method in('bank_transfer','upi','cash','cheque','other')),
  reference text,
  note text,
  received_at timestamptz not null,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(order_id,stage)
);

create index if not exists manual_payments_order on public.manual_payments(order_id,received_at);
alter table public.blocked_slots enable row level security;
alter table public.manual_payments enable row level security;
grant all on public.blocked_slots,public.manual_payments to service_role;

create or replace function public.manage_blocked_slot(
  p_admin uuid,p_pool uuid,p_slot integer,p_block boolean,p_reason text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools;
begin
  if not exists(select 1 from admins where user_id=p_admin) then raise exception 'Administrator required.'; end if;
  select * into p from pools where id=p_pool for update;
  if p.id is null then raise exception 'Pool not found.'; end if;
  if p.status not in('draft','live','confirming') then raise exception 'Slots can only be changed before pool confirmation.'; end if;
  if p_slot<1 or p_slot>p.total_slots then raise exception 'Invalid slot number.'; end if;
  if p_block then
    if length(trim(p_reason))<3 then raise exception 'Enter a reason for blocking this slot.'; end if;
    if exists(select 1 from slot_allocations where pool_id=p_pool and slot_no=p_slot) then raise exception 'A reserved slot cannot be blocked.'; end if;
    if exists(select 1 from waitlist where pool_id=p_pool and offered_slot=p_slot and status='offered') then raise exception 'This slot has an active waiting-list offer.'; end if;
    insert into blocked_slots(pool_id,slot_no,reason,blocked_by)
      values(p_pool,p_slot,trim(p_reason),p_admin)
      on conflict(pool_id,slot_no) do update set reason=excluded.reason,blocked_by=excluded.blocked_by,created_at=now();
  else
    delete from blocked_slots where pool_id=p_pool and slot_no=p_slot;
  end if;
  update pools set updated_at=clock_timestamp() where id=p_pool;
  insert into audit_log(actor,action,entity_id,payload)
    values(p_admin,case when p_block then 'block_slot' else 'unblock_slot' end,p_pool,jsonb_build_object('slot',p_slot,'reason',trim(p_reason)));
  return jsonb_build_object('updated',true,'blocked',p_block,'slot',p_slot);
end;$$;

create or replace function public.record_manual_payment(
  p_admin uuid,p_order uuid,p_stage text,p_method text,p_reference text,p_note text,p_received_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare o orders; expected bigint; booking bigint; confirmation bigint; final_amount bigint; payment manual_payments;
begin
  if not exists(select 1 from admins where user_id=p_admin) then raise exception 'Administrator required.'; end if;
  select * into o from orders where id=p_order for update;
  if o.id is null then raise exception 'Order not found.'; end if;
  if o.status in('cancelled','expired','dispatched') then raise exception 'This order cannot receive a payment confirmation.'; end if;
  if p_stage not in('booking','confirmation','final') then raise exception 'Invalid payment stage.'; end if;
  if p_method not in('bank_transfer','upi','cash','cheque','other') then raise exception 'Invalid payment method.'; end if;
  if length(trim(p_reference))<2 then raise exception 'Enter a transaction or receipt reference.'; end if;
  if p_received_at is null or p_received_at>now()+interval '5 minutes' then raise exception 'Invalid payment date.'; end if;
  booking=round((o.quote->>'total')::bigint*0.10);
  confirmation=round((o.quote->>'total')::bigint*0.40);
  final_amount=(o.quote->>'total')::bigint-booking-confirmation;
  if p_stage='booking' then expected=booking;
  elsif p_stage='confirmation' then
    if not exists(select 1 from manual_payments where order_id=o.id and stage='booking') then raise exception 'Confirm the 10 percent booking payment first.'; end if;
    expected=confirmation;
  else
    if not exists(select 1 from manual_payments where order_id=o.id and stage='confirmation') then raise exception 'Confirm the 40 percent payment first.'; end if;
    if not exists(select 1 from pools where id=o.pool_id and status='qc_ready') then raise exception 'Final payment can be confirmed only after QC.'; end if;
    expected=final_amount;
  end if;
  insert into manual_payments(order_id,stage,amount,method,reference,note,received_at,recorded_by)
    values(o.id,p_stage,expected,p_method,trim(p_reference),nullif(trim(p_note),''),p_received_at,p_admin)
    returning * into payment;
  update orders set
    paid_amount=(select coalesce(sum(amount),0) from manual_payments where order_id=o.id),
    status=case p_stage when 'booking' then 'booked' when 'confirmation' then 'confirmed' else 'paid' end,
    payment_due_at=null
    where id=o.id;
  insert into audit_log(actor,action,entity_id,payload)
    values(p_admin,'manual_payment_confirmed',o.id,to_jsonb(payment));
  return to_jsonb(payment);
exception when unique_violation then
  raise exception 'This payment stage is already confirmed.';
end;$$;

create or replace function public.reserve_slots(
  p_user uuid,p_pool uuid,p_slots integer[],p_primary integer,p_secondary integer,p_quote jsonb,p_version timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools;s shipments;o orders;prof profiles;n integer;replacement_booking boolean:=false;
begin
  select * into p from pools where id=p_pool for update;
  if p.id is null then raise exception 'Pool not found.'; end if;
  select * into s from shipments where id=p.shipment_id for update;
  if p.updated_at is distinct from p_version then raise exception 'Pool changed. Refresh the quotation.'; end if;
  replacement_booking:=p.status='qc_ready';
  if not replacement_booking and (p.status<>'live' or p.closes_at<=now()) then raise exception 'Pool is closed for new bookings.'; end if;
  select * into prof from profiles where id=p_user;
  if prof.id is null then raise exception 'Complete your GST and billing details first.'; end if;
  n:=coalesce(array_length(p_slots,1),0);
  if n<1 or n>p.total_slots or (select count(distinct v) from unnest(p_slots)v)<>n or exists(select 1 from unnest(p_slots)v where v<1 or v>p.total_slots) then raise exception 'Invalid slot selection.'; end if;
  if p_primary<>70 or p_secondary<>30 or p_primary<>(p.config->>'default_primary')::int or p_secondary<>(p.config->>'default_secondary')::int then raise exception 'This pool accepts only the fixed 100-sheet slot composition.'; end if;
  if exists(select 1 from slot_allocations where pool_id=p_pool and slot_no=any(p_slots)) then raise exception 'A selected slot was just reserved. Choose another slot.'; end if;
  if exists(select 1 from blocked_slots where pool_id=p_pool and slot_no=any(p_slots)) then raise exception 'A selected slot is blocked by PLYDECK operations.'; end if;
  if exists(select 1 from waitlist where pool_id=p_pool and offered_slot=any(p_slots) and status='offered' and user_id<>p_user) then raise exception 'A selected slot is held for a waiting-list offer.'; end if;
  if replacement_booking and (n<>1 or not exists(select 1 from waitlist w join vacated_slots v on v.pool_id=w.pool_id and v.slot_no=w.offered_slot where w.pool_id=p.id and w.user_id=p_user and w.status='offered' and w.offered_slot=p_slots[1] and v.primary_qty=70 and v.secondary_qty=30)) then raise exception 'A valid waiting-list offer for the fixed slot is required.'; end if;
  if (p_quote->>'slot_count')::int<>n or (p_quote->>'primary_qty')::int<>70 or (p_quote->>'secondary_qty')::int<>30 or (p_quote->>'sheets')::int<>(100*n) or p_quote->>'terms_version'<>'2026-09-direct-1' then raise exception 'Quotation mismatch.'; end if;
  insert into orders(pool_id,user_id,slot_numbers,primary_qty,secondary_qty,quote,profile_snapshot,paid_amount,expires_at,replacement,payment_due_at,status)
    values(p_pool,p_user,p_slots,70,30,p_quote,to_jsonb(prof),0,null,replacement_booking,null,'booked') returning * into o;
  insert into slot_allocations(pool_id,slot_no,order_id) select p_pool,v,o.id from unnest(p_slots)v;
  if projected_weight(s.id)>s.payload_kg then raise exception 'The fixed slots exceed the shared truck payload.'; end if;
  update waitlist set status='accepted',offer_expires_at=null where pool_id=p_pool and user_id=p_user and status='offered' and offered_slot=any(p_slots);
  insert into audit_log(actor,action,entity_id,payload) values(p_user,'reserve_slots',o.id,jsonb_build_object('pool_id',p_pool,'slots',p_slots));
  return to_jsonb(o);
end;$$;

create or replace function public.transition_pool(p_admin uuid,p_pool uuid,p_event text,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools;reserved_count integer;blocked_count integer;
begin
  if not exists(select 1 from admins where user_id=p_admin) then raise exception 'Administrator required.'; end if;
  select * into p from pools where id=p_pool for update;
  if p.id is null then raise exception 'Pool not found.'; end if;
  select count(*) into reserved_count from slot_allocations where pool_id=p.id;
  select count(*) into blocked_count from blocked_slots where pool_id=p.id;
  if p_event='publish' then
    if p.status<>'draft' or p.closes_at<=now() then raise exception 'Only a current draft can be published.'; end if;
    if (p.config->>'bond') ilike '%pending%' or (p.config->>'tolerance') ilike '%pending%' or (p.config->>'specification') ilike '%pending%' then raise exception 'Replace pending factory specifications before publishing.'; end if;
    if not exists(select 1 from categories where id=p.category_id and active) then raise exception 'Choose a visible category.'; end if;
    if projected_weight(p.shipment_id)>(select payload_kg from shipments where id=p.shipment_id) then raise exception 'Shipment is overweight.'; end if;
    update pools set status='live',updated_at=clock_timestamp() where id=p.id;
  elsif p_event in('confirm','request_confirmation') then
    if p.status not in('live','confirming') or reserved_count+blocked_count<>p.total_slots then raise exception 'Every slot must be reserved or blocked before pool confirmation.'; end if;
    if exists(select 1 from orders o where o.pool_id=p.id and exists(select 1 from slot_allocations a where a.order_id=o.id) and o.paid_amount<round((o.quote->>'total')::bigint*0.50)) then raise exception 'Every reserved order requires manually confirmed payment of 50 percent.'; end if;
    update pools set status='confirmed',confirmed_at=coalesce(confirmed_at,now()),delivery_target=coalesce(delivery_target,now()+interval '7 days'),payment_due_at=null,updated_at=clock_timestamp() where id=p.id;
  elsif p_event='qc' then
    if p.status<>'confirmed' or length(trim(p_note))<20 then raise exception 'A confirmed pool and detailed QC report are required.'; end if;
    update pools set status='qc_ready',qc_report=p_note,payment_due_at=null,updated_at=clock_timestamp() where id=p.id;
  elsif p_event='dispatch' then
    if p.status<>'qc_ready' then raise exception 'QC is required before dispatch.'; end if;
    if exists(select 1 from orders o where o.pool_id=p.id and exists(select 1 from slot_allocations a where a.order_id=o.id) and o.paid_amount<>(o.quote->>'total')::bigint) then raise exception 'Every reserved order requires manually confirmed full payment before dispatch.'; end if;
    update pools set status='dispatched',updated_at=clock_timestamp() where id=p.id;
    update orders set status='dispatched',payment_due_at=null where pool_id=p.id and status not in('cancelled','expired');
  elsif p_event='cancel' then
    if p.status in('cancelled','dispatched') or length(trim(p_note))<3 then raise exception 'This pool cannot be cancelled or cancellation reason is missing.'; end if;
    update pools set status='cancelled',payment_due_at=null,updated_at=clock_timestamp() where id=p.id;
    update orders set status='cancelled',payment_due_at=null where pool_id=p.id and status not in('cancelled','expired');
    delete from slot_allocations where pool_id=p.id;
    delete from blocked_slots where pool_id=p.id;
    update waitlist set status='expired',offer_expires_at=null where pool_id=p.id and status in('waiting','offered');
  else raise exception 'Unknown pool action.';
  end if;
  insert into audit_log(actor,action,entity_id,payload) values(p_admin,p_event,p.id,jsonb_build_object('note',p_note));
  return jsonb_build_object('updated',true);
end;$$;

create or replace function public.offer_next(p_admin uuid,p_pool uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools;candidate waitlist;n integer;
begin
  if not exists(select 1 from admins where user_id=p_admin)then raise exception 'Administrator required.';end if;
  select * into p from pools where id=p_pool for update;
  if p.status<>'live' or p.closes_at<now()then raise exception 'Offers require an open pool.';end if;
  select v into n from generate_series(1,p.total_slots)v where not exists(select 1 from slot_allocations a where a.pool_id=p.id and a.slot_no=v) and not exists(select 1 from blocked_slots b where b.pool_id=p.id and b.slot_no=v) and not exists(select 1 from waitlist w where w.pool_id=p.id and w.offered_slot=v and w.status='offered') order by v limit 1;
  if n is null then raise exception 'No free slots.';end if;
  select * into candidate from waitlist where pool_id=p.id and status='waiting' order by created_at,id limit 1 for update;
  if candidate.id is null then raise exception 'No waiting buyers.';end if;
  update waitlist set status='offered',offered_slot=n,offer_expires_at=least(now()+interval '24 hours',p.closes_at) where id=candidate.id;
  insert into audit_log(actor,action,entity_id,payload)values(p_admin,'offer_next',p.id,jsonb_build_object('waitlist_id',candidate.id,'slot',n));
  return jsonb_build_object('offered',true,'waitlist_id',candidate.id,'slot',n);
end;$$;

do $$declare fn record;begin for fn in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('manage_blocked_slot','record_manual_payment','reserve_slots','transition_pool','offer_next') loop execute format('revoke all on function %s from public,anon,authenticated',fn.sig);execute format('grant execute on function %s to service_role',fn.sig);end loop;end;$$;

commit;
