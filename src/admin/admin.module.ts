/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { ConfigModule, ConfigService } from '@nestjs/config';
import { OtpModule } from 'src/user/schema/otp/otp.module';
import { KidModule } from 'src/Kid/kid.module';
import { WhatsappModule } from 'src/whatsapp/whatsapp.module';
import { FirebaseAdminModule } from 'src/notification/firebase.module';




@Module({
  imports: [
     OtpModule,
    ConfigModule,
    KidModule,
    WhatsappModule,
    FirebaseAdminModule,

    
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

  controllers: [AdminController],
  providers: [AdminService ], 
  exports: [AdminService ], 
   
})

export class AdminModule {}