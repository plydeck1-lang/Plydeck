-- Final-rate pricing overlay.
-- Every admin-entered plywood rate is the final per-sqft selling rate.
-- No operational allocation, spread, rounding uplift or separate tax line is
-- added by the application quotation engine.
begin;

update public.pools
set config = config || jsonb_build_object(
  'margin_rate', 0,
  'rounding_rate', 0,
  'gst_percent', 0
), updated_at = clock_timestamp();

create or replace function public.save_pool(p_admin uuid,p_record jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools; sid uuid; cfg jsonb; rates jsonb;
begin
  if not exists(select 1 from admins where user_id=p_admin) then raise exception 'Administrator required.'; end if;
  sid=(p_record->>'shipment_id')::uuid;
  perform 1 from shipments where id=sid for update;
  select * into p from pools where id=(p_record->>'id')::uuid for update;
  if found and (p.status not in('draft','live') or exists(select 1 from orders where pool_id=p.id)) then
    raise exception 'Commercial terms are locked after reservations. Create a new pool.';
  end if;
  cfg=p_record->'config';
  rates=cfg->'rate_card';
  if cfg is null or rates is null or jsonb_typeof(rates)<>'object'
     or not rates ?& array['mr_16','bwp_16','mr_6','bwp_6'] then
    raise exception 'Enter all four final rates in the fixed slot rate card.';
  end if;
  if (rates->>'mr_16')::numeric<=0 or (rates->>'bwp_16')::numeric<=0
     or (rates->>'mr_6')::numeric<=0 or (rates->>'bwp_6')::numeric<=0 then
    raise exception 'Every fixed slot rate must be greater than zero.';
  end if;
  cfg=cfg||jsonb_build_object(
    'thickness_primary',16,'thickness_secondary',6,'length_ft',8,'width_ft',4,
    'sheets_per_slot',100,'default_primary',70,'min_primary',70,'max_primary',70,
    'default_secondary',30,'min_secondary',30,'max_secondary',30,
    'primary_rate',(rates->>'mr_16')::numeric,
    'secondary_rate',(rates->>'mr_6')::numeric,
    'margin_rate',0,'rounding_rate',0,'gst_percent',0
  );
  insert into pools(id,code,name,category_id,shipment_id,city,image_url,total_slots,closes_at,config)
  values(
    (p_record->>'id')::uuid,p_record->>'code',(p_record->>'name'),
    (p_record->>'category_id')::uuid,sid,p_record->>'city',p_record->>'image_url',
    (p_record->>'total_slots')::int,(p_record->>'closes_at')::timestamptz,cfg
  )
  on conflict(id) do update set
    code=excluded.code,name=excluded.name,category_id=excluded.category_id,
    shipment_id=excluded.shipment_id,city=excluded.city,image_url=excluded.image_url,
    total_slots=excluded.total_slots,closes_at=excluded.closes_at,
    config=excluded.config,updated_at=clock_timestamp();
  if projected_weight(sid)>(select payload_kg from shipments where id=sid) then
    raise exception 'The linked fixed slots exceed the shipment payload.';
  end if;
  insert into audit_log(actor,action,entity_id,payload)
  values(p_admin,'save_pool',(p_record->>'id')::uuid,jsonb_set(p_record,'{config}',cfg));
  return jsonb_build_object('saved',true);
end;$$;

create or replace function public.reserve_slots(
  p_user uuid,p_pool uuid,p_slots integer[],p_primary integer,p_secondary integer,
  p_quote jsonb,p_version timestamptz
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
  if prof.id is null then raise exception 'Complete your business and billing details first.'; end if;
  n:=coalesce(array_length(p_slots,1),0);
  if n<1 or n>p.total_slots or (select count(distinct v) from unnest(p_slots)v)<>n
     or exists(select 1 from unnest(p_slots)v where v<1 or v>p.total_slots) then
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
  if exists(select 1 from blocked_slots where pool_id=p_pool and slot_no=any(p_slots)) then
    raise exception 'A selected slot is blocked by PLYDECK operations.';
  end if;
  if exists(select 1 from waitlist where pool_id=p_pool and offered_slot=any(p_slots)
            and status='offered' and user_id<>p_user) then
    raise exception 'A selected slot is held for a waiting-list offer.';
  end if;
  if replacement_booking and (n<>1 or not exists(
    select 1 from waitlist w join vacated_slots v
      on v.pool_id=w.pool_id and v.slot_no=w.offered_slot
    where w.pool_id=p.id and w.user_id=p_user and w.status='offered'
      and w.offered_slot=p_slots[1] and v.primary_qty=70 and v.secondary_qty=30
  )) then raise exception 'A valid waiting-list offer for the fixed slot is required.'; end if;
  if (p_quote->>'slot_count')::int<>n
     or (p_quote->>'primary_qty')::int<>70
     or (p_quote->>'secondary_qty')::int<>30
     or (p_quote->>'sheets')::int<>(100*n)
     or p_quote->>'terms_version'<>'2026-09-final-rate-1' then
    raise exception 'Quotation mismatch.';
  end if;
  insert into orders(
    pool_id,user_id,slot_numbers,primary_qty,secondary_qty,quote,profile_snapshot,
    paid_amount,expires_at,replacement,payment_due_at,status
  ) values(
    p_pool,p_user,p_slots,70,30,p_quote,to_jsonb(prof),0,null,replacement_booking,null,'booked'
  ) returning * into o;
  insert into slot_allocations(pool_id,slot_no,order_id)
    select p_pool,v,o.id from unnest(p_slots)v;
  if projected_weight(s.id)>s.payload_kg then raise exception 'The fixed slots exceed the shared truck payload.'; end if;
  update waitlist set status='accepted',offer_expires_at=null
    where pool_id=p_pool and user_id=p_user and status='offered' and offered_slot=any(p_slots);
  insert into audit_log(actor,action,entity_id,payload)
    values(p_user,'reserve_slots',o.id,jsonb_build_object('pool_id',p_pool,'slots',p_slots));
  return to_jsonb(o);
end;$$;

update public.whatsapp_templates
set body_preview='PLYDECK reservation {{1}} confirmed for {{2}}. Final order value: INR {{3}}. Your selected slots are locked.',
    updated_at=now()
where name='plydeck_booking_received';

revoke all on function public.save_pool(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.reserve_slots(uuid,uuid,integer[],integer,integer,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.save_pool(uuid,jsonb) to service_role;
grant execute on function public.reserve_slots(uuid,uuid,integer[],integer,integer,jsonb,timestamptz) to service_role;

commit;
