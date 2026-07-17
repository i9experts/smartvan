/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeesController } from './fees.controller';
import { FeesService } from './fees.service';
import { TransportFee, TransportFeeSchema } from './transport-fee.schema';
import { TransportPayment, TransportPaymentSchema } from './transport-payment.schema';
import { FirebaseAdminModule } from 'src/notification/firebase.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TransportFee.name, schema: TransportFeeSchema },
      { name: TransportPayment.name, schema: TransportPaymentSchema },
    ]),
    FirebaseAdminModule,
  ],
  controllers: [FeesController],
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}
