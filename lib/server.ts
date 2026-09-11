import {createClient} from '@supabase/supabase-js';
import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
export function serverDb(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new HttpError(503,'Database is not configured.');return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});}
export class HttpError extends Error{constructor(public status:number,message:string){super(message);}}
export async function identity(request:Request,required=true){
 if(process.env.NEXT_PUBLIC_DEMO_MODE==='true'&&required)throw new HttpError(503,'Real transactions are disabled in demo mode.');
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token){if(required)throw new HttpError(401,'Log in to continue.');return null;}
 const db=serverDb();const{data:{user},error}=await db.auth.getUser(token);if(error||!user){if(required)throw new HttpError(401,'Your session expired. Please log in again.');return null;}return user;
}
export async function adminIdentity(request:Request){const user=await identity(request);const{data}=await serverDb().from('admins').select('user_id').eq('user_id',user!.id).maybeSingle();if(!data)throw new HttpError(403,'Administrator access required.');return user!;}
export async function jsonBody(request:Request){if(Number(request.headers.get('content-length')??0)>100000)throw new HttpError(413,'Request too large.');const raw=await request.text();if(raw.length>100000)throw new HttpError(413,'Request too large.');try{return JSON.parse(raw);}catch{throw new HttpError(400,'Invalid JSON body.');}}
export async function rpc(name:string,args:Record<string,unknown>){const{data,error}=await serverDb().rpc(name,args);if(error)throw new HttpError(409,error.message);return data;}
export const ok=(data:unknown)=>NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
export function failure(error:unknown){if(error instanceof ZodError)return NextResponse.json({error:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')},{status:400});if(error instanceof HttpError)return NextResponse.json({error:error.message},{status:error.status});console.error(error instanceof Error?error.message:'Unhandled request error');return NextResponse.json({error:'Unable to complete this request. Please retry or contact PLYDECK with your order reference.'},{status:500});}
export async function limit(userId:string,action:string,max=20){await rpc('check_rate_limit',{p_user:userId,p_action:action,p_max:max});}
