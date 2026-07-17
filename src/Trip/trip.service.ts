/* eslint-disable prettier/prettier */
import { Injectable, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PickStudentDto } from './dto/pick-student.dto';
import mongoose from 'mongoose';
import * as moment from "moment-timezone"

import { Types } from "mongoose";

const TZ = process.env.DEFAULT_TIMEZONE || "Asia/Karachi";



import { CreateTripDto } from './dto/create-trip.dto';
import { DatabaseService } from "src/database/databaseservice";
import { EtaService } from './eta.service';
import { GeofenceService, GeofenceZone } from './geofence.service';
import { EndTripDto } from './dto/tripend.dto';
import { getLocationDto } from './dto/getLocations';
import { FirebaseAdminService } from 'src/notification/firebase-admin.service';
import { Kid } from 'src/Kid/kid.schema';
@Injectable()
export class TripService {
  constructor(
   private databaseService: DatabaseService,
   private firebaseAdminService: FirebaseAdminService,
   private readonly etaService: EtaService,
   private readonly geofenceService: GeofenceService,
  ) {} 



// async startTrip(driverId: string, createTripDto: CreateTripDto) {

//   const driverObjectId = new Types.ObjectId(driverId);
//   console.log(driverObjectId)
  
//   const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
//   if (!driver) {
//     throw new UnauthorizedException('Driver not found');
//   }


  


//  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
//   if (!van) {
//     throw new BadRequestException('Van not assigned to this driver');
//   }

  

//   const schoolId = van.schoolId;
  
//   if (!schoolId) {  
//     throw new BadRequestException('Van is not associated with any school');
//   }
  
//    if (driver.schoolId !== van.schoolId) {
//     throw new BadRequestException('Driver and Van school do not match');
//   }

//    if (van.status !== "active") {
//     throw new BadRequestException('Van is not active');
//   }
   

//   if (!createTripDto.routeId) {
//     throw new BadRequestException('Route ID is required to start a trip');
//   }

//   const today = new Date();
//   today.setHours(0, 0, 0, 0);

//     const tomorrow = new Date(today);
//     tomorrow.setDate(tomorrow.getDate() + 1);

//   const getTrip = await this.databaseService.repositories.TripModel.findOne({ 
//     routeId: createTripDto.routeId, 
//     type: createTripDto.type,
//     createdAt: {
//     $gte: today,     
//     $lt: tomorrow   
//       } 
//     });
//     if(getTrip){
//       throw new BadRequestException('this schedule trip already started');
//     }
  

//   const newTrip = new this.databaseService.repositories.TripModel({
//     driverId: driverId,
//     vanId: van._id.toString(),
//     schoolId: van.schoolId,
//     routeId: createTripDto.routeId,

//     type: createTripDto.type || undefined,
   

//     tripStart: {
//       startTime: new Date(),
//       lat: createTripDto.lat,
//       long: createTripDto.long,
//     },

//     status: 'ongoing',

//     kids: [],

  
//     locations: (createTripDto.lat && createTripDto.long)
//       ? [{
//           lat: createTripDto.lat,
//           long: createTripDto.long,
//           time: new Date(), 
//         }]
//       : [],
//   });

//   // 🔍 Save karo
//   const savedTrip = await newTrip.save();

//   return {
//     data: savedTrip.toObject(),
//   };
// }


async pickStudent(driverId, dto: PickStudentDto) {
  const driverObjectId = new Types.ObjectId(driverId);

  const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
  if (!driver) {
    throw new UnauthorizedException('Driver not found');
  }

  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
  if (!van) {
    throw new BadRequestException('Van not assigned to this driver');
  }

  const schoolId = van.schoolId;
  
  if (!schoolId) {  
    throw new BadRequestException('Van is not associated with any school');
  }
  
   if (driver.schoolId !== van.schoolId) {
    throw new BadRequestException('Driver and Van school do not match');
    
  }

  const tripObjectId = new Types.ObjectId(dto.tripId);

  console.log(tripObjectId)
  

   


  const trip = await this.databaseService.repositories.TripModel.findById(tripObjectId);
  if (!trip) {
    throw new NotFoundException('Trip not found');
  }

  if (trip.vanId !== van._id.toString()) {
    throw new BadRequestException("Van does not belong to this trip");
  }

  if (van.status !== "active") {
    throw new BadRequestException('Van is not active');
  }

const kid = await this.databaseService.repositories.KidModel.findById(dto.kidId);

 if (kid.status !== "active")
  {
    throw new BadRequestException('Kid is not active');
  } 


  
  

  trip.kids.push({
    kidId: dto.kidId,
    lat: dto.lat,
    long: dto.long,
    time: dto.time || new Date(),
    status: 'picked',
  });

  await trip.save();


  

  if (kid?.parentId) {
   const parent = await this.databaseService.repositories.parentModel.findOne({
  _id: kid.parentId,
  isDelete: false,

});

    const title = "Kid Picked";
    const message = `${kid.fullname} has been picked by the van driver.`;

   
    if (parent?.fcmToken && parent.notificationToggle === true) {
      await this.firebaseAdminService.sendToDevice(
        parent.fcmToken,
        {
          notification: {
            title,
            body: message,
          },
          data: {
            kidId: kid._id.toString(),
            status: 'picked',
            time: new Date().toISOString(),
          }
        }
      );
    }

 
    await this.databaseService.repositories.notificationModel.create({
      type: "driver",
      schoolId: van.schoolId,
      infoType: "Information",
      parentId: kid.parentId.toString(),
      VanId: van._id.toString(),
      title: title,
      message: message,
      actionType: "PICKED",
      status: "sent",
      date: new Date(),
    });
  }

  return {
    message: "Kid picked, notification sent & saved",
    data: trip
  };
}

async dropStudentForHome(driverId: string, dto: { tripId: string; kidId: string; lat: number; long: number }) {

  const driverObjectId = new Types.ObjectId(driverId);

  // 1️⃣ Driver check
  const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
  if (!driver) {
    throw new UnauthorizedException('Driver not found');
  }

  // 2️⃣ Van check
  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
  if (!van) {
    throw new BadRequestException('Van not assigned to this driver');
  }

  if (!van.schoolId) {
    throw new BadRequestException('Van is not associated with any school');
  }

  if (driver.schoolId !== van.schoolId) {
    throw new BadRequestException('Driver and Van school do not match');
  }

  if (van.status !== "active") {
    throw new BadRequestException('Van is not active');
  }

  // 3️⃣ Trip check
  const trip = await this.databaseService.repositories.TripModel.findById(dto.tripId);
  if (!trip) {
    throw new NotFoundException('Trip not found');
  }

  if (trip.vanId !== van._id.toString()) {
    throw new BadRequestException("Van does not belong to this trip");
  }

  // 4️⃣ Kid find in trip.kids array
  const kidIndex = trip.kids.findIndex(
    (k) => k.kidId.toString() === dto.kidId
  );

  if (kidIndex === -1) {
    throw new BadRequestException("Kid not found in this trip");
  }

  // 5️⃣ Update kid data
  trip.kids[kidIndex].status = "dropped"; // ✅ status update
  trip.kids[kidIndex].lat = dto.lat;      // ✅ location add
  trip.kids[kidIndex].long = dto.long;
  trip.kids[kidIndex].time = new Date();

  // 6️⃣ Add in locations array
  trip.locations.push({
    lat: dto.lat,
    long: dto.long,
    time: new Date(),
  });

  await trip.save();

  // 7️⃣ Notification (optional but recommended)
  const kid = await this.databaseService.repositories.KidModel.findById(dto.kidId);

  if (kid?.parentId) {

    const parent = await this.databaseService.repositories.parentModel.findOne({
      _id: kid.parentId,
      isDelete: false,
    });

    const title = "Kid Dropped";
    const message = `${kid.fullname} has been dropped at home.`;

    // 🔔 push
    if (parent?.fcmToken && parent.notificationToggle === true) {
      await this.firebaseAdminService.sendToDevice(
        parent.fcmToken,
        {
          notification: {
            title,
            body: message,
          },
          data: {
            kidId: kid._id.toString(),
            status: 'dropped',
            time: new Date().toISOString(),
          }
        }
      );
    }

    // 💾 save notification
    await this.databaseService.repositories.notificationModel.create({
      type: "driver",
      schoolId: van.schoolId,
      infoType: "Information",
      parentId: kid.parentId.toString(),
      VanId: van._id.toString(),
      title: title,
      message: message,
      actionType: "DROPPED",
      status: "sent",
      date: new Date(),
    });
  }

  return {
    message: "Kid dropped successfully",
    data: trip,
  };
}

// async endTrip(driverId, dto: EndTripDto) {
//   const { tripId, lat, long, time } = dto;
//   const driverObjectId = new Types.ObjectId(driverId);


//   const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
//   if (!driver) throw new UnauthorizedException('Driver not found');


//   const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
//   if (!van) throw new BadRequestException('Van not assigned to this driver');

//   const schoolId = van.schoolId;
  
//   if (!schoolId) {  
//     throw new BadRequestException('Van is not associated with any school');
//   }
  
//    if (driver.schoolId !== van.schoolId) {
//     throw new BadRequestException('Driver and Van school do not match');
//   }


//   const trip = await this.databaseService.repositories.TripModel.findById(tripId);
//   if (!trip) throw new NotFoundException('Trip not found');

//   if (trip.vanId !== van._id.toString()) {
//     throw new BadRequestException("Van does not belong to this trip");
//   }

//   trip.kids = trip.kids.map(kid => ({
//     ...kid,
//     status: 'dropped',
//     time: time ? new Date(time) : new Date(),
//     lat,
//     long,
//   }));

//   trip.status = 'end';
//   trip.tripEnd = {
//     endTime: time ? new Date(time) : new Date(),
//     lat,
//     long,
//   };

//   await trip.save();


//   for (const kidEntry of trip.kids) {

//     const kidDoc = await this.databaseService.repositories.KidModel.findById(kidEntry.kidId);
//     const SchoolId = kidDoc?.schoolId;
//     if (!kidDoc?.parentId) continue; // agar parentId nahi hai to skip

   
//   const parent = await this.databaseService.repositories.parentModel.findOne({
//     _id: kidDoc.parentId,
//     isDelete: false,
//   });
  
//     if (!parent) continue;

    
// const title = "Student Dropped";
// const message = `${kidDoc.fullname} has been safely dropped.`;



//     if (parent?.fcmToken) {
//       await this.firebaseAdminService.sendToDevice(
//         parent.fcmToken,
//         {
//           notification: { title, body: message },
//           data: {
//             kidId: kidDoc._id.toString(),
//             status: 'dropped',
//             tripId: trip._id.toString(),
//             time: new Date().toISOString(),
//           },
//         }
//       );
//     }


//     await this.databaseService.repositories.notificationModel.create({
//       type: "driver",
//       infoType: "Information",
//       parentId: kidDoc.parentId.toString(),
//       schoolId: SchoolId,
//       VanId: van._id.toString(),
//       title: title,
//       message: message,
//       actionType: "DROPPED",
//       status: "sent",
//       date: new Date(),
//     });
//   }

//   return {
//     message: "Trip ended, notifications sent & saved",
//     data: trip,
//   };
// }

async endTrip(driverId, dto: EndTripDto) {
  const { tripId, lat, long, time } = dto;
  const driverObjectId = new Types.ObjectId(driverId);

  // 1️⃣ Driver check
  const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
  if (!driver) throw new UnauthorizedException('Driver not found');

  // 2️⃣ Van check
  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
  if (!van) throw new BadRequestException('Van not assigned to this driver');

  const schoolId = van.schoolId;

  if (!schoolId) {
    throw new BadRequestException('Van is not associated with any school');
  }

  if (driver.schoolId !== van.schoolId) {
    throw new BadRequestException('Driver and Van school do not match');
  }

  // 3️⃣ Trip check
  const trip = await this.databaseService.repositories.TripModel.findById(tripId);
  if (!trip) throw new NotFoundException('Trip not found');

  if (trip.vanId !== van._id.toString()) {
    throw new BadRequestException("Van does not belong to this trip");
  }

  // 4️⃣ Update trip kids status
  trip.kids = trip.kids.map(kid => ({
    ...kid,
    status: 'dropped',
    time: time ? new Date(time) : new Date(),
    lat,
    long,
  }));

  trip.status = 'end';
  trip.tripEnd = {
    endTime: time ? new Date(time) : new Date(),
    lat,
    long,
  };

  await trip.save();

  // ===============================
  // 🔥 NEW LOGIC STARTS HERE
  // ===============================

  // 5️⃣ Get all kids data
  const kidIds = trip.kids.map(k => new Types.ObjectId(k.kidId));

  const kids = await this.databaseService.repositories.KidModel.find(
    { _id: { $in: kidIds } },
    { parentId: 1, fullname: 1, schoolId: 1 }
  );

  // 6️⃣ Unique parents
  const uniqueParentIds = [
    ...new Set(
      kids
        .filter(k => k.parentId)
        .map(k => k.parentId.toString())
    ),
  ];

  // 7️⃣ Send notification parent-wise
  for (const parentId of uniqueParentIds) {

    const parent = await this.databaseService.repositories.parentModel.findOne({
      _id: parentId,
      isDelete: false,
    });

    if (!parent) continue;

    // 👉 is parent ke kids
    const kidsOfParent = kids.filter(
      k => k.parentId && k.parentId.toString() === parentId
    );

    const kidNames = kidsOfParent.map(k => k.fullname).join(", ");

    const title = "Student Dropped";
    const message = `Your child ${kidNames} has been safely dropped.`;

    // 🔔 Push Notification
    if (parent.fcmToken && parent.notificationToggle === true) {
      await this.firebaseAdminService.sendToDevice(
        parent.fcmToken,
        {
          notification: { title, body: message },
      data: {
       kidIds: JSON.stringify(kidsOfParent.map(k => k._id.toString())), // ✅ string
       status: 'dropped',
        tripId: trip._id.toString(),
         time: new Date().toISOString(),
}
        }
      );
    }

    // 🗄️ Save Notification
    await this.databaseService.repositories.notificationModel.create({
      type: "driver",
      infoType: "Information",
      parentId: parentId,
      schoolId: kidsOfParent[0]?.schoolId,
      VanId: van._id.toString(),
      title: title,
      message: message,
      actionType: "DROPPED",
      status: "sent",
      date: new Date(),
    });
  }

  // ===============================
  // 🔥 END
  // ===============================

  return {
    message: "Trip ended, notifications sent & saved",
    data: trip,
  };
}

async startTrip(driverId: string, createTripDto: CreateTripDto) {

  const driverObjectId = new Types.ObjectId(driverId);

  // 1️⃣ Driver check
  const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
  if (!driver) {
    throw new UnauthorizedException('Driver not found');
  }

  // 2️⃣ Van check
  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
  if (!van) {
    throw new BadRequestException('Van not assigned to this driver');
  }

  if (!van.schoolId) {
    throw new BadRequestException('Van is not associated with any school');
  }

  if (driver.schoolId !== van.schoolId) {
    throw new BadRequestException('Driver and Van school do not match');
  }

  if (van.status !== "active") {
    throw new BadRequestException('Van is not active');
  }

  // 3️⃣ Route check
  if (!createTripDto.routeId) {
    throw new BadRequestException('Route ID is required to start a trip');
  }

  const route = await this.databaseService.repositories.routeModel.findById(createTripDto.routeId);

  if (!route) {
    throw new BadRequestException('Route not found');
  }

  if (!route.startTime) {
    throw new BadRequestException('Route start time not defined');
  }

  // 4️⃣ ⏰ Time validation (1 hour window)
  const now = new Date();

  const routeTime = new Date(route.startTime);

  // 👉 Aaj ki date + route ka time
  const todayRouteTime = new Date();
  todayRouteTime.setHours(
    routeTime.getHours(),
    routeTime.getMinutes(),
    0,
    0
  );

  const oneHourLater = new Date(todayRouteTime.getTime() + 60 * 60 * 1000);

  if (now < todayRouteTime) {
    console.log (todayRouteTime, now, oneHourLater)
    throw new BadRequestException('Trip cannot start before scheduled time');
  }

  

  if (now > oneHourLater) {
    throw new BadRequestException('Trip start window expired (1 hour limit)');
  }

  // 5️⃣ Duplicate trip check (same day)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const getTrip = await this.databaseService.repositories.TripModel.findOne({
    routeId: createTripDto.routeId,
    type: createTripDto.type,
    createdAt: {
      $gte: today,
      $lt: tomorrow
    }
  });

  if (getTrip) {
    throw new BadRequestException('This scheduled trip already started today');
  }

  // 6️⃣ Create trip
  const newTrip = new this.databaseService.repositories.TripModel({
    driverId: driverId,
    vanId: van._id.toString(),
    schoolId: van.schoolId,
    routeId: createTripDto.routeId,

    type: createTripDto.type || undefined,

    tripStart: {
      startTime: now,
      lat: createTripDto.lat,
      long: createTripDto.long,
    },

    status: 'ongoing',

    kids: [],

    locations: (createTripDto.lat && createTripDto.long)
      ? [{
          lat: createTripDto.lat,
          long: createTripDto.long,
          time: now,
        }]
      : [],
  });

  const savedTrip = await newTrip.save();

  return {
    message: "Trip started successfully",
    data: savedTrip.toObject(),
  };
}

