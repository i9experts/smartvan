/* eslint-disable prettier/prettier */
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DatabaseService } from 'src/database/databaseservice';
import { Types } from 'mongoose';
import { CreateRouteDto } from './dto/createRoutedto';
import { Trip } from 'src/database/schema';


@Injectable()
export class RouteService {
  constructor(
  private databaseService: DatabaseService,
  ) {}

  async createRoute(dto: CreateRouteDto, adminId: string) {
    console.log(adminId)
    
   const adminObjectId = new Types.ObjectId(adminId);
   console.log(adminObjectId)

  // Step 1: find school
  const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
  if (!school) {
    throw new UnauthorizedException("School not found");
  }

   
    const schoolIdString = school._id.toString();

      if (dto.vanId) {

    const existingRoute =
      await this.databaseService.repositories.routeModel.findOne({
        vanId: dto.vanId,
        schoolId: schoolIdString,
        tripType: dto.tripType,
      });

    if (existingRoute) {
     throw new BadRequestException(`This van is already assigned for this ${dto.tripType} route`);
    }
  }
  


    const newRoute = await this.databaseService.repositories.routeModel.create({
      ...dto,
      schoolId: schoolIdString,
    });
   return {
      success: true,
      message: "Route created successfully",
      data: newRoute
  };

  }

  async deleteRouteByAdmin(adminId: string, routeId: string) {

  const adminObjectId = new Types.ObjectId(adminId);

  // Step 1: find school by admin
  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException('School not found');
  }

  // Step 2: direct delete route
  const deletedRoute =
    await this.databaseService.repositories.routeModel.findOneAndDelete({
      _id: new Types.ObjectId(routeId),
      schoolId: school._id.toString(),
    });

  if (!deletedRoute) {
    throw new BadRequestException('Route not found');
  }

  return {
    success: true,
    message: 'Route deleted successfully',
  };
}

//   async getAssignedTripByDriver(driverId: string) {
//   if (!driverId) {
//     throw new UnauthorizedException('Invalid driver token');
//   }

//   // Step 1: Driver find karo (sirf name lo)
//   const driver = await this.databaseService.repositories.driverModel.findById(
//     new Types.ObjectId(driverId),
//     { fullname: 1 }
//   );

//   if (!driver) {
//     throw new BadRequestException('Driver not found');
//   }

//   // Step 2: Van find karo driverId se
//   const van = await this.databaseService.repositories.VanModel.findOne({
//     driverId: new Types.ObjectId(driverId),
//   },
//    { assignRoute: 1 , carNumber: 1  }
// );

//   if (!van) {
//     throw new BadRequestException('Van not found for this driver');
//   }

//   // Step 3: Route find karo based on vanId (string comparison)
//   const route = await this.databaseService.repositories.routeModel.findOne({
//     vanId: van._id.toString(),
//   });

//   if (!route) {
//     throw new BadRequestException('No route assigned to this van');
//   }

//   // ✅ Step 3.1: Check if today is active trip day (Pakistan timezone)
// const today = new Date().toLocaleString('en-US', { 
//   weekday: 'long', 
//   timeZone: 'Asia/Karachi'   // Pakistan timezone set kiya
// }).toLowerCase();  
// // e.g. 'monday', 'tuesday', etc.

// if (!route.tripDays?.[today]) {
//   // agar aaj ka din tripDays me false ya undefined hai
//   return {
//     message: 'No active trip today',
//     data: null,
//   };
// }


//   // Step 4: School find karo (schoolId route me string hai)
//   const school = await this.databaseService.repositories.SchoolModel.findById(
//     new Types.ObjectId(route.schoolId),
//     {  contactNumber: 1 }
//   );

//   if (!school) {
//     throw new BadRequestException('school not found');
//   }
//   // Step 5: Kids count nikaalo (van._id se)
//   const totalKids = await this.databaseService.repositories.KidModel.countDocuments({
//     VanId: van._id,
//   });

