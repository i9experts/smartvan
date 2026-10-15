/* eslint-disable prettier/prettier */
import * as moment from 'moment-timezone';

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

export interface SosRecipient { parentId: string; phone: string }

/** Parents → unique recipients by normalized number; invalid numbers are returned separately. */
export function collectRecipients(parents: { _id: any; phoneNo?: string }[]): { recipients: SosRecipient[]; invalid: string[] } {
  const seen = new Set<string>();
  const recipients: SosRecipient[] = [];
  const invalid: string[] = [];
  for (const p of parents) {
    const phone = toE164(p.phoneNo);
    const parentId = p._id.toString();
    if (!phone) { invalid.push(parentId); continue; }
    if (seen.has(phone)) continue;
    seen.add(phone);
    recipients.push({ parentId, phone });
  }
  return { recipients, invalid };
}

export function isThrottled(lastBatchAt: Date | null | undefined, now: Date, windowMs = SOS_WHATSAPP_WINDOW_MS): boolean {
  return !!lastBatchAt && now.getTime() - new Date(lastBatchAt).getTime() < windowMs;
}

export function mapsLink(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

export function pktTime(at: Date, tz = process.env.DEFAULT_TIMEZONE || 'Asia/Karachi'): string {
  return moment(at).tz(tz).format('h:mm A');
}

/** Template body params, in order: van number, driver name, time (PKT), maps link. */
export function sosTemplateParams(a: { vanNumber: string; driverName: string; at: Date; lat: number; lng: number }): string[] {
  return [a.vanNumber || 'N/A', a.driverName || 'Driver', pktTime(a.at), mapsLink(a.lat, a.lng)];
}
