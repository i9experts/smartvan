/* eslint-disable prettier/prettier */
import { Injectable, BadRequestException } from '@nestjs/common';
import * as Stripe from 'stripe';
import { DatabaseService } from 'src/database/databaseservice';
import { Types } from 'mongoose';

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

  constructor(private readonly databaseService: DatabaseService) {
    this.stripe = new (Stripe as any)(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: '2023-10-16' as any,
    });
  }

  // Get price key based on van type and currency
  getPriceKey(vanType: string, currency: string): string {
    const type = vanType.toLowerCase();
    const curr = currency.toUpperCase();
    if (type === 'car' || type === 'rickshaw' || type === 'auto rickshaw') return 'car_pkr';
    if ((type === 'hiroof' || type === 'hiace') && curr === 'USD') return 'hiroof_usd';
    if ((type === 'hiroof' || type === 'hiace')) return 'hiroof_pkr';
    if ((type === 'bus' || type === 'coach') && curr === 'USD') return 'bus_usd';
    if ((type === 'bus' || type === 'coach')) return 'bus_pkr';
    return 'hiroof_pkr'; // default
  }

  // Calculate monthly bill for a school
  async calculateMonthlyBill(adminId: string) {
    const adminObjectId = new Types.ObjectId(adminId);
    const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
    if (!school) throw new BadRequestException('School not found');

    const vans = await this.databaseService.repositories.VanModel.find({
      schoolId: school._id.toString(),
      status: 'active',
    }).lean();

    const currency = (school as any).currency || 'PKR';
    let totalAmount = 0;
    const breakdown: any[] = [];

    for (const van of vans) {
      const vanType = (van as any).vehicleType || 'Hiroof';
      const priceKey = this.getPriceKey(vanType, currency);
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

    const schoolAny = school as any;

    // Return existing customer
    if (schoolAny.stripeCustomerId) {
      return { customerId: schoolAny.stripeCustomerId };
    }

    // Create new Stripe customer
    const customer = await this.stripe.customers.create({
      name: schoolAny.schoolName,
      email: schoolAny.schoolEmail,
      metadata: {
        schoolId: school._id.toString(),
        adminId: adminId,
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
    const bill = await this.calculateMonthlyBill(adminId);
    const { customerId } = await this.createOrGetCustomer(adminId);

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

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL || 'https://smartvanride.com'}/billing?success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://smartvanride.com'}/billing?cancelled=true`,
      metadata: {
        adminId,
        schoolId: bill.schoolId.toString(),
      },
    });

    return { sessionUrl: session.url, sessionId: session.id, bill };
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
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return {
        status: 'inactive',
        plan: 'No Active Plan',
        bill,
        subscription: null,
      };
    }

    const sub = subscriptions.data[0];
    return {
      status: 'active',
      plan: 'Active Subscription',
      bill,
      subscription: {
        id: sub.id,
        currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
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

    return invoices.data.map(inv => ({
      id: inv.id,
      amount: (inv.amount_paid / 100),
      currency: inv.currency.toUpperCase(),
      status: inv.status,
      date: new Date(inv.created * 1000),
      pdfUrl: inv.invoice_pdf,
    }));
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
        const session = event.data.object as any;
        const schoolId = session.metadata?.schoolId;
        if (schoolId) {
          await this.databaseService.repositories.SchoolModel.updateOne(
            { _id: new Types.ObjectId(schoolId) },
            { $set: { subscriptionStatus: 'active', currentPlan: 'Paid' } }
          );
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        await this.databaseService.repositories.SchoolModel.updateOne(
          { stripeCustomerId: customerId },
          { $set: { subscriptionStatus: 'payment_failed' } }
        );
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        await this.databaseService.repositories.SchoolModel.updateOne(
          { stripeCustomerId: customerId },
          { $set: { subscriptionStatus: 'inactive', currentPlan: 'Free' } }
        );
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
}
