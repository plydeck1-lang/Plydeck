import { test } from "node:test";
import assert from "node:assert/strict";
import { demoSeed } from "../lib/seed";
import { FIXED_SLOT_ITEMS, nextStage, quoteSlot } from "../lib/pricing";

test("fixed slot has the four required plywood items, 100 sheets and exact 10/40/50 totals", () => {
  const q = quoteSlot(demoSeed().pools[0]);
  assert.deepEqual(
    FIXED_SLOT_ITEMS.map((item) => item.quantity),
    [50, 20, 15, 15],
  );
  assert.equal(q.sheets, 100);
  assert.equal(q.area, 3200);
  assert.equal(q.weight_kg, 2600);
  assert.equal(q.rate, 61);
  assert.deepEqual(
    q.lines.slice(0, 4).map((line) => line.amount),
    [8_960_000, 3_584_000, 2_688_000, 2_688_000],
  );
  assert.equal(q.subtotal, 19_520_000);
  assert.equal(q.gst, 3_513_600);
  assert.equal(q.total, 23_033_600);
  assert.deepEqual(q.stages, {
    booking: 2_303_360,
    confirmation: 9_213_440,
    dispatch: 11_516_800,
  });
});

test("each rate-card line changes only its fixed plywood line", () => {
  const p = demoSeed().pools[0];
  p.config.rate_card = { mr_16: 60, bwp_16: 70, mr_6: 40, bwp_6: 50 };
  p.config.rounding_rate = 0;
  const q = quoteSlot(p);
  assert.deepEqual(
    q.lines.slice(0, 4).map((line) => line.amount),
    [9_600_000, 4_480_000, 1_920_000, 2_400_000],
  );
  assert.equal(q.primary_qty, 70);
  assert.equal(q.secondary_qty, 30);
});

test("multiple fixed slots allocate GST once and instalments sum exactly", () => {
  const p = demoSeed().pools[0];
  p.config.rate_card.mr_16 = 56.13;
  p.config.rounding_rate = 0;
  for (let n = 1; n <= 5; n++) {
    const q = quoteSlot(p, n);
    assert.equal(q.sheets, 100 * n);
    assert.equal(q.area, 3200 * n);
    assert.equal(
      q.stages.booking + q.stages.confirmation + q.stages.dispatch,
      q.total,
    );
    assert.equal(q.gst, Math.round(q.subtotal * 0.18));
  }
});

test("payments cannot skip QC; replacement orders still follow all three instalments", () => {
  const q = quoteSlot(demoSeed().pools[0]);
  assert.equal(nextStage({ paid_amount: q.stages.booking, quote: q }, "live"), null);
  assert.equal(
    nextStage(
      { paid_amount: q.stages.booking + q.stages.confirmation, quote: q },
      "confirmed",
    ),
    null,
  );
  assert.equal(
    nextStage(
      { paid_amount: q.stages.booking + q.stages.confirmation, quote: q },
      "qc_ready",
    ),
    "dispatch",
  );
  assert.equal(
    nextStage({ paid_amount: 0, quote: q, replacement: true }, "qc_ready"),
    "booking",
  );
});
