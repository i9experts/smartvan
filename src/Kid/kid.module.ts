/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { KidService } from './kid.service';
import { KidController } from './kid.controller';
import { KidQrService } from './kid-qr.service';
import { FirebaseAdminModule } from 'src/notification/firebase.module';
import { AdminController } from 'src/admin/admin.controller';
import { WhatsappModule } from 'src/whatsapp/whatsapp.module';




@Module({
 
  controllers: [KidController],
  providers: [KidService, KidQrService], 
  exports: [KidService, KidQrService], 
  imports: [FirebaseAdminModule, WhatsappModule],
})
// eslint-disable-next-line prettier/prettier
export class KidModule {}