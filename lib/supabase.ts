import {createClient} from '@supabase/supabase-js';
export const DEMO=process.env.NEXT_PUBLIC_DEMO_MODE==='true';
let client:ReturnType<typeof createClient>|undefined;
export function browserDb(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase is not configured. Set the public URL and anon key, or enable demo mode locally.');
 return client??=createClient(url,key);
}
export async function api<T=unknown>(path:string,body?:unknown,method?:string):Promise<T>{
 const{data:{session}}=await browserDb().auth.getSession();
 const response=await fetch(`/api/${path}`,{method:method??(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.access_token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok)throw new Error(data.error??'The request could not be completed.');return data;
}
