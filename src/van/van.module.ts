/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { VanService } from './van.service';
import { VanController } from './van.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { ConfigModule, ConfigService } from '@nestjs/config';
import { OtpModule } from 'src/user/schema/otp/otp.module';
import { FirebaseAdminModule } from 'src/notification/firebase.module';
import { WhatsappModule } from 'src/whatsapp/whatsapp.module';




@Module({
  imports: [
     OtpModule,
    ConfigModule,
      FirebaseAdminModule,
      WhatsappModule,
    
    
    PassportModule,

  
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),

      ],



 
  controllers: [VanController],
  providers: [VanService], 
  exports: [VanService], 
})
// eslint-disable-next-line prettier/prettier
export class VanModule {}