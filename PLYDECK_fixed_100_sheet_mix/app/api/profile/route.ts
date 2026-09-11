import {identity,serverDb,ok,failure,jsonBody,limit} from '@/lib/server';
import {profileSchema} from '@/lib/validation';
export async function POST(request:Request){try{const user=await identity(request);await limit(user!.id,'profile');const values=profileSchema.parse(await jsonBody(request));const{error}=await serverDb().from('profiles').upsert({...values,id:user!.id,email:user!.email,updated_at:new Date().toISOString()});if(error)throw error;return ok({saved:true});}catch(e){return failure(e);}}
