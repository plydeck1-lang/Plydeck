-- Let buyers choose the two thickness quantities independently.
-- Default OEM mix: 70 x 16mm plus 30 x 6mm. Buyer ranges: 60-100 and 15-30.

alter table public.waitlist add column if not exists offered_secondary integer;
alter table public.vacated_slots add column if not exists secondary_qty integer;

update public.vacated_slots v
set secondary_qty=o.secondary_qty
from public.orders o
where o.id=v.source_order and v.secondary_qty is null;

update public.vacated_slots v
set secondary_qty=(p.config->>'sheets_per_slot')::integer-v.primary_qty
from public.pools p
where p.id=v.pool_id and v.secondary_qty is null;

alter table public.vacated_slots alter column secondary_qty set not null;

-- Give every historical pool explicit secondary bounds. Existing 16mm/6mm OEM
-- pools receive the requested 70:30 default and adjustable quantity ranges.
update public.pools
set config=config||jsonb_build_object(
 'default_secondary',greatest(0,(config->>'sheets_per_slot')::integer-(config->>'default_primary')::integer),
 'min_secondary',greatest(0,(config->>'sheets_per_slot')::integer-(config->>'max_primary')::integer),
 'max_secondary',greatest(0,(config->>'sheets_per_slot')::integer-(config->>'min_primary')::integer)
)
where not(config ? 'default_secondary' and config ? 'min_secondary' and config ? 'max_secondary');

update public.pools
set config=config||jsonb_build_object(
 'sheets_per_slot',100,
 'default_primary',70,
 'min_primary',60,
 'max_primary',100,
 'default_secondary',30,
 'min_secondary',15,
 'max_secondary',30
),updated_at=clock_timestamp()
where (config->>'thickness_primary')::numeric=16
  and (config->>'thickness_secondary')::numeric=6;

update public.waitlist w
set offered_secondary=coalesce(
 (select v.secondary_qty from public.vacated_slots v where v.pool_id=w.pool_id and v.slot_no=w.offered_slot),
 (select (p.config->>'default_secondary')::integer from public.pools p where p.id=w.pool_id)
)
where w.status='offered' and w.offered_secondary is null;

create or replace function public.projected_weight(p_shipment uuid) returns numeric language sql stable security definer set search_path=public as $$
 select s.packing_kg+coalesce(sum(
   coalesce((select sum((o.quote->>'weight_kg')::numeric) from orders o where o.pool_id=p.id and exists(select 1 from slot_allocations a where a.order_id=o.id)),0)
   +(p.total_slots-(select count(*) from slot_allocations a where a.pool_id=p.id))*
   ((p.config->>'default_primary')::numeric*(p.config->>'primary_weight')::numeric+(p.config->>'default_secondary')::numeric*(p.config->>'secondary_weight')::numeric)
 ),0) from shipments s left join pools p on p.shipment_id=s.id and p.status<>'cancelled' where s.id=p_shipment group by s.packing_kg;
$$;

