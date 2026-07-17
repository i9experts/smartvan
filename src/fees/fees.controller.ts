/* eslint-disable prettier/prettier */
import { Controller, Post, Get, Body, Req, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FeesService } from './fees.service';

@Controller('fees')
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  // Set transport fee for a school/route/van
  @UseGuards(AuthGuard('jwt'))
  @Post('set')
  async setFee(@Body() body: any, @Req() req: any) {
    return this.feesService.setFee(body);
  }

  // Get all fees for a school
  @UseGuards(AuthGuard('jwt'))
  @Get('school')
  async getSchoolFees(@Query('schoolId') schoolId: string, @Req() req: any) {
    return this.feesService.getSchoolFees(schoolId);
  }

  // Generate monthly payment records for all kids
  @UseGuards(AuthGuard('jwt'))
  @Post('generate-monthly')
  async generateMonthly(@Body() body: { schoolId: string; month?: string }, @Req() req: any) {
    return this.feesService.generateMonthlyPayments(body.schoolId, body.month);
  }

  // Record a payment (by driver or admin)
  @UseGuards(AuthGuard('jwt'))
  @Post('record-payment')
  async recordPayment(@Body() body: any, @Req() req: any) {
    return this.feesService.recordPayment(body, req.user.userId, req.user.role || 'admin');
  }

  // Get all payments for a school (admin view)
  @UseGuards(AuthGuard('jwt'))
  @Get('payments')
  async getPayments(
    @Query('schoolId') schoolId: string,
    @Query('month') month: string,
    @Query('status') status: string,
    @Req() req: any,
  ) {
    return this.feesService.getPayments(schoolId, month, status);
  }

  // Get unpaid students this month
  @UseGuards(AuthGuard('jwt'))
  @Get('unpaid')
  async getUnpaid(
    @Query('schoolId') schoolId: string,
    @Query('month') month: string,
    @Req() req: any,
  ) {
    return this.feesService.getUnpaidStudents(schoolId, month);
  }

  // Parent views their payment history
  @UseGuards(AuthGuard('jwt'))
  @Get('parent-payments')
  async getParentPayments(@Req() req: any) {
    return this.feesService.getParentPayments(req.user.userId);
  }

  // Send payment reminders to all unpaid parents
  @UseGuards(AuthGuard('jwt'))
  @Post('send-reminders')
  async sendReminders(@Body() body: { schoolId: string; month?: string }, @Req() req: any) {
    return this.feesService.sendPaymentReminders(body.schoolId, body.month);
  }

  // Get fee summary stats for dashboard
  @UseGuards(AuthGuard('jwt'))
  @Get('summary')
  async getFeeSummary(@Query('schoolId') schoolId: string, @Query('month') month: string, @Req() req: any) {
    return this.feesService.getFeeSummary(schoolId || req.user.schoolId, month);
  }

  // Update payment status (overdue etc)
  @UseGuards(AuthGuard('jwt'))
  @Post('update-status')
  async updateStatus(@Body() body: { paymentId: string; status: string }, @Req() req: any) {
    return this.feesService.updatePaymentStatus(body.paymentId, body.status);
  }

  // Delete a fee config
  @UseGuards(AuthGuard('jwt'))
  @Post('delete-fee')
  async deleteFee(@Body() body: { feeId: string }, @Req() req: any) {
    return this.feesService.deleteFee(body.feeId);
  }

  // Get payments by student
  @UseGuards(AuthGuard('jwt'))
  @Get('student-payments')
  async getStudentPayments(@Query('kidId') kidId: string, @Req() req: any) {
    return this.feesService.getStudentPayments(kidId);
  }
}
