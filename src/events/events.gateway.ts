/* eslint-disable prettier/prettier */

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { verify } from "jsonwebtoken";
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from 'src/database/databaseservice';
import { Server } from 'socket.io';
import { CustomSocket } from './custom-socket.interface';
import { Types } from 'mongoose';
import { FirebaseAdminService } from 'src/notification/firebase-admin.service';
import { WhatsappService } from 'src/whatsapp/whatsapp.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly whatsappService: WhatsappService,
  ) {
    console.log('🔥 EventsGateway constructor called');
  }

  @WebSocketServer()
  server: Server;

afterInit(server: Server) {
  console.log("socket server started");

  server.use((socket: any, next) => {
    let token =
      socket.handshake.auth?.token ||
      socket.handshake.headers["authorization"] ||
      socket.handshake.query?.token;
    console.log("Raw token:", token);

    if (!token) {
      return next(new Error("No token provided"));
    }

    if (token.startsWith("Bearer ")) {
      token = token.slice(7);
    }

    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      const payload: any = verify(token, secret);
      console.log("Verified JWT payload:", payload);
      socket.decoded_token = payload;
      next();
    } catch (err) {
      console.error("JWT verification failed:", err.message);
      return next(new Error("Authentication error: invalid or expired token"));
    }
  });
}

  async handleConnection(socket: CustomSocket) {
    console.log('Socket connected:', socket.id);
    const payload = {
      ok: true,
      socketId: socket.id,
      userId: (socket as any)?.data?.user?.userId ?? null,
      namespace: socket.nsp?.name ?? '/',
      rooms: [...socket.rooms],
      at: new Date().toISOString(),
    };
    socket.emit('connectionAck', payload);
  }

  async handleDisconnect(socket: CustomSocket) {
    console.log('Socket disconnected:', socket.id);
  }

  @SubscribeMessage('startTrip')
  async startTrip(
    @MessageBody() data: { tripId: string },
    @ConnectedSocket() socket: CustomSocket,
  ) {
    if (socket?.decoded_token?.userType !== 'driver') {
      socket.emit('error', { msg: 'Only drivers can start trips' });
      return;
    }
    const { tripId } = data;
    socket.join(tripId);
    console.log(`Driver ${socket.decoded_token?.sub || socket.decoded_token.userId} joined trip room: ${tripId}`);
    this.server.to(socket.id).emit('tripStarted', { tripId });
  }

  @SubscribeMessage('updateLocation')
  async updateLocation(
    @MessageBody() data: { tripId: string; location: { lat: number; long: number } },
    @ConnectedSocket() socket: any,
  ) {
    if (socket?.decoded_token?.userType !== 'driver') {
      return;
    }

    const room = String(data.tripId).trim();
    const before = await this.server.in(room).allSockets();
    console.log(`[location] will emit to room=${room}, listeners=${before.size}`);

    if (!socket.rooms.has(room)) {
      await socket.join(room);
    }

    const tripObjectId = new Types.ObjectId(room);
    const trip = await this.databaseService.repositories.TripModel.findById(
      tripObjectId,
      { 'locations': { $slice: -1 } }
    ).lean();
    const last = trip?.locations?.[0];
    const current = data.location;

    if (Math.abs(current.lat) > 90 || Math.abs(current.long) > 180) {
      console.log("❌ Physically impossible coordinates skipped");
      return;
    }

    if (last) {
      const latDiff = Math.abs(last.lat - current.lat);
      const lngDiff = Math.abs(last.long - current.long);
      if (latDiff < 0.00005 && lngDiff < 0.00005) {
        console.log("⚠️ Noise/duplicate skipped");
        return;
      }
    }

    let smoothLocation = current;
    if (last) {
      smoothLocation = {
        lat: last.lat * 0.3 + current.lat * 0.7,
        long: last.long * 0.3 + current.long * 0.7,
      };
    }

    await this.databaseService.repositories.TripModel.findByIdAndUpdate(
      tripObjectId,
      {
        $push: {
          locations: {
            lat: smoothLocation.lat,
            long: smoothLocation.long,
            time: new Date(),
          },
        },
      },
      { new: false },
    );

    const userId =
      socket?.data?.user?.userId ||
      socket?.decoded_token?.userId ||
      socket?.decoded_token?.sub ||
      'unknown';

    this.server.to(room).emit('locationUpdated', {
      userId,
      location: smoothLocation,
      at: new Date().toISOString(),
    });

    const after = await this.server.in(room).allSockets();
    console.log(`[location] emitted to room=${room}, listeners=${after.size}`);
  }

  @SubscribeMessage('joinTrip')
  async joinTrip(
    @MessageBody() data: { tripId: string },
    @ConnectedSocket() socket: CustomSocket,
  ) {
    const parentId = socket?.decoded_token?.userId || socket?.decoded_token?.sub;

    if (!parentId) {
      socket.emit('error', { msg: 'Not authenticated' });
      return;
    }

    const { tripId } = data;

    const trip = await this.databaseService.repositories.TripModel.findById(
      new Types.ObjectId(tripId),
      { vanId: 1 }
    ).lean();

    if (!trip) {
      socket.emit('error', { msg: 'Trip not found' });
      return;
    }

    const kid = await this.databaseService.repositories.KidModel.findOne({
      parentId: new Types.ObjectId(parentId),
      VanId: trip.vanId,
    }).lean();

    if (!kid) {
      console.warn(`Unauthorized joinTrip — parentId: ${parentId}, tripId: ${tripId}`);
      socket.emit('error', { msg: 'Not authorized: no child on this van' });
      return;
    }

    socket.join(tripId);
    console.log(`Parent ${parentId} joined trip room: ${tripId}`);
    this.server.to(socket.id).emit('joinedTrip', { tripId });
  }

  @SubscribeMessage('sos')
  async handleSOS(
    @MessageBody() data: { tripId: string; message?: string; location?: { lat: number; lng: number } },
    @ConnectedSocket() socket: CustomSocket,
  ) {
    const ackFail = (reason: string) => {
      socket.emit('sosAck', { success: false, error: reason });
    };

    try {
      const parentId = socket?.decoded_token?.userId || socket?.decoded_token?.sub;
      if (!parentId || socket?.decoded_token?.userType !== 'parent') {
        return ackFail('Only parents can send an SOS alert');
      }

      const { tripId } = data || ({} as any);
      if (!tripId) {
        return ackFail('tripId is required');
      }

      const trip = await this.databaseService.repositories.TripModel.findById(
        new Types.ObjectId(tripId),
        { vanId: 1, schoolId: 1 },
      ).lean();
      if (!trip) {
        return ackFail('Trip not found');
      }

      // Same authorization check as joinTrip — only a parent with a child on
      // this exact van can trigger an SOS for this trip.
      const kid = await this.databaseService.repositories.KidModel.findOne({
        parentId: new Types.ObjectId(parentId),
        VanId: trip.vanId,
      }).lean();
      if (!kid) {
        console.warn(`Unauthorized SOS attempt — parentId: ${parentId}, tripId: ${tripId}`);
        return ackFail('Not authorized: no child on this van');
      }

      // 1) Persist the SOS as a real, queryable notification record —
      // this is what makes it show up in admin/driver alert lists later,
      // rather than existing only as a socket event nobody stored.
      const notification = await new this.databaseService.repositories.notificationModel({
        type: 'sos',
        alertType: 'SOS_EMERGENCY',
        VanId: trip.vanId,
        schoolId: trip.schoolId,
        parentId: parentId,
        message: data?.message || `Emergency SOS from ${kid.fullname || 'a parent'}`,
        status: 'sent',
        date: new Date(),
      }).save();

      // 2) Real-time alert to everyone in the trip room (the driver, chiefly)
      this.server.to(tripId).emit('sosAlert', {
        tripId,
        studentName: kid.fullname,
        message: data?.message,
        location: data?.location,
        at: new Date().toISOString(),
      });

      // 3) Best-effort push + WhatsApp escalation — these must never block
      // or fail the ack; the parent should get confirmation the moment the
      // notification record + socket broadcast above succeed.
      const van = await this.databaseService.repositories.VanModel.findById(trip.vanId).lean();
      const driver = van?.driverId
        ? await this.databaseService.repositories.driverModel.findById(van.driverId).lean()
        : null;

      if (driver?.fcmToken) {
        this.firebaseAdminService
          .sendToDevice(driver.fcmToken, {
            notification: {
              title: '🚨 Emergency SOS',
              body: `${kid.fullname || "A parent"}'s parent sent an SOS alert`,
            },
            data: { type: 'sos', tripId },
          })
          .catch((e) => console.error('SOS push to driver failed:', e));
      }

      const school = await this.databaseService.repositories.SchoolModel.findById(trip.schoolId).lean();
      if (school?.contactNumber) {
        // Note: smartvan_sos WhatsApp template is still pending Meta approval
        // as of this writing — this call will fail gracefully (returns
        // {success:false}, doesn't throw) until that template is approved.
        this.whatsappService
          .sendSosAlert(
            school.contactNumber,
            'Parent',
            kid.fullname || 'Student',
            (van as any)?.carNumber || trip.vanId,
            school.contactNumber,
          )
          .catch((e) => console.error('SOS WhatsApp to school failed:', e));
      }

      // 4) Only now tell the parent it actually worked
      socket.emit('sosAck', { success: true, notificationId: notification._id });
    } catch (err) {
      console.error('SOS handler error:', err);
      ackFail('Server error while sending SOS');
    }
  }
}
