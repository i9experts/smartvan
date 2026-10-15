/* eslint-disable prettier/prettier */
import { Controller, Get, Post, Body, Param, Req, UseGuards, Headers, RawBodyRequest, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BillingService } from './billing.service';
import { Request } from 'express';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // Billing, unlike students/fleet/fees/etc, is deliberately never
  // delegable to school_staff (see the comment on SCHOOL_STAFF_PERMISSION_KEYS)
  // — it's the school admin's own financial/account-level data. Unlike
  // fees.controller.ts's resolveSchoolId, there's no staff case to support
  // here; this just rejects non-admins cleanly instead of letting a
  // school_staff's own userId silently mismatch the school.admin lookup
  // inside billingService and surface as a confusing "School not found".
  private requireAdmin(user: any) {
    if (user?.role !== 'admin') {
      throw new ForbiddenException('Billing is only accessible to school admins');
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('calculate')
  async calculateBill(@Req() req: any) {
    this.requireAdmin(req.user);
    return this.billingService.calculateMonthlyBill(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('status')
  async getStatus(@Req() req: any) {
    this.requireAdmin(req.user);
    return this.billingService.getSubscriptionStatus(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('history')
  async getHistory(@Req() req: any) {
    this.requireAdmin(req.user);
    return this.billingService.getBillingHistory(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('create-checkout')
  async createCheckout(@Req() req: any) {
    this.requireAdmin(req.user);
    return this.billingService.createCheckoutSession(req.user.userId);
  }

  // Self-serve reconciliation — called by the school admin's own billing
  // page on every visit so their status/Premium unlock reflects Stripe
  // immediately, independent of webhook delivery.
  @UseGuards(AuthGuard('jwt'))
  @Post('sync-my-status')
  async syncMyStatus(@Req() req: any) {
    this.requireAdmin(req.user);
    return this.billingService.syncMySubscriptionFromStripe(req.user.userId);
  }

  // Separate subscription from the per-van billing above — unlocks the
  // Premium feature tier (Analytics, AI Route Optimization, Safety
  // Checklist Compliance, Ratings Log, Complaints & Reports, Fee
  // Management) rather than paying for van capacity.
  @UseGuards(AuthGuard('jwt'))
  @Post('premium/create-checkout')
  async createPremiumCheckout(@Req() req: any) {
    this.requireAdmin(req.user);
    return this.billingService.createPremiumCheckoutSession(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('all-schools')
  async getAllSchoolsBilling(@Req() req: any) {
    if (!req.user || req.user.role !== 'superadmin') {
      throw new ForbiddenException('Only superadmins can access this API');
    }
    return this.billingService.getAllSchoolsBilling();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('plan-breakdown')
  async getPlanBreakdown(@Req() req: any) {
    if (!req.user || req.user.role !== 'superadmin') {
      throw new ForbiddenException('Only superadmins can access this API');
    }
    return this.billingService.getPlanBreakdown();
  }

  // On-demand reconciliation: re-reads a school's real subscription state
  // from Stripe and writes it back, for when a webhook delivery was missed
  // (see syncSubscriptionStatusFromStripe's comment for why that happens).
  @UseGuards(AuthGuard('jwt'))
  @Post('schools/:schoolId/sync-from-stripe')
  async syncFromStripe(@Req() req: any, @Param('schoolId') schoolId: string) {
    if (!req.user || req.user.role !== 'superadmin') {
      throw new ForbiddenException('Only superadmins can access this API');
    }
    return this.billingService.syncSubscriptionStatusFromStripe(schoolId);
  }

  // Emails a specific school's billing contact a payment link for their
  // current fleet, for schools getPlanBreakdown() surfaces as running vans
  // without a confirmed subscription (e.g. manually-provisioned accounts
  // that never went through self-serve checkout).
  @UseGuards(AuthGuard('jwt'))
  @Post('schools/:schoolId/send-reminder')
  async sendBillingReminder(@Req() req: any, @Param('schoolId') schoolId: string) {
    if (!req.user || req.user.role !== 'superadmin') {
      throw new ForbiddenException('Only superadmins can access this API');
    }
    return this.billingService.sendBillingReminder(schoolId, {
      userId: req.user.userId,
      email: req.user.email,
    });
  }

  // Override for a payment that never created a Stripe Subscription (a
  // manually-sent Stripe invoice/payment link, a bank transfer, etc) — see
  // manuallyMarkPaid's comment. Deliberately separate from sync-from-stripe,
  // which only ever reflects what Stripe's own subscription data says.
  @UseGuards(AuthGuard('jwt'))
  @Post('schools/:schoolId/mark-paid')
  async markPaid(
    @Req() req: any,
    @Param('schoolId') schoolId: string,
    @Body() body: { vanBilling?: boolean; premium?: boolean; note: string },
  ) {
    if (!req.user || req.user.role !== 'superadmin') {
      throw new ForbiddenException('Only superadmins can access this API');
    }
    return this.billingService.manuallyMarkPaid(schoolId, body, {
      userId: req.user.userId,
      email: req.user.email,
    });
  }

  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.billingService.handleWebhook(req.rawBody!, signature);
  }
}
