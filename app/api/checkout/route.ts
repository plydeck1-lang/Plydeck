import {identity,serverDb,ok,failure,jsonBody,limit,rpc,HttpError} from '@/lib/server';
import {checkoutSchema} from '@/lib/validation';
import {quoteSlot} from '@/lib/pricing';
import {createPayment} from '@/lib/razorpay-server';
export async function POST(request:Request){try{const user=await identity(request);await limit(user!.id,'checkout',12);if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET)throw new HttpError(503,'Payments are not configured.');const input=checkoutSchema.parse(await jsonBody(request));const{data:pool,error}=await serverDb().from('pools').select('*').eq('id',input.pool_id).single();if(error||!pool)throw new HttpError(404,'Pool not found.');const quote=quoteSlot(pool,input.primary_qty,input.slot_numbers.length);if(quote.total!==input.expected_total)throw new HttpError(409,'The price changed. Refresh the pool and review the current quotation.');
 const order=await rpc('reserve_slots',{p_user:user!.id,p_pool:pool.id,p_slots:input.slot_numbers,p_primary:input.primary_qty,p_quote:quote,p_version:pool.updated_at});return ok(await createPayment(order.id,user!.id,'booking'));
 }catch(e){return failure(e);}}
