-- PLYDECK: ONE-FILE INSTALLER FOR A NEW, EMPTY SUPABASE PROJECT ONLY.
-- Includes migrations 001, 002, 003, 004 and the seed. Run the ENTIRE file once.
-- Do NOT run the individual migrations afterwards; they are already included.
-- Existing installations: follow supabase/README_SQL.md instead.
-- No credentials or administrator assignments are included.
begin;
do $$begin
 if to_regclass('public.pools') is not null or to_regclass('public.profiles') is not null or to_regclass('public.orders') is not null then
  raise exception 'Existing tables found. Use the upgrade instructions instead of the new-project installer.';
 end if;
end;$$;

-- Included file: 001_plydeck.sql
-- PLYDECK Phase 1. Apply once in a NEW dedicated Supabase project.
-- All money in order quotes / payments is integer paise. Config rates are rupees.
create table public.admins(user_id uuid primary key references auth.users(id) on delete cascade,created_at timestamptz not null default now());
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,business_name text not null,contact_name text not null,phone text not null,gstin text not null,address text not null,city text not null,state text not null,pincode text not null,email text,updated_at timestamptz not null default now());
create table public.categories(id uuid primary key default gen_random_uuid(),name text not null,slug text unique not null,description text not null,image_url text not null,active boolean not null default true);
create table public.shipments(id uuid primary key default gen_random_uuid(),name text not null,origin text not null,destination text not null,payload_kg numeric not null check(payload_kg>0),packing_kg numeric not null check(packing_kg>=0 and packing_kg<payload_kg));
create table public.pools(id uuid primary key default gen_random_uuid(),code text unique not null,name text not null,category_id uuid not null references public.categories(id),shipment_id uuid not null references public.shipments(id),city text not null,image_url text not null,status text not null default 'draft' check(status in('draft','live','confirming','confirmed','qc_ready','dispatched','cancelled')),total_slots integer not null check(total_slots between 1 and 100),closes_at timestamptz not null,config jsonb not null,confirmed_at timestamptz,delivery_target timestamptz,qc_report text,payment_due_at timestamptz,updated_at timestamptz not null default clock_timestamp());
create table public.orders(id uuid primary key default gen_random_uuid(),pool_id uuid not null references public.pools(id),user_id uuid not null references auth.users(id),slot_numbers integer[] not null,primary_qty integer not null,secondary_qty integer not null,status text not null default 'holding',quote jsonb not null,profile_snapshot jsonb not null,paid_amount bigint not null default 0 check(paid_amount>=0),expires_at timestamptz,default_notice_at timestamptz,default_notice text,created_at timestamptz not null default now());
create index orders_user on public.orders(user_id,created_at desc);
create index orders_pool on public.orders(pool_id);
create table public.slot_allocations(pool_id uuid not null references public.pools(id),slot_no integer not null,order_id uuid not null references public.orders(id),primary key(pool_id,slot_no));
create table public.payment_attempts(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),stage text not null check(stage in('booking','confirmation','dispatch')),amount bigint not null check(amount>0),razorpay_order_id text unique,status text not null default 'creating',created_at timestamptz not null default now(),unique(order_id,stage));
create table public.payments(id text primary key,attempt_id uuid not null references public.payment_attempts(id),order_id uuid not null references public.orders(id),amount bigint not null check(amount>0),accepted boolean not null,created_at timestamptz not null default now());
create table public.waitlist(id uuid primary key default gen_random_uuid(),pool_id uuid not null references public.pools(id),user_id uuid not null references auth.users(id),status text not null default 'waiting' check(status in('waiting','offered','accepted','expired')),offered_slot integer,offer_expires_at timestamptz,created_at timestamptz not null default now(),unique(pool_id,user_id));
create unique index waiting_slot_offer on public.waitlist(pool_id,offered_slot) where status='offered';
create table public.refunds(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),amount bigint not null default 0 check(amount>=0),status text not null default 'review',reason text not null,decision_note text,decided_by uuid references auth.users(id),created_at timestamptz not null default now());
create table public.refund_tasks(id uuid primary key default gen_random_uuid(),refund_id uuid not null references public.refunds(id),payment_id text not null references public.payments(id),amount bigint not null check(amount>0),provider_refund_id text unique,status text not null default 'pending',unique(refund_id,payment_id));
create table public.audit_log(id uuid primary key default gen_random_uuid(),actor uuid references auth.users(id),action text not null,entity_id uuid,payload jsonb,created_at timestamptz not null default now());
create table public.rate_limits(user_id uuid not null,action text not null,bucket timestamptz not null,count integer not null,primary key(user_id,action,bucket));

alter table public.admins enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.shipments enable row level security;
alter table public.pools enable row level security;
alter table public.orders enable row level security;
alter table public.slot_allocations enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payments enable row level security;
alter table public.waitlist enable row level security;
alter table public.refunds enable row level security;
alter table public.refund_tasks enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;
create policy own_admin on public.admins for select to authenticated using(user_id=auth.uid());
create policy own_profile on public.profiles for select to authenticated using(id=auth.uid());
create policy own_order on public.orders for select to authenticated using(user_id=auth.uid());
create policy own_waitlist on public.waitlist for select to authenticated using(user_id=auth.uid());
-- No client mutation policies. Mutations go through authenticated server routes.
grant select on public.admins,public.profiles,public.orders,public.waitlist to authenticated;
grant all on public.admins,public.profiles,public.categories,public.shipments,public.pools,public.orders,public.slot_allocations,public.payment_attempts,public.payments,public.waitlist,public.refunds,public.refund_tasks,public.audit_log,public.rate_limits to service_role;

