import {ok,failure,HttpError,rpc} from '@/lib/server';
import {verifyWhatsAppSignature,webhookEventHash} from '@/lib/whatsapp-server';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const query=new URL(request.url).searchParams;
 if(query.get('hub.mode')==='subscribe'&&process.env.WHATSAPP_VERIFY_TOKEN&&query.get('hub.verify_token')===process.env.WHATSAPP_VERIFY_TOKEN&&query.get('hub.challenge'))return new Response(query.get('hub.challenge'),{status:200});
 return new Response('Forbidden',{status:403});
}
export async function POST(request:Request){try{
 const secret=process.env.WHATSAPP_APP_SECRET;
 if(!secret||!process.env.WHATSAPP_PHONE_NUMBER_ID)throw new HttpError(503,'WhatsApp webhook is not configured.');
 const raw=await request.text();if(raw.length>1000000)throw new HttpError(413,'Payload too large.');
 if(!verifyWhatsAppSignature(raw,request.headers.get('x-hub-signature-256')??'',secret))throw new HttpError(400,'Invalid WhatsApp webhook signature.');
 let event;try{event=JSON.parse(raw);}catch{throw new HttpError(400,'Invalid JSON.');}
 if(event.object!=='whatsapp_business_account'||!Array.isArray(event.entry))throw new HttpError(400,'Unsupported WhatsApp event.');
 for(const entry of event.entry){
  if(!Array.isArray(entry.changes))throw new HttpError(400,'Invalid changes array.');
  for(const change of entry.changes){
   const value=change.value;
   if(change.field!=='messages'||!value||value.metadata?.phone_number_id!==process.env.WHATSAPP_PHONE_NUMBER_ID)throw new HttpError(400,'Unexpected WhatsApp phone number or event.');
  }
 }
 return ok(await rpc('apply_whatsapp_webhook',{p_hash:webhookEventHash(raw),p_payload:event}));
}catch(e){return failure(e);}}
