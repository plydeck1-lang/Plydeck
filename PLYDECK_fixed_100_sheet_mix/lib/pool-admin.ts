import type {Category, Pool, PoolConfig} from './types';

const IST_OFFSET_MS = 330 * 60_000;

/** The pool editor uses India time explicitly, independently of the device timezone. */
export function bookingDateInput(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp + IST_OFFSET_MS).toISOString().slice(0, 16)
    : '';
}

export function bookingDateForSave(original: string, input: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) {
    throw new Error('Choose a valid booking closing date and time (IST).');
  }
  // Preserve seconds when an administrator edits other fields only.
  if (input === bookingDateInput(original)) return new Date(original).toISOString();
  const timestamp = Date.parse(`${input}:00+05:30`);
  if (!Number.isFinite(timestamp) || bookingDateInput(new Date(timestamp).toISOString()) !== input) {
    throw new Error('Choose a valid booking closing date and time (IST).');
  }
  return new Date(timestamp).toISOString();
}

export const SPEC_LABELS = {
  core: 'Core construction', face: 'Face veneer', bond: 'Bond / glue grade',
  tolerance: 'Thickness tolerance', specification: 'Full specification / supplier commitment',
} as const;

export function pendingSpecifications(config: PoolConfig): string[] {
  return (['bond', 'tolerance', 'specification'] as const)
    .filter(field => config[field].trim().length < (field === 'specification' ? 20 : 2) || /pending/i.test(config[field]))
    .map(field => SPEC_LABELS[field]);
}

export function poolPublishIssues(pool: Pool, categories: Category[], now = Date.now()): string[] {
  const issues: string[] = [];
  const deadline = Date.parse(pool.closes_at);
  if (!Number.isFinite(deadline) || deadline <= now) issues.push('Choose a future booking closing date.');
  const pending = pendingSpecifications(pool.config);
  if (pending.length) issues.push(`Enter supplier-confirmed values for: ${pending.join(', ')}.`);
  if (!categories.some(category => category.id === pool.category_id && category.active)) {
    issues.push('Choose a visible category.');
  }
  return issues;
}
