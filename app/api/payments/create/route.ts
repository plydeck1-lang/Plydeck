import {z} from 'zod';
import {identity,ok,failure,jsonBody,limit} from '@/lib/server';
import {createPayment} from '@/lib/razorpay-server';
export async function POST(request:Request){try{const user=await identity(request);await limit(user!.id,'payment',15);const body=z.object({order_id:z.uuid(),stage:z.enum(['booking','confirmation','dispatch'])}).parse(await jsonBody(request));return ok(await createPayment(body.order_id,user!.id,body.stage));}catch(e){return failure(e);}}
