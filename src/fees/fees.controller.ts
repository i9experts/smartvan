/* eslint-disable prettier/prettier */
import { Controller, Post, Get, Body, Req, Query, UseGuards, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Types } from 'mongoose';
import { FeesService } from './fees.service';
import { DatabaseService } from 'src/database/databaseservice';

@Controller('fees')
export class FeesController {
  constructor(
    private readonly feesService: FeesService,
    private readonly databaseService: DatabaseService,
  ) {}

  /**
   * SECURITY: resolves the school a fees request is actually scoped to,
   * server-side, from the caller's own identity — never trusting a
   * client-supplied schoolId for a regular school admin.
   *
   * Previously every fees endpoint took whatever schoolId (if any) the
   * client sent, or fell back to req.user.schoolId — a field that has
   * never existed on any JWT payload in this app. That meant a normal
   * admin call with no schoolId resulted in queries like
   * `find({ schoolId: undefined, ... })`, which Mongoose strips to
   * `find({ ... })` — returning every school's payment data mixed
   * together. This was a live cross-tenant financial data leak.
   *
   * Superadmins may still pass an explicit schoolId to view a specific
   * school's fees (a legitimate cross-school use case) — regular admins
   * always get their own school's ID resolved here, full stop.
   */
  private async resolveSchoolId(req: any, providedSchoolId?: string): Promise<string> {
    if (req.user?.role === 'superadmin') {
      if (!providedSchoolId) {
        throw new BadRequestException('schoolId is required for superadmin requests');
      }
      return providedSchoolId;
    }

    const adminId = req.user?.userId;
    if (!adminId) {
      throw new UnauthorizedException('Invalid session');
    }
    const school = await this.databaseService.repositories.SchoolModel.findOne({
      admin: new Types.ObjectId(adminId),
    });
    if (!school) {
      throw new UnauthorizedException('Invalid admin or school not found');
    }
    return school._id.toString();
  }

  // Set transport fee for a school/route/van
  @UseGuards(AuthGuard('jwt'))
  @Post('set')
  async setFee(@Body() body: any, @Req() req: any) {
    const schoolId = await this.resolveSchoolId(req, body.schoolId);
    return this.feesService.setFee({ ...body, schoolId });
  }

  // Get all fees for a school
  @UseGuards(AuthGuard('jwt'))
  @Get('school')
  async getSchoolFees(@Query('schoolId') schoolId: string, @Req() req: any) {
    const resolvedSchoolId = await this.resolveSchoolId(req, schoolId);
    return this.feesService.getSchoolFees(resolvedSchoolId);
  }

  // Generate monthly payment records for all kids
  @UseGuards(AuthGuard('jwt'))
  @Post('generate-monthly')
  async generateMonthly(@Body() body: { schoolId: string; month?: string }, @Req() req: any) {
    const schoolId = await this.resolveSchoolId(req, body.schoolId);
    return this.feesService.generateMonthlyPayments(schoolId, body.month);
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
    const resolvedSchoolId = await this.resolveSchoolId(req, schoolId);
    return this.feesService.getPayments(resolvedSchoolId, month, status);
  }

  // Get unpaid students this month
  @UseGuards(AuthGuard('jwt'))
  @Get('unpaid')
  async getUnpaid(
    @Query('schoolId') schoolId: string,
    @Query('month') month: string,
    @Req() req: any,
  ) {
    const resolvedSchoolId = await this.resolveSchoolId(req, schoolId);
    return this.feesService.getUnpaidStudents(resolvedSchoolId, month);
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
    const schoolId = await this.resolveSchoolId(req, body.schoolId);
    return this.feesService.sendPaymentReminders(schoolId, body.month);
  }

  // Get fee summary stats for dashboard
  @UseGuards(AuthGuard('jwt'))
  @Get('summary')
  async getFeeSummary(@Query('schoolId') schoolId: string, @Query('month') month: string, @Req() req: any) {
    const resolvedSchoolId = await this.resolveSchoolId(req, schoolId);
    return this.feesService.getFeeSummary(resolvedSchoolId, month);
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
