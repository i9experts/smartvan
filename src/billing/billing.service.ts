/* eslint-disable prettier/prettier */
import { Injectable, BadRequestException } from '@nestjs/common';
import * as Stripe from 'stripe';
import * as nodemailer from 'nodemailer';
import { DatabaseService } from 'src/database/databaseservice';
import { Types } from 'mongoose';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { sendWithTimeout } from 'src/common/send-with-timeout.util';

const PRICE_IDS = {
  car_pkr: 'price_1ShP57GTlXYof3w6LpNPt7t7',
  hiroof_pkr: 'price_1TqvEqGTlXYof3w6M613HUu3',
  hiroof_usd: 'price_1TqvJuGTlXYof3w6tlZYY7r8',
  bus_pkr: 'price_1TqvGCGTlXYof3w6JquXcZh5',
  bus_usd: 'price_1TqvNYGTlXYof3w6eabmaR44',
};

const VAN_PRICES = {
  car_pkr: { amount: 790, currency: 'PKR', label: 'Car/Rickshaw' },
  hiroof_pkr: { amount: 990, currency: 'PKR', label: 'Hiroof/Hiace' },
  hiroof_usd: { amount: 19, currency: 'USD', label: 'Hiroof/Hiace' },
  bus_pkr: { amount: 1990, currency: 'PKR', label: 'Bus/Coach' },
  bus_usd: { amount: 39, currency: 'USD', label: 'Bus/Coach' },
};