create function public.check_rate_limit(p_user uuid,p_action text,p_max integer) returns void language plpgsql security definer set search_path=public as $$
declare n integer;begin
 insert into rate_limits values(p_user,p_action,date_trunc('minute',now()),1) on conflict(user_id,action,bucket) do update set count=rate_limits.count+1 returning count into n;
 if n>p_max then raise exception 'Too many requests. Please wait a minute.';end if;
end;$$;

create function public.expire_holds() returns void language plpgsql security definer set search_path=public as $$
begin
 -- Lock and release expired unpaid reservations. A captured payment arriving later
 -- is recorded for refund, never used to take a slot from another buyer.
 with expired as(update orders set status='expired' where status='holding' and paid_amount=0 and expires_at<now() returning id)
 delete from slot_allocations where order_id in(select id from expired);
 update waitlist set status='expired' where status='offered' and offer_expires_at<now();
end;$$;

create function public.projected_weight(p_shipment uuid) returns numeric language sql stable security definer set search_path=public as $$
 select s.packing_kg+coalesce(sum(
   coalesce((select sum((o.quote->>'weight_kg')::numeric) from orders o where o.pool_id=p.id and exists(select 1 from slot_allocations a where a.order_id=o.id)),0)
   +(p.total_slots-(select count(*) from slot_allocations a where a.pool_id=p.id))*
   ((p.config->>'default_primary')::numeric*(p.config->>'primary_weight')::numeric+((p.config->>'sheets_per_slot')::numeric-(p.config->>'default_primary')::numeric)*(p.config->>'secondary_weight')::numeric)
 ),0) from shipments s left join pools p on p.shipment_id=s.id and p.status<>'cancelled' where s.id=p_shipment group by s.packing_kg;
$$;

