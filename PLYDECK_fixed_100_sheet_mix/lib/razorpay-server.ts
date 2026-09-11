import {createHmac,timingSafeEqual} from 'node:crypto';
import {HttpError,rpc,serverDb} from './server';
import type {Stage} from './types';
export function checkSignature(message:string,signature:string,secret:string){if(!/^[a-f0-9]{64}$/i.test(signature))return false;const expected=createHmac('sha256',secret).update(message).digest();return timingSafeEqual(expected,Buffer.from(signature,'hex'));}
export async function razorpay(path:string,body?:unknown,idempotency?:string){const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;if(!key||!secret)throw new HttpError(503,'Payment provider is not configured.');const response=await fetch(`https://api.razorpay.com/v1/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,'Content-Type':'application/json',...(idempotency?{'X-Refund-Idempotency':idempotency}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),cache:'no-store'});const result=await response.json();if(!response.ok)throw new HttpError(502,'The payment provider could not complete this request. Retry from My orders; do not create a second reservation.');return result;}
export async function createPayment(orderId:string,userId:string,stage:Stage){
 if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET)throw new HttpError(503,'Razorpay credentials are not configured.');
 const attempt=await rpc('prepare_payment',{p_order:orderId,p_user:userId,p_stage:stage});
 if(attempt.razorpay_order_id)return{order_id:orderId,razorpay_order_id:attempt.razorpay_order_id,key:process.env.RAZORPAY_KEY_ID,amount:attempt.amount};
 try{const remote=await razorpay('orders',{amount:attempt.amount,currency:'INR',receipt:attempt.id.replaceAll('-',''),notes:{plydeck_order:orderId,stage,attempt_id:attempt.id}});
  const{error}=await serverDb().from('payment_attempts').update({razorpay_order_id:remote.id,status:'created'}).eq('id',attempt.id).is('razorpay_order_id',null);if(error)throw error;
  return{order_id:orderId,razorpay_order_id:remote.id,key:process.env.RAZORPAY_KEY_ID,amount:attempt.amount};
 }catch(e){await serverDb().from('payment_attempts').update({status:'creation_uncertain'}).eq('id',attempt.id).is('razorpay_order_id',null);throw e;}
}
export async function settlePayment(paymentId:string){
 const payment=await razorpay(`payments/${encodeURIComponent(paymentId)}`);if(payment.status!=='captured'||payment.currency!=='INR')throw new HttpError(409,'Payment is not captured yet. We will reconcile it before marking the order paid.');
 const{data:attempt}=await serverDb().from('payment_attempts').select('*').eq('razorpay_order_id',payment.order_id).maybeSingle();
 if(!attempt){const remote=await razorpay(`orders/${encodeURIComponent(payment.order_id)}`);const id=remote.notes?.attempt_id;if(!id)throw new HttpError(409,'Unrecognised payment order.');const{data:unlinked}=await serverDb().from('payment_attempts').select('*').eq('id',id).maybeSingle();if(!unlinked||remote.amount!==unlinked.amount||remote.receipt!==id.replaceAll('-',''))throw new HttpError(409,'Payment order mismatch.');await serverDb().from('payment_attempts').update({razorpay_order_id:payment.order_id,status:'created'}).eq('id',id).is('razorpay_order_id',null);}
 return rpc('apply_payment',{p_razorpay_order:payment.order_id,p_payment:payment.id,p_amount:payment.amount,p_currency:payment.currency});
}
export async function processRefund(refundId:string,adminId:string,amount:number,note:string){
 const tasks=await rpc('prepare_refund',{p_refund:refundId,p_admin:adminId,p_amount:amount,p_note:note});
 for(const task of tasks){if(task.provider_refund_id)continue;const result=await razorpay(`payments/${encodeURIComponent(task.payment_id)}/refund`,{amount:task.amount,notes:{refund_task:task.id,plydeck_refund:refundId}},task.id);const{error}=await serverDb().from('refund_tasks').update({provider_refund_id:result.id,status:result.status==='processed'?'processed':'pending'}).eq('id',task.id);if(error)throw error;}
 await rpc('finish_refund',{p_refund:refundId});
}
