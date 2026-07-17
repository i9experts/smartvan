import { Controller, Get, Post, Query, Body, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (mode === 'subscribe' && token === 'smartvan_whatsapp_2026') {
      console.log('WhatsApp webhook verified!');
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  @Post('webhook')
  receiveMessage(@Body() body: any) {
    console.log('WhatsApp webhook received:', JSON.stringify(body));
    return { status: 'ok' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('send-fee-reminder')
  async sendFeeReminder(@Body() body: any) {
    const { to, parentName, studentName, amount, currency, month } = body;
    return this.whatsappService.sendFeeReminder(to, parentName, studentName, amount, currency, month);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('send-credentials')
  async sendCredentials(@Body() body: any) {
    const { to, parentName, email, password, schoolName } = body;
    return this.whatsappService.sendLoginCredentials(to, parentName, email, password, schoolName);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('send-trip-alert')
  async sendTripAlert(@Body() body: any) {
    const { to, parentName, studentName, status, time } = body;
    return this.whatsappService.sendTripAlert(to, parentName, studentName, status, time);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('send-school-welcome')
  async sendSchoolWelcome(@Body() body: any) {
    const { to, contactPerson, schoolName } = body;
    return this.whatsappService.sendSchoolWelcome(to, contactPerson, schoolName);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('send-parent-welcome')
  async sendParentWelcome(@Body() body: any) {
    const { to, parentName, studentName, schoolName } = body;
    return this.whatsappService.sendParentWelcome(to, parentName, studentName, schoolName);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('send-driver-welcome')
  async sendDriverWelcome(@Body() body: any) {
    const { to, driverName, schoolName, vanNumber } = body;
    return this.whatsappService.sendDriverWelcome(to, driverName, schoolName, vanNumber);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('send-fee-reminder-template')
  async sendFeeReminderTemplate(@Body() body: any) {
    const { to, parentName, studentName, month, amount } = body;
    return this.whatsappService.sendFeeReminderTemplate(to, parentName, studentName, month, amount);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('send-sos')
  async sendSosAlert(@Body() body: any) {
    const { to, parentName, studentName, vanNumber, schoolPhone } = body;
    return this.whatsappService.sendSosAlert(to, parentName, studentName, vanNumber, schoolPhone);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('send-test')
  async sendTest(@Body() body: any) {
    const { to, message, parentName } = body;
    return this.whatsappService.sendTemplateMessage(to, parentName || 'Parent', message);
  }
}
