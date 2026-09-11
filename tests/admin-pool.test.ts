import {test} from 'node:test';
import assert from 'node:assert/strict';
import {poolSchema} from '../lib/validation';
import {demoSeed} from '../lib/seed';
import {bookingDateInput, bookingDateForSave, pendingSpecifications, poolPublishIssues} from '../lib/pool-admin';

test('admin pool: Supabase UTC offsets, fractional seconds and IST offsets retain their instant', () => {
  const pool = demoSeed().pools[0];
  for (const closes_at of ['2026-09-14T06:58:00+00:00', '2026-09-14T12:28:00+05:30', '2026-09-14T06:58:00.000000+00:00']) {
    assert.equal(poolSchema.parse({...pool, closes_at}).closes_at, '2026-09-14T06:58:00.000Z');
  }
  assert.equal(poolSchema.parse({...pool, closes_at: '2026-09-14T06:58:00.123456+00:00'}).closes_at, '2026-09-14T06:58:00.123Z');
  for (const closes_at of ['', 'invalid', '2026-02-30T12:28:00Z', '2026-09-14T12:28']) {
    assert.equal(poolSchema.safeParse({...pool, closes_at}).success, false);
  }
});

test('admin pool: IST form preserves an unchanged date and safely handles edits and clearing', () => {
  const saved = '2026-09-14T06:58:47.123+00:00';
  assert.equal(bookingDateInput(saved), '2026-09-14T12:28');
  assert.equal(bookingDateForSave(saved, bookingDateInput(saved)), '2026-09-14T06:58:47.123Z');
  assert.equal(bookingDateForSave(saved, '2026-09-15T00:15'), '2026-09-14T18:45:00.000Z');
  assert.equal(bookingDateInput('invalid'), '');
  for (const input of ['', '2026-02-30T12:28', '2026-09-14T25:28']) {
    assert.throws(() => bookingDateForSave(saved, input), /valid booking closing date/);
  }
});

test('admin pool: drafts can save pending specifications, but publish guidance identifies the blocked fields', () => {
  const data = demoSeed(), pool = {...data.pools[0], closes_at: '2099-09-14T06:58:00+00:00'};
  assert.equal(poolSchema.safeParse(pool).success, true);
  assert.deepEqual(pendingSpecifications(pool.config), ['Bond / glue grade', 'Thickness tolerance']);
  assert.match(poolPublishIssues(pool, data.categories).join(' '), /supplier-confirmed/);
  pool.config = {...pool.config, bond: 'Test fixture bond specification', tolerance: 'Test fixture thickness tolerance'};
  assert.deepEqual(poolPublishIssues(pool, data.categories), []);
  assert.match(poolPublishIssues({...pool, closes_at: '2000-01-01T00:00:00Z'}, data.categories).join(' '), /future/);
  assert.match(poolPublishIssues(pool, data.categories.map(category => ({...category, active: false}))).join(' '), /visible category/);
});