create function public.save_pool(p_admin uuid,p_record jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools; sid uuid;cfg jsonb;begin
 if not exists(select 1 from admins where user_id=p_admin) then raise exception 'Administrator required.';end if;
 sid=(p_record->>'shipment_id')::uuid;perform 1 from shipments where id=sid for update;
 select * into p from pools where id=(p_record->>'id')::uuid for update;
 if found and (p.status not in('draft','live') or exists(select 1 from orders where pool_id=p.id)) then raise exception 'Commercial terms are locked after reservations. Create a new pool.';end if;
 cfg=p_record->'config';
 if (cfg->>'gst_percent')::numeric<>18 or (cfg->>'min_primary')::int>(cfg->>'default_primary')::int or (cfg->>'default_primary')::int>(cfg->>'max_primary')::int or (cfg->>'max_primary')::int>(cfg->>'sheets_per_slot')::int then raise exception 'Invalid pool configuration.';end if;
 insert into pools(id,code,name,category_id,shipment_id,city,image_url,total_slots,closes_at,config)
 values((p_record->>'id')::uuid,p_record->>'code',p_record->>'name',(p_record->>'category_id')::uuid,sid,p_record->>'city',p_record->>'image_url',(p_record->>'total_slots')::int,(p_record->>'closes_at')::timestamptz,cfg)
 on conflict(id) do update set code=excluded.code,name=excluded.name,category_id=excluded.category_id,shipment_id=excluded.shipment_id,city=excluded.city,image_url=excluded.image_url,total_slots=excluded.total_slots,closes_at=excluded.closes_at,config=excluded.config,updated_at=clock_timestamp();
 if projected_weight(sid)>(select payload_kg from shipments where id=sid) then raise exception 'The linked pools exceed the shipment payload at their default mixes.';end if;
 insert into audit_log(actor,action,entity_id,payload)values(p_admin,'save_pool',(p_record->>'id')::uuid,p_record);
 return jsonb_build_object('saved',true);
end;$$;

create function public.save_shipment(p_admin uuid,p_record jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from admins where user_id=p_admin) then raise exception 'Administrator required.';end if;
 perform 1 from shipments where id=(p_record->>'id')::uuid for update;
 insert into shipments(id,name,origin,destination,payload_kg,packing_kg)values((p_record->>'id')::uuid,p_record->>'name',p_record->>'origin',p_record->>'destination',(p_record->>'payload_kg')::numeric,(p_record->>'packing_kg')::numeric)
 on conflict(id) do update set name=excluded.name,origin=excluded.origin,destination=excluded.destination,payload_kg=excluded.payload_kg,packing_kg=excluded.packing_kg;
 if projected_weight((p_record->>'id')::uuid)>(p_record->>'payload_kg')::numeric then raise exception 'Shipment payload is below the committed/planned load.';end if;
 insert into audit_log(actor,action,entity_id,payload)values(p_admin,'save_shipment',(p_record->>'id')::uuid,p_record);
 return jsonb_build_object('saved',true);
end;$$;

create function public.reserve_slots(p_user uuid,p_pool uuid,p_slots integer[],p_primary integer,p_quote jsonb,p_version timestamptz) returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools;s shipments;o orders;profile profiles;n integer;begin
 select * into s from shipments where id=(select shipment_id from pools where id=p_pool) for update;
 select * into p from pools where id=p_pool for update;
 if p.id is null then raise exception 'Pool not found.';end if;
 perform expire_holds();
 if p.updated_at<>p_version then raise exception 'Pool changed. Refresh the quotation.';end if;
 if p.status<>'live' or p.closes_at<=now() then raise exception 'Pool is closed for new bookings.';end if;
 select * into profile from profiles where id=p_user;if profile.id is null then raise exception 'Complete your GST and billing details first.';end if;
 n=array_length(p_slots,1);
 if n is null or n<1 or n>p.total_slots or (select count(distinct v) from unnest(p_slots)v)<>n or exists(select 1 from unnest(p_slots)v where v<1 or v>p.total_slots) then raise exception 'Invalid slot selection.';end if;
 if p_primary<(p.config->>'min_primary')::int or p_primary>(p.config->>'max_primary')::int then raise exception 'Thickness mix is outside the pool limits.';end if;
 if exists(select 1 from slot_allocations where pool_id=p_pool and slot_no=any(p_slots)) then raise exception 'A selected slot was just reserved. Choose another slot.';end if;
 if exists(select 1 from waitlist where pool_id=p_pool and offered_slot=any(p_slots) and status='offered' and user_id<>p_user) then raise exception 'A selected slot is held for a waiting-list offer.';end if;
 if (p_quote->>'slot_count')::int<>n or (p_quote->>'primary_qty')::int<>p_primary or p_quote->>'terms_version'<>'2026-09-p1' then raise exception 'Quotation mismatch.';end if;
 insert into orders(pool_id,user_id,slot_numbers,primary_qty,secondary_qty,quote,profile_snapshot,expires_at)
 values(p_pool,p_user,p_slots,p_primary,(p.config->>'sheets_per_slot')::int-p_primary,p_quote,to_jsonb(profile),now()+interval '15 minutes')returning * into o;
 insert into slot_allocations select p_pool,v,o.id from unnest(p_slots)v;
 if projected_weight(s.id)>s.payload_kg then raise exception 'This mix exceeds the shared truck payload. Reduce the primary sheet quantity.';end if;
 update waitlist set status='accepted' where pool_id=p_pool and user_id=p_user and status='offered' and offered_slot=any(p_slots);
 return to_jsonb(o);
end;$$;

create function public.prepare_payment(p_order uuid,p_user uuid,p_stage text) returns jsonb language plpgsql security definer set search_path=public as $$
declare o orders;p pools;a payment_attempts;expected bigint;begin
 select * into p from pools where id=(select pool_id from orders where id=p_order) for update;
 select * into o from orders where id=p_order and user_id=p_user for update;
 if o.id is null then raise exception 'Order not found.';end if;
 if o.status in('cancelled','expired','defaulted','refund_pending','refunded','cancellation_requested','dispatched') then raise exception 'This order cannot accept payments.';end if;
 if p_stage='booking' then
  if o.paid_amount<>0 or p.status<>'live' or o.expires_at<now() or p.closes_at<now() then raise exception 'Booking payment is no longer available.';end if;
 elsif p_stage='confirmation' then
  if p.status<>'confirming' or o.paid_amount<>(o.quote->'stages'->>'booking')::bigint then raise exception 'Confirmation instalment is not due.';end if;
 elsif p_stage='dispatch' then
  if p.status<>'qc_ready' or o.paid_amount<>((o.quote->'stages'->>'booking')::bigint+(o.quote->'stages'->>'confirmation')::bigint) then raise exception 'QC and first 50%% payment are required.';end if;
 else raise exception 'Invalid payment stage.';end if;
 expected=(o.quote->'stages'->>p_stage)::bigint;
 select * into a from payment_attempts where order_id=o.id and stage=p_stage for update;
 if found then
  if a.razorpay_order_id is null then raise exception 'An earlier payment-order request is pending reconciliation. Retry shortly; contact PLYDECK if it persists.';end if;
  return to_jsonb(a);
 end if;
 insert into payment_attempts(order_id,stage,amount)values(o.id,p_stage,expected)returning * into a;
 return to_jsonb(a);
end;$$;

create function public.apply_payment(p_razorpay_order text,p_payment text,p_amount bigint,p_currency text) returns jsonb language plpgsql security definer set search_path=public as $$
declare a payment_attempts;o orders;p pools;accepted boolean:=true;existing payments;begin
 select * into a from payment_attempts where razorpay_order_id=p_razorpay_order;
 if a.id is null then raise exception 'Unknown payment attempt.';end if;
 select * into p from pools where id=(select pool_id from orders where id=a.order_id) for update;
 select * into o from orders where id=a.order_id for update;
 select * into existing from payments where id=p_payment;
 if found then return jsonb_build_object('verified',existing.accepted,'duplicate',true,'refund_pending',not existing.accepted);end if;
 if p_currency<>'INR' or p_amount<>a.amount then raise exception 'Payment amount or currency mismatch.';end if;
 if o.status in('cancelled','expired','defaulted','refund_pending','refunded','cancellation_requested','dispatched') then accepted=false;end if;
 if a.stage='booking' and (o.paid_amount<>0 or o.expires_at<now() or p.status<>'live' or p.closes_at<now()) then accepted=false;end if;
 if a.stage='confirmation' and (p.status<>'confirming' or o.paid_amount<>(o.quote->'stages'->>'booking')::bigint) then accepted=false;end if;
 if a.stage='dispatch' and (p.status<>'qc_ready' or o.paid_amount<>((o.quote->'stages'->>'booking')::bigint+(o.quote->'stages'->>'confirmation')::bigint)) then accepted=false;end if;
 if not exists(select 1 from slot_allocations where order_id=o.id) then accepted=false;end if;
 insert into payments(id,attempt_id,order_id,amount,accepted)values(p_payment,a.id,o.id,p_amount,accepted);
 if accepted then
  update orders set paid_amount=paid_amount+p_amount,status=case a.stage when 'booking' then 'booked' when 'confirmation' then 'confirmed' else 'paid' end,expires_at=null where id=o.id;
  update payment_attempts set status='paid' where id=a.id;
 else
  insert into refunds(order_id,amount,reason)values(o.id,p_amount,'Late or duplicate captured payment; slot or instalment unavailable. Full refund required.');
 end if;
 return jsonb_build_object('verified',accepted,'refund_pending',not accepted,'order_id',o.id);
end;$$;

create function public.transition_pool(p_admin uuid,p_pool uuid,p_event text,p_note text default '') returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools;n integer;begin
 if not exists(select 1 from admins where user_id=p_admin)then raise exception 'Administrator required.';end if;
 perform 1 from shipments where id=(select shipment_id from pools where id=p_pool) for update;
 select * into p from pools where id=p_pool for update;if p.id is null then raise exception 'Pool not found.';end if;
 perform expire_holds();select count(*) into n from slot_allocations where pool_id=p.id;
 if p_event='publish' then
  if p.status<>'draft' or p.closes_at<=now() then raise exception 'Only a current draft can be published.';end if;
  if (p.config->>'bond') ilike '%pending%' or (p.config->>'tolerance') ilike '%pending%' or (p.config->>'specification') ilike '%pending%' then raise exception 'Replace pending factory specifications before publishing.';end if;
  if not exists(select 1 from categories where id=p.category_id and active) then raise exception 'Choose a visible category.';end if;
  if projected_weight(p.shipment_id)>(select payload_kg from shipments where id=p.shipment_id) then raise exception 'Shipment is overweight.';end if;
  update pools set status='live',updated_at=clock_timestamp()where id=p.id;
 elsif p_event='request_confirmation' then
  if p.status<>'live' or n<>p.total_slots or exists(select 1 from orders o where o.pool_id=p.id and exists(select 1 from slot_allocations a where a.order_id=o.id) and o.paid_amount<(o.quote->'stages'->>'booking')::bigint)then raise exception 'All slots require a verified 10%% booking.';end if;
  update pools set status='confirming',payment_due_at=now()+interval '48 hours',updated_at=clock_timestamp()where id=p.id;
 elsif p_event='confirm' then
  if p.status<>'confirming' or n<>p.total_slots or exists(select 1 from orders o where o.pool_id=p.id and exists(select 1 from slot_allocations a where a.order_id=o.id) and o.paid_amount<((o.quote->'stages'->>'booking')::bigint+(o.quote->'stages'->>'confirmation')::bigint)) then raise exception 'All slots must be allocated and paid to 50%%.';end if;
  update pools set status='confirmed',confirmed_at=now(),delivery_target=now()+interval '7 days',payment_due_at=null,updated_at=clock_timestamp()where id=p.id;
 elsif p_event='qc' then
  if p.status<>'confirmed' or length(trim(p_note))<20 then raise exception 'A confirmed pool and detailed QC report are required.';end if;
  update pools set status='qc_ready',qc_report=p_note,payment_due_at=now()+interval '48 hours',updated_at=clock_timestamp()where id=p.id;
 elsif p_event='dispatch' then
  if p.status<>'qc_ready' or n<>p.total_slots or exists(select 1 from orders o where o.pool_id=p.id and exists(select 1 from slot_allocations a where a.order_id=o.id) and o.paid_amount<>(o.quote->>'total')::bigint)then raise exception 'QC and cleared full payments for all allocated slots are required.';end if;
  update pools set status='dispatched',updated_at=clock_timestamp()where id=p.id;
  update orders set status='dispatched' where pool_id=p.id and exists(select 1 from slot_allocations a where a.order_id=orders.id);
 elsif p_event='cancel' then
  if p.status in('cancelled','dispatched') or length(trim(p_note))<3 then raise exception 'This pool cannot be cancelled or cancellation reason is missing.';end if;
  update pools set status='cancelled',updated_at=clock_timestamp()where id=p.id;
  insert into refunds(order_id,amount,reason) select o.id,o.paid_amount,'PLYDECK pool cancellation: '||p_note from orders o where o.pool_id=p.id and o.paid_amount>0 and exists(select 1 from slot_allocations a where a.order_id=o.id);
  update orders set status=case when paid_amount>0 then 'refund_pending' else 'cancelled' end where pool_id=p.id and exists(select 1 from slot_allocations a where a.order_id=orders.id);
  delete from slot_allocations where pool_id=p.id;
  update waitlist set status='expired' where pool_id=p.id and status in('waiting','offered');
 else raise exception 'Unknown pool action.';end if;
 insert into audit_log(actor,action,entity_id,payload)values(p_admin,p_event,p.id,jsonb_build_object('note',p_note));
 return jsonb_build_object('updated',true);
end;$$;

create function public.join_waitlist(p_user uuid,p_pool uuid) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from pools where id=p_pool and status not in('draft','cancelled','dispatched'))then raise exception 'Waiting list is closed.';end if;
 insert into waitlist(pool_id,user_id)values(p_pool,p_user)on conflict(pool_id,user_id)do nothing;return jsonb_build_object('joined',true);
