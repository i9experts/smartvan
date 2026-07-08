/* eslint-disable prettier/prettier */
import { Controller, Get, Post, Body, Req, UseGuards, Headers, RawBodyRequest } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BillingService } from './billing.service';
import { Request } from 'express';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('calculate')
  async calculateBill(@Req() req: any) {
    return this.billingService.calculateMonthlyBill(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('status')
  async getStatus(@Req() req: any) {
    return this.billingService.getSubscriptionStatus(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('history')
  async getHistory(@Req() req: any) {
    return this.billingService.getBillingHistory(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('create-checkout')
  async createCheckout(@Req() req: any) {
    return this.billingService.createCheckoutSession(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('all-schools')
  async getAllSchoolsBilling() {
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
