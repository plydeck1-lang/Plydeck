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
