/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { SchoolStaffController } from './school-staff.controller';
import { SchoolStaffService } from './school-staff.service';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [SchoolStaffController],
  providers: [SchoolStaffService],
  exports: [SchoolStaffService],
})
export class SchoolStaffModule {}
