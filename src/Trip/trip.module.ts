/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { TripService } from './trip.service';
import { TripController } from './trip.controller';
import { EtaService } from './eta.service';
import { GeofenceService } from './geofence.service';
import { FirebaseAdminModule } from 'src/notification/firebase.module';
import { TripLiveService } from './trip-live.service';
import { EventsModule } from 'src/events/events.module';
import { TripHistoryService } from './trip-history.service';
import { DriverTripHistoryController, ParentTripHistoryController, AdminTripHistoryController } from './trip-history.controller';

@Module({
  imports: [FirebaseAdminModule, EventsModule],
  controllers: [TripController, DriverTripHistoryController, ParentTripHistoryController, AdminTripHistoryController],
  providers: [TripService, EtaService, GeofenceService, TripLiveService, TripHistoryService],
  exports: [TripService, EtaService, GeofenceService],
})
export class TripModule {}
