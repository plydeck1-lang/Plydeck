import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { demoSeed, POOL_ONE } from "../lib/seed";
import { quoteSlot } from "../lib/pricing";

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BUYER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

async function database(combined = false) {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as 'select null::uuid';create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,bucket_id text);alter table storage.objects enable row level security;`);
  if (combined) {
    await db.exec(readFileSync("supabase/install/PLYDECK_NEW_PROJECT_SETUP.sql", "utf8"));
  } else {
    for (const file of ["001_plydeck.sql","002_replacement_slots.sql","003_whatsapp_notifications.sql","004_whatsapp_delivery_fixes.sql","005_independent_thickness_quantities.sql","006_fixed_100_sheet_slot_mix.sql","007_fixed_four_item_slot.sql","008_direct_slot_reservations.sql","009_admin_slot_blocks_manual_payments.sql","010_final_rate_card_pricing.sql"])
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  }
  await db.query("insert into auth.users values($1),($2),($3)",[ADMIN,BUYER,OTHER]);
  await db.query("insert into admins(user_id)values($1)",[ADMIN]);
  for (const id of [BUYER,OTHER]) await db.query(`insert into profiles(id,business_name,contact_name,phone,gstin,address,city,state,pincode,whatsapp_opt_in)values($1,'Demo business','Buyer','9876543210','29ABCDE1234F1Z5','Demo address 123','Bengaluru','Karnataka','560001',true)`,[id]);
  await db.exec("update pools set status='live'");
  return db;
}

async function reserve(db: PGlite, slots: number[], user = BUYER) {
  const p = (await db.query<any>("select * from pools where id=$1",[POOL_ONE])).rows[0];
  const q = quoteSlot(p, slots.length);
  return (await db.query<any>("select reserve_slots($1,$2,$3,$4,$5,$6,$7)as result",[user,POOL_ONE,slots,q.primary_qty,q.secondary_qty,JSON.stringify(q),p.updated_at])).rows[0].result;
}

async function recordPayment(db: PGlite, orderId: string, stage: "booking" | "confirmation" | "final") {
  return (await db.query<any>(
    "select record_manual_payment($1,$2,$3,$4,$5,$6,$7) as result",
    [ADMIN, orderId, stage, "bank_transfer", `UTR-${stage}`, "Test receipt verified", new Date().toISOString()],
  )).rows[0].result;
}

test("direct reservation locks slots, stores no payment and enforces exclusivity", async () => {
  const db = await database();
  try {
    const order = await reserve(db,[1]);
    assert.equal(order.status,"booked");
    assert.equal(Number(order.paid_amount),0);
    assert.equal(order.expires_at,null);
    assert.deepEqual(order.slot_numbers,[1]);
    await assert.rejects(() => reserve(db,[1],OTHER),/reserved/);
    await db.query("select cancel_order($1,$2)",[BUYER,order.id]);
    const slot = await db.query<any>("select count(*)::int as n from slot_allocations where pool_id=$1 and slot_no=1",[POOL_ONE]);
    assert.equal(slot.rows[0].n,0);
    assert.equal((await db.query<any>("select status from orders where id=$1",[order.id])).rows[0].status,"cancelled");
    assert.equal((await db.query<any>("select count(*)::int as n from refunds where order_id=$1",[order.id])).rows[0].n,0);
  } finally { await db.close(); }
});

test("admin can block and unblock an available slot but cannot block a reservation", async () => {
  const db = await database();
  try {
    await db.query("select manage_blocked_slot($1,$2,$3,$4,$5)",[ADMIN,POOL_ONE,1,true,"Held for factory allocation"]);
    await assert.rejects(() => reserve(db,[1]),/blocked/);
    await db.query("select manage_blocked_slot($1,$2,$3,$4,$5)",[ADMIN,POOL_ONE,1,false,""]);
    const order = await reserve(db,[1]);
    await assert.rejects(
      () => db.query("select manage_blocked_slot($1,$2,$3,$4,$5)",[ADMIN,POOL_ONE,1,true,"Try to block reserved"]),
      /reserved slot cannot be blocked/,
    );
    assert.equal(order.status,"booked");
  } finally { await db.close(); }
});

test("reserved and blocked slots can confirm after 50 percent manual payment", async () => {
  const db = await database();
  try {
    const order = await reserve(db,[1,2,3,4]);
    await db.query("select manage_blocked_slot($1,$2,$3,$4,$5)",[ADMIN,POOL_ONE,5,true,"Internal allocation"]);
    await assert.rejects(() => db.query("select transition_pool($1,$2,$3,$4)",[ADMIN,POOL_ONE,"confirm",""]),/50 percent/);
    await assert.rejects(() => recordPayment(db,order.id,"confirmation"),/10 percent/);
    await recordPayment(db,order.id,"booking");
    await recordPayment(db,order.id,"confirmation");
    await db.query("select transition_pool($1,$2,$3,$4)",[ADMIN,POOL_ONE,"confirm",""]);
    assert.equal((await db.query<any>("select status from pools where id=$1",[POOL_ONE])).rows[0].status,"confirmed");
    await db.query("select transition_pool($1,$2,$3,$4)",[ADMIN,POOL_ONE,"qc","QC passed: all sheets inspected and accepted for dispatch."]);
    await assert.rejects(() => db.query("select transition_pool($1,$2,$3,$4)",[ADMIN,POOL_ONE,"dispatch",""]),/full payment/);
    await recordPayment(db,order.id,"final");
    await db.query("select transition_pool($1,$2,$3,$4)",[ADMIN,POOL_ONE,"dispatch",""]);
    assert.equal((await db.query<any>("select status from pools where id=$1",[POOL_ONE])).rows[0].status,"dispatched");
    assert.equal((await db.query<any>("select count(*)::int as n from orders where pool_id=$1 and status='dispatched'",[POOL_ONE])).rows[0].n,1);
    const total = (await db.query<any>("select (quote->>'total')::bigint as total,paid_amount from orders where id=$1",[order.id])).rows[0];
    assert.equal(Number(total.paid_amount),Number(total.total));
    assert.equal((await db.query<any>("select count(*)::int as n from manual_payments where order_id=$1",[order.id])).rows[0].n,3);
  } finally { await db.close(); }
});

test("publish remains admin-only and WhatsApp booking event is queued for opt-in", async () => {
  const db = await database(true);
  try {
    const grants = await db.query<any>("select has_function_privilege('authenticated','reserve_slots(uuid,uuid,integer[],integer,integer,jsonb,timestamptz)','EXECUTE')as allowed");
    assert.equal(grants.rows[0].allowed,false);
    const order = await reserve(db,[1]);
    const msg = await db.query<any>("select purpose,variables->>'pool_code' as pool_code from whatsapp_messages where order_id=$1",[order.id]);
    assert.equal(msg.rows[0].purpose,"booking_received");
    assert.ok(msg.rows[0].pool_code);
  } finally { await db.close(); }
});

test("combined installer includes final rate-card pricing and stays guarded", () => {
  const sql = readFileSync("supabase/install/PLYDECK_NEW_PROJECT_SETUP.sql","utf8");
  assert.match(sql,/008_direct_slot_reservations\.sql/);
  assert.match(sql,/009_admin_slot_blocks_manual_payments\.sql/);
  assert.match(sql,/010_final_rate_card_pricing\.sql/);
  assert.match(sql,/record_manual_payment/i);
  assert.match(sql,/2026-09-final-rate-1/);
  assert.match(sql,/direct slot booking overlay/i);
  assert.match(sql,/Existing tables found/);
});
