import {z} from 'zod';
import {identity,ok,failure,jsonBody,rpc,limit} from '@/lib/server';
export async function POST(request:Request){try{const user=await identity(request);await limit(user!.id,'cancel',10);const{order_id}=z.object({order_id:z.uuid()}).parse(await jsonBody(request));return ok(await rpc('cancel_order',{p_user:user!.id,p_order:order_id}));}catch(e){return failure(e);}}
