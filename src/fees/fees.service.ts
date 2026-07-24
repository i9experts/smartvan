/* eslint-disable prettier/prettier */
import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as nodemailer from 'nodemailer';
import { TransportFee, TransportFeeDocument } from './transport-fee.schema';
import { TransportPayment, TransportPaymentDocument } from './transport-payment.schema';
import { DatabaseService } from 'src/database/databaseservice';
import { FirebaseAdminService } from 'src/notification/firebase-admin.service';

@Injectable()
export class FeesService {
  constructor(
    @InjectModel(TransportFee.name) private feeModel: Model<TransportFeeDocument>,
    @InjectModel(TransportPayment.name) private paymentModel: Model<TransportPaymentDocument>,
    private databaseService: DatabaseService,
    private firebaseAdminService: FirebaseAdminService,
  ) {}

  private getMailer() {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }

  private generateReceiptNumber(): string {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return 'SV-' + ts + '-' + rand;
  }

  private getCurrentMonth(): string {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  // ── Set / update transport fee for a route or van ──────────────────────────
  async setFee(body: any) {
    const {
      schoolId, routeId, vanId, amount, currency, billingCycle, description,
      serviceType, pickOnlyAmount, dropOnlyAmount,
      siblingDiscountPercent, earlyPaymentDiscountPercent, earlyPaymentDeadlineDay,
      lateFeeAmount, lateFeeAfterDay, notes,
    } = body;
    if (!schoolId || !amount) throw new BadRequestException('schoolId and amount are required');

    const optionalFields = {
      serviceType, pickOnlyAmount, dropOnlyAmount,
      siblingDiscountPercent, earlyPaymentDiscountPercent, earlyPaymentDeadlineDay,
      lateFeeAmount, lateFeeAfterDay, notes,
    };

    // Update if exists, create if not
    const existing = await this.feeModel.findOne({
      schoolId,
      ...(routeId ? { routeId } : {}),
      ...(vanId ? { vanId } : {}),
    });

    if (existing) {
      existing.amount = amount;
      existing.currency = currency || existing.currency;
      existing.billingCycle = billingCycle || existing.billingCycle;
      existing.description = description || existing.description;
      existing.isActive = true;
      Object.keys(optionalFields).forEach((key) => {
        const value = (optionalFields as any)[key];
        if (value !== undefined) (existing as any)[key] = value;
      });
      await existing.save();
      return { message: 'Fee updated successfully', data: existing };
    }

    const fee = await this.feeModel.create({
      schoolId, routeId, vanId, amount,
      currency: currency || 'PKR',
      billingCycle: billingCycle || 'monthly',
      description: description || 'Monthly transport fee',
      ...optionalFields,
    });

    return { message: 'Fee set successfully', data: fee };
  }

  // ── Get all fees for a school ──────────────────────────────────────────────
  async getSchoolFees(schoolId: string) {
    const fees = await this.feeModel.find({ schoolId, isActive: true }).lean();

    // Enrich with route and van info
    const enriched = await Promise.all(fees.map(async (fee: any) => {
      let routeInfo = null;
      let vanInfo = null;

      if (fee.routeId) {
        routeInfo = await this.databaseService.repositories.routeModel
          .findById(fee.routeId, { title: 1, tripType: 1 }).lean();
      }
      if (fee.vanId) {
        vanInfo = await this.databaseService.repositories.VanModel
          .findById(fee.vanId, { carNumber: 1, vehicleType: 1 }).lean();
      }

      return { ...fee, route: routeInfo, van: vanInfo };
    }));

    return { message: 'Fees fetched', data: enriched };
  }

  // ── Generate monthly payment records for all kids in a school ─────────────
  async generateMonthlyPayments(schoolId: string, month?: string) {
    const targetMonth = month || this.getCurrentMonth();

    // Get all active kids in school
    const kids = await this.databaseService.repositories.KidModel.find({
      schoolId, status: 'active',
    }).lean();

    if (!kids.length) throw new BadRequestException('No active students found');

    // Get school fee
    const fee = await this.feeModel.findOne({ schoolId, isActive: true });
    if (!fee) throw new BadRequestException('No fee configured for this school. Please set a fee first.');

    let created = 0;
    let skipped = 0;

    for (const kid of kids) {
      // Check if payment record already exists for this month
      const exists = await this.paymentModel.findOne({
        schoolId, kidId: kid._id.toString(), month: targetMonth,
      });

      if (exists) { skipped++; continue; }

      await this.paymentModel.create({
        schoolId,
        kidId: kid._id.toString(),
        parentId: kid.parentId?.toString() || '',
        feeId: fee._id.toString(),
        vanId: (kid as any).vanId || '',
        amount: fee.amount,
        currency: fee.currency,
        paymentMethod: 'cash',
        status: 'pending',
        month: targetMonth,
        receiptNumber: this.generateReceiptNumber(),
      });
      created++;
    }

    return {
      message: 'Monthly payment records generated',
      month: targetMonth,
      created,
      skipped,
      total: kids.length,
    };
  }

  // ── Record a payment (cash/jazzcash/bank) ─────────────────────────────────
  async recordPayment(body: any, collectorId: string, collectorType: string) {
    const { paymentId, schoolId, paymentMethod, amount, notes } = body;
    let { kidId, month } = body;
    const targetMonth = month || this.getCurrentMonth();

    let payment: any;

    if (paymentId) {
      // Admin panel's Record Payment modal already has the specific
      // payment selected and only sends its ID — the caller never had
      // kidId/month in the first place, so look it up directly instead.
      payment = await this.paymentModel.findById(paymentId);
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.schoolId !== schoolId) {
        throw new UnauthorizedException('This payment does not belong to your school');
      }
      kidId = payment.kidId;
      month = payment.month;
    } else {
      const kidCheck = await this.databaseService.repositories.KidModel.findById(kidId).lean() as any;
      if (!kidCheck) throw new NotFoundException('Student not found');
      if (kidCheck.schoolId !== schoolId) {
        throw new UnauthorizedException('This student does not belong to your school');
      }

      // Find or create payment record
      payment = await this.paymentModel.findOne({
        kidId, schoolId, month: targetMonth,
      });

      if (!payment) {
        // Auto-create if not exists
        const fee = await this.feeModel.findOne({ schoolId, isActive: true });
        payment = await this.paymentModel.create({
          schoolId, kidId,
          parentId: body.parentId || '',
          feeId: fee?._id.toString() || '',
          amount: amount || fee?.amount || 0,
          currency: fee?.currency || 'PKR',
          paymentMethod: paymentMethod || 'cash',
          status: 'pending',
          month: targetMonth,
          receiptNumber: this.generateReceiptNumber(),
        });
      }
    }

    if (payment.status === 'paid') {
      throw new BadRequestException('Payment already recorded for this month');
    }

    // Mark as paid
    payment.status = 'paid';
    payment.paidAt = new Date();
    payment.paymentMethod = paymentMethod || 'cash';
    payment.collectedBy = collectorId;
    payment.collectedByType = collectorType;
    payment.notes = notes || '';
    if (amount) payment.amount = amount;
    await payment.save();

    // Notify parent via FCM
    const kid = await this.databaseService.repositories.KidModel.findById(kidId).lean() as any;
    if (kid?.parentId) {
      const parent = await this.databaseService.repositories.parentModel.findOne({
        _id: kid.parentId, isDelete: false,
      }) as any;

      if (parent?.fcmToken && parent.notificationToggle === true) {
        await this.firebaseAdminService.sendToDevice(parent.fcmToken, {
          notification: {
            title: 'Payment Received ✅',
            body: 'Transport fee of ' + payment.currency + ' ' + payment.amount +
              ' for ' + (kid.fullname || 'your child') + ' has been recorded for ' + targetMonth,
          },
          data: {
            type: 'PAYMENT_RECEIVED',
            kidId,
            month: targetMonth,
            amount: String(payment.amount),
            currency: payment.currency,
            receiptNumber: payment.receiptNumber,
            paymentMethod: payment.paymentMethod,
          },
        });
      }
    }

    return {
      message: 'Payment recorded successfully',
      data: {
        receiptNumber: payment.receiptNumber,
        kidId,
        month: targetMonth,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        paidAt: payment.paidAt,
        status: payment.status,
      },
    };
  }

