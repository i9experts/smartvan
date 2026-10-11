import { Types } from 'mongoose';
import { findDriverVanAndKids } from './driver-van-kids';

function fakeDb({ van, routes, kids }: { van: any; routes: any[]; kids: any[] }) {
  const kidFind = jest.fn().mockReturnValue({
    sort: () => ({ lean: () => Promise.resolve(kids) }),
  });
  return {
    db: {
      repositories: {
        VanModel: { collection: { findOne: jest.fn().mockResolvedValue(van) } },
        routeModel: { collection: { find: jest.fn().mockReturnValue({ toArray: () => Promise.resolve(routes) }) } },
        KidModel: { find: kidFind },
      },
    } as any,
    kidFind,
  };
}

describe('findDriverVanAndKids', () => {
  const driverId = new Types.ObjectId().toString();
  const vanId = new Types.ObjectId();
  const routeKid = new Types.ObjectId();

  it('returns no kids when the driver has no van', async () => {
    const { db } = fakeDb({ van: null, routes: [], kids: [] });
    await expect(findDriverVanAndKids(db, driverId)).resolves.toEqual({ van: null, kids: [] });
  });

  it('matches kids by VanId OR by being a stop on one of the van routes (no status filter)', async () => {
    const kids = [{ _id: routeKid, status: 'inActive' }];
    const { db, kidFind } = fakeDb({
      van: { _id: vanId },
      routes: [{ kidLocations: [{ kidId: routeKid }] }],
      kids,
    });
    const result = await findDriverVanAndKids(db, driverId);
    expect(result.kids).toBe(kids);
    const filter = kidFind.mock.calls[0][0];
    expect(filter.status).toBeUndefined();
    expect(filter.$or[0]).toEqual({ VanId: vanId.toString() });
    expect(filter.$or[1]._id.$in.map(String)).toEqual([routeKid.toString()]);
  });

  it('looks the van up by both ObjectId and string driverId', async () => {
    const { db } = fakeDb({ van: null, routes: [], kids: [] });
    await findDriverVanAndKids(db, driverId);
    const query = db.repositories.VanModel.collection.findOne.mock.calls[0][0];
    expect(query.driverId.$in.map(String)).toEqual([driverId, driverId]);
  });
});
