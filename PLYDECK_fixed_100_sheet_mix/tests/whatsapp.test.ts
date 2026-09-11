import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildWhatsAppTemplatePayload,normalizeWhatsAppPhone,verifyWhatsAppSignature} from '../lib/whatsapp-server';
import {createHmac} from 'node:crypto';

test('WhatsApp phone normalization returns India E.164 digits',()=>{
 assert.equal(normalizeWhatsAppPhone('98765 43210'),'919876543210');
 assert.equal(normalizeWhatsAppPhone('+91 9876543210'),'919876543210');
 assert.throws(()=>normalizeWhatsAppPhone('1234'),/valid Indian WhatsApp/);
});

test('WhatsApp template payload keeps approved variable order',()=>{
 const payload=buildWhatsAppTemplatePayload({recipient_phone:'919876543210',template_name:'plydeck_booking_received',template_language:'en_US',variables:{pool_code:'BLR-OEM-001',amount:'₹2,303',order_ref:'ORDER123'}},['order_ref','pool_code','amount']);
 assert.deepEqual(payload.template.components?.[0].parameters.map(p=>p.text),['ORDER123','BLR-OEM-001','₹2,303']);
 assert.equal(payload.to,'919876543210');
});

test('WhatsApp webhook signature rejects tampering',()=>{
 const raw='{"entry":[]}';const secret='test-app-secret';const sig='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
 assert.equal(verifyWhatsAppSignature(raw,sig,secret),true);assert.equal(verifyWhatsAppSignature(raw+'x',sig,secret),false);assert.equal(verifyWhatsAppSignature(raw,'sha256=bad',secret),false);
});

test('WhatsApp templates refuse missing values and missing variable order',()=>{
 const m={recipient_phone:'919876543210',template_name:'plydeck_booking_received',template_language:'en_US',variables:{amount:'10.00'}};
 assert.throws(()=>buildWhatsAppTemplatePayload(m),/order is missing/);
 assert.throws(()=>buildWhatsAppTemplatePayload(m,['order_ref','amount']),/value missing/);
});
