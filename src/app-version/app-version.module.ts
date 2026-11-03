/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AppVersionService } from './app-version.service';
import { AdminAppVersionController, AppVersionController } from './app-version.controller';

@Module({
  controllers: [AppVersionController, AdminAppVersionController],
  providers: [AppVersionService],
})
export class AppVersionModule {}
