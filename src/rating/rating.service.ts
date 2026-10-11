/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { DatabaseService } from 'src/database/databaseservice';
import { RateTripDto } from './dto/rate-trip.dto';

@Injectable()
export class RatingService {
  constructor(private readonly databaseService: DatabaseService) {}

  private otherRole(role: string) {
    return role === 'driver' ? 'parent' : 'driver';
  }

  private userModelFor(role: string) {
    return role === 'driver'
      ? this.databaseService.repositories.driverModel
      : this.databaseService.repositories.parentModel;
  }

  async rateTrip(raterUserId: string, raterRole: string, dto: RateTripDto) {
    if (raterRole !== 'parent' && raterRole !== 'driver') {
      throw new ForbiddenException('Only parents and drivers can rate a trip');
    }

    const trip = await this.databaseService.repositories.TripModel.findById(dto.tripId);
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status !== 'end') {
      throw new BadRequestException('Trip has not ended yet');
    }

    const van = await this.databaseService.repositories.VanModel.findById(trip.vanId);
    if (!van) throw new NotFoundException('Van not found for this trip');

    let rateeUserId: string;
    const rateeRole = this.otherRole(raterRole);

    if (raterRole === 'parent') {
      // The rater must actually have a kid on this trip.
      const kidIds = trip.kids.map((k) => k.kidId);
      const kid = await this.databaseService.repositories.KidModel.findOne({
        _id: { $in: kidIds },
        parentId: new Types.ObjectId(raterUserId),
      });
      if (!kid) throw new ForbiddenException('You do not have a child on this trip');

      // Always rate the trip's actual driver — never trust a client-sent id here.
      if (!van.driverId) throw new NotFoundException('No driver assigned to this trip');
      rateeUserId = van.driverId.toString();
    } else {
      // Driver rater must own the van that ran this trip.
      if (!van.driverId || van.driverId.toString() !== raterUserId) {
        throw new ForbiddenException('You did not drive this trip');
      }
      if (!dto.rateeUserId) {
        throw new BadRequestException('rateeUserId is required when rating as a driver');
      }
      const kidIds = trip.kids.map((k) => k.kidId);
      const parentOnTrip = await this.databaseService.repositories.KidModel.findOne({
        _id: { $in: kidIds },
        parentId: new Types.ObjectId(dto.rateeUserId),
      });
      if (!parentOnTrip) throw new ForbiddenException('That parent was not on this trip');
      rateeUserId = dto.rateeUserId;
    }

    if (rateeUserId === raterUserId) {
      throw new BadRequestException('Cannot rate yourself');
    }

    const existing = await this.databaseService.repositories.ratingModel.findOne({
      tripId: dto.tripId,
      raterUserId: new Types.ObjectId(raterUserId),
      rateeUserId: new Types.ObjectId(rateeUserId),
    });
    if (existing) {
      throw new BadRequestException('You have already rated this trip');
    }

    const rating = await this.databaseService.repositories.ratingModel.create({
      tripId: dto.tripId,
      vanId: trip.vanId,
      schoolId: trip.schoolId,
      raterUserId: new Types.ObjectId(raterUserId),
      raterRole,
      rateeUserId: new Types.ObjectId(rateeUserId),
      rateeRole,
      stars: dto.stars,
      comment: dto.comment?.trim() || '',
    });

    const rateeModel = this.userModelFor(rateeRole);
    await rateeModel.updateOne(
      { _id: rateeUserId },
      { $inc: { ratingSum: dto.stars, ratingCount: 1 } },
    );

