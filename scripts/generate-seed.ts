import {writeFileSync}from'node:fs';
import {demoSeed}from'../lib/seed';
const d=demoSeed(),q=(s:string)=>`'${s.replaceAll("'","''")}'`;
let sql='-- Two OEM pools. Production records deliberately start as DRAFT.\n-- ₹56 is assumed for BOTH thicknesses. ₹50,000 combined freight is a budget, not a quote.\n-- Replace pending specs, rates, dates and weights in admin before publishing.\n';
for(const c of d.categories)sql+=`insert into public.categories(id,name,slug,description,image_url,active)values(${q(c.id)},${q(c.name)},${q(c.slug)},${q(c.description)},${q(c.image_url)},true)on conflict(id)do nothing;\n`;
for(const s of d.shipments)sql+=`insert into public.shipments(id,name,origin,destination,payload_kg,packing_kg)values(${q(s.id)},${q(s.name)},${q(s.origin)},${q(s.destination)},${s.payload_kg},${s.packing_kg})on conflict(id)do nothing;\n`;
for(const p of d.pools)sql+=`insert into public.pools(id,code,name,category_id,shipment_id,city,image_url,status,total_slots,closes_at,config)values(${q(p.id)},${q(p.code)},${q(p.name)},${q(p.category_id)},${q(p.shipment_id)},${q(p.city)},${q(p.image_url)},'draft',${p.total_slots},now()+interval '72 hours',${q(JSON.stringify(p.config))}::jsonb)on conflict(id)do nothing;\n`;
writeFileSync('supabase/seed.sql',sql);
