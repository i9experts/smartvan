/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { InstitutionHealthController } from './institution-health.controller';
import { InstitutionHealthService } from './institution-health.service';

@Module({
  controllers: [InstitutionHealthController],
  providers: [InstitutionHealthService],
})
export class InstitutionHealthModule {}
