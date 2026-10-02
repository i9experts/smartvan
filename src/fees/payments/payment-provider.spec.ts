import { isOnlineMethod, MockPaymentProvider, paymentsMode, providerFor } from './payment-provider';

describe('payment providers', () => {
  it('validates methods', () => {
    expect(isOnlineMethod('jazzcash')).toBe(true);
    expect(isOnlineMethod('raast')).toBe(true);
    expect(isOnlineMethod('cash')).toBe(false);
    expect(isOnlineMethod(undefined)).toBe(false);
  });

  it('payments are off unless configured', () => {
    expect(paymentsMode(undefined)).toBe('off');
    expect(paymentsMode('MOCK')).toBe('mock');
    expect(paymentsMode('live')).toBe('live');
    expect(paymentsMode('yes')).toBe('off');
  });

  it('only mock mode has a provider today', () => {
    expect(providerFor('jazzcash', 'off')).toBeNull();
    expect(providerFor('jazzcash', 'live')).toBeNull();
    expect(providerFor('jazzcash', 'mock')).toBeInstanceOf(MockPaymentProvider);
  });

  it('mock checkout returns a reference and test instructions', async () => {
    const s = await new MockPaymentProvider().createCheckout({
      checkoutId: 'c', method: 'easypaisa', amount: 3000, currency: 'PKR', description: 'x',
    });
    expect(s.providerRef).toMatch(/^MOCK-[0-9A-F]{12}$/);
    expect(s.instructions).toContain('TEST MODE');
  });
});