end;$$;

create function public.offer_next(p_admin uuid,p_pool uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools;candidate waitlist;n integer;begin
 if not exists(select 1 from admins where user_id=p_admin)then raise exception 'Administrator required.';end if;
 select * into p from pools where id=p_pool for update;
 if p.status<>'live' or p.closes_at<now()then raise exception 'Offers require an open pool. Use a new replacement pool after supplier commitment.';end if;
 perform expire_holds();
 select v into n from generate_series(1,p.total_slots)v where not exists(select 1 from slot_allocations a where a.pool_id=p.id and a.slot_no=v) and not exists(select 1 from waitlist w where w.pool_id=p.id and w.offered_slot=v and w.status='offered') order by v limit 1;
 if n is null then raise exception 'No free slots.';end if;
 select * into candidate from waitlist where pool_id=p.id and status='waiting' order by created_at,id limit 1 for update;
 if candidate.id is null then raise exception 'No waiting buyers.';end if;
 update waitlist set status='offered',offered_slot=n,offer_expires_at=least(now()+interval '24 hours',p.closes_at) where id=candidate.id;
 insert into audit_log(actor,action,entity_id,payload)values(p_admin,'offer_next',p.id,jsonb_build_object('waitlist_id',candidate.id,'slot',n));
 return jsonb_build_object('offered',true,'waitlist_id',candidate.id,'slot',n);
end;$$;

create function public.cancel_order(p_user uuid,p_order uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare o orders;p pools;begin
 select * into p from pools where id=(select pool_id from orders where id=p_order)for update;
 select * into o from orders where id=p_order and user_id=p_user for update;
 if o.id is null then raise exception 'Order not found.';end if;
 if o.status in('cancelled','expired','refund_pending','refunded','defaulted','cancellation_requested','dispatched')then raise exception 'Order is already closed or under review.';end if;
 if p.status in('live','confirming','cancelled')then
  update orders set status=case when paid_amount>0 then 'refund_pending' else 'cancelled' end where id=o.id;
  delete from slot_allocations where order_id=o.id;
  if o.paid_amount>0 then insert into refunds(order_id,amount,reason)values(o.id,o.paid_amount,'Buyer cancellation before final pool confirmation. Full refund required.');end if;
  if p.status='confirming' then update pools set status='live',closes_at=greatest(closes_at,now()+interval '24 hours'),updated_at=clock_timestamp()where id=p.id;end if;
 else
  update orders set status='cancellation_requested' where id=o.id;
  insert into refunds(order_id,amount,reason)values(o.id,0,'Buyer cancellation after supplier commitment. Review actual costs and resale recovery.');
 end if;
 return jsonb_build_object('requested',true);
end;$$;

create function public.default_order(p_admin uuid,p_order uuid,p_event text,p_note text)returns jsonb language plpgsql security definer set search_path=public as $$
declare o orders;p pools;begin
 if not exists(select 1 from admins where user_id=p_admin)then raise exception 'Administrator required.';end if;
 select * into p from pools where id=(select pool_id from orders where id=p_order) for update;
 select * into o from orders where id=p_order for update;
 if o.id is null or p.status not in('confirming','qc_ready') or coalesce(o.payment_due_at,p.payment_due_at)>now() or o.paid_amount=0 or (p.status='confirming' and o.paid_amount>=(o.quote->'stages'->>'booking')::bigint+(o.quote->'stages'->>'confirmation')::bigint) or o.paid_amount>=(o.quote->>'total')::bigint then raise exception 'No overdue instalment eligible for default.';end if;
 if length(trim(p_note))<10 then raise exception 'Record the notice or review basis.';end if;
 if p_event='default_notice' then update orders set default_notice_at=now(),default_notice=p_note where id=o.id;
 elsif p_event='default' then
  if o.default_notice_at is null or o.default_notice_at+interval '48 hours'>now()then raise exception 'Written notice and the 48-hour cure period are required.';end if;
  if o.status='defaulted' then raise exception 'Default already recorded.';end if;
  update orders set status='defaulted' where id=o.id;delete from slot_allocations where order_id=o.id;
  insert into refunds(order_id,amount,reason)values(o.id,case when p.status='confirming' then o.paid_amount else 0 end,case when p.status='confirming' then 'Default before final confirmation. Full refund required.' else 'Post-QC buyer default; assess reasonable committed costs and resale recovery. '||p_note end);
  if p.status='confirming' then update pools set status='live',closes_at=greatest(closes_at,now()+interval '24 hours'),updated_at=clock_timestamp()where id=p.id;end if;
 else raise exception 'Invalid default action.';end if;
 insert into audit_log(actor,action,entity_id,payload)values(p_admin,p_event,o.id,jsonb_build_object('note',p_note));return jsonb_build_object('updated',true);
end;$$;

create function public.prepare_refund(p_refund uuid,p_admin uuid,p_amount bigint,p_note text)returns jsonb language plpgsql security definer set search_path=public as $$
declare r refunds;o orders;payment record;remaining bigint;available bigint;take bigint;already bigint;begin
 if not exists(select 1 from admins where user_id=p_admin)then raise exception 'Administrator required.';end if;
 select * into o from orders where id=(select order_id from refunds where id=p_refund) for update;
 select * into r from refunds where id=p_refund for update;
 if r.id is null then raise exception 'Refund not found.';end if;
 if r.status='processing' then return (select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb)from refund_tasks t where refund_id=r.id);end if;
 if r.status<>'review' then raise exception 'Refund is already settled.';end if;
 if p_amount<0 or length(trim(p_note))<5 then raise exception 'Invalid refund decision.';end if;
 if r.reason ilike '%full refund required%' or r.reason like 'PLYDECK pool cancellation:%' then if p_amount<>r.amount then raise exception 'This cancellation requires a full refund.';end if;end if;
 select coalesce(sum(amount),0)into already from refund_tasks where payment_id in(select id from payments where order_id=o.id);
 if p_amount>(select coalesce(sum(amount),0)from payments where order_id=o.id)-already then raise exception 'Refund exceeds the remaining captured amount.';end if;
 if r.amount=0 and p_amount<greatest(0,o.paid_amount-((o.quote->'stages'->>'booking')::bigint+(o.quote->'stages'->>'confirmation')::bigint)-already)then raise exception 'Retention cannot exceed the first 50%% commitment.';end if;
 if o.status='cancellation_requested' then update orders set status='cancelled' where id=o.id;delete from slot_allocations where order_id=o.id;end if;
 remaining=p_amount;
 for payment in select * from payments where order_id=o.id order by created_at loop
  select payment.amount-coalesce(sum(amount),0)into available from refund_tasks where payment_id=payment.id;
  take=least(remaining,available);if take>0 then insert into refund_tasks(refund_id,payment_id,amount)values(r.id,payment.id,take);remaining=remaining-take;end if;
  exit when remaining=0;
 end loop;
 update refunds set amount=p_amount,status=case when p_amount=0 then 'closed_no_refund' else 'processing' end,decision_note=p_note,decided_by=p_admin where id=r.id;
 insert into audit_log(actor,action,entity_id,payload)values(p_admin,'refund_decision',r.id,jsonb_build_object('amount',p_amount,'note',p_note));
 return (select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb)from refund_tasks t where refund_id=r.id);