async pickStudentsFromSchool(
  driverId: string,
  dto: { tripId: string; kidId: string }
) {

  const driverObjectId = new Types.ObjectId(driverId);

  // 1️⃣ Driver check
  const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
  if (!driver) {
    throw new UnauthorizedException('Driver not found');
  }

  // 2️⃣ Van check
  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
  if (!van) {
    throw new BadRequestException('Van not assigned to this driver');
  }

  if (!van.schoolId) {
    throw new BadRequestException('Van is not associated with any school');
  }

  if (driver.schoolId !== van.schoolId) {
    throw new BadRequestException('Driver and Van school do not match');
  }

  if (van.status !== "active") {
    throw new BadRequestException('Van is not active');
  }

  // 3️⃣ Trip check
  const trip = await this.databaseService.repositories.TripModel.findById(dto.tripId);
  if (!trip) {
    throw new NotFoundException('Trip not found');
  }

  if (trip.vanId !== van._id.toString()) {
    throw new BadRequestException("Van does not belong to this trip");
  }

  if (trip.type !== "drop") {
    throw new BadRequestException("This API is only for drop trips");
  }

  // 4️⃣ Single Kid fetch
  const kid = await this.databaseService.repositories.KidModel.findOne({
    _id: new Types.ObjectId(dto.kidId),
    status: "active"
  });

  if (!kid) {
    throw new BadRequestException("Kid not found or inactive");
  }

  // 5️⃣ Add kid in trip
  const kidEntry = {
    kidId: kid._id.toString(),
    time: new Date(),
    status: 'picked' as const
  };

  trip.kids.push(kidEntry);

  await trip.save();

  // 6️⃣ Notification
  if (kid.parentId) {

    const parent = await this.databaseService.repositories.parentModel.findOne({
      _id: kid.parentId,
      isDelete: false,
    });

    const title = "Kid Picked from School";
    const message = `${kid.fullname} has been picked from school.`;

    // 🔔 Push Notification
    if (parent?.fcmToken && parent.notificationToggle === true) {
      await this.firebaseAdminService.sendToDevice(
        parent.fcmToken,
        {
          notification: {
            title,
            body: message,
          },
          data: {
            kidId: kid._id.toString(),
            status: 'picked_from_school',
            time: new Date().toISOString(),
          }
        }
      );
    }

    // 💾 Save Notification
    await this.databaseService.repositories.notificationModel.create({
      type: "driver",
      schoolId: van.schoolId,
      infoType: "Information",
      parentId: kid.parentId.toString(),
      VanId: van._id.toString(),
      title: title,
      message: message,
      actionType: "PICKED_FROM_SCHOOL",
      status: "sent",
      date: new Date(),
    });
  }

  return {
    message: "Kid picked from school & added to trip",
    data: trip
  };
}

