/* eslint-disable prettier/prettier */
/** One WhatsApp SOS batch per trip per 5 minutes. */
export const SOS_WHATSAPP_WINDOW_MS = 5 * 60_000;

export function sosWhatsappEnabled(raw: string | undefined = process.env.SOS_WHATSAPP_ENABLED): boolean {
  return (raw || '').trim().toLowerCase() === 'true';
}

const PK_MOBILE = /^(?:\+?92|0)?(3\d{9})$/;

/**
 * Phone → E.164. Pakistani mobiles in any usual spelling become +923XXXXXXXXX;
 * other numbers are accepted only when already international (+… or 00…).
 * Returns null when it can't be a valid number.
 */
export function toE164(raw: unknown): string | null {
  const compact = String(raw ?? '').trim().replace(/[\s\-().]/g, '');
  if (!compact) return null;
  const pk = PK_MOBILE.exec(compact);
  if (pk) return `+92${pk[1]}`;
  const intl = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  return /^\+[1-9]\d{7,14}$/.test(intl) ? intl : null;
}

/** +923001234567 → +92300***4567 (for logs). */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 8) return '***';
  return `${phone.slice(0, 6)}***${phone.slice(-4)}`;
}

export interface SosRecipient { parentId: string; phone: string; childNames: string }

/**
 * Parents → unique recipients by normalized number (children of parents
 * sharing a number are merged into one message); invalid numbers are
 * returned separately.
 */
export function collectRecipients(
  parents: { _id: any; phoneNo?: string; kidNames?: string[] }[],
): { recipients: SosRecipient[]; invalid: string[] } {
  const byPhone = new Map<string, SosRecipient & { names: string[] }>();
  const invalid: string[] = [];
  for (const p of parents) {
    const phone = toE164(p.phoneNo);
    const parentId = p._id.toString();
    if (!phone) { invalid.push(parentId); continue; }
    const entry = byPhone.get(phone) || { parentId, phone, childNames: '', names: [] };
    for (const n of p.kidNames || []) if (n && !entry.names.includes(n)) entry.names.push(n);
    byPhone.set(phone, entry);
  }
  const recipients = [...byPhone.values()].map(({ names, ...r }) => ({ ...r, childNames: names.join(', ') || 'your child' }));
  return { recipients, invalid };
}

export function isThrottled(lastBatchAt: Date | null | undefined, now: Date, windowMs = SOS_WHATSAPP_WINDOW_MS): boolean {
  return !!lastBatchAt && now.getTime() - new Date(lastBatchAt).getTime() < windowMs;
}

/**
 * Body params of the approved `smartvan_sos` template, in order:
 * {{1}} child name(s), {{2}} van number, {{3}} contact number.
 * "Alert regarding {{1}} on van {{2}}. Contact number: {{3}}. Please respond immediately."
 */
export function sosTemplateParams(a: { childNames: string; vanNumber: string; contactNumber: string }): string[] {
  return [a.childNames || 'your child', a.vanNumber || 'N/A', a.contactNumber || 'N/A'];
}
