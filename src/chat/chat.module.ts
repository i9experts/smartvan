/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsModule } from 'src/events/events.module';
import { FirebaseAdminModule } from 'src/notification/firebase.module';
import { ChatController } from './chat.controller';
import { ChatConversation, ChatConversationSchema, ChatMessage, ChatMessageSchema } from './chat.schema';
import { ChatService } from './chat.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatConversation.name, schema: ChatConversationSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
    ]),
    EventsModule,
    FirebaseAdminModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
