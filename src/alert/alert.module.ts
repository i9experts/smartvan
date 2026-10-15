/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';

import { AlertController } from './alert.controller';
import { alertService } from './alert.service';
import { FirebaseAdminModule } from 'src/notification/firebase.module';
import { EventsModule } from 'src/events/events.module';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertSeen, AlertSeenSchema } from './alert-seen.schema';
import { AdminAlertsUnreadService } from './admin-alerts-unread.service';
import { SosWhatsappService } from './sos-whatsapp.service';
import { WhatsappModule } from 'src/whatsapp/whatsapp.module';

@Module({
  
  controllers: [AlertController],
  providers: [alertService, AdminAlertsUnreadService, SosWhatsappService],
  exports: [alertService], // agar kahin aur use karna ho to
    imports: [WhatsappModule, FirebaseAdminModule, EventsModule, MongooseModule.forFeature([{ name: AlertSeen.name, schema: AlertSeenSchema }])],
})
export class AlertModule {}