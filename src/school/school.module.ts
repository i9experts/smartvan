/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OtpModule } from 'src/user/schema/otp/otp.module';
import { MongooseModule } from '@nestjs/mongoose';
import { SchoolLead, SchoolLeadSchema } from './school-lead.schema';
import { WhatsappModule } from 'src/whatsapp/whatsapp.module';
import { AuditLogModule } from 'src/audit-log/audit-log.module';

@Module({
  imports: [
    OtpModule,
    WhatsappModule,
    AuditLogModule,
    ConfigModule,
    PassportModule,
    MongooseModule.forFeature([
      { name: SchoolLead.name, schema: SchoolLeadSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [SchoolController],
  providers: [SchoolService],
  exports: [SchoolService],
})
export class SchoolModule {}
