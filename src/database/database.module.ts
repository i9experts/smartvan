/* eslint-disable prettier/prettier */
import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as schema from './schema';
import { DatabaseService } from './databaseservice'

@Global()
@Module({
  imports: [
    ConfigModule.forRoot(),
    // Connection string comes from the environment — never commit it.
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('MONGODB_URI');
        if (!uri) {
          throw new Error(
            'MONGODB_URI is not set. Add it to .env (local/VPS) or the Railway service variables.',
          );
        }
        return { uri };
      },
    }),

    MongooseModule.forFeature([
       { name: 'Parent', schema: schema.UserSchema, collection: 'parents' },
       { name: 'Driver', schema: schema.UserSchema, collection: 'drivers' },
       { name: schema.Admin.name, schema: schema.AdminSchema },
        { name: schema.School.name, schema: schema.SchoolSchema },
       { name: schema.Van.name, schema: schema.VanSchema },
       { name: schema.Kid.name, schema: schema.KidSchema },
        { name: schema.Trip.name, schema: schema.TripSchema },
         { name: schema.Notification.name, schema: schema.NotificationSchema },
          { name: schema.Report.name, schema: schema.ReportSchema },
           { name: schema.FAQ.name, schema: schema.FAQSchema },
           { name: schema.Route.name, schema: schema.RouteSchema },
           { name: schema.Invoice.name, schema: schema.InvoiceSchema },
           { name: schema.PromotionBanner.name, schema: schema.PromotionBannerSchema },
            { name: schema.Support.name, schema: schema.SupportSchema },
       { name: schema.Employee.name, schema: schema.EmployeeSchema },
       { name: schema.SchoolStaff.name, schema: schema.SchoolStaffSchema },
       { name: schema.VanSchoolLink.name, schema: schema.VanSchoolLinkSchema },
       { name: schema.AuditLog.name, schema: schema.AuditLogSchema },
       { name: schema.PretripChecklist.name, schema: schema.PretripChecklistSchema },
           
    ]),
  ],
  exports: [MongooseModule, DatabaseService],
  providers: [DatabaseService],
})
export class DatabaseModule {}