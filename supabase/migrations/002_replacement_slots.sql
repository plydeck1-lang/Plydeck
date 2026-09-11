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
