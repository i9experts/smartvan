/* eslint-disable prettier/prettier */

import { userRoom } from 'src/chat/chat.util';
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

    if (!token) {
      return next(new Error("No token provided"));
    }

    if (token.startsWith("Bearer ")) {
      token = token.slice(7);
    }

    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      const payload: any = verify(token, secret);
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
    // Personal room for chat and other per-user events.
    const uid = socket?.decoded_token?.userId || socket?.decoded_token?.sub;
    if (uid) socket.join(userRoom(String(uid)));
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

  // ─── Server-side emit helpers (used by services) ─────────────────────

  /** Room every admin/staff socket of a school joins via `joinSchoolAlerts`. */
  static schoolRoom(schoolId: string): string {
    return `school:${schoolId}`;
  }

  /** Best-effort emit — never throws into the caller's request flow. */
  emitToRoom(room: string, event: string, payload: unknown): void {
    try {
      this.server?.to(room).emit(event, payload);
    } catch (e) {
      console.error(`[EventsGateway] emit ${event} to ${room} failed:`, e);
    }
  }

  emitToSchool(schoolId: string, event: string, payload: unknown): void {
    if (!schoolId) return;
    this.emitToRoom(EventsGateway.schoolRoom(schoolId), event, payload);
  }

  /**
   * Admin dashboards join their school's alert room to receive SOS,
   * child-left-behind and checklist alerts in real time, without having
   * to be watching a specific trip.
   */
  @SubscribeMessage('joinSchoolAlerts')
  async joinSchoolAlerts(
    @MessageBody() data: { schoolId?: string },
    @ConnectedSocket() socket: CustomSocket,
  ) {
    const role = socket?.decoded_token?.role;
    const userId = socket?.decoded_token?.userId || socket?.decoded_token?.sub;
    if (!userId) {
      socket.emit('error', { msg: 'Not authenticated' });
      return;
    }

    let schoolId: string | null = null;
    if (role === 'admin') {
      const school = await this.databaseService.repositories.SchoolModel.findOne({
        admin: new Types.ObjectId(userId),
      }).lean();
      schoolId = school?._id?.toString() ?? null;
    } else if (role === 'school_staff') {
      schoolId = socket?.decoded_token?.schoolId ?? null;
    } else if (role === 'superadmin') {
      schoolId = data?.schoolId ?? null;
    }

    if (!schoolId) {
      socket.emit('error', { msg: 'Not authorized for school alerts' });
      return;
    }
    socket.join(EventsGateway.schoolRoom(schoolId));
    this.server.to(socket.id).emit('joinedSchoolAlerts', { schoolId });
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

  /**
   * Live position from the driver app, every GPS fix (~2–3 s). Only
   * relayed to the trip room — it is NOT written to the database here:
   * POST /trips/updateLocation already stores the trail (throttled), and
   * writing every socket fix too doubled the trail and loaded MongoDB.
   *
   * Payload in:  { tripId, location: { lat, long|lng }, speed?: m/s, heading?: deg }
   * Payload out (locationUpdated):
   *   { tripId, location: { lat, lng, long }, speedKmh, heading, moving, at }
   */
  @SubscribeMessage('updateLocation')
  async updateLocation(
    @MessageBody() data: { tripId: string; location: { lat: number; long?: number; lng?: number }; speed?: number; heading?: number },
    @ConnectedSocket() socket: any,
  ) {
    if (socket?.decoded_token?.userType !== 'driver') return;
    const room = String(data?.tripId ?? '').trim();
    if (!Types.ObjectId.isValid(room)) return;

    const lat = Number(data?.location?.lat);
    const lng = Number(data?.location?.lng ?? data?.location?.long);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

    // The trip must belong to this driver's van — checked once per socket.
    socket.data = socket.data || {};
    const verified: Set<string> = socket.data.verifiedTrips || (socket.data.verifiedTrips = new Set<string>());
    if (!verified.has(room)) {
      const driverId = socket.decoded_token?.userId || socket.decoded_token?.sub;
      const [trip, van]: any[] = await Promise.all([
        this.databaseService.repositories.TripModel.findById(room, { vanId: 1, status: 1 }).lean(),
        this.databaseService.repositories.VanModel.findOne({ driverId: new Types.ObjectId(driverId) }, { _id: 1 }).lean(),
      ]);
      if (!trip || !van || trip.vanId !== van._id.toString() || trip.status !== 'ongoing') {
        socket.emit('error', { msg: 'Not your ongoing trip' });
        return;
      }
      verified.add(room);
    }
    if (!socket.rooms.has(room)) await socket.join(room);

    const speedMs = Number(data?.speed);
    const speedKmh = Number.isFinite(speedMs) && speedMs >= 0 && speedMs < 70 ? Math.round(speedMs * 3.6) : null;
    const headingRaw = Number(data?.heading);
    const heading = Number.isFinite(headingRaw) && headingRaw >= 0 && headingRaw <= 360 ? headingRaw : null;

    this.server.to(room).emit('locationUpdated', {
      tripId: room,
      location: { lat, lng, long: lng },
      speedKmh,
      heading,
      moving: speedKmh === null ? null : speedKmh >= 5,
      at: new Date().toISOString(),
    });
  }

  @SubscribeMessage('joinTrip')
  async joinTrip(
    @MessageBody() data: { tripId: string },
    @ConnectedSocket() socket: CustomSocket,
  ) {
    const { tripId } = data;
    const userType = socket?.decoded_token?.userType;
    const role = socket?.decoded_token?.role;
    const userId =
      socket?.decoded_token?.userId || socket?.decoded_token?.sub;

    if (!userId) {
      socket.emit('error', { msg: 'Not authenticated' });
      return;
    }

    const trip = await this.databaseService.repositories.TripModel.findById(
      new Types.ObjectId(tripId),
      { vanId: 1, schoolId: 1 },
    ).lean();

    if (!trip) {
      socket.emit('error', { msg: 'Trip not found' });
      return;
    }

    // School admins watching their own Live Tracking dashboard were never
    // handled here at all — this only ever checked for a parent's linked
    // kid, so every admin join was silently rejected with "no child on
    // this van", meaning the dashboard never actually received location
    // broadcasts no matter how correct the rest of the pipeline was.
    if (role === 'admin' || role === 'superadmin') {
      const school = await this.databaseService.repositories.SchoolModel.findOne({
        admin: new Types.ObjectId(userId),
      }).lean();

      if (role !== 'superadmin' && (!school || school._id.toString() !== trip.schoolId)) {
        console.warn(`Unauthorized joinTrip — adminId: ${userId}, tripId: ${tripId}`);
        socket.emit('error', { msg: 'Not authorized: trip belongs to a different school' });
        return;
      }

      socket.join(tripId);
      console.log(`Admin ${userId} joined trip room: ${tripId}`);
      this.server.to(socket.id).emit('joinedTrip', { tripId });
      return;
    }

    // Parent path: one of their kids must ride this trip — by VanId, by
    // being a stop on the trip's route, or by already being on the trip.
    // (Only VanId was checked before; kids added to routes without VanId
    // were rejected, so their parents' live map stayed on "Connecting…".)
    const repos = this.databaseService.repositories;
    const parentKids: any[] = await repos.KidModel.find(
      { parentId: new Types.ObjectId(userId) },
      { _id: 1, VanId: 1 },
    ).lean();
    const parentKidIds = new Set(parentKids.map((k) => k._id.toString()));
    let kid: any = parentKids.find((k) => k.VanId === trip.vanId) || null;
    if (!kid && parentKidIds.size) {
      const full: any = await repos.TripModel.findById(tripId, { routeId: 1, kids: 1 }).lean();
      if ((full?.kids || []).some((k: any) => parentKidIds.has(k.kidId?.toString()))) kid = true;
      if (!kid && full?.routeId && Types.ObjectId.isValid(full.routeId)) {
        const route: any = await repos.routeModel.findById(full.routeId, { kidLocations: 1 }).lean();
        if ((route?.kidLocations || []).some((kl: any) => parentKidIds.has(kl.kidId?.toString()))) kid = true;
      }
    }

    if (!kid) {
      console.warn(`Unauthorized joinTrip — parentId: ${userId}, tripId: ${tripId}`);
      socket.emit('error', { msg: 'Not authorized: no child on this van' });
      return;
    }

    socket.join(tripId);
    console.log(`Parent ${userId} joined trip room: ${tripId}`);
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