  // ── Get all payments for admin ─────────────────────────────────────────────
  async getPayments(schoolId: string, month?: string, status?: string) {
    const targetMonth = month || this.getCurrentMonth();
    const filter: any = { schoolId, month: targetMonth };
    if (status) filter.status = status;

    const payments = await this.paymentModel.find(filter).sort({ createdAt: -1 }).lean();

    // Enrich with kid info
    const enriched = await Promise.all(payments.map(async (p: any) => {
      const kid = await this.databaseService.repositories.KidModel
        .findById(p.kidId, { fullname: 1, image: 1 }).lean() as any;
      return { ...p, kidName: kid?.fullname || 'Unknown', kidImage: kid?.image || null };
    }));

    const total = enriched.length;
    const paid = enriched.filter(p => p.status === 'paid').length;
    const pending = enriched.filter(p => p.status === 'pending').length;
    const totalAmount = enriched.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);

    return {
      message: 'Payments fetched',
      month: targetMonth,
      summary: { total, paid, pending, totalAmount },
      data: enriched,
    };
  }

  // ── Get unpaid students this month ────────────────────────────────────────
  async getUnpaidStudents(schoolId: string, month?: string) {
    const targetMonth = month || this.getCurrentMonth();
    const unpaid = await this.paymentModel.find({
      schoolId, month: targetMonth, status: { $in: ['pending', 'overdue'] },
    }).lean();

    const enriched = await Promise.all(unpaid.map(async (p: any) => {
      const kid = await this.databaseService.repositories.KidModel
        .findById(p.kidId, { fullname: 1, image: 1, parentId: 1 }).lean() as any;
      const parent = kid?.parentId
        ? await this.databaseService.repositories.parentModel
            .findById(kid.parentId, { fullname: 1, phoneNo: 1 }).lean() as any
        : null;
      return {
        ...p,
        kidName: kid?.fullname || 'Unknown',
        kidImage: kid?.image || null,
        parentName: parent?.fullname || 'Unknown',
        parentPhone: parent?.phoneNo || '',
      };
    }));

    return {
      message: 'Unpaid students fetched',
      month: targetMonth,
      total: enriched.length,
      data: enriched,
    };
  }

  // ── Parent views their payment history ────────────────────────────────────
  async getParentPayments(parentId: string) {
    const payments = await this.paymentModel.find({ parentId })
      .sort({ createdAt: -1 }).lean();

    const enriched = await Promise.all(payments.map(async (p: any) => {
      const kid = await this.databaseService.repositories.KidModel
        .findById(p.kidId, { fullname: 1, image: 1 }).lean() as any;
      return { ...p, kidName: kid?.fullname || 'Unknown', kidImage: kid?.image || null };
    }));

    return { message: 'Payment history fetched', data: enriched };
  }

  // ── Send payment reminder to all unpaid parents ───────────────────────────
  async sendPaymentReminders(schoolId: string, month?: string) {
    const targetMonth = month || this.getCurrentMonth();
    const unpaid = await this.paymentModel.find({
      schoolId, month: targetMonth, status: 'pending',
    }).lean();

    let sent = 0;
    for (const p of unpaid as any[]) {
      const kid = await this.databaseService.repositories.KidModel
        .findById(p.kidId, { fullname: 1, parentId: 1 }).lean() as any;
      if (!kid?.parentId) continue;

      const parent = await this.databaseService.repositories.parentModel.findOne({
        _id: kid.parentId, isDelete: false,
      }) as any;

      if (parent?.fcmToken && parent.notificationToggle === true) {
        await this.firebaseAdminService.sendToDevice(parent.fcmToken, {
          notification: {
            title: 'Transport Fee Reminder 🔔',
            body: 'Transport fee of ' + p.currency + ' ' + p.amount +
              ' for ' + (kid.fullname || 'your child') + ' is due for ' + targetMonth,
          },
          data: {
            type: 'PAYMENT_REMINDER',
            kidId: p.kidId,
            month: targetMonth,
            amount: String(p.amount),
          },
        });
        sent++;
      }
    }

    return { message: 'Reminders sent', sent, total: unpaid.length };
  }

  async getFeeSummary(schoolId: string, month?: string) {
    const targetMonth = month || this.getCurrentMonth();
    const payments = await this.paymentModel.find({ schoolId, month: targetMonth }).lean();
    const paid = payments.filter((p: any) => p.status === 'paid');
    const pending = payments.filter((p: any) => p.status === 'pending');
    const overdue = payments.filter((p: any) => p.status === 'overdue');
    const totalCollected = paid.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const totalPending = pending.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const totalOverdue = overdue.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    return {
      message: 'Summary fetched',
      month: targetMonth,
      data: {
        total: payments.length,
        paid: paid.length,
        pending: pending.length,
        overdue: overdue.length,
        totalCollected,
        totalPending,
        totalOverdue,
        collectionRate: payments.length ? Math.round((paid.length / payments.length) * 100) : 0,
      }
    };
  }

  async updatePaymentStatus(paymentId: string, status: string, callerSchoolId: string) {
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.schoolId !== callerSchoolId) {
      throw new UnauthorizedException('This payment does not belong to your school');
    }
    payment.status = status as any;
    if (status === 'overdue') payment.paidAt = null;
    await payment.save();
    return { message: 'Status updated', data: payment };
  }

  async deleteFee(feeId: string, callerSchoolId: string) {
    const fee = await this.feeModel.findById(feeId);
    if (!fee) throw new NotFoundException('Fee not found');
    if (fee.schoolId !== callerSchoolId) {
      throw new UnauthorizedException('This fee does not belong to your school');
    }
    await this.feeModel.findByIdAndUpdate(feeId, { isActive: false });
    return { message: 'Fee deleted successfully' };
  }

  async getStudentPayments(kidId: string, callerSchoolId: string) {
    const kid = await this.databaseService.repositories.KidModel.findById(kidId);
    if (!kid) throw new NotFoundException('Student not found');
    if ((kid as any).schoolId !== callerSchoolId) {
      throw new UnauthorizedException('This student does not belong to your school');
    }
    const payments = await this.paymentModel.find({ kidId }).sort({ createdAt: -1 }).lean();
    return { message: 'Student payments fetched', data: payments };
  }
}
