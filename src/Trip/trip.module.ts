/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { TripService } from './trip.service';
import { TripController } from './trip.controller';
import { EtaService } from './eta.service';
import { GeofenceService } from './geofence.service';
import { FirebaseAdminModule } from 'src/notification/firebase.module';

@Module({
  imports: [FirebaseAdminModule],
  controllers: [TripController],
  providers: [TripService, EtaService, GeofenceService],
  exports: [TripService, EtaService, GeofenceService],
})
export class TripModule {}
