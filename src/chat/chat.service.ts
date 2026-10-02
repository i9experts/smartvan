/* eslint-disable prettier/prettier */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DatabaseService } from 'src/database/databaseservice';
import { EventsGateway } from 'src/events/events.gateway';
import { FirebaseAdminService } from 'src/notification/firebase-admin.service';
import {
  ChatConversation,
  ChatConversationDocument,
  ChatMessage,
  ChatMessageDocument,
} from './chat.schema';
import { ChatRole, chatRoleOf, clampLimit, cleanMessageText, userRoom } from './chat.util';

/**
 * Parent ↔ driver chat. A parent can talk to the driver of any van their
 * kid rides; a driver can talk to the parent of any active kid on their van.
 * Delivery: socket 'chatMessage' to both users' rooms + FCM to the recipient.
 */
@Injectable()
export class ChatService {
  constructor(
    @InjectModel(ChatConversation.name) private conversationModel: Model<ChatConversationDocument>,
    @InjectModel(ChatMessage.name) private messageModel: Model<ChatMessageDocument>,
    private readonly databaseService: DatabaseService,
    private readonly eventsGateway: EventsGateway,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  private role(user: any): ChatRole {
    const r = chatRoleOf(user);
    if (!r) throw new ForbiddenException('Chat is for parents and drivers');
    return r;
  }

  /** Opens (or creates) the conversation about [kidId]. */
  async start(user: any, kidId: string) {
    const role = this.role(user);
    if (!Types.ObjectId.isValid(kidId)) throw new NotFoundException('Student not found');
    const repos = this.databaseService.repositories;
    const kid: any = await repos.KidModel.findById(kidId, { parentId: 1, VanId: 1, schoolId: 1, fullname: 1 }).lean();
    if (!kid || !kid.parentId) throw new NotFoundException('Student not found');
    if (!kid.VanId || !Types.ObjectId.isValid(kid.VanId)) {
      throw new BadRequestException({ success: false, code: 'NO_VAN', message: 'This student has no van assigned.' });
    }
    const van: any = await repos.VanModel.findById(kid.VanId, { driverId: 1, schoolId: 1 }).lean();
    if (!van?.driverId) {
      throw new BadRequestException({ success: false, code: 'NO_DRIVER', message: 'This van has no driver assigned.' });
    }
    const parentId = kid.parentId.toString();
    const driverId = van.driverId.toString();

    if (role === 'parent' && parentId !== user.userId) throw new ForbiddenException('Not your child');
    if (role === 'driver' && driverId !== user.userId) throw new ForbiddenException('Student is not on your van');

    const conv = await this.conversationModel.findOneAndUpdate(
      { parentId, driverId },
      {
        $setOnInsert: { parentId, driverId },
        $set: { vanId: van._id.toString(), schoolId: van.schoolId || kid.schoolId },
        $addToSet: { kidIds: kidId },
      },
      { upsert: true, new: true },
    ).lean();
    return { success: true, data: await this.view(conv, role) };
  }

  async list(user: any) {
    const role = this.role(user);
    const filter = role === 'parent' ? { parentId: user.userId } : { driverId: user.userId };
    const convs = await this.conversationModel.find(filter).sort({ updatedAt: -1 }).limit(100).lean();
    const data = await Promise.all(convs.map((c) => this.view(c, role)));
    return { success: true, data };
  }

  private async view(c: any, role: ChatRole) {
    const repos = this.databaseService.repositories;
    const otherId = role === 'parent' ? c.driverId : c.parentId;
    const otherModel: any = role === 'parent' ? repos.driverModel : repos.parentModel;
    const other: any = Types.ObjectId.isValid(otherId)
      ? await otherModel.findById(otherId, { fullname: 1, image: 1 }).lean()
      : null;
    const kids: any[] = await repos.KidModel.find(
      { _id: { $in: (c.kidIds || []).filter((id: string) => Types.ObjectId.isValid(id)) } },
      { fullname: 1 },
    ).lean();
    return {
      conversationId: c._id.toString(),
      otherUser: {
        id: otherId,
        type: role === 'parent' ? 'driver' : 'parent',
        name: other?.fullname || (role === 'parent' ? 'Driver' : 'Parent'),
        image: other?.image || null,
      },
      kids: kids.map((k) => ({ kidId: k._id.toString(), fullname: k.fullname })),
      lastMessage: c.lastMessage || null,
      unread: role === 'parent' ? c.unreadParent || 0 : c.unreadDriver || 0,
      updatedAt: c.updatedAt,
    };
  }

  private async loadConversation(user: any, conversationId: string) {
    const role = this.role(user);
    if (!Types.ObjectId.isValid(conversationId)) throw new NotFoundException('Conversation not found');
    const c: any = await this.conversationModel.findById(conversationId);
    if (!c) throw new NotFoundException('Conversation not found');
    const mine = role === 'parent' ? c.parentId : c.driverId;
    if (mine !== user.userId) throw new NotFoundException('Conversation not found');
    return { c, role };
  }

  /** Newest first. Page backwards with ?before=<ISO date of oldest loaded>. */
  async messages(user: any, conversationId: string, before?: string, limit?: unknown) {
    await this.loadConversation(user, conversationId);
    const filter: any = { conversationId };
    const b = before ? new Date(before) : null;
    if (b && !isNaN(b.getTime())) filter.createdAt = { $lt: b };
    const n = clampLimit(limit);
    const rows: any[] = await this.messageModel.find(filter).sort({ createdAt: -1 }).limit(n + 1).lean();
    return {
      success: true,
      data: rows.slice(0, n).map((m) => this.messageView(m)),
      hasMore: rows.length > n,
    };
  }

  private messageView(m: any) {
    return {
      messageId: m._id.toString(),
      conversationId: m.conversationId,
      senderType: m.senderType,
      senderId: m.senderId,
      text: m.text,
      templateKey: m.templateKey || null,
      readAt: m.readAt || null,
      createdAt: m.createdAt,
    };
  }

  async send(user: any, conversationId: string, body: { text?: string; templateKey?: string }) {
    const { c, role } = await this.loadConversation(user, conversationId);
    const text = cleanMessageText(body?.text);
    if (!text) throw new BadRequestException({ success: false, code: 'EMPTY_MESSAGE', message: 'Message is empty' });

    const msg: any = await this.messageModel.create({
      conversationId,
      senderType: role,
      senderId: user.userId,
      text,
      templateKey: typeof body?.templateKey === 'string' ? body.templateKey.slice(0, 50) : undefined,
    });

    const unreadField = role === 'parent' ? 'unreadDriver' : 'unreadParent';
    await this.conversationModel.updateOne(
      { _id: c._id },
      {
        $set: { lastMessage: { text: text.slice(0, 200), senderType: role, at: msg.createdAt } },
        $inc: { [unreadField]: 1 },
      },
    );

    const view = this.messageView(msg);
    const recipientId = role === 'parent' ? c.driverId : c.parentId;
    this.eventsGateway.emitToRoom(userRoom(recipientId), 'chatMessage', view);
    this.eventsGateway.emitToRoom(userRoom(user.userId), 'chatMessage', view);

    // Push to the recipient (best effort).
    try {
      const repos = this.databaseService.repositories;
      const recipientModel: any = role === 'parent' ? repos.driverModel : repos.parentModel;
      const senderModel: any = role === 'parent' ? repos.parentModel : repos.driverModel;
      const [recipient, sender]: any[] = await Promise.all([
        recipientModel.findById(recipientId, { fcmToken: 1 }).lean(),
        senderModel.findById(user.userId, { fullname: 1 }).lean(),
      ]);
      if (recipient?.fcmToken) {
        await this.firebaseAdminService.sendToDevice(recipient.fcmToken, {
          notification: {
            title: sender?.fullname || (role === 'parent' ? 'Parent' : 'Driver'),
            body: text.length > 120 ? text.slice(0, 117) + '…' : text,
          },
          data: { type: 'CHAT_MESSAGE', conversationId },
        });
      }
    } catch (e) {
      console.error('[chat] push failed:', e);
    }

    return { success: true, data: view };
  }

  /** Marks the other side's messages as read and clears my unread count. */
  async markRead(user: any, conversationId: string) {
    const { c, role } = await this.loadConversation(user, conversationId);
    const otherType = role === 'parent' ? 'driver' : 'parent';
    const now = new Date();
    await this.messageModel.updateMany(
      { conversationId, senderType: otherType, readAt: { $exists: false } },
      { $set: { readAt: now } },
    );
    await this.conversationModel.updateOne(
      { _id: c._id },
      { $set: { [role === 'parent' ? 'unreadParent' : 'unreadDriver']: 0 } },
    );
    const otherId = role === 'parent' ? c.driverId : c.parentId;
    this.eventsGateway.emitToRoom(userRoom(otherId), 'chatRead', {
      conversationId, readBy: role, at: now.toISOString(),
    });
    return { success: true };
  }

  async unreadTotal(user: any) {
    const role = this.role(user);
    const field = role === 'parent' ? 'unreadParent' : 'unreadDriver';
    const filter = role === 'parent' ? { parentId: user.userId } : { driverId: user.userId };
    const rows = await this.conversationModel.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: `$${field}` } } },
    ]);
    return { success: true, data: { unread: rows[0]?.total || 0 } };
  }
}
