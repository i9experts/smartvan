/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatConversationDocument = ChatConversation & Document;
export type ChatMessageDocument = ChatMessage & Document;

/** One thread per parent ↔ driver pair. */
@Schema({ timestamps: true, collection: 'chatconversations' })
export class ChatConversation {
  @Prop({ required: true, index: true })
  parentId: string;

  @Prop({ required: true, index: true })
  driverId: string;

  @Prop({ required: false })
  vanId?: string;

  @Prop({ required: false })
  schoolId?: string;

  /** Kids that link this parent to this driver's van. */
  @Prop({ type: [String], default: [] })
  kidIds: string[];

  @Prop({ type: Object, required: false })
  lastMessage?: { text: string; senderType: 'parent' | 'driver'; at: Date };

  @Prop({ type: Number, default: 0 })
  unreadParent: number;

  @Prop({ type: Number, default: 0 })
  unreadDriver: number;
}

export const ChatConversationSchema = SchemaFactory.createForClass(ChatConversation);
ChatConversationSchema.index({ parentId: 1, driverId: 1 }, { unique: true });

@Schema({ timestamps: true, collection: 'chatmessages' })
export class ChatMessage {
  @Prop({ required: true, index: true })
  conversationId: string;

  @Prop({ required: true, enum: ['parent', 'driver'] })
  senderType: string;

  @Prop({ required: true })
  senderId: string;

  @Prop({ required: true, maxlength: 1000 })
  text: string;

  /** Set when sent from a quick-reply template (e.g. 'running_late'). */
  @Prop({ required: false })
  templateKey?: string;

  @Prop({ required: false })
  readAt?: Date;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);
ChatMessageSchema.index({ conversationId: 1, createdAt: -1 });
