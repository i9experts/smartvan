/* eslint-disable prettier/prettier */
import { Controller, Get, Post, Body, Req, UseGuards, Headers, RawBodyRequest, UnauthorizedException, ForbiddenException } from '@nestjs/common';
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

  @UseGuards(AuthGuard('jwt'))
  @Get('all-schools')
  async getAllSchoolsBilling(@Req() req: any) {
    if (!req.user || req.user.role !== 'superadmin') {
      throw new ForbiddenException('Only superadmins can access this API');
    }
    return this.billingService.getAllSchoolsBilling();
  }

  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.billingService.handleWebhook(req.rawBody!, signature);
  }
}
