/* eslint-disable prettier/prettier */
import { Types } from 'mongoose';
import { EventsGateway } from './events.gateway';

const oid = () => new Types.ObjectId();
const lean = (v: any) => ({ lean: async () => v });

function setup(tripOver: any = {}) {
  const vanId = oid();
  const driverId = oid().toString();
  const trip = { _id: oid(), vanId: vanId.toString(), status: 'ongoing', trackingSession: null, ...tripOver };
  const repos: any = {
    TripModel: { findById: () => lean(trip) },
    VanModel: { findOne: () => lean({ _id: vanId }) },
  };
  const gw = new EventsGateway({ repositories: repos } as any, {} as any, {} as any, {} as any);
  const emitted: any[] = [];
  (gw as any).server = { to: () => ({ emit: (ev: string, p: any) => emitted.push([ev, p]) }) };
  const socket: any = {
    decoded_token: { userType: 'driver', userId: driverId },
    rooms: new Set<string>([trip._id.toString()]),
    join: async () => undefined,
    emit: jest.fn(),
    data: {},
  };
  const room = trip._id.toString();
  const send = (lat: number, extra: any = {}) =>
    gw.updateLocation({ tripId: room, location: { lat, lng: 67.0 }, ...extra } as any, socket);
  return { gw, socket, emitted, send, room };
}

describe('socket live relay', () => {
  it('relays a normal fix', async () => {
    const { send, emitted } = setup();
    await send(24.9);
    expect(emitted.map((e) => e[0])).toEqual(['locationUpdated']);
  });

  it('a phone whose session was replaced gets TRACKING_SESSION_REPLACED and is not relayed', async () => {
    const { send, emitted, socket, gw, room } = setup();
    await send(24.9, { sessionId: 'OLD' });
    gw.setTrackingSession(room, 'NEW'); // the driver continued on another phone
    await send(24.9001, { sessionId: 'OLD' });
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ code: 'TRACKING_SESSION_REPLACED' }));
    expect(emitted).toHaveLength(1);
    await send(24.9002, { sessionId: 'NEW' });
    expect(emitted).toHaveLength(2);
  });

  it('the session stored on the trip applies after a server restart', async () => {
    const { send, emitted, socket } = setup({ trackingSession: { sessionId: 'NEW' } });
    await send(24.9, { sessionId: 'OLD' });
    expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ code: 'TRACKING_SESSION_REPLACED' }));
    expect(emitted).toHaveLength(0);
  });

  it('no sessionId (old app) is still relayed', async () => {
    const { send, emitted, gw, room } = setup();
    gw.setTrackingSession(room, 'NEW');
    await send(24.9);
    expect(emitted).toHaveLength(1);
  });

  it('drops inaccurate and impossible fixes, keeps the next normal one', async () => {
    const { send, emitted } = setup();
    await send(24.9);
    await send(24.9001, { accuracy: 90 });  // too inaccurate
    await send(24.95);                      // ~5.5 km away at once
    expect(emitted).toHaveLength(1);
    await send(24.9002);
    expect(emitted).toHaveLength(2);
  });
});
