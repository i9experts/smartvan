/* eslint-disable prettier/prettier */
import { Types } from 'mongoose';
import { DatabaseService } from 'src/database/databaseservice';

/**
 * The van a driver drives and every student who rides it.
 *
 * A student counts as riding the van if EITHER
 *  - their VanId is this van, OR
 *  - they are a stop on one of this van's routes (route.kidLocations).
 * The fee screen used only the first, and only for status 'active' kids,
 * so drivers whose students were added to routes (but whose VanId was
 * never set, or who were still 'inActive') saw "No students assigned".
 *
 * driverId / vanId are matched as both ObjectId and string, because older
 * records stored them as strings.
 */
export async function findDriverVanAndKids(db: DatabaseService, driverId: string) {
  const repos = db.repositories;
  const idVariants = (id: string): any[] =>
    Types.ObjectId.isValid(id) ? [new Types.ObjectId(id), id] : [id];

  // Raw collection query so mongoose doesn't cast the string variant away.
  const van: any = await repos.VanModel.collection.findOne({ driverId: { $in: idVariants(driverId) } });
  if (!van) return { van: null, kids: [] as any[] };
  const vanId = van._id.toString();

  const routes: any[] = await repos.routeModel.collection
    .find({ vanId: { $in: idVariants(vanId) } }, { projection: { kidLocations: 1 } })
    .toArray();
  const routeKidIds = new Set<string>();
  for (const r of routes) {
    for (const kl of r.kidLocations || []) {
      if (kl?.kidId) routeKidIds.add(kl.kidId.toString());
    }
  }

  const kids: any[] = await repos.KidModel.find({
    $or: [
      { VanId: vanId },
      { _id: { $in: [...routeKidIds].filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)) } },
    ],
  })
    .sort({ fullname: 1 })
    .lean();

  return { van, kids };
}
