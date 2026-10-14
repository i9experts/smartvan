/* eslint-disable prettier/prettier */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DatabaseService } from 'src/database/databaseservice';
import { AlertSeen, AlertSeenDocument } from './alert-seen.schema';

/** First visit: count alerts from the last 7 days instead of all time. */
const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Unread count for the admin portal's Alerts badge: school alerts
 * (recipientType ADMIN — SOS, traffic, tracking lost, van checks, …)
 * newer than when this user last opened the Alerts page.
 */
@Injectable()
export class AdminAlertsUnreadService {
  constructor(
    @InjectModel(AlertSeen.name) private seenModel: Model<AlertSeenDocument>,
    private readonly databaseService: DatabaseService,
  ) {}

  private async schoolIdFor(adminId: string): Promise<string> {
    const school: any = await this.databaseService.repositories.SchoolModel.findOne(
      { admin: new Types.ObjectId(adminId) },
      { _id: 1 },
    ).lean();
    if (!school) throw new UnauthorizedException('Invalid admin or school not found');
    return school._id.toString();
  }

  async unreadCount(userId: string, adminId: string) {
    const schoolId = await this.schoolIdFor(adminId);
    const seen: any = await this.seenModel.findOne({ userId }).lean();
    const since = seen?.seenAt ? new Date(seen.seenAt) : new Date(Date.now() - DEFAULT_LOOKBACK_MS);
    const unread = await this.databaseService.repositories.notificationModel.countDocuments({
      recipientType: 'ADMIN',
      schoolId,
      date: { $gt: since },
    });
    return { success: true, data: { unread, since } };
  }

  async markSeen(userId: string, adminId: string) {
    const schoolId = await this.schoolIdFor(adminId);
    const now = new Date();
    await this.seenModel.updateOne({ userId }, { $set: { schoolId, seenAt: now } }, { upsert: true });
    return { success: true, data: { unread: 0, seenAt: now } };
  }
}
