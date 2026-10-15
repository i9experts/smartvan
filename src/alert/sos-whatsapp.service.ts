/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import * as moment from 'moment-timezone';
import { Types } from 'mongoose';
import { DatabaseService } from '../database/databaseservice';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import {
  collectRecipients, isThrottled, maskPhone, sosTemplateParams, sosWhatsappEnabled, SOS_WHATSAPP_WINDOW_MS,
} from './sos-whatsapp.util';

export interface SosWhatsappInput {
  alertId: string;
  trip: any | null;
  van: any | null;
  driverName: string;
  lat: number;
  lng: number;
  at: Date;
}

/**
 * Driver SOS → WhatsApp template to the parents of the kids on the active
 * trip (fallback: kids on the van's routes today). Fire-and-forget from the
 * SOS endpoint; results are saved on the alert document.
 */
@Injectable()
export class SosWhatsappService {
  private readonly logger = new Logger(SosWhatsappService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /** Never throws. */
  async notifyParents(input: SosWhatsappInput): Promise<void> {
    try {
      await this.run(input);
    } catch (e: any) {
      this.logger.error(`SOS WhatsApp failed for alert ${input.alertId}: ${e?.message || e}`);
    }
  }

  private async run(input: SosWhatsappInput) {
    if (!sosWhatsappEnabled()) return;
    const template = (process.env.WHATSAPP_SOS_TEMPLATE || '').trim();
    if (!template) {
      this.logger.warn('SOS_WHATSAPP_ENABLED is on but WHATSAPP_SOS_TEMPLATE is not set; skipping');
      return;
    }
    const lang = (process.env.WHATSAPP_SOS_TEMPLATE_LANG || 'en').trim();
    const repos = this.databaseService.repositories;
    const { trip, van, alertId, at } = input;

    // ── Anti-spam: one batch per trip (or van) per 5 minutes ──
    const key = trip?._id ? trip._id.toString() : `van:${van?._id?.toString() || 'unknown'}`;
    const previous: any = await repos.notificationModel.findOne(
      { whatsappBatchKey: key, whatsappBatchAt: { $gte: new Date(at.getTime() - SOS_WHATSAPP_WINDOW_MS) }, _id: { $ne: new Types.ObjectId(alertId) } },
      { whatsappBatchAt: 1 },
    ).sort({ whatsappBatchAt: -1 }).lean();
    if (isThrottled(previous?.whatsappBatchAt, at)) {
      await repos.notificationModel.updateOne({ _id: alertId }, { $set: { whatsappSkipped: 'throttled', tripId: trip?._id?.toString() } });
      this.logger.log(`SOS WhatsApp throttled for ${key}`);
      return;
    }
    // Claim the window before sending so a second SOS can't slip in.
    await repos.notificationModel.updateOne(
      { _id: alertId },
      { $set: { whatsappBatchKey: key, whatsappBatchAt: at, tripId: trip?._id?.toString() } },
    );

    const parents = await this.parentsToNotify(trip, van, at);
    const { recipients, invalid } = collectRecipients(parents);
    const results: any[] = invalid.map((parentId) => ({ parentId, phone: '', status: 'failed', error: 'invalid_phone', sentAt: new Date() }));

    if (!recipients.length && !invalid.length) {
      await repos.notificationModel.updateOne({ _id: alertId }, { $set: { whatsappSkipped: 'no_recipients' } });
      return;
    }

    const params = sosTemplateParams({ vanNumber: van?.carNumber || '', driverName: input.driverName, at, lat: input.lat, lng: input.lng });
    for (const r of recipients) {
      const res = await this.whatsapp.sendTemplate(r.phone, template, lang, params);
      results.push({
        parentId: r.parentId,
        phone: r.phone,
        status: res.success ? 'sent' : 'failed',
        ...(res.messageId ? { messageId: res.messageId } : {}),
        ...(res.error ? { error: res.error } : {}),
        sentAt: new Date(),
      });
      if (!res.success) this.logger.warn(`SOS WhatsApp to ${maskPhone(r.phone)} failed: ${res.error}`);
    }
    await repos.notificationModel.updateOne({ _id: alertId }, { $set: { whatsappNotifications: results } });
    this.logger.log(`SOS WhatsApp alert ${alertId}: ${results.filter((x) => x.status === 'sent').length}/${results.length} sent`);
  }

  /** Parents of kids on the active trip; else of kids on the van's routes running today. */
  private async parentsToNotify(trip: any | null, van: any | null, at: Date): Promise<any[]> {
    const repos = this.databaseService.repositories;
    const kidIds = new Set<string>();

    if (trip) {
      for (const k of trip.kids || []) if (k?.kidId) kidIds.add(k.kidId.toString());
      const route: any = Types.ObjectId.isValid(trip.routeId) ? await repos.routeModel.findById(trip.routeId, { kidLocations: 1 }).lean() : null;
      for (const kl of route?.kidLocations || []) if (kl?.kidId) kidIds.add(kl.kidId.toString());
    } else if (van?._id) {
      const day = moment(at).tz(process.env.DEFAULT_TIMEZONE || 'Asia/Karachi').format('dddd').toLowerCase();
      const routes: any[] = await repos.routeModel.find({ vanId: van._id.toString() }, { kidLocations: 1, tripDays: 1 }).lean();
      for (const r of routes) {
        if (r.tripDays && r.tripDays[day] === false) continue;
        for (const kl of r.kidLocations || []) if (kl?.kidId) kidIds.add(kl.kidId.toString());
      }
    }
    if (!kidIds.size) return [];

    const kids: any[] = await repos.KidModel.find(
      { _id: { $in: [...kidIds].filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)) } },
      { parentId: 1 },
    ).lean();
    const parentIds = [...new Set(kids.filter((k) => k.parentId).map((k) => k.parentId.toString()))];
    if (!parentIds.length) return [];
    return repos.parentModel.find({ _id: { $in: parentIds }, isDelete: false }, { phoneNo: 1 }).lean();
  }
}
