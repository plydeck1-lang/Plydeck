import {whatsappConfig} from '@/lib/whatsapp-server';
import {identity,serverDb,ok,failure,rpc} from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const db=serverDb(),user=await identity(request,false);let isAdmin=false;if(user){const{data}=await db.from('admins').select('user_id').eq('user_id',user.id).maybeSingle();isAdmin=!!data;}
 await rpc('expire_holds',{});
 const results=await Promise.all([db.from('categories').select('*').order('name'),db.from('pools').select('*').order('code'),db.from('shipments').select('*'),db.from('slot_allocations').select('pool_id,slot_no,order_id'),db.from('waitlist').select('id,pool_id,user_id,created_at,status,offered_slot,offered_primary,offered_secondary,offer_expires_at')]);
 for(const r of results)if(r.error)throw r.error;
 const[categories,poolRows,shipments,allocations,waiting]=results.map(r=>r.data??[]) as any[][];
 let profile=null,orders:any[]=[],refunds:any[]=[],whatsappMessages:any[]=[];
 if(user){const profileResult=await db.from('profiles').select('*').eq('id',user.id).maybeSingle();profile=profileResult.data;let oq=db.from('orders').select('*').order('created_at',{ascending:false});if(!isAdmin)oq=oq.eq('user_id',user.id);const or=await oq;if(or.error)throw or.error;orders=or.data??[];let mq=db.from('whatsapp_messages').select('*').order('created_at',{ascending:false}).limit(200);if(!isAdmin)mq=mq.eq('user_id',user.id);const mr=await mq;if(mr.error)throw mr.error;whatsappMessages=mr.data??[];if(isAdmin){const rr=await db.from('refunds').select('*').order('created_at',{ascending:false});refunds=rr.data??[];}}
 const pools=poolRows.filter(p=>isAdmin||p.status!=='draft').map(p=>({...p,allocations:allocations.filter(a=>a.pool_id===p.id).map(a=>({slot_no:a.slot_no,status:'reserved'})).concat(waiting.filter(w=>w.pool_id===p.id&&w.status==='offered'&&w.user_id!==user?.id).map(w=>({slot_no:w.offered_slot,status:'waiting-list offer'}))),waitlist_count:waiting.filter(w=>w.pool_id===p.id&&w.status==='waiting').length}));
 const whatsapp=whatsappConfig();
 return ok({categories:categories.filter(c=>isAdmin||c.active),pools,shipments,profile,orders,isAdmin,waitlist:waiting.filter(w=>isAdmin||w.user_id===user?.id),refunds,whatsappMessages,whatsapp});
 }catch(e){return failure(e);}}
