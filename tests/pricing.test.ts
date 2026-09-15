import { test } from "node:test";
import assert from "node:assert/strict";
import { demoSeed } from "../lib/seed";
import { FIXED_SLOT_ITEMS, quoteSlot, TERMS_VERSION } from "../lib/pricing";

test("fixed slot total is the direct sum of the four final rate-card lines", () => {
  const q = quoteSlot(demoSeed().pools[0]);
  assert.deepEqual(FIXED_SLOT_ITEMS.map((item) => item.quantity), [50, 20, 15, 15]);
  assert.equal(q.sheets, 100);
  assert.equal(q.area, 3200);
  assert.equal(q.weight_kg, 2600);
  assert.equal(q.rate, 56);
  assert.deepEqual(q.lines.slice(0, 4).map((line) => line.amount), [8_960_000, 3_584_000, 2_688_000, 2_688_000]);
  assert.equal(q.subtotal, 17_920_000);
  assert.equal(q.gst, 0);
  assert.equal(q.total, 17_920_000);
  assert.equal(q.terms_version, TERMS_VERSION);
});

test("each rate-card line changes only its fixed plywood line", () => {
  const p = demoSeed().pools[0];
  p.config.rate_card = { mr_16: 60, bwp_16: 70, mr_6: 40, bwp_6: 50 };
  p.config.rounding_rate = 0;
  const q = quoteSlot(p);
  assert.deepEqual(q.lines.slice(0, 4).map((line) => line.amount), [9_600_000, 4_480_000, 1_920_000, 2_400_000]);
  assert.equal(q.primary_qty, 70);
  assert.equal(q.secondary_qty, 30);
});

test("multiple direct reservations scale final rates and fixed quantities", () => {
  const p = demoSeed().pools[0];
  p.config.rounding_rate = 0;
  for (let n = 1; n <= 5; n++) {
    const q = quoteSlot(p, n);
    assert.equal(q.sheets, 100 * n);
    assert.equal(q.area, 3200 * n);
    assert.equal(q.primary_qty, 70);
    assert.equal(q.secondary_qty, 30);
    assert.equal(q.gst, 0);
    assert.equal(q.total, q.subtotal);
  }
});

test("entered screenshot rates produce the exact final slot total without uplift", () => {
  const p = demoSeed().pools[0];
  p.config.rate_card = { mr_16: 61, bwp_16: 76.3, mr_6: 45.78, bwp_6: 53.41 };
  const q = quoteSlot(p);
  assert.deepEqual(q.lines.map((line) => line.amount), [9_760_000, 4_883_200, 2_197_440, 2_563_680]);
  assert.equal(q.total, 19_404_320);
  assert.equal(Math.round(q.rate * 100), 6064);
});
