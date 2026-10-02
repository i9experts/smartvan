/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';

import { AlertController } from './alert.controller';
import { alertService } from './alert.service';
import { FirebaseAdminModule } from 'src/notification/firebase.module';
import { EventsModule } from 'src/events/events.module';

@Module({
  
  controllers: [AlertController],
  providers: [alertService],
  exports: [alertService], // agar kahin aur use karna ho to
    imports: [FirebaseAdminModule, EventsModule],
})
export class AlertModule {}