create or replace function public.save_pool(p_admin uuid,p_record jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools;sid uuid;cfg jsonb;begin
 if not exists(select 1 from admins where user_id=p_admin) then raise exception 'Administrator required.';end if;
 sid=(p_record->>'shipment_id')::uuid;perform 1 from shipments where id=sid for update;
 select * into p from pools where id=(p_record->>'id')::uuid for update;
 if found and (p.status not in('draft','live') or exists(select 1 from orders where pool_id=p.id)) then raise exception 'Commercial terms are locked after reservations. Create a new pool.';end if;
 cfg=p_record->'config';
 if cfg is null or not cfg ?& array['sheets_per_slot','default_primary','min_primary','max_primary','default_secondary','min_secondary','max_secondary'] then raise exception 'Both thickness quantity settings are required.';end if;
 if (cfg->>'gst_percent')::numeric<>18
  or (cfg->>'min_primary')::int>(cfg->>'default_primary')::int
  or (cfg->>'default_primary')::int>(cfg->>'max_primary')::int
  or (cfg->>'min_secondary')::int>(cfg->>'default_secondary')::int
  or (cfg->>'default_secondary')::int>(cfg->>'max_secondary')::int
  or (cfg->>'sheets_per_slot')::int<>(cfg->>'default_primary')::int+(cfg->>'default_secondary')::int
 then raise exception 'Invalid pool quantity configuration.';end if;
 insert into pools(id,code,name,category_id,shipment_id,city,image_url,total_slots,closes_at,config)
 values((p_record->>'id')::uuid,p_record->>'code',p_record->>'name',(p_record->>'category_id')::uuid,sid,p_record->>'city',p_record->>'image_url',(p_record->>'total_slots')::int,(p_record->>'closes_at')::timestamptz,cfg)
 on conflict(id) do update set code=excluded.code,name=excluded.name,category_id=excluded.category_id,shipment_id=excluded.shipment_id,city=excluded.city,image_url=excluded.image_url,total_slots=excluded.total_slots,closes_at=excluded.closes_at,config=excluded.config,updated_at=clock_timestamp();
 if projected_weight(sid)>(select payload_kg from shipments where id=sid) then raise exception 'The linked pools exceed the shipment payload at their default mixes.';end if;
 insert into audit_log(actor,action,entity_id,payload)values(p_admin,'save_pool',(p_record->>'id')::uuid,p_record);
 return jsonb_build_object('saved',true);
end;$$;

create or replace function public.remember_vacated_slot()returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status in('defaulted','cancelled') and old.status<>new.status and exists(select 1 from pools where id=new.pool_id and status in('confirmed','qc_ready'))then
  insert into vacated_slots(pool_id,slot_no,primary_qty,secondary_qty,source_order)
  select new.pool_id,n,new.primary_qty,new.secondary_qty,new.id from unnest(new.slot_numbers)n
  on conflict(pool_id,slot_no)do update set primary_qty=excluded.primary_qty,secondary_qty=excluded.secondary_qty,source_order=excluded.source_order;
 end if;return new;
end;$$;

create or replace function public.offer_next(p_admin uuid,p_pool uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare p pools;candidate waitlist;n integer;primary_sheets integer;secondary_sheets integer;begin
 if not exists(select 1 from admins where user_id=p_admin)then raise exception 'Administrator required.';end if;
 select * into p from pools where id=p_pool for update;
 if p.status not in('live','qc_ready') or (p.status='live' and p.closes_at<now())then raise exception 'Offers require an open pool or a released QC-approved slot.';end if;
 perform expire_holds();
 select v into n from generate_series(1,p.total_slots)v where not exists(select 1 from slot_allocations a where a.pool_id=p.id and a.slot_no=v) and not exists(select 1 from waitlist w where w.pool_id=p.id and w.offered_slot=v and w.status='offered') and (p.status='live' or exists(select 1 from vacated_slots x where x.pool_id=p.id and x.slot_no=v))order by v limit 1;
 if n is null then raise exception 'No released slots available.';end if;
 select * into candidate from waitlist where pool_id=p.id and status='waiting' order by created_at,id limit 1 for update;
 if candidate.id is null then raise exception 'No waiting buyers.';end if;
 select primary_qty,secondary_qty into primary_sheets,secondary_sheets from vacated_slots where pool_id=p.id and slot_no=n;
 update waitlist set status='offered',offered_slot=n,
  offered_primary=coalesce(primary_sheets,(p.config->>'default_primary')::int),
  offered_secondary=coalesce(secondary_sheets,(p.config->>'default_secondary')::int),
  offer_expires_at=case when p.status='live' then least(now()+interval '24 hours',p.closes_at)else now()+interval '24 hours'end
 where id=candidate.id;
 insert into audit_log(actor,action,entity_id,payload)values(p_admin,'offer_next',p.id,jsonb_build_object('waitlist_id',candidate.id,'slot',n));return jsonb_build_object('offered',true,'slot',n);
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
 if exists(select 1 from slot_allocations where pool_id=p_pool and slot_no=any(p_slots))then raise exception 'A selected slot was just reserved. Choose another slot.';end if;
 if exists(select 1 from waitlist where pool_id=p_pool and offered_slot=any(p_slots)and status='offered' and user_id<>p_user)then raise exception 'A selected slot is held for a waiting-list offer.';end if;
 if is_replacement and (n<>1 or not exists(select 1 from waitlist w join vacated_slots v on v.pool_id=w.pool_id and v.slot_no=w.offered_slot where w.pool_id=p.id and w.user_id=p_user and w.status='offered' and w.offered_slot=p_slots[1]and v.primary_qty=p_primary and v.secondary_qty=p_secondary))then raise exception 'A valid waiting-list offer and the original QC-approved quantities are required.';end if;
 if (p_quote->>'slot_count')::int<>n or (p_quote->>'primary_qty')::int<>p_primary or (p_quote->>'secondary_qty')::int<>p_secondary or p_quote->>'terms_version'<>'2026-09-p1'then raise exception 'Quotation mismatch.';end if;
 insert into orders(pool_id,user_id,slot_numbers,primary_qty,secondary_qty,quote,profile_snapshot,expires_at,replacement,payment_due_at)
 values(p_pool,p_user,p_slots,p_primary,p_secondary,p_quote,to_jsonb(profile),now()+interval '15 minutes',is_replacement,case when is_replacement then now()+interval '48 hours'else null end)returning * into o;
 insert into slot_allocations select p_pool,v,o.id from unnest(p_slots)v;
 if projected_weight(s.id)>s.payload_kg then raise exception 'This mix exceeds the shared truck payload. Reduce one or both sheet quantities.';end if;
 update waitlist set status='accepted' where pool_id=p_pool and user_id=p_user and status='offered' and offered_slot=any(p_slots);
 return to_jsonb(o);
end;$$;

-- Short deployment bridge for the previous web build. It derives the secondary
-- amount from the former fixed-total model until Vercel deploys the new client.
create or replace function public.reserve_slots(p_user uuid,p_pool uuid,p_slots integer[],p_primary integer,p_quote jsonb,p_version timestamptz) returns jsonb language plpgsql security definer set search_path=public as $$
declare secondary_sheets integer;begin
 select (config->>'sheets_per_slot')::integer-p_primary into secondary_sheets from pools where id=p_pool;
 return reserve_slots(p_user,p_pool,p_slots,p_primary,secondary_sheets,p_quote,p_version);
end;$$;

revoke all on function public.projected_weight(uuid) from public,anon,authenticated;
revoke all on function public.save_pool(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.remember_vacated_slot() from public,anon,authenticated;
revoke all on function public.offer_next(uuid,uuid) from public,anon,authenticated;
revoke all on function public.reserve_slots(uuid,uuid,integer[],integer,integer,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.reserve_slots(uuid,uuid,integer[],integer,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.projected_weight(uuid) to service_role;
grant execute on function public.save_pool(uuid,jsonb) to service_role;
grant execute on function public.remember_vacated_slot() to service_role;
grant execute on function public.offer_next(uuid,uuid) to service_role;
grant execute on function public.reserve_slots(uuid,uuid,integer[],integer,integer,jsonb,timestamptz) to service_role;
grant execute on function public.reserve_slots(uuid,uuid,integer[],integer,jsonb,timestamptz) to service_role;