//   // Step 6: Response ready karo
//   return {
//     message: 'Assigned trip fetched successfully',
//     data: {
//       driverName: driver.fullname,
//       vehicleType: van.vehicleType,
//       vehicleNumber: van.carNumber,
//       routeId: route._id,
//       routeTitle: route.title,
//       tripType: route.tripType,
//       startTime: route.startTime,
      
//       schoolContact: school?.contactNumber || null,
//       totalKids,
//     },
//   };
// }




async getAssignedTripByDriver(driverId: string) {
  if (!driverId) {
    throw new UnauthorizedException('Invalid driver token');
  }


  const driver = await this.databaseService.repositories.driverModel.findById(
    new Types.ObjectId(driverId),
  );
  if (!driver) {
    throw new BadRequestException('Driver not found');
  }

  if (driver.isDelete === true) {
    throw new BadRequestException('Driver account is deleted');
  }

  if (driver.status !== 'active') {
    throw new BadRequestException('Driver account is not active');
  }

  // Step 2: Van find karo driverId se
  const van = await this.databaseService.repositories.VanModel.findOne(
    { driverId: new Types.ObjectId(driverId) },
    { assignRoute: 1, carNumber: 1, vehicleType: 1, status: 1 }
  );
  if (!van) {
    throw new BadRequestException('Van not found for this driver');
  }





  console.log(van._id)
  // Step 3: Routes find karo
  const routes = await this.databaseService.repositories.routeModel.find({
    vanId: van._id.toString(),
  });
  if (!routes || routes.length === 0) {
    throw new BadRequestException('No routes assigned to this van');
  }

  console.log(routes)

  // ✅ Step 4: Today info (Pakistan timezone)
  const today = new Date().toLocaleString('en-US', {
    weekday: 'long',
    timeZone: process.env.DEFAULT_TIMEZONE || 'Asia/Karachi',
  }).toLowerCase();

  const todayDate = new Date().toLocaleDateString('en-CA', {
    timeZone: process.env.DEFAULT_TIMEZONE || 'Asia/Karachi',
  }); // e.g. 2025-11-14

  // ✅ Step 5: Active routes for today
  const activeRoutes = routes.filter(route => route.tripDays?.[today]);
  if (activeRoutes.length === 0) {
    return { message: 'No active trip today', data: null };
  }

  // ✅ Step 6: School find karo
  const school = await this.databaseService.repositories.SchoolModel.findById(
    new Types.ObjectId(activeRoutes[0].schoolId),
    { contactNumber: 1 }
  );
  if (!school) {
    throw new BadRequestException('School not found');
  }

  // ✅ Step 7: Kids count
  const totalKids = await this.databaseService.repositories.KidModel.countDocuments({
    VanId: van._id,
  });

  // ✅ Step 8: Response ready karo
  const routeData = [];

  for (const route of activeRoutes) {
    // Step 8.1: CreatedAt se aaj ki date match karni
    const startOfDay = new Date(todayDate + 'T00:00:00+05:00'); // start of today (PKT)
    const endOfDay = new Date(todayDate + 'T23:59:59+05:00');   // end of today

    const existingTrip = await this.databaseService.repositories.TripModel.findOne({
      routeId: route._id.toString(),
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    });

    console.log("wali",existingTrip)

    const routeInfo = {
      driverName: driver.fullname,
      vehicleType: van.vehicleType,
      vehicleNumber: van.carNumber,
      scheduleDate: todayDate,
      routeId: route._id,
      tripStatus: existingTrip?.status || "start",
      TripStarted: !!existingTrip,
      routeTitle: route.title,
      tripType: route.tripType,
      startTime: route.startTime,
      schoolContact: school?.contactNumber || null,
      totalKids,
    };

    // agar trip mili to details do
    if (existingTrip) {
      routeData.push({
        ...routeInfo,
        tripDetails: existingTrip,
      });
    } else {
      // agar trip nahi mili to null
      routeData.push({
        ...routeInfo,
        tripDetails: null,
      });
    }
  }

  // ✅ Final response
  return {
    message: 'Assigned trips fetched successfully',
    data: routeData,
  };
}