async endTripForDrop(driverId, dto: EndTripDto) {
  const { tripId, lat, long, time } = dto;
  const driverObjectId = new Types.ObjectId(driverId);

  // 1️⃣ Driver check
  const driver = await this.databaseService.repositories.driverModel.findById(driverObjectId);
  if (!driver) throw new UnauthorizedException('Driver not found');

  // 2️⃣ Van check
  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driverObjectId });
  if (!van) throw new BadRequestException('Van not assigned to this driver');

  if (!van.schoolId) {
    throw new BadRequestException('Van is not associated with any school');
  }

  if (driver.schoolId !== van.schoolId) {
    throw new BadRequestException('Driver and Van school do not match');
  }

  // 3️⃣ Trip check
  const trip = await this.databaseService.repositories.TripModel.findById(tripId);
  if (!trip) throw new NotFoundException('Trip not found');

  if (trip.vanId !== van._id.toString()) {
    throw new BadRequestException("Van does not belong to this trip");
  }

  // ✅ Only DROP trip allowed
  if (trip.type !== "drop") {
    throw new BadRequestException("This API is only for drop trips");
  }

  // ✅ Already ended check
  if (trip.status === "end") {
    throw new BadRequestException("Trip already ended");
  }

  // ❌ NO kids update

  // 4️⃣ End trip only
  trip.status = 'end';
  trip.tripEnd = {
    endTime: time ? new Date(time) : new Date(),
    lat,
    long,
  };

  await trip.save();

  return {
    message: "Drop trip ended successfully",
    data: trip,
  };
}



