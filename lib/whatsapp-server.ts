import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {serverDb,HttpError} from './server';
import type {WhatsAppMessage} from './types';

export function whatsappConfig(){
 const enabled=process.env.NEXT_PUBLIC_DEMO_MODE!=='true'&&process.env.WHATSAPP_ENABLED==='true';
 const configured=Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID&&process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_VERIFY_TOKEN&&process.env.WHATSAPP_APP_SECRET);
 return {enabled,configured,reason:!enabled?'WhatsApp sending is disabled.':!configured?'Add the Meta Cloud API credentials, app secret and verify token.':undefined};
}
export function normalizeWhatsAppPhone(value:string,defaultCountry='91'){
 let digits=String(value||'').replace(/[^0-9]/g,'');
 if(digits.startsWith('00'))digits=digits.slice(2);
 if(digits.length===10)digits=defaultCountry+digits;
 if(!/^91[6-9][0-9]{9}$/.test(digits))throw new HttpError(400,'Enter a valid Indian WhatsApp mobile number.');
 return digits;
}
export function buildWhatsAppTemplatePayload(message:Pick<WhatsAppMessage,'recipient_phone'|'template_name'|'template_language'|'variables'>,variableOrder:string[]=[]){
 if(Object.keys(message.variables??{}).length&&!variableOrder.length)throw new Error('Approved template variable order is missing.');
 const parameters=variableOrder.map(key=>{
  const text=String(message.variables?.[key]??'').trim();
  if(!text)throw new Error(`Template value missing: ${key}`);
  return {type:'text' as const,text};
 });
 const template:{name:string;language:{code:string};components?:{type:'body';parameters:{type:'text';text:string}[]}[]}={name:message.template_name,language:{code:message.template_language||'en_US'}};
 if(parameters.length)template.components=[{type:'body',parameters}];
 return {messaging_product:'whatsapp',recipient_type:'individual',to:normalizeWhatsAppPhone(message.recipient_phone),type:'template',template};
}
export function verifyWhatsAppSignature(raw:string,header:string,secret:string){
 if(!secret||!header.startsWith('sha256='))return false;
 const expected=Buffer.from(`sha256=${createHmac('sha256',secret).update(raw).digest('hex')}`),actual=Buffer.from(header);
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export function webhookEventHash(raw:string){return createHash('sha256').update(raw).digest('hex');}
export class WhatsAppSendError extends Error{
 constructor(message:string,public code:string,public retryable=false){super(message);}
}
export async function claimWhatsAppMessages(limit=5){
 const{data,error}=await serverDb().rpc('claim_whatsapp_messages',{p_limit:limit});if(error)throw error;
 return (data??[]) as WhatsAppMessage[];
}
export async function sendWhatsAppMessage(message:WhatsAppMessage){
 const config=whatsappConfig();if(!config.enabled)return {skipped:true as const,reason:config.reason};
 if(!config.configured)throw new HttpError(503,config.reason||'WhatsApp is not configured.');
 const db=serverDb();
 const {data:template,error:templateError}=await db.from('whatsapp_templates').select('variables,language,enabled').eq('name',message.template_name).single();
 if(templateError)throw templateError;
 const {data:eligible,error:consentError}=await db.rpc('whatsapp_sendable',{p_id:message.id});if(consentError)throw consentError;
 if(!eligible||!template.enabled)return {skipped:true as const,reason:'Consent, phone, template or order state changed.'};
 const payload={...buildWhatsAppTemplatePayload({...message,template_language:template.language},template.variables),biz_opaque_callback_data:message.id};
 const version=process.env.WHATSAPP_GRAPH_VERSION||'v24.0',phone=process.env.WHATSAPP_PHONE_NUMBER_ID!;
 if(!/^v[0-9]+\.[0-9]+$/.test(version)||!/^\d+$/.test(phone))throw new Error('Invalid Meta API version or phone number ID.');
 let response:Response;
 try{response=await fetch(`https://graph.facebook.com/${version}/${phone}/messages`,{method:'POST',headers:{Authorization:`Bearer ${process.env.WHATSAPP_ACCESS_TOKEN!}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});}
 catch{throw new WhatsAppSendError('Delivery outcome unknown. Check Meta before retrying to avoid duplicate messages.','delivery_unknown');}
 const result=await response.json().catch(()=>null);
 if(!response.ok){
  if(!result?.error)throw new WhatsAppSendError('Delivery outcome unknown; Meta returned no error details.','delivery_unknown');
  throw new WhatsAppSendError(result.error.message||'WhatsApp rejected the message.',String(result.error.code??response.status),response.status===429||result.error.is_transient===true);
 }
 const id=result?.messages?.[0]?.id;
 if(typeof id!=='string'||!id)throw new WhatsAppSendError('Meta did not return a message ID. Review before retrying.','delivery_unknown');
 return {skipped:false as const,messages:[{id}]};
}
export async function markWhatsAppSent(id:string,providerMessageId:string){
 const{error}=await serverDb().from('whatsapp_messages').update({status:'sent',provider_message_id:providerMessageId,sent_at:new Date().toISOString(),retryable:false,error_code:null,error_message:null}).eq('id',id).eq('status','sending');if(error)throw error;
}
export async function markWhatsAppSkipped(id:string,reason:string){
 const{error}=await serverDb().from('whatsapp_messages').update({status:'skipped',retryable:false,error_message:reason}).eq('id',id).eq('status','sending');if(error)throw error;
}
export async function markWhatsAppFailed(id:string,error:unknown){
 const e=error instanceof Error?error:new Error(String(error));
 const{error:dbError}=await serverDb().from('whatsapp_messages').update({status:'failed',retryable:e instanceof WhatsAppSendError&&e.retryable,error_code:e instanceof WhatsAppSendError?e.code:'configuration_or_database_error',error_message:e.message.slice(0,1000)}).eq('id',id).eq('status','sending');if(dbError)throw dbError;
}