@Injectable()
export class BillingService {
  private stripe: Stripe;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditLogService: AuditLogService,
  ) {
    this.stripe = new (Stripe as any)(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: '2023-10-16' as any,
    });
  }

  // Get price key based on van type/category and currency.
  // vehicleCategory (Van/Mini Bus/Mid-Size Bus/Full-Size Bus/Electric
  // Vehicle/Other) is the authoritative signal when present — it's a
  // clean, structured field, unlike vehicleType which is a computed
  // display string like "Toyota Coaster (Mid-Size Bus)" that was never
  // reliably matchable by exact string equality in the first place.
  getPriceKey(vanType: string, currency: string, vehicleCategory?: string): string {
    const curr = currency.toUpperCase();
    const isUsd = curr === 'USD';

    if (vehicleCategory) {
      const cat = vehicleCategory.toLowerCase();
      if (cat === 'mini bus' || cat === 'mid-size bus' || cat === 'full-size bus') {
        return isUsd ? 'bus_usd' : 'bus_pkr';
      }
      if (cat === 'van' || cat === 'electric vehicle') {
        return isUsd ? 'hiroof_usd' : 'hiroof_pkr';
      }
      // 'Other' falls through to keyword matching on vehicleType below.
    }

    const type = vanType.toLowerCase();
    if (type.includes('car') || type.includes('rickshaw')) return 'car_pkr';
    if ((type.includes('hiroof') || type.includes('hiace')) && isUsd) return 'hiroof_usd';
    if (type.includes('hiroof') || type.includes('hiace')) return 'hiroof_pkr';
    if ((type.includes('bus') || type.includes('coach')) && isUsd) return 'bus_usd';
    if (type.includes('bus') || type.includes('coach')) return 'bus_pkr';
    return 'hiroof_pkr'; // default
  }

  // Sum of actual per-van pricing (by vehicle type/category) for a given
  // list of van records — the same price table calculateMonthlyBill() uses,
  // exposed so other services (e.g. the super admin overview) can estimate
  // a school's fleet value without duplicating/drifting from these prices.
  estimateMonthlyVanRevenue(vans: any[], currency = 'PKR'): number {
    return (vans || []).reduce((sum, v) => {
      const priceKey = this.getPriceKey(v.vehicleType || 'Hiroof', currency, v.vehicleCategory);
      return sum + (VAN_PRICES[priceKey]?.amount || 0);
    }, 0);
  }

  // Calculate monthly bill for a school
  async calculateMonthlyBill(adminId: string) {
    const adminObjectId = new Types.ObjectId(adminId);
    const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
    if (!school) throw new BadRequestException('School not found');
    return this.calculateMonthlyBillForSchool(school);
  }

  // Same calculation, keyed off an already-resolved school document rather
  // than an adminId — lets a superadmin-triggered action (e.g. sending a
  // billing reminder to a specific unbilled school) reuse the exact same
  // pricing logic as the school admin's own self-serve checkout.
  private async calculateMonthlyBillForSchool(school: any) {
    // Include vans approval-linked from another school (the shared
    // driver/van-across-campuses case) — each school that actually uses
    // a shared van is billed for it independently.
    const linkedVanLinks = await this.databaseService.repositories.vanSchoolLinkModel.find({
      requestingSchoolId: school._id.toString(),
      status: 'approved',
    }).lean();
    const linkedVanIds = linkedVanLinks.map((l: any) => l.vanId);

    const vans = await this.databaseService.repositories.VanModel.find({
      $or: [
        { schoolId: school._id.toString() },
        { _id: { $in: linkedVanIds.map(id => new Types.ObjectId(id)) } },
      ],
      status: 'active',
    }).lean();

    const currency = (school as any).currency || 'PKR';
    let totalAmount = 0;
    const breakdown: any[] = [];

    for (const van of vans) {
      const vanType = (van as any).vehicleType || 'Hiroof';
      const priceKey = this.getPriceKey(vanType, currency, (van as any).vehicleCategory);
      const price = VAN_PRICES[priceKey];
      totalAmount += price.amount;
      breakdown.push({
        vanId: van._id,
        carNumber: (van as any).carNumber,
        vehicleType: vanType,
        priceKey,
        amount: price.amount,
        currency: price.currency,
        label: price.label,
      });
    }

    return {
      schoolId: school._id,
      schoolName: (school as any).schoolName,
      currency,
      totalVans: vans.length,
      totalAmount,
      breakdown,
    };
  }

  // Create Stripe customer for school
  async createOrGetCustomer(adminId: string) {
    const adminObjectId = new Types.ObjectId(adminId);
    const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
    if (!school) throw new BadRequestException('School not found');
    return this.createOrGetCustomerForSchool(school);
  }

  private async createOrGetCustomerForSchool(school: any) {
    const schoolAny = school as any;

    // Return existing customer
    if (schoolAny.stripeCustomerId) {
      return { customerId: schoolAny.stripeCustomerId };
    }

    // A Stripe customer for this school may already exist from an earlier
    // checkout whose DB write-back never landed on this exact school
    // document (e.g. the school was re-provisioned/duplicated afterward) —
    // reuse it by email rather than silently minting a second, orphaned
    // customer and letting the first one's payment history go untracked.
    if (schoolAny.schoolEmail) {
      const existing = await this.stripe.customers.list({ email: schoolAny.schoolEmail, limit: 1 });
      if (existing.data.length > 0) {
        const customerId = existing.data[0].id;
        await this.databaseService.repositories.SchoolModel.updateOne(
          { _id: school._id },
          { $set: { stripeCustomerId: customerId } },
        );
        return { customerId };
      }
    }

    // Create new Stripe customer
    const customer = await this.stripe.customers.create({
      name: schoolAny.schoolName,
      email: schoolAny.schoolEmail,
      metadata: {
        schoolId: school._id.toString(),
        adminId: schoolAny.admin?.toString() || '',
      },
    });

    // Save customer ID to school
    await this.databaseService.repositories.SchoolModel.updateOne(
      { _id: school._id },
      { $set: { stripeCustomerId: customer.id } }
    );

    return { customerId: customer.id };
  }

  // Create checkout session
  async createCheckoutSession(adminId: string) {
    const adminObjectId = new Types.ObjectId(adminId);
    const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
    if (!school) throw new BadRequestException('School not found');
    return this.buildVanCheckoutSession(school);
  }

  // Superadmin-triggered equivalent of createCheckoutSession, keyed by
  // schoolId instead of the caller's own JWT — used to send a specific
  // unbilled school a payment link without that school's admin having to
  // initiate it themselves (see sendBillingReminder below).
  async createCheckoutSessionForSchool(schoolId: string) {
    const school = await this.databaseService.repositories.SchoolModel.findById(schoolId);
    if (!school) throw new BadRequestException('School not found');
    return this.buildVanCheckoutSession(school);
  }

  private async buildVanCheckoutSession(school: any) {
    const bill = await this.calculateMonthlyBillForSchool(school);
    const { customerId } = await this.createOrGetCustomerForSchool(school);

    // Create line items based on van breakdown
    const lineItems: any[] = [];
    const priceGroups: Record<string, number> = {};

    for (const item of bill.breakdown) {
      priceGroups[item.priceKey] = (priceGroups[item.priceKey] || 0) + 1;
    }

    for (const [priceKey, quantity] of Object.entries(priceGroups)) {
      lineItems.push({
        price: PRICE_IDS[priceKey],
        quantity,
      });
    }

    if (lineItems.length === 0) throw new BadRequestException('No active vans found for billing');

    const schoolId = bill.schoolId.toString();
    const adminId = (school as any).admin?.toString() || '';
    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL || 'https://app.smartvan.pk'}/billing?success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://app.smartvan.pk'}/billing?cancelled=true`,
      // type:'van_billing' tags both the session and the resulting
      // subscription (via subscription_data.metadata) so the webhook can
      // tell this apart from a Premium feature-tier subscription on the
      // same Stripe customer — see handleWebhook's resolveSubscriptionType.
      metadata: { adminId, schoolId, type: 'van_billing' },
      subscription_data: { metadata: { adminId, schoolId, type: 'van_billing' } },
    });

    return { sessionUrl: session.url, sessionId: session.id, bill };
  }

  // Superadmin action: a school can have real, active vans without ever
  // completing Stripe checkout (manually-provisioned/legacy accounts in
  // particular) — this generates that school's payment link and emails it
  // to the school's own contact address, so the superadmin doesn't have to
  // chase it down manually (phone call, WhatsApp, etc) for every unbilled
  // school surfaced by getPlanBreakdown()'s unbilledSchoolsWithVans.
  async sendBillingReminder(schoolId: string, actor: { userId: string; email: string }) {
    const school = await this.databaseService.repositories.SchoolModel.findById(schoolId);
    if (!school) throw new BadRequestException('School not found');
    const schoolAny = school as any;
    if (!schoolAny.schoolEmail) throw new BadRequestException('This school has no contact email on file');

    const { sessionUrl, bill } = await this.buildVanCheckoutSession(school);

    const byPriceKey: Record<string, { label: string; count: number; amount: number; currency: string }> = {};
    bill.breakdown.forEach((item: any) => {
      if (!byPriceKey[item.priceKey]) byPriceKey[item.priceKey] = { label: item.label, count: 0, amount: 0, currency: item.currency };
      byPriceKey[item.priceKey].count += 1;
      byPriceKey[item.priceKey].amount += item.amount;
    });
    const rowsHtml = Object.values(byPriceKey)
      .map((r) => `<tr><td style="padding:6px 0;color:#1a1a2e">${r.count} × ${r.label}</td><td style="padding:6px 0;text-align:right;color:#1a1a2e">${r.currency} ${r.amount.toLocaleString()}</td></tr>`)
      .join('');

    const mailer = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    const html =
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">' +
      '<div style="background:#1B3B69;padding:24px;border-radius:12px 12px 0 0"><img src="https://app.smartvan.pk/favicon-192.png" alt="SmartVan" width="56" height="56" style="display:block;margin:0 auto 10px;border-radius:12px">' +
      '<h2 style="color:white;margin:0;text-align:center">Set up billing for your SmartVan fleet</h2></div>' +
      '<div style="background:#f8f9fc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb">' +
      `<p style="color:#1a1a2e;font-size:14px;line-height:1.7">Hi, <strong>${schoolAny.schoolName}</strong> has <strong>${bill.totalVans} active van${bill.totalVans === 1 ? '' : 's'}</strong> running on SmartVan, but no payment method is on file yet. Here's the current monthly bill:</p>` +
      `<table style="width:100%;border-collapse:collapse;margin:16px 0">${rowsHtml}<tr style="border-top:1.5px solid #e5e7eb"><td style="padding:10px 0;font-weight:700;color:#1a1a2e">Total / month</td><td style="padding:10px 0;text-align:right;font-weight:700;color:#1a1a2e">${bill.currency} ${bill.totalAmount.toLocaleString()}</td></tr></table>` +
      `<div style="text-align:center;margin:24px 0"><a href="${sessionUrl}" style="background:#FFB800;color:#1B3B69;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none;display:inline-block">Set Up Payment</a></div>` +
      '<p style="color:#9ca3af;font-size:12px;text-align:center">This link expires in 24 hours. If it has expired, just log in to your SmartVan dashboard and open Billing to generate a new one.</p>' +
      '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">' +
      '<p style="color:#9ca3af;font-size:12px;text-align:center">SmartVan — School Transport Intelligence | smartvan.pk</p>' +
      '</div></div>';

    await sendWithTimeout(
      mailer.sendMail({
        from: '"SmartVan Team" <' + process.env.EMAIL_USER + '>',
        to: schoolAny.schoolEmail,
        subject: `Action needed: set up billing for ${bill.totalVans} van${bill.totalVans === 1 ? '' : 's'} on SmartVan`,
        html,
      }).then(() => {}),
      `billing reminder to ${schoolAny.schoolEmail}`,
    );

    this.auditLogService.record(
      'billing_reminder_sent',
      actor.userId,
      actor.email,
      'superadmin',
      { schoolId: school._id.toString(), schoolName: schoolAny.schoolName, totalAmount: bill.totalAmount, currency: bill.currency, totalVans: bill.totalVans },
    );

    return {
      message: `Billing reminder sent to ${schoolAny.schoolEmail}`,
      data: { schoolEmail: schoolAny.schoolEmail, totalAmount: bill.totalAmount, currency: bill.currency, totalVans: bill.totalVans },
    };
  }

  // ─── Premium feature tier — separate subscription from van billing ────

  private getPremiumPrice(currency: string): { amount: number; currency: string } {
    const isUsd = currency.toUpperCase() === 'USD';
    const raw = isUsd ? process.env.PREMIUM_PLAN_PRICE_USD : process.env.PREMIUM_PLAN_PRICE_PKR;
    const amount = Number(raw);
    if (!raw || !Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        `Premium plan pricing is not configured on the server (set PREMIUM_PLAN_PRICE_${isUsd ? 'USD' : 'PKR'}).`,
      );
    }
    return { amount, currency: isUsd ? 'usd' : 'pkr' };
  }

  async createPremiumCheckoutSession(adminId: string) {
    const adminObjectId = new Types.ObjectId(adminId);
    const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
    if (!school) throw new BadRequestException('School not found');

    const schoolAny = school as any;
    if (schoolAny.featureTier === 'premium' && schoolAny.premiumSubscriptionStatus === 'active') {
      throw new BadRequestException('This school already has Premium active.');
    }

    const { customerId } = await this.createOrGetCustomer(adminId);
    const schoolId = school._id.toString();
    const price = this.getPremiumPrice(schoolAny.currency || 'PKR');

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: price.currency,
            product_data: {
              name: 'SmartVan Premium',
              description: 'Analytics, AI Route Optimization, Safety Checklist Compliance, Ratings Log, Complaints & Reports, and Fee Management.',
            },
            unit_amount: Math.round(price.amount * 100),
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL || 'https://app.smartvan.pk'}/settings?premium=success`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://app.smartvan.pk'}/settings?premium=cancelled`,
      metadata: { adminId, schoolId, type: 'premium_feature_tier' },
      subscription_data: { metadata: { adminId, schoolId, type: 'premium_feature_tier' } },
    });

    return { sessionUrl: session.url, sessionId: session.id, price };
  }

  /** What kind of subscription a given Stripe subscription ID is — defaults
   * to 'van_billing' for subscriptions created before this metadata existed. */
  private async resolveSubscriptionType(subscriptionId: string | null | undefined): Promise<string> {
    if (!subscriptionId) return 'van_billing';
    try {
      const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
      return (sub.metadata as any)?.type || 'van_billing';
    } catch {
      return 'van_billing';
    }
  }

  // Get subscription status
  async getSubscriptionStatus(adminId: string) {
    const adminObjectId = new Types.ObjectId(adminId);
    const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
    if (!school) throw new BadRequestException('School not found');

    const schoolAny = school as any;
    const bill = await this.calculateMonthlyBill(adminId);

    if (!schoolAny.stripeCustomerId) {
      return {
        status: 'no_subscription',
        plan: 'Free Trial',
        bill,
        subscription: null,
      };
    }

    const subscriptions = await this.stripe.subscriptions.list({
      customer: schoolAny.stripeCustomerId,
      status: 'active',
      limit: 10,
    });

    // A customer can have an active Premium subscription alongside (or
    // instead of) van billing — without filtering by type, the first
    // result here could be the Premium one, misreporting its renewal date
    // as the van billing status.
    const vanSub = subscriptions.data.find((s) => ((s.metadata as any)?.type || 'van_billing') === 'van_billing');

    if (!vanSub) {
      return {
        status: 'inactive',
        plan: 'No Active Plan',
        bill,
        subscription: null,
      };
    }

    return {
      status: 'active',
      plan: 'Active Subscription',
      bill,
      subscription: {
        id: vanSub.id,
        currentPeriodEnd: new Date((vanSub as any).current_period_end * 1000),
        cancelAtPeriodEnd: vanSub.cancel_at_period_end,
      },
    };
  }

  // Get billing history
  async getBillingHistory(adminId: string) {
    const { customerId } = await this.createOrGetCustomer(adminId);
    const invoices = await this.stripe.invoices.list({
      customer: customerId,
      limit: 10,
    });

    // Tag each invoice van_billing vs premium_feature_tier (same lookup the
    // webhook uses) so the billing page can show which subscription each
    // payment belongs to, rather than one undifferentiated list.
    return Promise.all(invoices.data.map(async (inv) => ({
      id: inv.id,
      amount: (inv.amount_paid / 100),
      currency: inv.currency.toUpperCase(),
      status: inv.status,
      date: new Date(inv.created * 1000),
      pdfUrl: inv.invoice_pdf,
      type: await this.resolveSubscriptionType((inv as any).subscription),
    })));
  }

  // Handle Stripe webhook
  async handleWebhook(payload: Buffer, signature: string) {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (e) {
      throw new BadRequestException('Invalid webhook signature');
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        // Two independent subscriptions can exist on the same Stripe
        // customer (per-van billing, and the Premium feature tier) — route
        // by the type tag set at checkout-session creation, never assume.
        const session = event.data.object as any;
        const schoolId = session.metadata?.schoolId;
        const type = session.metadata?.type || 'van_billing';
        if (!schoolId) break;
        if (type === 'premium_feature_tier') {
          await this.databaseService.repositories.SchoolModel.updateOne(
            { _id: new Types.ObjectId(schoolId) },
            { $set: {
              featureTier: 'premium',
              premiumSubscriptionStatus: 'active',
              premiumStripeSubscriptionId: session.subscription,
            } },
          );
        } else {
          await this.databaseService.repositories.SchoolModel.updateOne(
            { _id: new Types.ObjectId(schoolId) },
            { $set: { subscriptionStatus: 'active', currentPlan: 'Paid' } },
          );
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const type = await this.resolveSubscriptionType((invoice as any).subscription);
        if (type === 'premium_feature_tier') {
          await this.databaseService.repositories.SchoolModel.updateOne(
            { stripeCustomerId: customerId },
            { $set: { premiumSubscriptionStatus: 'payment_failed' } },
          );
        } else {
          await this.databaseService.repositories.SchoolModel.updateOne(
            { stripeCustomerId: customerId },
            { $set: { subscriptionStatus: 'payment_failed' } },
          );
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        // A school previously marked payment_failed had no way to ever
        // automatically recover — even after Stripe's automatic retries
        // succeed, or the customer simply updates their card. Without
        // this, a paying customer could stay stuck showing as
        // delinquent indefinitely.
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const type = await this.resolveSubscriptionType((invoice as any).subscription);
        if (type === 'premium_feature_tier') {
          await this.databaseService.repositories.SchoolModel.updateOne(
            { stripeCustomerId: customerId },
            { $set: { premiumSubscriptionStatus: 'active', featureTier: 'premium' } },
          );
        } else {
          await this.databaseService.repositories.SchoolModel.updateOne(
            { stripeCustomerId: customerId },
            { $set: { subscriptionStatus: 'active', currentPlan: 'Paid' } },
          );
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const type = (sub.metadata as any)?.type || 'van_billing';
        if (type === 'premium_feature_tier') {
          // Auto-relock: a cancelled/expired Premium subscription drops
          // the school straight back to Basic, no manual step needed.
          await this.databaseService.repositories.SchoolModel.updateOne(
            { stripeCustomerId: customerId, premiumStripeSubscriptionId: sub.id },
            { $set: { featureTier: 'basic', premiumSubscriptionStatus: 'inactive' } },
          );
        } else {
          await this.databaseService.repositories.SchoolModel.updateOne(
            { stripeCustomerId: customerId },
            { $set: { subscriptionStatus: 'inactive', currentPlan: 'Free' } },
          );
        }
        break;
      }
    }

    return { received: true };
  }

  // Superadmin — get all schools billing
  async getAllSchoolsBilling() {
    const schools = await this.databaseService.repositories.SchoolModel.find({
      stripeCustomerId: { $exists: true, $ne: null }
    }).lean();

    const results = [];
    for (const school of schools) {
      const schoolAny = school as any;
      try {
        const subscriptions = await this.stripe.subscriptions.list({
          customer: schoolAny.stripeCustomerId,
          limit: 1,
        });
        results.push({
          schoolId: school._id,
          schoolName: schoolAny.schoolName,
          stripeCustomerId: schoolAny.stripeCustomerId,
          subscriptionStatus: subscriptions.data[0]?.status || 'inactive',
          currentPeriodEnd: subscriptions.data[0] ? new Date((subscriptions.data[0] as any).current_period_end * 1000) : null,
        });
      } catch {}
    }
    return results;
  }

  // Maps Stripe's own subscription.status vocabulary onto the simpler
  // internal vocabulary the rest of the app (webhook handler, frontend
  // badges) already uses — 'active'/'payment_failed'/'inactive'.
  private mapStripeStatus(status: Stripe.Subscription.Status): 'active' | 'payment_failed' | 'inactive' {
    if (status === 'active' || status === 'trialing') return 'active';
    if (status === 'past_due' || status === 'unpaid') return 'payment_failed';
    return 'inactive';
  }

  // Self-serve version of syncSubscriptionStatusFromStripe — a school admin
  // reconciling their own school, keyed off their own JWT instead of a
  // superadmin-supplied schoolId. The billing page calls this on every
  // visit so a school's own status/Premium unlock catches up with Stripe
  // immediately, without waiting on a webhook or a superadmin's manual sync.
  async syncMySubscriptionFromStripe(adminId: string) {
    const adminObjectId = new Types.ObjectId(adminId);
    const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
    if (!school) throw new BadRequestException('School not found');
    return this.syncSubscriptionStatusFromStripe(school._id.toString());
  }

  /**
   * Superadmin: re-reads a school's subscriptions directly from Stripe and
   * writes the result back to the school document. Webhooks are the normal
   * path for keeping subscriptionStatus/premiumSubscriptionStatus current,
   * but webhook delivery isn't guaranteed (a misconfigured signing secret,
   * a transient outage, Stripe exhausting its retries) — this is the
   * on-demand fallback so a confirmed Stripe payment is never permanently
   * stuck showing as unbilled in the dashboard.
   */
  async syncSubscriptionStatusFromStripe(schoolId: string) {
    const school = await this.databaseService.repositories.SchoolModel.findById(schoolId);
    if (!school) throw new BadRequestException('School not found');
    const schoolAny = school as any;

    let stripeCustomerId: string | null = schoolAny.stripeCustomerId || null;
    let recovered = false;

    // No customer on file doesn't necessarily mean "never paid" — a
    // checkout can succeed on Stripe's side while the DB write-back that
    // links it to this exact school document never lands (e.g. the school
    // was re-provisioned/duplicated after the original checkout). Before
    // reporting "never went through checkout", look for an existing Stripe
    // customer under this school's own email and adopt it if found.
    if (!stripeCustomerId && schoolAny.schoolEmail) {
      const found = await this.stripe.customers.list({ email: schoolAny.schoolEmail, limit: 1 });
      if (found.data.length > 0) {
        stripeCustomerId = found.data[0].id;
        recovered = true;
        await this.databaseService.repositories.SchoolModel.updateOne(
          { _id: school._id },
          { $set: { stripeCustomerId } },
        );
      }
    }

    if (!stripeCustomerId) {
      return {
        message: 'No Stripe customer on file for this school yet',
        data: {
          subscriptionStatus: schoolAny.subscriptionStatus || 'no_subscription',
          premiumSubscriptionStatus: schoolAny.premiumSubscriptionStatus || 'inactive',
          diagnostic: { stripeCustomerId: null, subscriptionsFound: [] },
        },
      };
    }

    const subscriptions = await this.stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 10,
    });
    // Surfaced back to the caller so a "synced but nothing changed" result
    // is debuggable (e.g. the stored customer really has zero subscriptions
    // in Stripe — wrong/stale stripeCustomerId — rather than a silent no-op
    // that looks identical to "already up to date").
    const diagnostic = {
      stripeCustomerId,
      recoveredByEmail: recovered,
      subscriptionsFound: subscriptions.data.map((s) => ({
        id: s.id,
        status: s.status,
        type: (s.metadata as any)?.type || 'van_billing (untagged)',
        created: new Date(s.created * 1000).toISOString(),
      })),
    };

    // Same customer can carry both a van_billing and a premium_feature_tier
    // subscription (see createCheckoutSessionForSchool/createPremiumCheckoutSession) —
    // route each by its metadata.type tag, most-recently-created wins within a type.
    let vanSub: Stripe.Subscription | undefined;
    let premiumSub: Stripe.Subscription | undefined;
    for (const sub of subscriptions.data) {
      const type = (sub.metadata as any)?.type || 'van_billing';
      if (type === 'premium_feature_tier') {
        if (!premiumSub || sub.created > premiumSub.created) premiumSub = sub;
      } else if (!vanSub || sub.created > vanSub.created) {
        vanSub = sub;
      }
    }

    const update: any = {};
    let subscriptionStatus = schoolAny.subscriptionStatus || 'no_subscription';
    let premiumSubscriptionStatus = schoolAny.premiumSubscriptionStatus || 'inactive';

    if (vanSub) {
      subscriptionStatus = this.mapStripeStatus(vanSub.status);
      update.subscriptionStatus = subscriptionStatus;
      update.currentPlan = subscriptionStatus === 'active' ? 'Paid' : 'Free';
    }
    if (premiumSub) {
      premiumSubscriptionStatus = this.mapStripeStatus(premiumSub.status);
      update.premiumSubscriptionStatus = premiumSubscriptionStatus;
      update.premiumStripeSubscriptionId = premiumSub.id;
      if (premiumSubscriptionStatus === 'active') update.featureTier = 'premium';
    }

    if (Object.keys(update).length > 0) {
      await this.databaseService.repositories.SchoolModel.updateOne({ _id: school._id }, { $set: update });
    }

    return {
      message: 'Synced from Stripe',
      data: { subscriptionStatus, premiumSubscriptionStatus, diagnostic },
    };
  }

  /**
   * Superadmin: platform-wide plan breakdown — counts and estimated MRR per
   * feature tier (Basic/Premium), plus van-billing subscription health
   * (active/payment_failed/no_subscription/cancelled). These are two
   * separate Stripe subscriptions per school (see handleWebhook's comment
   * on why they're tracked as distinct fields), so the breakdown reports
   * them side by side rather than conflating them into one "MRR" figure.
   */
  async getPlanBreakdown() {
    const schools = await this.databaseService.repositories.SchoolModel.find(
      {},
      { featureTier: 1, premiumSubscriptionStatus: 1, subscriptionStatus: 1, currency: 1 },
    ).lean();

    // A school can have active vans (real fleet in use) without ever having
    // completed Stripe checkout — manually-provisioned/legacy accounts in
    // particular. subscriptionStatus alone then reads 'no_subscription' and
    // every revenue figure derived only from confirmed subscriptions hides
    // that fleet entirely. Here we also compute what the fleet is actually
    // worth at current per-van prices, regardless of billing status, so the
    // super admin can see which schools are running unbilled.
    const schoolIds = schools.map((s: any) => s._id.toString());
    const activeVans = await this.databaseService.repositories.VanModel.find(
      { schoolId: { $in: schoolIds }, status: 'active' },
      { schoolId: 1, vehicleType: 1, vehicleCategory: 1 },
    ).lean();
    const vansBySchoolId: Record<string, any[]> = {};
    activeVans.forEach((v: any) => {
      (vansBySchoolId[v.schoolId] ||= []).push(v);
    });

    const byTier = { basic: 0, premium: 0 };
    const byVanBillingStatus: Record<string, number> = {};
    const potentialVanBillingByCurrency: Record<string, number> = {};
    let premiumActiveCount = 0;
    let unbilledSchoolsWithVans = 0;

    schools.forEach((s: any) => {
      const sid = s._id.toString();
      const tier = s.featureTier === 'premium' ? 'premium' : 'basic';
      byTier[tier] += 1;
      if (s.premiumSubscriptionStatus === 'active') premiumActiveCount += 1;

      const vanStatus = s.subscriptionStatus || 'no_subscription';
      byVanBillingStatus[vanStatus] = (byVanBillingStatus[vanStatus] || 0) + 1;

      const schoolVans = vansBySchoolId[sid] || [];
      if (schoolVans.length > 0) {
        const currency = (s.currency || 'PKR').toUpperCase();
        const amount = this.estimateMonthlyVanRevenue(schoolVans, currency);
        potentialVanBillingByCurrency[currency] = (potentialVanBillingByCurrency[currency] || 0) + amount;
        if (vanStatus !== 'active') unbilledSchoolsWithVans += 1;
      }
    });

    const premiumPricePkr = Number(process.env.PREMIUM_PLAN_PRICE_PKR) || 0;
    const estimatedPremiumMrrPkr = premiumActiveCount * premiumPricePkr;

    return {
      message: 'Plan breakdown fetched',
      data: {
        totalSchools: schools.length,
        byTier,
        premiumActiveCount,
        estimatedPremiumMrrPkr,
        premiumPricePkr,
        byVanBillingStatus,
        potentialVanBillingByCurrency,
        unbilledSchoolsWithVans,
      },
    };
  }
}
