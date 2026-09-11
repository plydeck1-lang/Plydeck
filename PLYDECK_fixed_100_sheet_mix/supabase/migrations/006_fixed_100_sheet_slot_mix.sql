-- Make the OEM quantity selector a linked, fixed-total mix.
-- Each slot contains exactly 100 sheets: default 70 x 16mm + 30 x 6mm.
-- The buyer can shuffle from 70:30 through 85:15.

update public.pools
set config=config||jsonb_build_object(
 'sheets_per_slot',100,
 'default_primary',70,
 'min_primary',70,
 'max_primary',85,
 'default_secondary',30,
 'min_secondary',15,
 'max_secondary',30
),updated_at=clock_timestamp()
where (config->>'thickness_primary')::numeric=16
  and (config->>'thickness_secondary')::numeric=6;

create or replace function public.save_pool(p_admin uuid,p_record jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools;sid uuid;cfg jsonb;begin
 if not exists(select 1 from admins where user_id=p_admin) then raise exception 'Administrator required.';end if;
 sid=(p_record->>'shipment_id')::uuid;perform 1 from shipments where id=sid for update;
 select * into p from pools where id=(p_record->>'id')::uuid for update;
 if found and (p.status not in('draft','live') or exists(select 1 from orders where pool_id=p.id)) then raise exception 'Commercial terms are locked after reservations. Create a new pool.';end if;
 cfg=p_record->'config';
 if cfg is null or not cfg ?& array['sheets_per_slot','default_primary','min_primary','max_primary','default_secondary','min_secondary','max_secondary'] then raise exception 'Both thickness quantity settings are required.';end if;
 if (cfg->>'gst_percent')::numeric<>18
  or (cfg->>'sheets_per_slot')::int<1
  or (cfg->>'min_primary')::int<0
  or (cfg->>'min_secondary')::int<0
  or (cfg->>'min_primary')::int>(cfg->>'default_primary')::int
  or (cfg->>'default_primary')::int>(cfg->>'max_primary')::int
  or (cfg->>'min_secondary')::int>(cfg->>'default_secondary')::int
  or (cfg->>'default_secondary')::int>(cfg->>'max_secondary')::int
  or (cfg->>'sheets_per_slot')::int<>(cfg->>'default_primary')::int+(cfg->>'default_secondary')::int
  or (cfg->>'sheets_per_slot')::int<>(cfg->>'min_primary')::int+(cfg->>'max_secondary')::int
  or (cfg->>'sheets_per_slot')::int<>(cfg->>'max_primary')::int+(cfg->>'min_secondary')::int
 then raise exception 'Every permitted mix must equal the fixed sheets per slot.';end if;
 insert into pools(id,code,name,category_id,shipment_id,city,image_url,total_slots,closes_at,config)
 values((p_record->>'id')::uuid,p_record->>'code',p_record->>'name',(p_record->>'category_id')::uuid,sid,p_record->>'city',p_record->>'image_url',(p_record->>'total_slots')::int,(p_record->>'closes_at')::timestamptz,cfg)
 on conflict(id) do update set code=excluded.code,name=excluded.name,category_id=excluded.category_id,shipment_id=excluded.shipment_id,city=excluded.city,image_url=excluded.image_url,total_slots=excluded.total_slots,closes_at=excluded.closes_at,config=excluded.config,updated_at=clock_timestamp();
 if projected_weight(sid)>(select payload_kg from shipments where id=sid) then raise exception 'The linked pools exceed the shipment payload at their default mixes.';end if;
 insert into audit_log(actor,action,entity_id,payload)values(p_admin,'save_pool',(p_record->>'id')::uuid,p_record);
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
 if p_primary<(p.config->>'min_primary')::int or p_primary>(p.config->>'max_primary')::int
  or p_secondary<(p.config->>'min_secondary')::int or p_secondary>(p.config->>'max_secondary')::int
 then raise exception 'One or both thickness quantities are outside the pool limits.';end if;
 if p_primary+p_secondary<>(p.config->>'sheets_per_slot')::int then raise exception 'Each slot must contain exactly the configured sheet total.';end if;
 if exists(select 1 from slot_allocations where pool_id=p_pool and slot_no=any(p_slots))then raise exception 'A selected slot was just reserved. Choose another slot.';end if;
 if exists(select 1 from waitlist where pool_id=p_pool and offered_slot=any(p_slots)and status='offered' and user_id<>p_user)then raise exception 'A selected slot is held for a waiting-list offer.';end if;
 if is_replacement and (n<>1 or not exists(select 1 from waitlist w join vacated_slots v on v.pool_id=w.pool_id and v.slot_no=w.offered_slot where w.pool_id=p.id and w.user_id=p_user and w.status='offered' and w.offered_slot=p_slots[1]and v.primary_qty=p_primary and v.secondary_qty=p_secondary))then raise exception 'A valid waiting-list offer and the original QC-approved quantities are required.';end if;
 if (p_quote->>'slot_count')::int<>n or (p_quote->>'primary_qty')::int<>p_primary or (p_quote->>'secondary_qty')::int<>p_secondary or p_quote->>'terms_version'<>'2026-09-p1'then raise exception 'Quotation mismatch.';end if;
 insert into orders(pool_id,user_id,slot_numbers,primary_qty,secondary_qty,quote,profile_snapshot,expires_at,replacement,payment_due_at)
 values(p_pool,p_user,p_slots,p_primary,p_secondary,p_quote,to_jsonb(profile),now()+interval '15 minutes',is_replacement,case when is_replacement then now()+interval '48 hours'else null end)returning * into o;
 insert into slot_allocations select p_pool,v,o.id from unnest(p_slots)v;
 if projected_weight(s.id)>s.payload_kg then raise exception 'This mix exceeds the shared truck payload. Reduce the 16mm quantity.';end if;
 update waitlist set status='accepted' where pool_id=p_pool and user_id=p_user and status='offered' and offered_slot=any(p_slots);
 return to_jsonb(o);
end;$$;

revoke all on function public.save_pool(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.reserve_slots(uuid,uuid,integer[],integer,integer,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.save_pool(uuid,jsonb) to service_role;
grant execute on function public.reserve_slots(uuid,uuid,integer[],integer,integer,jsonb,timestamptz) to service_role;
