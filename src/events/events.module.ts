import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { DatabaseModule } from 'src/database/database.module';
import { ConfigModule } from '@nestjs/config';
import { FirebaseAdminModule } from 'src/notification/firebase.module';
import { WhatsappModule } from 'src/whatsapp/whatsapp.module';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    FirebaseAdminModule,
    WhatsappModule,
  ],
  providers: [EventsGateway],
})
export class EventsModule {}
