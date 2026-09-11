-- Replace the adjustable thickness mix with one fixed, four-item OEM slot.
-- Every slot is 100 sheets / 3,200 sqft:
--   50 MR 16mm, 20 BWP 16mm, 15 MR 6mm, 15 BWP 6mm; all 8 x 4 ft.

update public.pools
set config=config||jsonb_build_object(
 'thickness_primary',16,
 'thickness_secondary',6,
 'length_ft',8,
 'width_ft',4,
 'sheets_per_slot',100,
 'default_primary',70,
 'min_primary',70,
 'max_primary',70,
 'default_secondary',30,
 'min_secondary',30,
 'max_secondary',30,
 'rate_card',jsonb_build_object(
  'mr_16',coalesce((config->'rate_card'->>'mr_16')::numeric,(config->>'primary_rate')::numeric,56),
  'bwp_16',coalesce((config->'rate_card'->>'bwp_16')::numeric,(config->>'primary_rate')::numeric,56),
  'mr_6',coalesce((config->'rate_card'->>'mr_6')::numeric,(config->>'secondary_rate')::numeric,56),
  'bwp_6',coalesce((config->'rate_card'->>'bwp_6')::numeric,(config->>'secondary_rate')::numeric,56)
 )
),updated_at=clock_timestamp();

create or replace function public.save_pool(p_admin uuid,p_record jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools;sid uuid;cfg jsonb;rates jsonb;begin
 if not exists(select 1 from admins where user_id=p_admin) then raise exception 'Administrator required.';end if;
 sid=(p_record->>'shipment_id')::uuid;perform 1 from shipments where id=sid for update;
 select * into p from pools where id=(p_record->>'id')::uuid for update;
 if found and (p.status not in('draft','live') or exists(select 1 from orders where pool_id=p.id)) then raise exception 'Commercial terms are locked after reservations. Create a new pool.';end if;
 cfg=p_record->'config';rates=cfg->'rate_card';
 if cfg is null or rates is null or jsonb_typeof(rates)<>'object' or not rates ?& array['mr_16','bwp_16','mr_6','bwp_6'] then raise exception 'Enter all four ex-factory rates in the fixed slot rate card.';end if;
 if (rates->>'mr_16')::numeric<=0 or (rates->>'bwp_16')::numeric<=0 or (rates->>'mr_6')::numeric<=0 or (rates->>'bwp_6')::numeric<=0 then raise exception 'Every fixed slot rate must be greater than zero.';end if;
 if (cfg->>'gst_percent')::numeric<>18 then raise exception 'GST must be 18 percent.';end if;
 cfg=cfg||jsonb_build_object(
  'thickness_primary',16,'thickness_secondary',6,'length_ft',8,'width_ft',4,
  'sheets_per_slot',100,'default_primary',70,'min_primary',70,'max_primary',70,
  'default_secondary',30,'min_secondary',30,'max_secondary',30,
  'primary_rate',(rates->>'mr_16')::numeric,'secondary_rate',(rates->>'mr_6')::numeric
 );
 insert into pools(id,code,name,category_id,shipment_id,city,image_url,total_slots,closes_at,config)
 values((p_record->>'id')::uuid,p_record->>'code',p_record->>'name',(p_record->>'category_id')::uuid,sid,p_record->>'city',p_record->>'image_url',(p_record->>'total_slots')::int,(p_record->>'closes_at')::timestamptz,cfg)
 on conflict(id) do update set code=excluded.code,name=excluded.name,category_id=excluded.category_id,shipment_id=excluded.shipment_id,city=excluded.city,image_url=excluded.image_url,total_slots=excluded.total_slots,closes_at=excluded.closes_at,config=excluded.config,updated_at=clock_timestamp();
 if projected_weight(sid)>(select payload_kg from shipments where id=sid) then raise exception 'The linked fixed slots exceed the shipment payload.';end if;
 insert into audit_log(actor,action,entity_id,payload)values(p_admin,'save_pool',(p_record->>'id')::uuid,jsonb_set(p_record,'{config}',cfg));
 return jsonb_build_object('saved',true);
end;$$;

create or replace function public.reserve_slots(p_user uuid,p_pool uuid,p_slots integer[],p_primary integer,p_secondary integer,p_quote jsonb,p_version timestamptz) returns jsonb language plpgsql security definer set search_path=public as $$
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
 if p_primary<>70 or p_secondary<>30 or p_primary<>(p.config->>'default_primary')::int or p_secondary<>(p.config->>'default_secondary')::int then raise exception 'This pool accepts only the fixed 100-sheet slot composition.';end if;
 if exists(select 1 from slot_allocations where pool_id=p_pool and slot_no=any(p_slots))then raise exception 'A selected slot was just reserved. Choose another slot.';end if;
 if exists(select 1 from waitlist where pool_id=p_pool and offered_slot=any(p_slots)and status='offered' and user_id<>p_user)then raise exception 'A selected slot is held for a waiting-list offer.';end if;
 if is_replacement and (n<>1 or not exists(select 1 from waitlist w join vacated_slots v on v.pool_id=w.pool_id and v.slot_no=w.offered_slot where w.pool_id=p.id and w.user_id=p_user and w.status='offered' and w.offered_slot=p_slots[1]and v.primary_qty=p_primary and v.secondary_qty=p_secondary))then raise exception 'A valid waiting-list offer for the fixed QC-approved slot is required.';end if;
 if (p_quote->>'slot_count')::int<>n or (p_quote->>'primary_qty')::int<>70 or (p_quote->>'secondary_qty')::int<>30 or (p_quote->>'sheets')::int<>100*n or p_quote->>'terms_version'<>'2026-09-p1'then raise exception 'Quotation mismatch.';end if;
 insert into orders(pool_id,user_id,slot_numbers,primary_qty,secondary_qty,quote,profile_snapshot,expires_at,replacement,payment_due_at)
 values(p_pool,p_user,p_slots,70,30,p_quote,to_jsonb(profile),now()+interval '15 minutes',is_replacement,case when is_replacement then now()+interval '48 hours'else null end)returning * into o;
 insert into slot_allocations select p_pool,v,o.id from unnest(p_slots)v;
 if projected_weight(s.id)>s.payload_kg then raise exception 'The fixed slots exceed the shared truck payload.';end if;
 update waitlist set status='accepted' where pool_id=p_pool and user_id=p_user and status='offered' and offered_slot=any(p_slots);
 return to_jsonb(o);
end;$$;

revoke all on function public.save_pool(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.reserve_slots(uuid,uuid,integer[],integer,integer,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.save_pool(uuid,jsonb) to service_role;
grant execute on function public.reserve_slots(uuid,uuid,integer[],integer,integer,jsonb,timestamptz) to service_role;