end;$$;

create function public.finish_refund(p_refund uuid)returns void language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from refund_tasks where refund_id=p_refund) and not exists(select 1 from refund_tasks where refund_id=p_refund and status<>'processed')then
  update refunds set status='refunded' where id=p_refund;
  update orders set status='refunded' where id=(select order_id from refunds where id=p_refund) and status='refund_pending';
 end if;
end;$$;

-- Restrict SECURITY DEFINER RPCs to the server's service role. Never ship its key.
do $$declare fn record;begin for fn in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('check_rate_limit','expire_holds','projected_weight','save_pool','save_shipment','reserve_slots','prepare_payment','apply_payment','transition_pool','join_waitlist','offer_next','cancel_order','default_order','prepare_refund','finish_refund')loop execute format('revoke all on function %s from public,anon,authenticated',fn.sig);execute format('grant execute on function %s to service_role',fn.sig);end loop;end;$$;

-- Product-image storage. Write access remains server-admin only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('catalog-images','catalog-images',true,5242880,array['image/jpeg','image/png','image/webp'])on conflict(id)do nothing;
create policy public_catalog_images on storage.objects for select using(bucket_id='catalog-images');


-- Included file: 002_replacement_slots.sql
-- A released post-QC slot contains existing goods. The replacement buyer must
-- accept the same sheet mix and QC report; it cannot be reconfigured.
alter table public.orders add column replacement boolean not null default false;
alter table public.orders add column payment_due_at timestamptz;
alter table public.waitlist add column offered_primary integer;
create table public.vacated_slots(pool_id uuid not null references public.pools(id),slot_no integer not null,primary_qty integer not null,source_order uuid not null references public.orders(id),primary key(pool_id,slot_no));
alter table public.vacated_slots enable row level security;
grant all on public.vacated_slots to service_role;