async getAllRoutesByAdmin(adminId: string, query: any) {
  const adminObjectId = new Types.ObjectId(adminId);

  // 🔹 Pagination
  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const limit = Math.max(1, parseInt(query.limit as string, 10) || 10);
  const skip = (page - 1) * limit;

  // 🔹 Optional driverName filter
  const driverName =
    typeof query.driverName === "string" ? query.driverName.trim() : "";

  // 🔹 Step 1: Find school
  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException("School not found");
  }

  const schoolIdString = school._id.toString();

  // 🔹 Base pipeline (same as before)
  const basePipeline: any[] = [
    { $match: { schoolId: schoolIdString } },

    {
      $lookup: {
        from: "vans",
        let: { vanIdObj: { $toObjectId: "$vanId" } },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$vanIdObj"],
              },
            },
          },
          { $project: { _id: 1, carNumber: 1, driverId: 1 } },
        ],
        as: "vanDetails",
      },
    },
    {
      $unwind: {
        path: "$vanDetails",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $lookup: {
        from: "drivers",
        let: { drvId: "$vanDetails.driverId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$drvId"],
              },
            },
          },
          { $project: { _id: 1, fullname: 1 } },
        ],
        as: "driverDetails",
      },
    },
    {
      $unwind: {
        path: "$driverDetails",
        preserveNullAndEmptyArrays: true,
      },
    },
  ];

  // 🔹 Driver name filter
  if (driverName) {
    basePipeline.push({
      $match: {
        "driverDetails.fullname": {
          $regex: driverName,
          $options: "i",
        },
      },
    });
  }

  // 🔥 DATA PIPELINE (UPDATED WITH GROUPING)
  const dataPipeline: any[] = [
    ...basePipeline,

    {
      $project: {
        _id: 1,
        title: 1,
        tripType: 1,
        startTime: 1,
        startPoint: 1,
        endPoint: 1,
        tripDays: 1,
        vanId: 1,
        "vanDetails._id": 1,
        "vanDetails.carNumber": 1,
        "driverDetails._id": 1,
        "driverDetails.fullname": 1,
        createdAt: 1,
      },
    },

    // 🔥 GROUP BY van + driver
    {
      $group: {
        _id: {
          vanId: "$vanDetails._id",
          driverId: "$driverDetails._id",
        },

        vanDetails: { $first: "$vanDetails" },
        driverDetails: { $first: "$driverDetails" },

        routes: {
          $push: {
            id: { $toString: "$_id" },
            title: "$title",
            tripType: "$tripType",
            startTime: "$startTime",
            startPoint: "$startPoint",
            endPoint: "$endPoint",
            tripDays: "$tripDays",
          },
        },

        createdAt: { $first: "$createdAt" },
      },
    },

    // 🔹 Final shape
    {
      $project: {
        _id: 0,

        van: {
          id: { $toString: "$vanDetails._id" },
          carNumber: { $ifNull: ["$vanDetails.carNumber", ""] },
        },

        driver: {
          id: {
            $cond: [
              { $ifNull: ["$driverDetails._id", false] },
              { $toString: "$driverDetails._id" },
              null,
            ],
          },
          fullname: { $ifNull: ["$driverDetails.fullname", ""] },
        },

        routes: 1,
        createdAt: 1,
      },
    },

    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
  ];

  const routes =
    await this.databaseService.repositories.routeModel.aggregate(
      dataPipeline,
    );

  // 🔥 COUNT PIPELINE (UPDATED)
  const countPipeline: any[] = [
    ...basePipeline,

    {
      $group: {
        _id: {
          vanId: "$vanDetails._id",
          driverId: "$driverDetails._id",
        },
      },
    },

    { $count: "total" },
  ];

  const countResult =
    await this.databaseService.repositories.routeModel.aggregate(
      countPipeline,
    );

  const total = countResult[0]?.total || 0;

  return {
    message: "Routes fetched successfully",
    data: routes,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}