    return { message: 'Rating submitted', data: rating };
  }

  async getMyRatingSummary(userId: string, role: string) {
    const model = this.userModelFor(role);
    const user = await model.findById(userId, {
      ratingSum: 1,
      ratingCount: 1,
      completedTripCount: 1,
    });
    if (!user) throw new NotFoundException('User not found');

    const ratingCount = user.ratingCount || 0;
    const avgRating = ratingCount > 0 ? Math.round((user.ratingSum / ratingCount) * 10) / 10 : 0;

    return {
      avgRating,
      ratingCount,
      completedTripCount: user.completedTripCount || 0,
    };
  }

  // Recently-ended trips this user is party to but hasn't rated yet —
  // bounded to the last 30 days / 20 trips so the query stays cheap.
  async getPendingRatings(userId: string, role: string) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const userObjectId = new Types.ObjectId(userId);

    if (role === 'parent') {
      const kids = await this.databaseService.repositories.KidModel.find(
        { parentId: userObjectId },
        { _id: 1, fullname: 1 },
      );
      const kidIds = kids.map((k) => k._id.toString());
      if (!kidIds.length) return { data: [] };

      const trips = await this.databaseService.repositories.TripModel.find({
        status: 'end',
        'kids.kidId': { $in: kidIds },
        createdAt: { $gte: since },
      })
        .sort({ createdAt: -1 })
        .limit(20);

      if (!trips.length) return { data: [] };

      const alreadyRated = await this.databaseService.repositories.ratingModel.find({
        raterUserId: userObjectId,
        tripId: { $in: trips.map((t) => t._id.toString()) },
      });
      const ratedTripIds = new Set(alreadyRated.map((r) => r.tripId));

      const pending = trips.filter((t) => !ratedTripIds.has(t._id.toString()));
      const vanIds = [...new Set(pending.map((t) => t.vanId))];
      const vans = await this.databaseService.repositories.VanModel.find(
        { _id: { $in: vanIds } },
        { driverId: 1, carNumber: 1 },
      );
      const vanById = new Map(vans.map((v) => [v._id.toString(), v]));
      const driverIds = [...new Set(vans.map((v) => v.driverId?.toString()).filter(Boolean))];
      const drivers = await this.databaseService.repositories.driverModel.find(
        { _id: { $in: driverIds } },
        { fullname: 1, image: 1 },
      );
      const driverById = new Map(drivers.map((d) => [d._id.toString(), d]));

      return {
        data: pending.map((t) => {
          const van = vanById.get(t.vanId);
          const driver = van?.driverId ? driverById.get(van.driverId.toString()) : null;
          return {
            tripId: t._id.toString(),
            type: t.type,
            endedAt: t.tripEnd?.endTime || t.updatedAt,
            driverId: driver?._id?.toString() || null,
            driverName: driver?.fullname || null,
            driverImage: driver?.image || null,
          };
        }),
      };
    }

    if (role === 'driver') {
      const vans = await this.databaseService.repositories.VanModel.find(
        { driverId: userObjectId },
        { _id: 1 },
      );
      const vanIds = vans.map((v) => v._id.toString());
      if (!vanIds.length) return { data: [] };

      const trips = await this.databaseService.repositories.TripModel.find({
        status: 'end',
        vanId: { $in: vanIds },
        createdAt: { $gte: since },
      })
        .sort({ createdAt: -1 })
        .limit(20);

      if (!trips.length) return { data: [] };

      const alreadyRated = await this.databaseService.repositories.ratingModel.find({
        raterUserId: userObjectId,
        tripId: { $in: trips.map((t) => t._id.toString()) },
      });
      const ratedPairs = new Set(
        alreadyRated.map((r) => `${r.tripId}:${r.rateeUserId.toString()}`),
      );

      const allKidIds = [...new Set(trips.flatMap((t) => t.kids.map((k) => k.kidId)))];
      const kids = await this.databaseService.repositories.KidModel.find(
        { _id: { $in: allKidIds } },
        { parentId: 1, fullname: 1 },
      );
      const kidById = new Map(kids.map((k) => [k._id.toString(), k]));
      const parentIds = [...new Set(kids.map((k) => k.parentId?.toString()).filter(Boolean))];
      const parents = await this.databaseService.repositories.parentModel.find(
        { _id: { $in: parentIds } },
        { fullname: 1, image: 1 },
      );
      const parentById = new Map(parents.map((p) => [p._id.toString(), p]));

      const pending: any[] = [];
      for (const t of trips) {
        const parentIdsOnTrip = new Set(
          t.kids
            .map((k) => kidById.get(k.kidId)?.parentId?.toString())
            .filter(Boolean),
        );
        for (const parentId of parentIdsOnTrip) {
          if (ratedPairs.has(`${t._id.toString()}:${parentId}`)) continue;
          const parent = parentById.get(parentId);
          pending.push({
            tripId: t._id.toString(),
            type: t.type,
            endedAt: t.tripEnd?.endTime || t.updatedAt,
            parentId,
            parentName: parent?.fullname || null,
            parentImage: parent?.image || null,
          });
        }
      }

      return { data: pending };
    }

    throw new ForbiddenException('Only parents and drivers have pending ratings');
  }

  // School-admin read of one driver/parent's individual review history
  // (stars + comment per trip) — the list/register endpoints only expose
  // the aggregate avgRating, this is for a detail-view "Reviews" section.
  async getRatingsForUserAsAdmin(adminId: string, targetUserId: string) {
    const school = await this.databaseService.repositories.SchoolModel.findOne({
      admin: new Types.ObjectId(adminId),
    });
    if (!school) throw new UnauthorizedException('School not found');

    const schoolIdStr = school._id.toString();

    const driver = await this.databaseService.repositories.driverModel.findOne({
      _id: targetUserId,
    });
    const parent = driver
      ? null
      : await this.databaseService.repositories.parentModel.findOne({ _id: targetUserId });

    const targetUser: any = driver || parent;
    if (!targetUser) throw new NotFoundException('User not found');
    if (targetUser.schoolId !== schoolIdStr) {
      throw new ForbiddenException('This user is not in your school');
    }

    const ratings = await this.databaseService.repositories.ratingModel
      .find({ rateeUserId: new Types.ObjectId(targetUserId) })
      .sort({ createdAt: -1 })
      .limit(50);

    return {
      message: 'Ratings fetched successfully',
      data: ratings.map((r: any) => ({
        stars: r.stars,
        comment: r.comment,
        raterRole: r.raterRole,
        tripId: r.tripId,
        createdAt: r.createdAt,
      })),
    };
  }
}
