/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ParentIntelligenceController } from './parent-intelligence.controller';
import { ParentIntelligenceService } from './parent-intelligence.service';

@Module({
  controllers: [ParentIntelligenceController],
  providers: [ParentIntelligenceService],
})
export class ParentIntelligenceModule {}
