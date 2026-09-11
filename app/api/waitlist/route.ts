import {z} from 'zod';
import {identity,ok,failure,jsonBody,rpc,limit} from '@/lib/server';
export async function POST(request:Request){try{const user=await identity(request);await limit(user!.id,'waitlist',10);const{pool_id}=z.object({pool_id:z.uuid()}).parse(await jsonBody(request));return ok(await rpc('join_waitlist',{p_user:user!.id,p_pool:pool_id}));}catch(e){return failure(e);}}
