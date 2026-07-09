/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { DatabaseModule } from './database/database.module';
import { UsersModule } from './user/user.module';
import { AdminModule } from './admin/admin.module'
import { EventsModule } from './events/events.module'

import { AuthModule } from './auth/auth.module';
import { VanModule } from './van/van.module';
import { KidModule } from './Kid/kid.module';
import {UploadModule} from "./upload/upload.module"
import {SchoolModule} from "./school/school.module"
import { FeesModule } from "./fees/fees.module"
import { FirebaseAdminModule } from './notification/firebase.module';
import { ReportModule } from './report/report.module';
import { TripModule } from './Trip/trip.module';
import { RouteModule } from './route/route.module';
import { AlertModule } from './alert/alert.module';
import { InvoiceModule } from './invoice/invoice.module';
import { PromotionBannerModule } from './promotion-banner/promotion-banner.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { BillingModule } from './billing/billing.module';
import { ContactController } from './admin/contact.controller';




@Module({
  imports: [
    // ✅ Load .env globally
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    AdminModule,
    VanModule,
    KidModule,
    UploadModule,
    SchoolModule,
    FeesModule,
    FirebaseAdminModule,
    EventsModule,
    ReportModule,
    TripModule,
    RouteModule,
    AlertModule,
    InvoiceModule,
    PromotionBannerModule,
    WhatsappModule,
    BillingModule,
  ],
  controllers: [AppController, ContactController],
  providers: [AppService],
})
export class AppModule {}
