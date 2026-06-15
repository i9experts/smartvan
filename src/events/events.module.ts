import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { DatabaseModule } from 'src/database/database.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
  ],
  providers: [EventsGateway],
})
export class EventsModule {}
