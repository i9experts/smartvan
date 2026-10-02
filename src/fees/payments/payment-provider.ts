/* eslint-disable prettier/prettier */
import { randomBytes } from 'crypto';

export const ONLINE_METHODS = [
  { key: 'jazzcash', label: 'JazzCash' },
  { key: 'easypaisa', label: 'Easypaisa' },
  { key: 'raast', label: 'Raast (bank app)' },
] as const;

export type OnlineMethod = (typeof ONLINE_METHODS)[number]['key'];

export function isOnlineMethod(m: unknown): m is OnlineMethod {
  return typeof m === 'string' && ONLINE_METHODS.some((x) => x.key === m);
}

export interface CheckoutRequest {
  checkoutId: string;
  method: OnlineMethod;
  amount: number;
  currency: string;
  description: string;
}

export interface CheckoutSession {
  providerRef: string;
  /** Where the app should send the parent (hosted payment page), if any. */
  redirectUrl?: string;
  /** Text to show the parent while they complete the payment. */
  instructions: string;
}

export interface WebhookResult {
  providerRef: string;
  success: boolean;
  failureReason?: string;
}

/**
 * A payment gateway. To add JazzCash / Easypaisa / Raast: implement this
 * with the merchant credentials, register it in providerFor(), and point
 * the gateway's callback URL at POST /fees/webhook/<name>.
 */
export interface PaymentProvider {
  readonly name: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** Returns null if the request is not a valid, signed callback. */
  verifyWebhook(headers: Record<string, any>, body: any): Promise<WebhookResult | null>;
}

/**
 * Development provider: no money moves. The parent app confirms through
 * POST /fees/pay-online/:checkoutId/mock-confirm. Only active when
 * PAYMENTS_MODE=mock.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    return {
      providerRef: 'MOCK-' + randomBytes(6).toString('hex').toUpperCase(),
      instructions:
        `TEST MODE — no real money. Tap "Confirm test payment" to simulate paying ` +
        `${req.currency} ${req.amount} with ${req.method}.`,
    };
  }

  async verifyWebhook(): Promise<WebhookResult | null> {
    return null; // mock payments are confirmed via the mock-confirm endpoint
  }
}

export function paymentsMode(raw: string | undefined = process.env.PAYMENTS_MODE): 'mock' | 'live' | 'off' {
  const v = (raw || '').toLowerCase();
  if (v === 'mock' || v === 'live') return v;
  return 'off';
}

/** Provider for a method in the current mode, or null if unavailable. */
export function providerFor(method: OnlineMethod, mode = paymentsMode()): PaymentProvider | null {
  if (mode === 'mock') return new MockPaymentProvider();
  // mode === 'live': real gateways are registered here once merchant
  // accounts exist, e.g. if (method === 'jazzcash') return new JazzCashProvider(...)
  void method;
  return null;
}

export const CHECKOUT_TTL_MS = 15 * 60 * 1000;
