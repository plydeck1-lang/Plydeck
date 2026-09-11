import {z} from 'zod';
import {adminIdentity,serverDb,ok,failure,jsonBody,rpc,HttpError,limit} from '@/lib/server';
import {poolSchema,categorySchema,shipmentSchema} from '@/lib/validation';
import {processRefund} from '@/lib/razorpay-server';
export async function POST(request:Request){try{const user=await adminIdentity(request);await limit(user.id,'admin',50);const body=await jsonBody(request);switch(body.action){
 case 'save':{if(body.entity==='pools')return ok(await rpc('save_pool',{p_admin:user.id,p_record:poolSchema.parse(body.record)}));if(body.entity==='shipments')return ok(await rpc('save_shipment',{p_admin:user.id,p_record:shipmentSchema.parse(body.record)}));if(body.entity==='categories'){const value=categorySchema.parse(body.record);const db=serverDb();const{error}=await db.from('categories').upsert(value);if(error)throw error;await db.from('audit_log').insert({actor:user.id,action:'save_category',entity_id:value.id,payload:value});return ok({saved:true});}throw new HttpError(400,'Unknown entity.');}
 case 'transition':{const v=z.object({pool_id:z.uuid(),event:z.enum(['publish','request_confirmation','confirm','qc','dispatch','cancel']),note:z.string().max(10000).default('')}).parse(body);return ok(await rpc('transition_pool',{p_admin:user.id,p_pool:v.pool_id,p_event:v.event,p_note:v.note}));}
 case 'default_notice':case 'default':{const v=z.object({order_id:z.uuid(),note:z.string().min(10).max(10000)}).parse(body);return ok(await rpc('default_order',{p_admin:user.id,p_order:v.order_id,p_event:body.action,p_note:v.note}));}
 case 'offer_next':return ok(await rpc('offer_next',{p_admin:user.id,p_pool:z.uuid().parse(body.pool_id)}));
 case 'refund':{const v=z.object({refund_id:z.uuid(),amount:z.number().int().nonnegative(),note:z.string().min(5).max(10000)}).parse(body);await processRefund(v.refund_id,user.id,v.amount,v.note);return ok({processed:true});}
 default:throw new HttpError(400,'Unknown action.');}}catch(e){return failure(e);}}
