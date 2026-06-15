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
  ) {
    console.log('🔥 EventsGateway constructor called');
  }

  @WebSocketServer()
  server: Server;

afterInit(server: Server) {
  console.log("socket server started");

  server.use((socket: any, next) => {
    let token = socket.handshake.headers["authorization"] || socket.handshake.query?.token;
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
}
