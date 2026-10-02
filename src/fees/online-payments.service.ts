/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DatabaseService } from 'src/database/databaseservice';
import { FirebaseAdminService } from 'src/notification/firebase-admin.service';
import { TransportPayment, TransportPaymentDocument } from './transport-payment.schema';
import { PaymentCheckout, PaymentCheckoutDocument } from './payment-checkout.schema';
import {
  CHECKOUT_TTL_MS,
  isOnlineMethod,
  ONLINE_METHODS,
  paymentsMode,
  providerFor,
} from './payments/payment-provider';

const fail = (code: string, message: string, status = HttpStatus.BAD_REQUEST) =>
  new HttpException({ success: false, code, message }, status);

/**
 * Parent pays a transport fee online, plus receipts and the driver's
 * monthly collection summary.
 */
@Injectable()
export class OnlinePaymentsService {
  constructor(
    @InjectModel(TransportPayment.name) private paymentModel: Model<TransportPaymentDocument>,
    @InjectModel(PaymentCheckout.name) private checkoutModel: Model<PaymentCheckoutDocument>,
    private readonly databaseService: DatabaseService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  getMethods() {
    const mode = paymentsMode();
    return {
      success: true,
      mode,
      methods: ONLINE_METHODS.map((m) => ({
        ...m,
        enabled: providerFor(m.key, mode) !== null,
      })),
    };
  }

  /** Payment must belong to this parent (stored parentId, or the kid's parent). */
  private async loadParentPayment(parentId: string, paymentId: string) {
    if (!Types.ObjectId.isValid(paymentId)) throw new NotFoundException('Payment not found');
    const payment: any = await this.paymentModel.findById(paymentId);
    if (!payment) throw new NotFoundException('Payment not found');
    let owns = payment.parentId === parentId;
    if (!owns) {
      const kid: any = await this.databaseService.repositories.KidModel.findById(payment.kidId, { parentId: 1 }).lean();
      owns = kid?.parentId?.toString() === parentId;
    }
    if (!owns) throw new ForbiddenException('This payment does not belong to you');
    return payment;
  }

  async startCheckout(parentId: string, body: { paymentId: string; method: string }) {
    if (!isOnlineMethod(body?.method)) {
      throw fail('INVALID_METHOD', 'Choose JazzCash, Easypaisa or Raast.');
    }
    const provider = providerFor(body.method);
    if (!provider) {
      throw fail('PAYMENTS_UNAVAILABLE', 'Online payment is not available yet. Please pay your driver or school.',
        HttpStatus.SERVICE_UNAVAILABLE);
    }
    const payment = await this.loadParentPayment(parentId, body.paymentId);
    if (payment.status === 'paid') throw fail('ALREADY_PAID', 'This fee is already paid.');

    // Reuse an open checkout for the same payment+method instead of stacking.
    const now = new Date();
    const open: any = await this.checkoutModel.findOne({
      paymentId: payment._id.toString(),
      method: body.method,
      status: 'pending',
      expiresAt: { $gt: now },
    });
    if (open) return this.checkoutView(open, null);

    const checkout: any = await this.checkoutModel.create({
      paymentId: payment._id.toString(),
      parentId,
      kidId: payment.kidId,
      schoolId: payment.schoolId,
      amount: payment.amount,
      currency: payment.currency || 'PKR',
      method: body.method,
      provider: provider.name,
      status: 'pending',
      expiresAt: new Date(now.getTime() + CHECKOUT_TTL_MS),
    });
    const session = await provider.createCheckout({
      checkoutId: checkout._id.toString(),
      method: body.method,
      amount: checkout.amount,
      currency: checkout.currency,
      description: `SmartVan transport fee ${payment.month}`,
    });
    checkout.providerRef = session.providerRef;
    await checkout.save();
    return this.checkoutView(checkout, session);
  }

  private checkoutView(c: any, session: { redirectUrl?: string; instructions: string } | null) {
    return {
      success: true,
      data: {
        checkoutId: c._id.toString(),
        paymentId: c.paymentId,
        method: c.method,
        provider: c.provider,
        amount: c.amount,
        currency: c.currency,
        status: c.status,
        expiresAt: c.expiresAt,
        redirectUrl: session?.redirectUrl ?? null,
        instructions: session?.instructions ??
          (c.provider === 'mock' ? 'TEST MODE — confirm the test payment to continue.' : 'Complete the payment in your wallet app.'),
        testMode: c.provider === 'mock',
      },
    };
  }

  async getCheckout(parentId: string, checkoutId: string) {
    const c: any = await this.loadParentCheckout(parentId, checkoutId);
    if (c.status === 'pending' && c.expiresAt < new Date()) {
      c.status = 'expired';
      await c.save();
    }
    return this.checkoutView(c, null);
  }

  private async loadParentCheckout(parentId: string, checkoutId: string) {
    if (!Types.ObjectId.isValid(checkoutId)) throw new NotFoundException('Checkout not found');
    const c: any = await this.checkoutModel.findById(checkoutId);
    if (!c || c.parentId !== parentId) throw new NotFoundException('Checkout not found');
    return c;
  }

  /** TEST MODE only: simulate the gateway confirming (or failing). */
  async mockConfirm(parentId: string, checkoutId: string, success = true) {
    if (paymentsMode() !== 'mock') throw new NotFoundException();
    const c: any = await this.loadParentCheckout(parentId, checkoutId);
    if (c.provider !== 'mock') throw new NotFoundException();
    await this.complete(c, success, success ? undefined : 'Declined (test)');
    return this.getCheckout(parentId, checkoutId);
  }

  /** Gateway callback. */
  async handleWebhook(providerName: string, headers: any, body: any) {
    const mode = paymentsMode();
    const method = ONLINE_METHODS.find((m) => providerFor(m.key, mode)?.name === providerName)?.key;
    const provider = method ? providerFor(method, mode) : null;
    if (!provider || provider.name === 'mock') throw new NotFoundException();
    const result = await provider.verifyWebhook(headers, body);
    if (!result) throw new ForbiddenException('Invalid signature');
    const c: any = await this.checkoutModel.findOne({ provider: providerName, providerRef: result.providerRef });
    if (!c) throw new NotFoundException('Unknown transaction');
    await this.complete(c, result.success, result.failureReason);
    return { success: true };
  }

  /** Idempotent: a checkout completes once; the fee is marked paid once. */
  private async complete(c: any, success: boolean, failureReason?: string) {
    if (c.status !== 'pending') return;
    c.status = success ? 'succeeded' : 'failed';
    c.completedAt = new Date();
    if (failureReason) c.failureReason = failureReason;
    await c.save();
    if (!success) return;

    const payment: any = await this.paymentModel.findOneAndUpdate(
      { _id: c.paymentId, status: { $ne: 'paid' } },
      {
        $set: {
          status: 'paid',
          paidAt: c.completedAt,
          paymentMethod: c.method,
          collectedBy: c.parentId,
          collectedByType: 'online',
          notes: `Online via ${c.provider} (${c.providerRef || c._id})`,
        },
      },
      { new: true },
    );
    if (!payment) return; // already paid some other way

    try {
      const parent: any = await this.databaseService.repositories.parentModel.findOne({
        _id: c.parentId, isDelete: false,
      }).lean();
      const kid: any = await this.databaseService.repositories.KidModel.findById(payment.kidId, { fullname: 1 }).lean();
      if (parent?.fcmToken) {
        await this.firebaseAdminService.sendToDevice(parent.fcmToken, {
          notification: {
            title: 'Payment Received ✅',
            body: `Transport fee of ${payment.currency} ${payment.amount} for ${kid?.fullname || 'your child'} (${payment.month}) is paid.`,
          },
          data: {
            type: 'PAYMENT_RECEIVED',
            paymentId: payment._id.toString(),
            kidId: payment.kidId,
            month: payment.month,
            amount: String(payment.amount),
            currency: payment.currency,
            receiptNumber: payment.receiptNumber || '',
            paymentMethod: payment.paymentMethod,
          },
        });
      }
    } catch (e) {
      console.error('[online-payments] receipt push failed:', e);
    }
  }

  // ─── Receipts ──────────────────────────────────────────────────────────

  /** Parent (own kid), driver (kid on their van) or school admin/staff/superadmin. */
  async getReceipt(user: any, paymentId: string) {
    if (!Types.ObjectId.isValid(paymentId)) throw new NotFoundException('Payment not found');
    const payment: any = await this.paymentModel.findById(paymentId).lean();
    if (!payment) throw new NotFoundException('Payment not found');
    const repos = this.databaseService.repositories;
    const kid: any = await repos.KidModel.findById(payment.kidId, { fullname: 1, grade: 1, parentId: 1, VanId: 1 }).lean();

    let allowed = false;
    if (user?.userType === 'parent') {
      allowed = payment.parentId === user.userId || kid?.parentId?.toString() === user.userId;
    } else if (user?.userType === 'driver') {
      const van: any = await repos.VanModel.findOne({ driverId: new Types.ObjectId(user.userId) }, { _id: 1 }).lean();
      allowed = !!van && kid?.VanId === van._id.toString();
    } else if (user?.role === 'superadmin') {
      allowed = true;
    } else if (user?.role === 'school_staff') {
      allowed = user.schoolId?.toString() === payment.schoolId;
    } else if (user?.role === 'admin') {
      const school: any = await repos.SchoolModel.findOne({ admin: new Types.ObjectId(user.userId) }, { _id: 1 }).lean();
      allowed = school?._id?.toString() === payment.schoolId;
    }
    if (!allowed) throw new ForbiddenException('You cannot view this receipt');
    if (payment.status !== 'paid') throw fail('NOT_PAID', 'This fee has not been paid yet.');

    const school: any = Types.ObjectId.isValid(payment.schoolId)
      ? await repos.SchoolModel.findById(payment.schoolId, { schoolName: 1, contactNumber: 1 }).lean()
      : null;

    return {
      success: true,
      data: {
        paymentId: payment._id.toString(),
        receiptNumber: payment.receiptNumber,
        schoolName: school?.schoolName || '',
        schoolPhone: school?.contactNumber || '',
        studentName: kid?.fullname || payment.studentName || '',
        grade: kid?.grade || payment.grade || '',
        month: payment.month,
        amount: payment.amount,
        discountAmount: payment.discountAmount || 0,
        lateFeeAmount: payment.lateFeeAmount || 0,
        currency: payment.currency || 'PKR',
        paymentMethod: payment.paymentMethod,
        collectedByType: payment.collectedByType || null,
        paidAt: payment.paidAt,
      },
    };
  }

  // ─── Driver monthly summary ────────────────────────────────────────────

  async getDriverSummary(driverId: string, month?: string) {
    const target = /^\d{4}-\d{2}$/.test(month || '')
      ? month
      : new Date().toISOString().slice(0, 7);
    const repos = this.databaseService.repositories;
    const van: any = await repos.VanModel.findOne({ driverId: new Types.ObjectId(driverId) }).lean();
    if (!van) return { success: true, data: { month: target, students: 0, paid: 0, pending: 0, notGenerated: 0, collectedByYou: 0, collectedOnline: 0, totalPaid: 0, totalPending: 0, currency: 'PKR', byMethod: {} } };

    const kids: any[] = await repos.KidModel.find({ VanId: van._id.toString(), status: 'active' }, { _id: 1 }).lean();
    const kidIds = kids.map((k) => k._id.toString());
    const payments: any[] = await this.paymentModel.find({ kidId: { $in: kidIds }, month: target }).lean();

    const byMethod: Record<string, number> = {};
    let totalPaid = 0;
    let totalPending = 0;
    let paid = 0;
    let collectedByYou = 0;
    let collectedOnline = 0;
    for (const p of payments) {
      if (p.status === 'paid') {
        paid++;
        totalPaid += p.amount || 0;
        byMethod[p.paymentMethod || 'other'] = (byMethod[p.paymentMethod || 'other'] || 0) + (p.amount || 0);
        if (p.collectedBy === driverId) collectedByYou += p.amount || 0;
        if (p.collectedByType === 'online') collectedOnline += p.amount || 0;
      } else {
        totalPending += p.amount || 0;
      }
    }
    const withPayment = new Set(payments.map((p) => p.kidId));
    return {
      success: true,
      data: {
        month: target,
        students: kidIds.length,
        paid,
        pending: payments.length - paid,
        notGenerated: kidIds.filter((id) => !withPayment.has(id)).length,
        totalPaid,
        totalPending,
        collectedByYou,
        collectedOnline,
        currency: payments[0]?.currency || 'PKR',
        byMethod,
      },
    };
  }
}
