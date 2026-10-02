/* eslint-disable prettier/prettier */
import * as moment from 'moment-timezone';

export interface ChecklistItemDef {
  key: string;
  label: string;
}

export const DEFAULT_CHECKLIST_ITEMS: ChecklistItemDef[] = [
  { key: 'tyres', label: 'Tyres OK' },
  { key: 'fuel', label: 'Enough fuel' },
  { key: 'brakes', label: 'Brakes working' },
  { key: 'lights', label: 'Lights & indicators working' },
  { key: 'first_aid', label: 'First-aid kit present' },
  { key: 'fire_extinguisher', label: 'Fire extinguisher present' },
  { key: 'seat_belts', label: 'Seat belts working' },
  { key: 'cleanliness', label: 'Van clean' },
];

/** Items from PRETRIP_CHECKLIST_ITEMS (JSON) if valid, else the defaults. */
export function checklistItemDefs(raw: string | undefined = process.env.PRETRIP_CHECKLIST_ITEMS): ChecklistItemDef[] {
  if (!raw) return DEFAULT_CHECKLIST_ITEMS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length &&
        parsed.every((i) => i && typeof i.key === 'string' && typeof i.label === 'string')) {
      return parsed.map((i) => ({ key: i.key, label: i.label }));
    }
  } catch {
    // fall through
  }
  console.warn('[checklist] PRETRIP_CHECKLIST_ITEMS is invalid — using defaults');
  return DEFAULT_CHECKLIST_ITEMS;
}

export function isChecklistRequired(raw: string | undefined = process.env.REQUIRE_PRETRIP_CHECKLIST): boolean {
  return (raw || '').toLowerCase() === 'true';
}

export function checklistDate(tz: string, now: Date = new Date()): string {
  return moment(now).tz(tz).format('YYYY-MM-DD');
}

/**
 * Validates submitted items against the defined keys. Every defined key must
 * be answered exactly once; unknown keys are rejected.
 * Returns an error message, or null when valid.
 */
export function validateChecklistItems(
  items: unknown,
  defs: ChecklistItemDef[],
): string | null {
  if (!Array.isArray(items) || !items.length) return 'items are required';
  const allowed = new Set(defs.map((d) => d.key));
  const seen = new Set<string>();
  for (const it of items as any[]) {
    if (!it || typeof it.key !== 'string' || typeof it.ok !== 'boolean') {
      return 'each item needs a string key and a boolean ok';
    }
    if (!allowed.has(it.key)) return `unknown item: ${it.key}`;
    if (seen.has(it.key)) return `duplicate item: ${it.key}`;
    seen.add(it.key);
  }
  const missing = defs.filter((d) => !seen.has(d.key)).map((d) => d.key);
  return missing.length ? `missing items: ${missing.join(', ')}` : null;
}