async getLocationByDriver( dto: getLocationDto) {
  const { tripId,  } = dto;






  const trip = await this.databaseService.repositories.TripModel.findById(tripId);
  if (!trip) {
    throw new NotFoundException('Trip not found');
  }
  


// ✅ Sirf required fields return karo
  return {
    data: {
      type: trip.type,
      status: trip.status,
      locations: trip.locations,
    },
  };
}



async getTripsByAdmin(
  AdminId: string,
  page: number = 1,
  limit: number = 10,
  status?: string,
  userType?: string,
  driverId?: string,
  schoolId?: string,
  date?: string
) {
  const skip = (page - 1) * limit;
  const matchCondition: any = {};

  // ==============================
  // USER TYPE LOGIC
  // ==============================
  if (userType === "admin") {
    const school = await this.databaseService.repositories.SchoolModel.findOne({
      admin: new Types.ObjectId(AdminId),
    }).lean();

    if (!school) {
      throw new UnauthorizedException("School not found");
    }

    matchCondition.schoolId = school._id.toString();
  } else if (userType === "superadmin") {
    if (schoolId) matchCondition.schoolId = schoolId;
  } else {
    throw new UnauthorizedException("Invalid user type");
  }

  // ==============================
  // STATUS FILTER
  // ==============================
  if (status) {
    matchCondition.status = status;
  }

  // ==============================
  // DATE FILTER (updatedAt day range)
  // ==============================
  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    matchCondition.updatedAt = { $gte: startOfDay, $lte: endOfDay };
  }

  // ==============================
  // DRIVER → VAN (SINGLE VAN)
  // ==============================
  if (driverId) {
    const van = await this.databaseService.repositories.VanModel.findOne(
      { driverId: new Types.ObjectId(driverId) },
      { _id: 1 }
    ).lean();

    if (!van) {
      return {
        message: "Trips fetched successfully",
        data: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      };
    }

    matchCondition.vanId = van._id.toString();
  }

  // ==============================
  // AGGREGATION PIPELINE (NO KIDS LOOKUP)
  // ==============================
  const pipeline: any[] = [
    { $match: matchCondition },

    // VAN LOOKUP
    {
      $lookup: {
        from: "vans",
        let: { vanObjId: { $toObjectId: "$vanId" } },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$vanObjId"] } } }],
        as: "van",
      },
    },
    { $unwind: { path: "$van", preserveNullAndEmptyArrays: true } },

    // DRIVER LOOKUP
    {
      $lookup: {
        from: "drivers",
        localField: "van.driverId",
        foreignField: "_id",
        as: "driver",
      },
    },
    { $unwind: { path: "$driver", preserveNullAndEmptyArrays: true } },

    // ROUTE LOOKUP
    {
      $lookup: {
        from: "routes",
        let: { routeObjId: { $toObjectId: "$routeId" } },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$routeObjId"] } } }],
        as: "route",
      },
    },
    { $unwind: { path: "$route", preserveNullAndEmptyArrays: true } },

    // SCHOOL LOOKUP
    {
      $lookup: {
        from: "schools",
        let: { schoolObjId: { $toObjectId: "$schoolId" } },
        pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$schoolObjId"] } } }],
        as: "school",
      },
    },
    { $unwind: { path: "$school", preserveNullAndEmptyArrays: true } },

    // FINAL FIELDS
    {
      $project: {
        _id: 1,
        status: 1,
        type: 1,
        tripStart: 1,
        tripEnd: 1,
        kids: 1, // keep original kids array (objects)
        locations: 1,
        updatedAt: 1,

        van: {
          _id: "$van._id",
          carNumber: "$van.carNumber",
          vehicleType: "$van.vehicleType",
        },

        driver: {
          _id: "$driver._id",
          fullname: "$driver.fullname",
          phoneNo: "$driver.phoneNo",
        },

        route: {
          _id: "$route._id",
          title: "$route.title",
          tripType: "$route.tripType",
        },

        schoolName: "$school.schoolName",
        contactNumber: "$school.contactNumber",
      },
    },

    { $sort: { updatedAt: -1 } },
    { $skip: skip },
    { $limit: limit },
  ];

  // ==============================
  // EXECUTE
  // ==============================
  const trips = await this.databaseService.repositories.TripModel.aggregate(pipeline);

  const total = await this.databaseService.repositories.TripModel.countDocuments(matchCondition);

  // ==============================
  // KIDS ENRICHMENT (MAP APPROACH)
  // kids: [{ kidId: "string", lat,long,time,status }]
  // ==============================
  const allKidIds: string[] = trips.flatMap((t: any) =>
    Array.isArray(t.kids) ? t.kids.map((k: any) => k?.kidId).filter(Boolean) : []
  );

  const uniqueKidIds = [...new Set(allKidIds)]
    .filter((id) => Types.ObjectId.isValid(id)); // safe check

  // If no kids, return as-is
  if (uniqueKidIds.length === 0) {
    return {
      message: "Trips fetched successfully",
      data: trips,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Fetch kids details once
  const kidsDetails = await this.databaseService.repositories.KidModel.find(
    { _id: { $in: uniqueKidIds.map((id) => new Types.ObjectId(id)) } },
    { fullname: 1, image: 1 }
  ).lean();

  const kidMap = new Map<string, any>(
    kidsDetails.map((k: any) => [k._id.toString(), k])
  );

  // Merge into trips.kids
  const updatedTrips = trips.map((trip: any) => ({
    ...trip,
    kids: Array.isArray(trip.kids)
      ? trip.kids.map((k: any) => {
          const kd = k?.kidId ? kidMap.get(k.kidId) : null;
          return {
            ...k,
            fullname: kd?.fullname ?? null,
            image: kd?.image ?? null,
          };
        })
      : [],
  }));

  return {
    message: "Trips fetched successfully",
    data: updatedTrips,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async generateGraphData(
  AdminId: string,
  adminType: "admin" | "superadmin",
  filterType: "weekly" | "monthly" | "yearly"
) {
  const adminObjectId = new Types.ObjectId(AdminId);

  // 1) Resolve time window + labels
  let start: moment.Moment;
  let end: moment.Moment;
  let labels: string[] = [];

  if (filterType === "weekly") {
    start = moment().tz(TZ).startOf("isoWeek");
    end = moment().tz(TZ).endOf("isoWeek");
    labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  } else if (filterType === "monthly") {
    start = moment().tz(TZ).startOf("month");
    end = moment().tz(TZ).endOf("month");
    const dim = start.daysInMonth();
    labels = Array.from({ length: dim }, (_, i) => String(i + 1).padStart(2, "0"));
  } else if (filterType === "yearly") {
    start = moment().tz(TZ).startOf("year");
    end = moment().tz(TZ).endOf("year");
    labels = moment.monthsShort();
  } else {
    throw new Error("Invalid filterType");
  }

  // 2) Base match for graph
  const match: any = {
    createdAt: { $gte: start.toDate(), $lte: end.toDate() },
  };

  // SchoolId store karne ke liye
  let schoolIdString: string | null = null;

  // Agar admin hai → uska school nikaalna
  if (adminType === "admin") {
    const school = await this.databaseService.repositories.SchoolModel
      .findOne({ admin: adminObjectId })
      .lean();

    if (!school) throw new UnauthorizedException("School not found");

    schoolIdString = String(school._id ?? school.id);
    match.schoolId = schoolIdString;
  }

  // 3) Group key per filter
  let groupId: any;
  if (filterType === "weekly") {
    groupId = { $isoDayOfWeek: { date: "$createdAt", timezone: TZ } }; // 1..7
  } else if (filterType === "monthly") {
    groupId = { $dateToString: { format: "%d", date: "$createdAt", timezone: TZ } };
  } else {
    groupId = { $dateToString: { format: "%m", date: "$createdAt", timezone: TZ } };
  }

  const TripModel = this.databaseService.repositories.TripModel;

  const rows: Array<{ _id: any; count: number }> = await TripModel.aggregate([
    { $match: match },
    { $group: { _id: groupId, count: { $sum: 1 } } },
  ]);

  // 4) Zero-filled map
  const map: Record<string, number> = {};
  for (const l of labels) map[l] = 0;

  // 5) Fill counts into map
  for (const r of rows) {
    if (filterType === "weekly") {
      const idx = (Number(r._id) || 1) - 1;
      const label = labels[idx];
      if (label) map[label] = r.count;
    } else if (filterType === "monthly") {
      const label = String(r._id);
      if (label in map) map[label] = r.count;
    } else {
      const monthNum = Number(r._id);
      const label = moment().month(monthNum - 1).format("MMM");
      if (label in map) map[label] = r.count;
    }
  }

  // 6) Graph data array
  const graphData = labels.map((label) => ({
    name: label,
    count: map[label] || 0,
  }));

  // --------------- EXTRA COUNTS ---------------
  const VanModel = this.databaseService.repositories.VanModel;
  const KidModel = this.databaseService.repositories.KidModel; // adjust if plural
  // TripModel already available

  // Base filter for admin (for superadmin → no filter)
  const baseCountFilter: any = {};
  if (adminType === "admin" && schoolIdString) {
    baseCountFilter.schoolId = schoolIdString;
  }

  // Parallel counts
  const [vansCount, tripsCount, kidsCount] = await Promise.all([
    VanModel.countDocuments(adminType === "admin" ? baseCountFilter : {}),
    TripModel.countDocuments(adminType === "admin" ? baseCountFilter : {}),
    KidModel.countDocuments(adminType === "admin" ? baseCountFilter : {}),
  ]);

  const driversCount = vansCount; // drivers = vans count

  // --------------- Final response ---------------
  const data = {
    graph: graphData,
    counts: {
      vans: vansCount,
      drivers: driversCount,
      trips: tripsCount,
      kids: kidsCount,
    },
  };

  return { data };
}





  async getTripsByDriver(driverId: string) {
    try {
      const { Types } = require('mongoose');
      const driverObjectId = new Types.ObjectId(driverId);
      const van = await this.databaseService.repositories.VanModel.findOne({
        driverId: driverObjectId
      }).lean();

      if (!van) {
        return { message: 'No van assigned', data: [] };
      }

      const trips = await this.databaseService.repositories.TripModel.find({
        vanId: van._id.toString()
      }).sort({ createdAt: -1 }).lean();

      return { message: 'Trips fetched', data: trips };
    } catch (e) {
      return { message: 'Error fetching trips', data: [] };
    }
  }
  // ─── ETA Engine ────────────────────────────────────────────────────────────

  async getETA(tripId: string, driverLat: number, driverLng: number) {
    const trip = await this.databaseService.repositories.TripModel.findById(tripId);
    if (!trip) throw new Error('Trip not found');

    const route = await this.databaseService.repositories.routeModel.findById(trip.routeId);
    if (!route) throw new Error('Route not found');

    const school = await this.databaseService.repositories.SchoolModel.findById(trip.schoolId);

    const destinations: { name: string; lat: number; lng: number }[] = [];

    if (trip.type === 'pick') {
      // ETA to school
      if (school?.lat && school?.long) {
        destinations.push({
          name: school.schoolName || 'School',
          lat: school.lat,
          lng: school.long,
        });
      }
    } else {
      // ETA to each pending kid home
      const pendingKids = trip.kids.filter(k => k.status !== 'dropped');
      if (route.kidLocations?.length) {
        for (const kl of route.kidLocations) {
          const isPending = pendingKids.some(k => k.kidId === kl.kidId.toString());
          if (isPending) {
            const kid = await this.databaseService.repositories.KidModel.findById(kl.kidId);
            destinations.push({
              name: kid?.fullname || 'Student',
              lat: kl.lat,
              lng: kl.long,
            });
          }
        }
      }
    }

    const etaResults = await this.etaService.calculateETA(driverLat, driverLng, destinations);

    return {
      message: 'ETA calculated successfully',
      tripId,
      tripType: trip.type,
      driverLocation: { lat: driverLat, lng: driverLng },
      eta: etaResults,
    };
  }

  async updateLocationAndBroadcastETA(
    driverId: string,
    tripId: string,
    lat: number,
    lng: number,
  ) {
    // 1. Save location to trip
    const trip = await this.databaseService.repositories.TripModel.findById(tripId);
    if (!trip) throw new Error('Trip not found');

    trip.locations.push({ lat, long: lng, time: new Date() });

    // 2. Get previous geofence state from trip (stored as custom field)
    const prevInsideZones: string[] = trip.insideZoneIds || [];

    // 3. Build zones list
    const zones: GeofenceZone[] = [];
    const school = await this.databaseService.repositories.SchoolModel.findById(trip.schoolId);
    if (school?.lat && school?.long) {
      zones.push({
        id: 'school_' + school._id.toString(),
        name: school.schoolName || 'School',
        lat: school.lat,
        lng: school.long,
        radiusMeters: 150,
        type: 'school',
      });
    }

    // Home zones for pending kids
    const route = await this.databaseService.repositories.routeModel.findById(trip.routeId);
    const pendingKids = trip.kids.filter(k => k.status !== 'dropped');

    if (route?.kidLocations?.length) {
      for (const kl of route.kidLocations) {
        const isPending = pendingKids.some(k => k.kidId === kl.kidId.toString());
        if (!isPending) continue;

        const kid = await this.databaseService.repositories.KidModel.findById(kl.kidId);
        if (!kid?.parentId) continue;

        const parent = await this.databaseService.repositories.parentModel.findOne({
          _id: kid.parentId, isDelete: false,
        });

        zones.push({
          id: 'home_' + kl.kidId.toString(),
          name: kid.fullname || 'Student Home',
          lat: kl.lat,
          lng: kl.long,
          radiusMeters: 100,
          type: 'home',
          kidId: kl.kidId.toString(),
          parentId: kid.parentId.toString(),
          parentFcmToken: parent?.fcmToken || undefined,
        });
      }
    }

    // 4. Check geofence zones
    const { events, nowInsideZoneIds } = this.geofenceService.checkZones(
      lat, lng, zones, prevInsideZones,
    );

    // 5. Save current zone state
    trip.insideZoneIds = nowInsideZoneIds;
    await trip.save();

    // 6. Process geofence events — send FCM + save notifications
    for (const evt of events) {
      let title = '';
      let body = '';
      let actionType = '';

      if (evt.zoneType === 'school' && evt.event === 'entered') {
        title = 'Van reached school';
        body = 'The van has arrived at school.';
        actionType = 'GEOFENCE_SCHOOL_ENTERED';
      } else if (evt.zoneType === 'school' && evt.event === 'exited') {
        title = 'Van left school';
        body = 'The van has departed from school.';
        actionType = 'GEOFENCE_SCHOOL_EXITED';
      } else if (evt.zoneType === 'home' && evt.event === 'entered') {
        title = 'Van is nearby!';
        body = evt.zoneName + ' — van is arriving at your location.';
        actionType = 'GEOFENCE_HOME_ENTERED';
      } else if (evt.zoneType === 'home' && evt.event === 'exited') {
        title = 'Van has left your area';
        body = 'The van has moved away from your location.';
        actionType = 'GEOFENCE_HOME_EXITED';
      }

      // Send FCM to parent
      if (evt.parentFcmToken) {
        try {
          await this.firebaseAdminService.sendToDevice(evt.parentFcmToken, {
            notification: { title, body },
            data: {
              tripId,
              type: actionType,
              zoneId: evt.zoneId,
              zoneName: evt.zoneName,
              kidId: evt.kidId || '',
              driverLat: String(lat),
              driverLng: String(lng),
            },
          });
        } catch (e) {
          console.error('Geofence FCM error:', e.message);
        }
      } else if (evt.zoneType === 'school') {
        // School event — notify ALL parents of kids in this trip
        for (const kidEntry of pendingKids) {
          const kid = await this.databaseService.repositories.KidModel.findById(kidEntry.kidId);
          if (!kid?.parentId) continue;
          const parent = await this.databaseService.repositories.parentModel.findOne({
            _id: kid.parentId, isDelete: false,
          });
          if (!parent?.fcmToken || parent.notificationToggle !== true) continue;
          try {
            await this.firebaseAdminService.sendToDevice(parent.fcmToken, {
              notification: { title, body },
              data: { tripId, type: actionType, driverLat: String(lat), driverLng: String(lng) },
            });
          } catch (e) {
            console.error('School geofence FCM error:', e.message);
          }
          // Save notification per parent
          await this.databaseService.repositories.notificationModel.create({
            type: 'driver',
            infoType: 'Geofence',
            parentId: kid.parentId.toString(),
            schoolId: trip.schoolId,
            VanId: trip.vanId,
            title,
            message: body,
            actionType,
            status: 'sent',
            date: new Date(),
          });
        }
      }

      // Save notification for home zone events
      if (evt.zoneType === 'home' && evt.parentId) {
        await this.databaseService.repositories.notificationModel.create({
          type: 'driver',
          infoType: 'Geofence',
          parentId: evt.parentId,
          schoolId: trip.schoolId,
          VanId: trip.vanId,
          title,
          message: body,
          actionType,
          status: 'sent',
          date: new Date(),
        });
      }
    }

    // 7. Calculate ETA
    const etaData = await this.getETA(tripId, lat, lng);

    // 8. ETA FCM to pending kids parents
    for (const kidEntry of pendingKids) {
      const kid = await this.databaseService.repositories.KidModel.findById(kidEntry.kidId);
      if (!kid?.parentId) continue;
      const parent = await this.databaseService.repositories.parentModel.findOne({
        _id: kid.parentId, isDelete: false,
      });
      if (!parent?.fcmToken || parent.notificationToggle !== true) continue;
      const firstEta = etaData.eta[0];
      if (!firstEta || firstEta.durationSeconds === 0) continue;
      const etaMins = Math.round(firstEta.durationSeconds / 60);
      try {
        await this.firebaseAdminService.sendToDevice(parent.fcmToken, {
          notification: {
            title: 'Van is on the way',
            body: etaMins <= 1
              ? 'Van is arriving now!'
              : 'Van arriving in ' + etaMins + ' mins (' + firstEta.etaTime + ')',
          },
          data: {
            tripId,
            type: 'ETA_UPDATE',
            etaMinutes: String(etaMins),
            etaTime: firstEta.etaTime,
            driverLat: String(lat),
            driverLng: String(lng),
          },
        });
      } catch (e) {
        console.error('ETA FCM error:', e.message);
      }
    }

    return {
      message: 'Location updated, geofence checked, ETA broadcast',
      location: { lat, lng },
      geofenceEvents: events.map(e => ({
        zone: e.zoneName,
        type: e.zoneType,
        event: e.event,
        distanceMeters: e.distanceMeters,
      })),
      eta: etaData.eta,
    };
  }



  // ─── Digital Attendance ─────────────────────────────────────────────────

  async getDailyAttendance(
    adminId: string,
    adminRole: string,
    date?: string,
    vanId?: string,
    schoolId?: string,
  ) {
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Resolve schoolId
    let resolvedSchoolId = schoolId;
    if (adminRole === 'admin') {
      const school = await this.databaseService.repositories.SchoolModel.findOne({
        admin: new Types.ObjectId(adminId),
      }).lean();
      if (!school) throw new Error('School not found');
      resolvedSchoolId = school._id.toString();
    }

    const matchCondition: any = {
      createdAt: { $gte: startOfDay, $lte: endOfDay },
      status: 'end',
    };
    if (resolvedSchoolId) matchCondition.schoolId = resolvedSchoolId;
    if (vanId) matchCondition.vanId = vanId;

    const trips = await this.databaseService.repositories.TripModel
      .find(matchCondition)
      .lean();

    if (!trips.length) {
      return {
        message: 'Attendance report generated',
        date: targetDate.toISOString().split('T')[0],
        totalStudents: 0,
        present: 0,
        absent: 0,
        records: [],
      };
    }

    // Collect all kidIds from all trips
    const allKidEntries: any[] = [];
    for (const trip of trips) {
      for (const k of trip.kids || []) {
        allKidEntries.push({
          kidId: k.kidId,
          status: k.status,
          time: k.time,
          lat: k.lat,
          long: k.long,
          tripId: trip._id.toString(),
          tripType: trip.type,
          vanId: trip.vanId,
          schoolId: trip.schoolId,
          tripStart: trip.tripStart?.startTime,
          tripEnd: trip.tripEnd?.endTime,
        });
      }
    }

    // Get unique kidIds
    const uniqueKidIds = [...new Set(allKidEntries.map(e => e.kidId))];

    // Fetch kid details
    const kids = await this.databaseService.repositories.KidModel.find({
      _id: { $in: uniqueKidIds.map(id => new Types.ObjectId(id)) },
    }).lean();

    const kidMap = new Map(kids.map((k: any) => [k._id.toString(), k]));

    // Fetch van details
    const vanIds = [...new Set(trips.map(t => t.vanId))];
    const vans = await this.databaseService.repositories.VanModel.find({
      _id: { $in: vanIds.map(id => new Types.ObjectId(id)) },
    }).lean();
    const vanMap = new Map(vans.map((v: any) => [v._id.toString(), v]));

    // Build attendance records per kid
    const records = uniqueKidIds.map(kidId => {
      const kid: any = kidMap.get(kidId);
      const entries = allKidEntries.filter(e => e.kidId === kidId);
      const pickEntry = entries.find(e => e.tripType === 'pick');
      const dropEntry = entries.find(e => e.tripType === 'drop');
      const van: any = vanMap.get(entries[0]?.vanId);

      // Determine attendance status
      let attendanceStatus = 'present';
      let remarks = '';

      if (!pickEntry && !dropEntry) {
        attendanceStatus = 'absent';
        remarks = 'No trip record found';
      } else if (pickEntry?.status === 'picked' || dropEntry?.status === 'dropped') {
        attendanceStatus = 'present';
        // Check if late — picked more than 15 mins after trip start
        if (pickEntry?.time && pickEntry?.tripStart) {
          const pickTime = new Date(pickEntry.time).getTime();
          const startTime = new Date(pickEntry.tripStart).getTime();
          const diffMins = (pickTime - startTime) / 60000;
          if (diffMins > 15) {
            attendanceStatus = 'late';
            remarks = 'Picked ' + Math.round(diffMins) + ' mins after trip start';
          }
        }
      }

      return {
        kidId,
        fullname: kid?.fullname || 'Unknown',
        image: kid?.image || null,
        schoolId: entries[0]?.schoolId,
        vanNumber: van?.carNumber || 'N/A',
        attendanceStatus,
        remarks,
        pickupTime: pickEntry?.time || null,
        pickupLat: pickEntry?.lat || null,
        pickupLng: pickEntry?.long || null,
        dropTime: dropEntry?.time || null,
        dropLat: dropEntry?.lat || null,
        dropLng: dropEntry?.long || null,
        tripId: entries[0]?.tripId,
      };
    });

    const present = records.filter(r => r.attendanceStatus === 'present').length;
    const late = records.filter(r => r.attendanceStatus === 'late').length;
    const absent = records.filter(r => r.attendanceStatus === 'absent').length;

    return {
      message: 'Attendance report generated',
      date: targetDate.toISOString().split('T')[0],
      totalStudents: records.length,
      present,
      late,
      absent,
      presentRate: records.length > 0
        ? Math.round(((present + late) / records.length) * 100)
        : 0,
      records,
    };
  }

  async getStudentAttendanceHistory(
    kidId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const kid: any = await this.databaseService.repositories.KidModel.findById(kidId).lean();
    if (!kid) throw new Error('Student not found');

    const trips = await this.databaseService.repositories.TripModel.find({
      'kids.kidId': kidId,
      status: 'end',
      createdAt: { $gte: start, $lte: end },
    }).lean();

    // Group by date
    const byDate: Record<string, any> = {};

    for (const trip of trips) {
      const dateKey = new Date((trip as any).createdAt).toISOString().split('T')[0];
      if (!byDate[dateKey]) byDate[dateKey] = { date: dateKey, trips: [] };

      const kidEntry = (trip.kids || []).find((k: any) => k.kidId === kidId);
      if (kidEntry) {
        byDate[dateKey].trips.push({
          tripId: trip._id.toString(),
          tripType: trip.type,
          status: kidEntry.status,
          time: kidEntry.time,
          vanId: trip.vanId,
        });
      }
    }

    const history = Object.values(byDate).map((day: any) => {
      const hasPick = day.trips.some((t: any) => t.tripType === 'pick' && (t.status === 'picked' || t.status === 'dropped'));
      const hasDrop = day.trips.some((t: any) => t.tripType === 'drop' && t.status === 'dropped');
      return {
        date: day.date,
        attendanceStatus: hasPick || hasDrop ? 'present' : 'absent',
        trips: day.trips,
      };
    }).sort((a: any, b: any) => b.date.localeCompare(a.date));

    const totalDays = history.length;
    const presentDays = history.filter((h: any) => h.attendanceStatus === 'present').length;

    return {
      message: 'Student attendance history',
      kid: {
        id: kidId,
        fullname: kid.fullname,
        image: kid.image,
      },
      period: {
        from: start.toISOString().split('T')[0],
        to: end.toISOString().split('T')[0],
      },
      summary: {
        totalDays,
        presentDays,
        absentDays: totalDays - presentDays,
        attendanceRate: totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0,
      },
      history,
    };
  }


}