/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ParentIntelligenceController } from './parent-intelligence.controller';
import { ParentIntelligenceService } from './parent-intelligence.service';
import { SchoolModule } from 'src/school/school.module';

@Module({
  imports: [SchoolModule],
  controllers: [ParentIntelligenceController],
  providers: [ParentIntelligenceService],
})
export class ParentIntelligenceModule {}
