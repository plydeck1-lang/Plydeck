import type {StoreData, PoolConfig} from './types';
export const OEM_CATEGORY='11111111-1111-4111-8111-111111111111';
export const SHIPMENT_ID='22222222-2222-4222-8222-222222222222';
export const POOL_ONE='33333333-3333-4333-8333-333333333331';
export const POOL_TWO='33333333-3333-4333-8333-333333333332';
export const initialConfig:PoolConfig={thickness_primary:16,thickness_secondary:6,length_ft:8,width_ft:4,sheets_per_slot:100,default_primary:70,min_primary:70,max_primary:85,default_secondary:30,min_secondary:15,max_secondary:30,primary_rate:56,secondary_rate:56,margin_rate:2,rounding_rate:.25,gst_percent:18,primary_weight:32,secondary_weight:12,costs:{transport:25000,unloading:5000,pickup_loading:2500,factory_packing:2000,insurance:1500,contingency:2000,warehouse:9000},core:'Semi-hardwood',face:'Okoume',bond:'Factory specification pending',tolerance:'Factory specification pending',specification:'OEM furniture plywood. Final bond grade, core construction, thickness tolerance and batch weights must be agreed before production bookings.'};
export function demoSeed():StoreData{
 return{categories:[{id:OEM_CATEGORY,name:'OEM Plywood',slug:'oem-plywood',description:'Flexible thickness combinations for cabinetry, interior fit-outs and retail stock.',image_url:'/plywood-studio.png',active:true},
 {id:'11111111-1111-4111-8111-111111111112',name:'Commercial Plywood',slug:'commercial-plywood',description:'Everyday interior applications. Categories and supplier specifications are managed by PLYDECK.',image_url:'/plywood-studio.png',active:true},
 {id:'11111111-1111-4111-8111-111111111113',name:'Marine Plywood',slug:'marine-plywood',description:'Explore marine-grade products as verified supplier specifications become available.',image_url:'/plywood-studio.png',active:true}],
 shipments:[{id:SHIPMENT_ID,name:'Kerala → Bengaluru · combined load',origin:'Perumbavoor, Kerala',destination:'Bengaluru',payload_kg:32000,packing_kg:600}],
 pools:[1,2].map(i=>({id:i===1?POOL_ONE:POOL_TWO,code:`BLR-OEM-00${i}`,name:i===1?'OEM collective · Pool 01':'OEM collective · Pool 02',category_id:OEM_CATEGORY,shipment_id:SHIPMENT_ID,city:'Bengaluru',image_url:'/plywood-studio.png',status:'live' as const,total_slots:5,closes_at:new Date(Date.now()+72*3600000).toISOString(),config:structuredClone(initialConfig),allocations:[],waitlist_count:0})),orders:[],profile:null,isAdmin:false,waitlist:[],refunds:[],whatsappMessages:[],whatsapp:{enabled:false,configured:false,reason:'Demo mode — no messages are sent.'}};
}
