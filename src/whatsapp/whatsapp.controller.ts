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
  @Post('send-test')
  async sendTest(@Body() body: any) {
    const { to, message } = body;
    return this.whatsappService.sendTextMessage(to, message);
  }
}
