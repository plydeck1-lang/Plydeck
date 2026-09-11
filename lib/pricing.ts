import type {Pool, Quote, Stage, Costs} from './types';
export const TERMS_VERSION='2026-09-p1';
export const COST_LABELS:Record<keyof Costs,string>={transport:'Factory → Bengaluru freight',unloading:'Warehouse unloading',pickup_loading:'Loading for collection',factory_packing:'Factory loading & packing',insurance:'Transit insurance',contingency:'Handling contingency',warehouse:'Transit warehouse allocation'};
export const money=(paise:number,decimals=0)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(paise/100);
export const rupees=(value:number)=>money(Math.round(value*100),2);
export function quoteSlot(pool:Pool,primary:number,slots=1):Quote{
 const c=pool.config;
 if(!Number.isInteger(primary)||primary<c.min_primary||primary>c.max_primary)throw new Error(`Choose ${c.min_primary}–${c.max_primary} primary sheets per slot.`);
 if(!Number.isInteger(slots)||slots<1||slots>pool.total_slots)throw new Error('Invalid slot count.');
 const secondary=c.sheets_per_slot-primary, area=c.sheets_per_slot*c.length_ft*c.width_ft*slots;
 const unitArea=c.length_ft*c.width_ft;
 const lines=[{label:`${c.thickness_primary}mm plywood · ex-factory`,amount:Math.round(primary*slots*unitArea*c.primary_rate*100),basis:`${primary*slots} sheets × ${unitArea} sqft × ₹${c.primary_rate}`},
 {label:`${c.thickness_secondary}mm plywood · ex-factory`,amount:Math.round(secondary*slots*unitArea*c.secondary_rate*100),basis:`${secondary*slots} sheets × ${unitArea} sqft × ₹${c.secondary_rate}`}];
 for(const k of Object.keys(COST_LABELS) as (keyof Costs)[])lines.push({label:COST_LABELS[k],amount:Math.round(c.costs[k]*100/pool.total_slots)*slots,basis:`₹${c.costs[k].toLocaleString('en-IN')} pool allocation ÷ ${pool.total_slots} slots × ${slots}`});
 lines.push({label:'PLYDECK service & trading spread',amount:Math.round(area*c.margin_rate*100),basis:`${area.toLocaleString('en-IN')} sqft × ₹${c.margin_rate}`});
 let subtotal=lines.reduce((s,l)=>s+l.amount,0);
 if(c.rounding_rate>0){const rounded=Math.ceil((subtotal/(area*100)-1e-9)/c.rounding_rate)*c.rounding_rate; const uplift=Math.round(rounded*area*100)-subtotal; if(uplift>0){lines.push({label:'Selling-rate rounding',amount:uplift,basis:`Rounded up to ₹${c.rounding_rate}/sqft increment`});subtotal+=uplift;}}
 const gst=Math.round(subtotal*c.gst_percent/100),total=subtotal+gst;
 const booking=Math.round(total*.1),confirmation=Math.round(total*.4);
 return{primary_qty:primary,secondary_qty:secondary,slot_count:slots,sheets:c.sheets_per_slot*slots,area,weight_kg:(primary*c.primary_weight+secondary*c.secondary_weight)*slots,lines,subtotal,gst,total,rate:subtotal/area/100,stages:{booking,confirmation,dispatch:total-booking-confirmation},terms_version:TERMS_VERSION};
}
export function nextStage(order:{paid_amount:number;quote:Quote;replacement?:boolean},status:string):Stage|null{
 if(order.paid_amount===0&&(status==='live'||order.replacement&&status==='qc_ready'))return'booking';
 if(order.paid_amount===order.quote.stages.booking&&(status==='confirming'||order.replacement&&status==='qc_ready'))return'confirmation';
 if(order.paid_amount===order.quote.stages.booking+order.quote.stages.confirmation&&status==='qc_ready')return'dispatch';
 return null;
}