async getRouteById(adminId: string, routeId: string) {
  const adminObjectId = new Types.ObjectId(adminId);

  // Step 1: Find school by adminId
  const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
  if (!school) {
    return {
      success: false,
      message: "School not found",
    };
  }

  const schoolIdString = school._id.toString();

  // Step 2: Find route by routeId + schoolId
  const route = await this.databaseService.repositories.routeModel.findOne({
    _id: new Types.ObjectId(routeId),
    schoolId: schoolIdString,
  });

  if (!route) {
    return {
      success: false,
      message: "Route not found",
    };
  }

 
  const van = await this.databaseService.repositories.VanModel.findOne({
    _id: new Types.ObjectId(route.vanId),
  });


  let driver = null;
  if (van?.driverId) {
    driver = await this.databaseService.repositories.driverModel.findById(van.driverId);
  }

  // Step 5: Final combined data
  const finalData = {
    _id: route._id,
    title: route.title,
    tripType: route.tripType,
    startTime: route.startTime,
    startPoint: route.startPoint,
    endPoint: route.endPoint,
    tripDays: route.tripDays,
    vanId: route.vanId,
    carNumber: van ? van.carNumber : null,
    driverName: driver ? driver.fullname : null,
    createdAt: (route as any).createdAt,
     updatedAt: (route as any).updatedAt,
  };

  return {
    success: true,
    message: "Route fetched successfully",
    data: finalData,
  };
}

// async editRoute(adminId: string, routeId: string, dto: CreateRouteDto) {
//   const adminObjectId = new Types.ObjectId(adminId);

//   // Step 1: Find school by adminId
//   const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
//   if (!school) {
//     throw new UnauthorizedException("School not found");
//   }

//   const schoolIdString = school._id.toString();

//   // Step 2: Verify route belongs to this school
//   const existingRoute = await this.databaseService.repositories.routeModel.findOne({
//     _id: new Types.ObjectId(routeId),
//     schoolId: schoolIdString,
//   });

//   if (!existingRoute) {
//     throw new BadRequestException("Route not found for this school");
//   }

//   // Step 3: Update route using DTO fields
//   const updatedRoute = await this.databaseService.repositories.routeModel.findByIdAndUpdate(
//     routeId,
//     { $set: { ...dto } },
//     { new: true } // Return updated document
//   );

//   return {
//     success: true,
//     message: "Route updated successfully",
//     data: updatedRoute,
//   };
// }

async editRoute(adminId: string, routeId: string, dto: CreateRouteDto) {
  const adminObjectId = new Types.ObjectId(adminId);

  // Step 1: Find school by adminId
  const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
  if (!school) {
    throw new UnauthorizedException("School not found");
  }

  const schoolIdString = school._id.toString();

  // Step 2: Verify route belongs to this school
  const existingRoute = await this.databaseService.repositories.routeModel.findOne({
    _id: new Types.ObjectId(routeId),
    schoolId: schoolIdString,
  });
  if (!existingRoute) {
    throw new BadRequestException("Route not found for this school");
  }

  // Step 3: Flatten nested objects to dot-notation
  const updateData: Record<string, any> = {};

  // Normal top-level keys
  const simpleFields = ['schoolId', 'vanId', 'title', 'startTime', 'tripType'];
  for (const key of simpleFields) {
    if (dto[key] !== undefined) updateData[key] = dto[key];
  }

  // Nested: tripDays
  if (dto.tripDays) {
    for (const [day, value] of Object.entries(dto.tripDays)) {
      updateData[`tripDays.${day}`] = value;
    }
  }

  // Nested: startPoint
  if (dto.startPoint) {
    for (const [coord, value] of Object.entries(dto.startPoint)) {
      updateData[`startPoint.${coord}`] = value;
    }
  }

  // Nested: endPoint
  if (dto.endPoint) {
    for (const [coord, value] of Object.entries(dto.endPoint)) {
      updateData[`endPoint.${coord}`] = value;
    }
  }

  // Step 4: Perform partial update safely
  const updatedRoute = await this.databaseService.repositories.routeModel.findByIdAndUpdate(
    routeId,
    { $set: updateData },
    { new: true }
  );

  return {
    success: true,
    message: "Route updated successfully",
    data: updatedRoute,
  };
}



}

