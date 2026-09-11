import {timingSafeEqual} from 'node:crypto';
import {ok,failure,HttpError} from '@/lib/server';
import {claimWhatsAppMessages,markWhatsAppFailed,markWhatsAppSent,markWhatsAppSkipped,sendWhatsAppMessage,whatsappConfig} from '@/lib/whatsapp-server';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){try{
 const expected=Buffer.from(`Bearer ${process.env.CRON_SECRET??''}`),actual=Buffer.from(request.headers.get('authorization')??'');
 if(!process.env.CRON_SECRET||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new HttpError(401,'Unauthorized.');
 const config=whatsappConfig();if(!config.enabled)return ok({processed:0,skipped:true,reason:config.reason});if(!config.configured)throw new HttpError(503,config.reason||'WhatsApp is not configured.');
 const messages=await claimWhatsAppMessages(5),results=[];
 for(const message of messages){
  let remote;
  try{remote=await sendWhatsAppMessage(message);}catch(error){await markWhatsAppFailed(message.id,error);results.push({id:message.id,status:'failed'});continue;}
  if(remote.skipped){await markWhatsAppSkipped(message.id,remote.reason||'Sending disabled.');results.push({id:message.id,status:'skipped'});}
  else{
   // If persisting an accepted provider response fails, leave 'sending' for
   // webhook correlation / manual recovery; never turn this into an auto-retry.
   await markWhatsAppSent(message.id,remote.messages[0].id);results.push({id:message.id,status:'sent'});
  }
 }
 return ok({processed:results.length,results});
}catch(e){return failure(e);}}