create function public.remember_vacated_slot()returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status in('defaulted','cancelled') and old.status<>new.status and exists(select 1 from pools where id=new.pool_id and status in('confirmed','qc_ready'))then
  insert into vacated_slots select new.pool_id,n,new.primary_qty,new.id from unnest(new.slot_numbers)n on conflict(pool_id,slot_no)do update set primary_qty=excluded.primary_qty,source_order=excluded.source_order;
 end if;return new;
end;$$;
create trigger record_vacated_slots after update of status on public.orders for each row execute function public.remember_vacated_slot();

create or replace function public.offer_next(p_admin uuid,p_pool uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools;candidate waitlist;n integer;qty integer;begin
 if not exists(select 1 from admins where user_id=p_admin)then raise exception 'Administrator required.';end if;
 select * into p from pools where id=p_pool for update;
 if p.status not in('live','qc_ready') or (p.status='live' and p.closes_at<now())then raise exception 'Offers require an open pool or a released QC-approved slot.';end if;
 perform expire_holds();
 select v into n from generate_series(1,p.total_slots)v where not exists(select 1 from slot_allocations a where a.pool_id=p.id and a.slot_no=v) and not exists(select 1 from waitlist w where w.pool_id=p.id and w.offered_slot=v and w.status='offered') and (p.status='live' or exists(select 1 from vacated_slots x where x.pool_id=p.id and x.slot_no=v))order by v limit 1;
 if n is null then raise exception 'No released slots available.';end if;
 select * into candidate from waitlist where pool_id=p.id and status='waiting' order by created_at,id limit 1 for update;
 if candidate.id is null then raise exception 'No waiting buyers.';end if;
 select primary_qty into qty from vacated_slots where pool_id=p.id and slot_no=n;
 update waitlist set status='offered',offered_slot=n,offered_primary=coalesce(qty,(p.config->>'default_primary')::int),offer_expires_at=case when p.status='live' then least(now()+interval '24 hours',p.closes_at)else now()+interval '24 hours'end where id=candidate.id;
 insert into audit_log(actor,action,entity_id,payload)values(p_admin,'offer_next',p.id,jsonb_build_object('waitlist_id',candidate.id,'slot',n));return jsonb_build_object('offered',true,'slot',n);
end;$$;

create or replace function public.reserve_slots(p_user uuid,p_pool uuid,p_slots integer[],p_primary integer,p_quote jsonb,p_version timestamptz) returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools;s shipments;o orders;profile profiles;n integer;is_replacement boolean;begin
 select * into s from shipments where id=(select shipment_id from pools where id=p_pool)for update;
 select * into p from pools where id=p_pool for update;
 if p.id is null then raise exception 'Pool not found.';end if;
 perform expire_holds();
 if p.updated_at<>p_version then raise exception 'Pool changed. Refresh the quotation.';end if;
 is_replacement=p.status='qc_ready';
 if (not is_replacement and (p.status<>'live' or p.closes_at<=now()))then raise exception 'Pool is closed for new bookings.';end if;
 select * into profile from profiles where id=p_user;if profile.id is null then raise exception 'Complete your GST and billing details first.';end if;
 n=array_length(p_slots,1);
 if n is null or n<1 or n>p.total_slots or (select count(distinct v)from unnest(p_slots)v)<>n or exists(select 1 from unnest(p_slots)v where v<1 or v>p.total_slots)then raise exception 'Invalid slot selection.';end if;
 if p_primary<(p.config->>'min_primary')::int or p_primary>(p.config->>'max_primary')::int then raise exception 'Thickness mix is outside the pool limits.';end if;
 if exists(select 1 from slot_allocations where pool_id=p_pool and slot_no=any(p_slots))then raise exception 'A selected slot was just reserved. Choose another slot.';end if;
 if exists(select 1 from waitlist where pool_id=p_pool and offered_slot=any(p_slots)and status='offered' and user_id<>p_user)then raise exception 'A selected slot is held for a waiting-list offer.';end if;
 if is_replacement and (n<>1 or not exists(select 1 from waitlist w join vacated_slots v on v.pool_id=w.pool_id and v.slot_no=w.offered_slot where w.pool_id=p.id and w.user_id=p_user and w.status='offered' and w.offered_slot=p_slots[1]and v.primary_qty=p_primary))then raise exception 'A valid waiting-list offer and the original QC-approved mix are required.';end if;
 if (p_quote->>'slot_count')::int<>n or (p_quote->>'primary_qty')::int<>p_primary or p_quote->>'terms_version'<>'2026-09-p1'then raise exception 'Quotation mismatch.';end if;
 insert into orders(pool_id,user_id,slot_numbers,primary_qty,secondary_qty,quote,profile_snapshot,expires_at,replacement,payment_due_at)
 values(p_pool,p_user,p_slots,p_primary,(p.config->>'sheets_per_slot')::int-p_primary,p_quote,to_jsonb(profile),now()+interval '15 minutes',is_replacement,case when is_replacement then now()+interval '48 hours'else null end)returning * into o;
 insert into slot_allocations select p_pool,v,o.id from unnest(p_slots)v;
 if projected_weight(s.id)>s.payload_kg then raise exception 'This mix exceeds the shared truck payload. Reduce the primary sheet quantity.';end if;
 update waitlist set status='accepted' where pool_id=p_pool and user_id=p_user and status='offered' and offered_slot=any(p_slots);
 return to_jsonb(o);
end;$$;

create or replace function public.prepare_payment(p_order uuid,p_user uuid,p_stage text)returns jsonb language plpgsql security definer set search_path=public as $$
declare o orders;p pools;a payment_attempts;expected bigint;begin
 select * into p from pools where id=(select pool_id from orders where id=p_order)for update;
 select * into o from orders where id=p_order and user_id=p_user for update;
 if o.id is null then raise exception 'Order not found.';end if;
 if o.status in('cancelled','expired','defaulted','refund_pending','refunded','cancellation_requested','dispatched')then raise exception 'This order cannot accept payments.';end if;
 if p_stage='booking' then
  if o.paid_amount<>0 or o.expires_at<now() or not(p.status='live' and p.closes_at>=now() or o.replacement and p.status='qc_ready')then raise exception 'Booking payment is no longer available.';end if;
 elsif p_stage='confirmation' then
  if not(p.status='confirming' or o.replacement and p.status='qc_ready')or o.paid_amount<>(o.quote->'stages'->>'booking')::bigint then raise exception 'Confirmation instalment is not due.';end if;
 elsif p_stage='dispatch' then
  if p.status<>'qc_ready' or o.paid_amount<>((o.quote->'stages'->>'booking')::bigint+(o.quote->'stages'->>'confirmation')::bigint)then raise exception 'QC and first 50%% payment are required.';end if;
 else raise exception 'Invalid payment stage.';end if;
 expected=(o.quote->'stages'->>p_stage)::bigint;
 select * into a from payment_attempts where order_id=o.id and stage=p_stage for update;
 if found then if a.razorpay_order_id is null then raise exception 'Payment-order creation is pending reconciliation. Retry shortly.';end if;return to_jsonb(a);end if;
 insert into payment_attempts(order_id,stage,amount)values(o.id,p_stage,expected)returning * into a;return to_jsonb(a);
end;$$;

create or replace function public.apply_payment(p_razorpay_order text,p_payment text,p_amount bigint,p_currency text)returns jsonb language plpgsql security definer set search_path=public as $$
declare a payment_attempts;o orders;p pools;accepted boolean:=true;existing payments;begin
 select * into a from payment_attempts where razorpay_order_id=p_razorpay_order;
 if a.id is null then raise exception 'Unknown payment attempt.';end if;
 select * into p from pools where id=(select pool_id from orders where id=a.order_id)for update;
 select * into o from orders where id=a.order_id for update;
 select * into existing from payments where id=p_payment;if found then return jsonb_build_object('verified',existing.accepted,'duplicate',true,'refund_pending',not existing.accepted);end if;
 if p_currency<>'INR' or p_amount<>a.amount then raise exception 'Payment amount or currency mismatch.';end if;
 if o.status in('cancelled','expired','defaulted','refund_pending','refunded','cancellation_requested','dispatched')then accepted=false;end if;
 if a.stage='booking' and (o.paid_amount<>0 or o.expires_at<now() or not(p.status='live' and p.closes_at>=now() or o.replacement and p.status='qc_ready'))then accepted=false;end if;
 if a.stage='confirmation' and (not(p.status='confirming' or o.replacement and p.status='qc_ready')or o.paid_amount<>(o.quote->'stages'->>'booking')::bigint)then accepted=false;end if;
 if a.stage='dispatch' and (p.status<>'qc_ready' or o.paid_amount<>((o.quote->'stages'->>'booking')::bigint+(o.quote->'stages'->>'confirmation')::bigint))then accepted=false;end if;
 if not exists(select 1 from slot_allocations where order_id=o.id)then accepted=false;end if;
 insert into payments(id,attempt_id,order_id,amount,accepted)values(p_payment,a.id,o.id,p_amount,accepted);
 if accepted then update orders set paid_amount=paid_amount+p_amount,status=case a.stage when 'booking'then'booked'when'confirmation'then'confirmed'else'paid'end,expires_at=null where id=o.id;update payment_attempts set status='paid'where id=a.id;
 else insert into refunds(order_id,amount,reason)values(o.id,p_amount,'Late or duplicate captured payment; slot or instalment unavailable. Full refund required.');end if;
 return jsonb_build_object('verified',accepted,'refund_pending',not accepted,'order_id',o.id);
end;$$;

revoke all on function public.remember_vacated_slot()from public,anon,authenticated;
grant execute on function public.remember_vacated_slot()to service_role;


-- Included file: 003_whatsapp_notifications.sql
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


-- Included file: 004_whatsapp_delivery_fixes.sql
-- PLYDECK deployment fixes. Run once AFTER 003_whatsapp_notifications.sql.
-- Existing records and previous migrations are preserved.

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


-- Included file: seed.sql
-- Two OEM pools. Production records deliberately start as DRAFT.
-- ₹56 is assumed for BOTH thicknesses. ₹50,000 combined freight is a budget, not a quote.
-- Replace pending specs, rates, dates and weights in admin before publishing.
insert into public.categories(id,name,slug,description,image_url,active)values('11111111-1111-4111-8111-111111111111','OEM Plywood','oem-plywood','Flexible thickness combinations for cabinetry, interior fit-outs and retail stock.','/plywood-studio.png',true)on conflict(id)do nothing;
insert into public.categories(id,name,slug,description,image_url,active)values('11111111-1111-4111-8111-111111111112','Commercial Plywood','commercial-plywood','Everyday interior applications. Categories and supplier specifications are managed by PLYDECK.','/plywood-studio.png',true)on conflict(id)do nothing;
insert into public.categories(id,name,slug,description,image_url,active)values('11111111-1111-4111-8111-111111111113','Marine Plywood','marine-plywood','Explore marine-grade products as verified supplier specifications become available.','/plywood-studio.png',true)on conflict(id)do nothing;
insert into public.shipments(id,name,origin,destination,payload_kg,packing_kg)values('22222222-2222-4222-8222-222222222222','Kerala → Bengaluru · combined load','Perumbavoor, Kerala','Bengaluru',32000,600)on conflict(id)do nothing;
insert into public.pools(id,code,name,category_id,shipment_id,city,image_url,status,total_slots,closes_at,config)values('33333333-3333-4333-8333-333333333331','BLR-OEM-001','OEM collective · Pool 01','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Bengaluru','/plywood-studio.png','draft',5,now()+interval '72 hours','{"thickness_primary":16,"thickness_secondary":6,"length_ft":8,"width_ft":4,"sheets_per_slot":100,"default_primary":80,"min_primary":60,"max_primary":100,"primary_rate":56,"secondary_rate":56,"margin_rate":2,"rounding_rate":0.25,"gst_percent":18,"primary_weight":32,"secondary_weight":12,"costs":{"transport":25000,"unloading":5000,"pickup_loading":2500,"factory_packing":2000,"insurance":1500,"contingency":2000,"warehouse":9000},"core":"Semi-hardwood","face":"Okoume","bond":"Factory specification pending","tolerance":"Factory specification pending","specification":"OEM furniture plywood. Final bond grade, core construction, thickness tolerance and batch weights must be agreed before production bookings."}'::jsonb)on conflict(id)do nothing;
insert into public.pools(id,code,name,category_id,shipment_id,city,image_url,status,total_slots,closes_at,config)values('33333333-3333-4333-8333-333333333332','BLR-OEM-002','OEM collective · Pool 02','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Bengaluru','/plywood-studio.png','draft',5,now()+interval '72 hours','{"thickness_primary":16,"thickness_secondary":6,"length_ft":8,"width_ft":4,"sheets_per_slot":100,"default_primary":80,"min_primary":60,"max_primary":100,"primary_rate":56,"secondary_rate":56,"margin_rate":2,"rounding_rate":0.25,"gst_percent":18,"primary_weight":32,"secondary_weight":12,"costs":{"transport":25000,"unloading":5000,"pickup_loading":2500,"factory_packing":2000,"insurance":1500,"contingency":2000,"warehouse":9000},"core":"Semi-hardwood","face":"Okoume","bond":"Factory specification pending","tolerance":"Factory specification pending","specification":"OEM furniture plywood. Final bond grade, core construction, thickness tolerance and batch weights must be agreed before production bookings."}'::jsonb)on conflict(id)do nothing;

commit;
