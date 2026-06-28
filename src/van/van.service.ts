/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from "src/database/databaseservice";
import { CreateVanDto } from './dto/create-van.dto';
import { OtpService } from 'src/user/schema/otp/otp.service';
import { FirebaseAdminService } from 'src/notification/firebase-admin.service';
import { EditVanByAdminDto } from './dto/editVanByAdmin.dto';
import { CreateVanByAdminDto } from './dto/createVanByAdmin.dto';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { EditDriverDto } from './dto/editDriver.dto';
import { title } from 'process';
import { Admin } from 'src/admin/admin.schema';
import { Trip } from 'src/database/schema';
import { start } from 'repl';

@Injectable()
export class VanService { 
  constructor(
   
    private databaseService: DatabaseService,
    private  OtpService:  OtpService,
     private firebaseAdminService: FirebaseAdminService
    

   
  ) {}

async addVan(createVanDto: CreateVanDto, userId: string, userType: string) {
  // Step 1: Sirf driver allowed hai
  if (userType !== 'driver') {
    throw new UnauthorizedException('Only drivers can add vans');
  }

  // Step 2: Driver find karo
  const driver = await this.databaseService.repositories.driverModel.findById(userId);
  if (!driver) {
    throw new UnauthorizedException('Driver not found');
  }

  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driver._id }); 
  if (van) {  
    throw new BadRequestException('You already have a van assigned'); 
  }

  // Step 3: DTO se sab fields nikaalo
  const { 
    licenceImageFront, 
    licenceImageBack, 
    vehicleCardImageFront, 
    vehicleCardImageBack, 
    ...vanData 
  } = createVanDto;

  // Step 4: Driver document me direct update karo (sab fields ayengi)
  driver.licenceImageFront = licenceImageFront;
  driver.licenceImageBack = licenceImageBack;
  driver.vehicleCardImageFront = vehicleCardImageFront;
  driver.vehicleCardImageBack = vehicleCardImageBack;

  await driver.save();

  // Step 5: Van create karo
  const newVan = new this.databaseService.repositories.VanModel({
    ...vanData,
    driverId: driver._id,
    ownVan: true,

  });

  const savedVan = await newVan.save();

  // Step 6: Response
  return {
    message: 'Van added and driver documents updated successfully',
    data: {
      van: savedVan,
      driver,
    },
  };
}

async getVans(userId: string, userType: string) {
  // Step 1: Sirf drivers allowed
  if (userType !== 'driver') {
    throw new UnauthorizedException('Only drivers can view their vans');
  }

  // Step 2: Driver validate karo
  const driver = await this.databaseService.repositories.driverModel.findById(userId);
  if (!driver) {
    throw new UnauthorizedException('Driver not found');
  }

  // Step 3: Vans fetch karo by driverId
  const vans = await this.databaseService.repositories.VanModel.find({ driverId: driver._id });
   

  // Step 4: Wrap in "data"
  return {
    message: 'Vans fetched successfully',
    data: vans,
  };
}




async addVanByAdmin(dto: CreateVanByAdminDto, adminId: string) {
    const adminObjectId = new Types.ObjectId(adminId);

  
    const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
    if (!school) {
      throw new UnauthorizedException('School not found');
    }

 
    const newVan = new this.databaseService.repositories.VanModel({
      
      schoolId: school._id,
      vehicleType: dto.vehicleType,
      carNumber: dto.carNumber,
      condition: dto.condition,
      venCapacity: dto.venCapacity,
      deviceId: dto.deviceId,
      assignRoute: dto.assignRoute,
      venImage: dto.venImage,
      status: 'active'
    });

    const savedVan = await newVan.save();

    // Step 5: Return response
    return {
      message: 'Van added successfully',
      data: savedVan,
    };
  }

   async editVanByAdmin(dto: EditVanByAdminDto, adminId: string) {
    const adminObjectId = new Types.ObjectId(adminId);
    const vanObjectId = new Types.ObjectId(dto.vanId);
     const driverObjectId = new Types.ObjectId(dto.driverId);


  
    const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
    if (!school) {
      throw new UnauthorizedException('School not found');
    }

    const schoolId = school._id.toString()

    
    const van = await this.databaseService.repositories.VanModel.findById({ _id: vanObjectId});
    if (!van) {
      throw new BadRequestException('Van not found');
    }

    // Step 3: Find driver by driverId
    // const driver = await this.databaseService.repositories.driverModel.findById({_id: driverObjectId } );
    // if (!driver) {
    //   throw new BadRequestException('Driver not found');
    // }

    const updatedVan = await this.databaseService.repositories.VanModel.findOneAndUpdate(
  { _id: vanObjectId },
  {
    $set: {
      vehicleType: dto.vehicleType,
      carNumber: dto.carNumber,
      condition: dto.condition,
      venCapacity: dto.venCapacity,
      deviceId: dto.deviceId,
      assignRoute: dto.assignRoute,
      venImage: dto.venImage
    },
  },
  { new: true }, // updated document return kare
);

// const updatedDriver = await this.databaseService.repositories.driverModel.findOneAndUpdate(
//   { _id: driverObjectId },
//   {
//     $set: {
//       fullname: dto.fullname,
//       NIC: dto.NIC,
//       phoneNo: dto.phoneNo,
//       email: dto.email,
//       image: dto.image
//     },
//   },
//   { new: true },
// );

return {
  message: 'Van updated successfully',
  data: {
    van: updatedVan,
    // driver: updatedDriver,
  },
};
}

async getVansByAdmin(
  AdminId: string,
  page = 1,
  limit = 10,
  search?: string,
  vanOwn?: boolean, // 👈 new filter
) {
  const adminObjectId = new Types.ObjectId(AdminId);

  // 🔹 1. Find school
  const school =
    await this.databaseService.repositories.SchoolModel.findOne({
      admin: adminObjectId,
    });

  if (!school) {
    throw new UnauthorizedException('School not found');
  }

  const skip = (page - 1) * limit;

  // 🔹 2. Aggregation pipeline
  const pipeline = [
    {
      $match: {
        schoolId: school._id.toString(),

        // ✅ search filter
        ...(search
          ? { carNumber: { $regex: search, $options: 'i' } }
          : {}),

        // ✅ vanOwn filter
        ...(vanOwn !== undefined
          ? { ownVan: vanOwn }
          : {}),
      },
    },

    // 🔹 Driver lookup
    {
      $lookup: {
        from: 'drivers',
        localField: 'driverId',
        foreignField: '_id',
        as: 'driver',
      },
    },
    {
      $unwind: {
        path: '$driver',
        preserveNullAndEmptyArrays: true,
      },
    },

    // 🔹 Routes lookup
    {
      $lookup: {
        from: 'routes',
        let: { vanIdStr: { $toString: '$_id' } },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ['$vanId', '$$vanIdStr'],
              },
            },
          },
        ],
        as: 'routes',
      },
    },

    // 🔹 Final response format
    {
      $project: {
        van: {
          id: { $toString: '$_id' },
          condition: { $ifNull: ['$condition', ''] },
          deviceId: { $ifNull: ['$deviceId', ''] },
          assignRoute: { $ifNull: ['$assignRoute', ''] },
          vehicleType: { $ifNull: ['$vehicleType', ''] },
          carNumber: { $ifNull: ['$carNumber', ''] },
          status: { $ifNull: ['$status', ''] },
          ownVan: { $ifNull: ['$ownVan', false] },
          venCapacity: { $ifNull: ['$venCapacity', null] },
          expiryDate: { $ifNull: ['$expiryDate', null] },
        },

        driver: {
          id: {
            $cond: [
              { $ifNull: ['$driver._id', false] },
              { $toString: '$driver._id' },
              null,
            ],
          },
          fullname: { $ifNull: ['$driver.fullname', ''] },
          image: { $ifNull: ['$driver.image', ''] },
          phoneNo: { $ifNull: ['$driver.phoneNo', ''] },
        },

        routes: {
          $map: {
            input: '$routes',
            as: 'r',
            in: {
              id: {
                $cond: [
                  { $ifNull: ['$$r._id', false] },
                  { $toString: '$$r._id' },
                  null,
                ],
              },
              title: { $ifNull: ['$$r.title', ''] },
              tripType: { $ifNull: ['$$r.tripType', ''] },
            },
          },
        },

        _id: 0,
      },
    },

    { $skip: skip },
    { $limit: limit },
  ];

  const vans =
    await this.databaseService.repositories.VanModel.aggregate(pipeline);

  // 🔹 Total count (IMPORTANT: same filters)
  const total =
    await this.databaseService.repositories.VanModel.countDocuments({
      schoolId: school._id.toString(),

      ...(search
        ? { carNumber: { $regex: search, $options: 'i' } }
        : {}),

      ...(vanOwn !== undefined
        ? { ownVan: vanOwn }
        : {}),

    });

  return {
    message: 'Vans fetched successfully',
    data: vans,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async getVanById(vanId: string) {
  // 1. Van find karo

    console.log("API HIT HO GAYI");
  const van = await this.databaseService.repositories.VanModel.findById(vanId);

  if (!van) {
    throw new BadRequestException("van not found");
  }

  // 2. Driver find karo
  let driver = null;
  if (van.driverId) {
    driver = await this.databaseService.repositories.driverModel.findById(van.driverId);
  }
   
  const routes = await this.databaseService.repositories.routeModel.find({
    vanId: van._id.toString(),
  });

  // 3. Response return karo
  return {
    message: "Van fetched successfully",
    data: {
      id: van._id,
      vehicleType: van.vehicleType || "",
      condition: van.condition || "",
      deviceId: van.deviceId || "",
      numberPlate: van.carNumber || "",
      capacity: van.venCapacity || 0,
      route: van.assignRoute || "",
      status: van.status ,
      ownVan: van.ownVan,


      // ✅ driver info direct fields ke saath
      driverName: driver?.fullname || "",
      driverPhone: driver?.phoneNo || "",
      driverEmail: driver?.email || "",
      driverCnic: driver?.NIC || "",
      driverPicture: driver?.image || "",
      driverId: driver?._id || null,

         routes: routes.map(r => ({
        id: r._id,
        routeName: r.title || "",
        tripType: r.tripType || "",
        startTime: r.startTime || "",
        // jo fields tumhare model me hain wo yahan add karo
      })),
    },
  };
}

async updateVanStatusByAdmin(
  vanIds: string[],
  adminId: string,
  status: string,
) {
  const adminObjectId = new Types.ObjectId(adminId);
   console.log("API HIT HO GAYI");

  // 1️⃣ Find school linked with admin
  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException('School not found');
  }

  const schoolIdString = school._id.toString();

  // 2️⃣ Validate status
  if (status !== 'active' && status !== 'inActive') {
    throw new BadRequestException('Invalid status value');
  }

  // 3️⃣ Validate vanIds
  if (!vanIds || vanIds.length === 0) {
    throw new BadRequestException('vanIds array is required');
  }

  const vanObjectIds = vanIds.map(id => new Types.ObjectId(id));
  console.log(vanObjectIds);  

  // 4️⃣ Update vans status
  const result =
    await this.databaseService.repositories.VanModel.updateMany(
      {
        _id: { $in: vanObjectIds },
        schoolId: schoolIdString,
      },
      {
        $set: { status },
      },
    );

    console.log(result);

  // 5️⃣ Fetch updated vans (driver ObjectId needed)
  const vans =
    await this.databaseService.repositories.VanModel.find(
      {
        _id: { $in: vanObjectIds },
        schoolId: schoolIdString,
      },
      {
        driverId: 1,
        carNumber: 1,
        status: 1,
      },
    );

    console.log(vans);

  // 6️⃣ Get unique driver IDs
  const uniqueDriverIds = [
    ...new Set(
      vans
        .filter(v => v.driverId)
        .map(v => v.driverId.toString()),
    ),
  ];

  console.log(uniqueDriverIds);

  // 7️⃣ Send notification to each driver
  for (const driverId of uniqueDriverIds) {

   const driver = await this.databaseService.repositories.driverModel.findOne({
  _id: driverId,
  schoolId: schoolIdString,
  isDelete: false,
});

      console.log(driver) 
    if (!driver) continue;

   
    const driverVans = vans.filter(
      v => v.driverId?.toString() === driverId,
    );

        const vanId = driverVans[0]?._id?.toString();
    if (!vanId) continue;

    const vanNumbers = driverVans.map(v => v.carNumber).join(', ');

    const title = 'Van Status Update';
    const message =
      status === 'active'
        ? `Your van(s) ${vanNumbers} have been activated by the school.`
        : `Your van(s) ${vanNumbers} have been marked inactive by the school.`;

    // 🔔 Push notification

  
    if (driver.fcmToken && driver.notificationToggle === true) {
      await this.firebaseAdminService.sendToDevice(
        driver.fcmToken,
        {
          notification: {
            title,
            body: message,
          },
        },
      );
    }

 

    // 💾 Save notification in DB
    await this.databaseService.repositories.notificationModel.create({
      type: 'admin',
      schoolId: schoolIdString,
      VanId: vanId,
      infoType: "Information",
      title,
      message,
      actionType: 'VAN_STATUS_UPDATED',
      status: 'sent',
      date: new Date(),
    });
  }

  return {
    message: 'Vans status updated successfully & drivers notified',
    modifiedCount: result.modifiedCount,
  };
}

async removeDriverFromVan(vanId: string , adminId: string) {
  const adminObjectId = new Types.ObjectId(adminId);

 
  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException('School not found');
  }


  const vanObjectId = new Types.ObjectId(vanId);

  const van = await this.databaseService.repositories.VanModel.findOne({
    _id: vanObjectId, 
    schoolId: school._id.toString(),  
  });

  if (!van) {
    throw new BadRequestException('Van not found');
  }

  if (van.ownVan === true) {
    throw new BadRequestException('Cannot remove driver from own van');
  }

    const driverId = van.driverId; // 🔥 save before removing

  if (!driverId) {
    throw new BadRequestException('No driver assigned to this van');
  }

  // 1. Update van → driverId null
  const result = await this.databaseService.repositories.VanModel.updateOne(
    { _id: vanObjectId },
    { $set: { driverId: null } }
  );

  // 2. Fetch updated van
  const updatedVan = await this.databaseService.repositories.VanModel.findOne(
    { _id: vanObjectId }
  );

    const driver = await this.databaseService.repositories.driverModel.findOne({
    _id: driverId,
    schoolId: school._id.toString(),
    isDelete: false,
  });

    if (driver) {
    const title = 'Van Unassigned';
    const message = `You have been removed from van ${van.carNumber}`;

    // 🔔 Push notification
    if (driver.fcmToken && driver.notificationToggle === true) {
      await this.firebaseAdminService.sendToDevice(driver.fcmToken, {
        notification: {
          title,
          body: message,
        },
      });
    }

    // 💾 Save notification (IMPORTANT CHANGE HERE)
    await this.databaseService.repositories.notificationModel.create({
      type: 'admin',
      schoolId: school._id.toString(),

      driverId: driverId,   // ✅ ONLY DRIVER ID (NO VAN ID)

      infoType: 'Information',
      title,
      message,
      actionType: 'DRIVER_REMOVED_FROM_VAN',
      status: 'sent',
      date: new Date(),
    });
  }

  // 8️⃣ Response
  return {
    message: 'Driver removed from van successfully',
    van: updatedVan,
  };
}


async updateProfile(
  userId: string,
  userType: 'driver' | 'parent',
  editDto: EditDriverDto,   // 👈 same DTO dono ke liye
) {
  let updatedDoc;

  if (userType === 'driver') {
    updatedDoc = await this.databaseService.repositories.driverModel.findByIdAndUpdate(
      userId,
      { $set: editDto },
      { new: true },
    );
  } else if (userType === 'parent') {
    updatedDoc = await this.databaseService.repositories.parentModel.findByIdAndUpdate(
      userId,
      { $set: editDto },
      { new: true },
    );
  } else {
    throw new BadRequestException('Invalid user type');
  }

  if (!updatedDoc) {
    throw new BadRequestException(`${userType} not found`);
  }

  return {
    message: `${userType} updated successfully`,
    data: updatedDoc,
  };
}


async updateVan(driverId: string, vanId: string, createVanDto: CreateVanDto) {
    // 🔹 Step 1: Driver check
    const driver = await this.databaseService.repositories.driverModel.findById(driverId);
    if (!driver) {
      throw new BadRequestException('Driver not found');
    }

    // 🔹 Step 2: Van check
    const van = await this.databaseService.repositories.VanModel.findById(vanId);
    if (!van) {
      throw new BadRequestException('Van not found');
    }

    // 🔹 Step 3: Update van with DTO
    const updatedVan = await this.databaseService.repositories.VanModel.findByIdAndUpdate(
      vanId,
     { $set: { ...createVanDto } }, // 👈 spread use karo
      { new: true },
    );

    return {
      message: 'Van updated successfully',
      data: updatedVan,
    };
  }

async getDriverKids(
  userId: string,
  tripId: string,
  page: number,
  limit: number,
) {

  console.log(userId)
  
  const driver = await this.databaseService.repositories.driverModel.findById(userId);
  if (!driver) throw new UnauthorizedException('Driver not found');

 
  const van = await this.databaseService.repositories.VanModel.findOne({ driverId: driver._id });
  if (!van) throw new BadRequestException('Van not found for this driver');

  const schoolId = van.schoolId;

  if (!schoolId) {
    throw new BadRequestException('School not found for this van'); 
  }

 
  const tripObjectId = new Types.ObjectId(tripId);
  const trip = await this.databaseService.repositories.TripModel.findById(tripObjectId);
  if (!trip) {
    throw new BadRequestException('Trip not found ');
  }

  // 🔹 Pagination calculate
  const skip = (page - 1) * limit;

  // 🔹 Kids fetch with parent lookup
  const kids = await this.databaseService.repositories.KidModel.aggregate([
    {
      $match: { VanId: van._id.toString(), schoolId: schoolId.toString(), status: 'active' },

    },
    {
      $lookup: {
        from: "parents",         
        localField: "parentId",  
        foreignField: "_id",     
        as: "parent"
      }
    },
    { $unwind: { path: "$parent", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        fullname: 1,
        image: 1,
        status: 1,
        "parent.address": 1,
        "parent.phoneNo": 1,
        "parent.alternatePhoneNo": 1
      }
    },
    { $skip: skip },
    { $limit: limit }
  ]);

  // 🔹 Total count for pagination
  const totalKidsInVan = await this.databaseService.repositories.KidModel.countDocuments({
    VanId: van._id.toString(),
  });

  // 🔹 Trip ke kids ids
  const tripKidIds = new Set(trip.kids.map((k: any) => k.kidId.toString()));

  // 🔹 Response kids banao
  const responseKids = kids.map(kid => ({
    _id: kid._id,
    name: kid.fullname,
    image: kid.image,
    status: kid.status,
    picked: tripKidIds.has(kid._id.toString()),
    parent: kid.parent ? {
      address: kid.parent.address,
      phone: kid.parent.phoneNo,
      alternatePhone: kid.parent.alternatePhoneNo,
    } : null,
  }));

  // 🔹 Picked count (sirf current page ke kids pe)
  const pickedCount = responseKids.filter(k => k.picked).length;

  return {
    message: 'Van kids with parent info and pickup status fetched successfully',
    data: {
      vanId: van._id,
      totalKids: totalKidsInVan,
      pickedCount,
      page,
      limit,
      totalPages: Math.ceil(totalKidsInVan / limit),
      kids: responseKids,
    },
  };
}

async uploadDocument(body: any, driverId: string) {
  if (!driverId) {
    throw new UnauthorizedException('Invalid driver token');
  }

  const {
    title,
    licenceImageFront,
    licenceImageBack,
    vehicleCardImageFront,
    vehicleCardImageBack,
    expiryDateLicense,
    expiryDateVehicleCard
  } = body;

  // Step 1: Find driver
  const driver = await this.databaseService.repositories.driverModel.findById(
    new Types.ObjectId(driverId)
  );

  if (!driver) {
    throw new BadRequestException('Driver not found');
  }

  // Step 2: Update only fields that are sent in request
  if (licenceImageFront) driver.licenceImageFront = licenceImageFront;
  if (licenceImageBack) driver.licenceImageBack = licenceImageBack;
  if (vehicleCardImageFront) driver.vehicleCardImageFront = vehicleCardImageFront;
  if (vehicleCardImageBack) driver.vehicleCardImageBack = vehicleCardImageBack;
  if (expiryDateLicense) driver.expiryDateLicense = expiryDateLicense;
  if (expiryDateVehicleCard) driver.expiryDateVehicleCard = expiryDateVehicleCard;

  // Step 3: Save changes
  await driver.save();

  return {
    message: 'Driver documents uploaded successfully',
    data: driver,
  };
}




async getDriverDocuments(driverId: string) {
  if (!driverId) {
    throw new UnauthorizedException('Invalid driver token');
  }

  // Step 1: Driver find karo
  const driver = await this.databaseService.repositories.driverModel.findById(
    new Types.ObjectId(driverId),
    'licenceImageFront licenceImageBack vehicleCardImageFront vehicleCardImageBack' // sirf ye 4 fields lo
  );

  if (!driver) {
    throw new BadRequestException('Driver not found');
  }

  // Step 2: Response return karo
  return {
    message: 'Driver documents fetched successfully',
    data: driver,
  };
}
// async getVehicleType(driverId: string) {
//   if (!driverId) {
//     throw new UnauthorizedException('Invalid driver token');
//   }

//   // Step 1: Van find karo based on driverId
//   const van = await this.databaseService.repositories.VanModel.findOne(
//     { driverId: new Types.ObjectId(driverId) },
//   );

//   if (!van) {
//     throw new BadRequestException('Van not found for this driver');
//   }

//   // Step 2: Response return karo
//   return {
//     message: 'Vehicle type fetched successfully',
//     data: {
//       vehicleType: van.vehicleType,
//     },
//   };
// }

async deleteVan(driverId: string) {
  if (!driverId) {
    throw new UnauthorizedException('Invalid driver token');
  }

  // Step 1: Van find karo based on driverId
  const van = await this.databaseService.repositories.VanModel.findOne({
    driverId: new Types.ObjectId(driverId),
  });

  if (!van) {
    throw new BadRequestException('Van not found for this driver');
  }

  if (van.ownVan === true) {
     van.driverId = null;
      van.status = 'inActive';
      van.schoolId = null;
      await van.save();

       return {
    message: 'Van removed successfully',
  };

}

  // Step 2: driverId ko null kar do
  van.driverId = null;

  // Step 3: Save updated document
  await van.save();

  return {
    message: 'Van unlinked from driver successfully',
  };
}

async deleteVanByAdmin(adminId: string, vanId: string) {

  const adminObjectId = new Types.ObjectId(adminId);
  const vanObjectId = new Types.ObjectId(vanId);
  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException('School not found');
  }

  const schoolIdString = school._id.toString();
  console.log(schoolIdString, vanObjectId)
  
  const van = await this.databaseService.repositories.VanModel.findOne({
    _id: vanObjectId,
    schoolId: schoolIdString,
  });

  if (!van) {
    throw new BadRequestException('Van not found');
  }

  if (van.ownVan === true) {
     

  // Step 2: driverId ko null kar do
  van.schoolId = null;
  van.status = 'inActive'; 

  // Step 3: Save updated document
  await van.save();
  

  return {
    message: 'Van deleted from School successfully',
  };

}
 van.status = 'inActive';
  van.schoolId = null;
  van.driverId = null;

  await van.save();

  return {
    message: 'Van deleted from School successfully',
  };



}

async getVansBySchool(schoolId: string) {
  // find all vans where schoolId matches
 const vans = await this.databaseService.repositories.VanModel.find({
    schoolId,
    status: 'active'   // 👈 ye add karo
  });

  // if no vans found
  if (!vans || vans.length === 0) {
    throw new NotFoundException('No vans found for this school');
  }

  return {
    message: 'Vans fetched successfully',
    count: vans.length,
    data: vans,
  };
}

async updateDriverStatusByAdmin(
  driverIds: string[],
  adminId: string,
  status: string,
) {
  const adminObjectId = new Types.ObjectId(adminId);
  console.log("API HIT HO GAYI");

  // 1️⃣ Find school linked with admin
  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException('School not found');
  }

  const schoolIdString = school._id.toString();

  // 2️⃣ Validate status
  if (status !== 'active' && status !== 'inActive') {
    throw new BadRequestException('Invalid status value');
  }

  // 3️⃣ Validate driverIds
  if (!driverIds || driverIds.length === 0) {
    throw new BadRequestException('driverIds array is required');
  }

  const driverObjectIds = driverIds.map(id => new Types.ObjectId(id));
  console.log(driverObjectIds);

  // 4️⃣ Update drivers status
  const result =
    await this.databaseService.repositories.driverModel.updateMany(
      {
        _id: { $in: driverObjectIds },
        schoolId: schoolIdString,
        isDelete: false,
      },
      {
        $set: { status },
      },
    )

  console.log(result);

  // 5️⃣ Fetch updated drivers
  const drivers =
    await this.databaseService.repositories.driverModel.find(
      {
        _id: { $in: driverObjectIds },
        schoolId: schoolIdString,
        isDelete: false,
      },
      {
        fullname: 1,
        fcmToken: 1,
        status: 1,
        notificationToggle: 1,
      },
    );



 
  // 6️⃣ Send notification to each driver
  for (const driver of drivers) {
    const title = 'Account Status Update';
    const message =
      status === 'active'
        ? `Your account has been activated by the school.`
        : `Your account has been marked inactive by the school.`;


  const van = await this.databaseService.repositories.VanModel.findOne({
    driverId: driver._id,
  });

 
  if (van && van.ownVan === true) {
    van.status = status;
    await van.save();
  }

  console.log("hello wali")
    if (driver.fcmToken && driver.notificationToggle === true) {
         console.log("wali", driver.fcmToken, driver.notificationToggle);
      await this.firebaseAdminService.sendToDevice(
        driver.fcmToken,
        {
          notification: {
            title,
            body: message,
          },
        },
      );
    }

        // 💾 Save notification in DB
    await this.databaseService.repositories.notificationModel.create({
      type: 'admin',
      schoolId: schoolIdString,
      driverId: driver._id.toString(),
      infoType: "Information",
      title,
      message,
      actionType: 'VAN_STATUS_UPDATED',
      status: 'sent',
      date: new Date(),
    });
  }
  

  return { message: 'Driver status updated successfully', updatedCount: result.modifiedCount };
}

async assignSchoolToDriver(
  driverId: string,
  schoolId: string,
) {
  // 1️⃣ Validate inputs
  if (!driverId) {
    throw new BadRequestException('driverId is required');
  }

  if (!schoolId) {
    throw new BadRequestException('schoolId is required');
  }

  const driverObjectId = new Types.ObjectId(driverId);

  // 2️⃣ Find driver by ID
  const driver = await this.databaseService.repositories.driverModel.findOne({
    _id: driverObjectId,
    isDelete: false,
  });

  if (!driver) {
    throw new NotFoundException('Driver not found');
  }

  // 3️⃣ Assign school
  driver.schoolId = schoolId;

  // 4️⃣ Save driver
  const updatedDriver = await driver.save();

  // 5️⃣ Return proper response
  return {
    message: 'Driver has been successfully assigned to the school',
    data: updatedDriver,
  };
}

async removeDriversFromSchool(
  driverIds: string[],
  adminId: string,
) {
  const adminObjectId = new Types.ObjectId(adminId);
  console.log("API HIT HO GAYI - Remove Drivers");

  // 1️⃣ Find school linked with admin
  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException('School not found');
  }

  const schoolIdString = school._id.toString();

  // 2️⃣ Validate driverIds
  if (!driverIds || driverIds.length === 0) {
    throw new BadRequestException('driverIds array is required');
  }

  const driverObjectIds = driverIds.map(id => new Types.ObjectId(id));
  console.log(driverObjectIds);

  // 3️⃣ Update drivers - remove school (set schoolId to null)
  const result = await this.databaseService.repositories.driverModel.updateMany(
    {
      _id: { $in: driverObjectIds },
      schoolId: schoolIdString,
      isDelete: false,
    },
    {
      $set: { schoolId: null },
    },
  );

  console.log(result);

  // 4️⃣ Fetch updated drivers
  const drivers = await this.databaseService.repositories.driverModel.find(
    {
      _id: { $in: driverObjectIds },
      isDelete: false,
    },
    {
      fullname: 1,
      fcmToken: 1,
      notificationToggle: 1,
    },
  );

  console.log(drivers);

  // 5️⃣ Send push notification to each driver
  for (const driver of drivers) {
    const title = 'Removed from School';
    const message = `You have been removed from the school by the admin.`;

    const van = await this.databaseService.repositories.VanModel.findOne({
    driverId: driver._id,
  });


    if (van && van.ownVan === true) {
      // 👉 Sirf school se unlink
      van.schoolId = null;
      van.status = 'inActive';
      driver.status = 'inActive';
      driver.schoolId = null;
      await van.save();
      await driver.save();

    } 

    else {
      driver.status = 'inActive';
      driver.schoolId = null;
      van.driverId = null;
      await van.save();
      await driver.save();
}

   
    if (driver.fcmToken && driver.notificationToggle === true) {
      await this.firebaseAdminService.sendToDevice(
        driver.fcmToken,
        {
          notification: {
            title,
            body: message,
          },
        },
      );
    }

            // 💾 Save notification in DB
    await this.databaseService.repositories.notificationModel.create({
      type: 'admin',
      schoolId: schoolIdString,
      driverId: driver._id.toString(),
      infoType: "Information",
      title,
      message,
      actionType: 'VAN_STATUS_UPDATED',
      status: 'sent',
      date: new Date(),
    });
  }
  

  

  return {
    message: 'Drivers removed from school successfully',
    removedCount: result.modifiedCount,
  };
}

async getAllDriversByAdmin(
  adminId: string,
  page = 1,
  limit = 10,
  search?: string,
  status?: 'active' | 'inActive', // optional status filter
) {
  const adminObjectId = new Types.ObjectId(adminId);

  // 1️⃣ Find school linked with admin
  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException('School not found');
  }

  const skip = (page - 1) * limit;

  // 2️⃣ Build query
  const query: any = {
    schoolId: school._id.toString(),
    isDelete: false,
  };

  if (search) {
    query.fullname = { $regex: search, $options: 'i' };
  }

  if (status) {
    query.status = status;
  }

  // 3️⃣ Fetch drivers with pagination
  const drivers = await this.databaseService.repositories.driverModel
    .find(query)
    .skip(skip)
    .limit(limit)
    .select('fullname email phoneNo status fcmToken image schoolId');

  // 4️⃣ Total count
  const total = await this.databaseService.repositories.driverModel.countDocuments(
    query,
  );

  // 5️⃣ Return response
  return {
    message: 'Drivers fetched successfully',
    data: drivers,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
async getDriverById(driverId: string) {
  if (!driverId) {
    throw new BadRequestException('Driver ID is required');
  }

  const driverObjectId = new Types.ObjectId(driverId);

  // 1️⃣ Find driver by ID
  const driver = await this.databaseService.repositories.driverModel.findOne({
    _id: driverObjectId,
    isDelete: false,
  });

  if (!driver) {
    throw new NotFoundException('Driver not found');
  }

  let schoolName = null;

  // 2️⃣ Fetch school name if driver has schoolId
  if (driver.schoolId) {
    const school = await this.databaseService.repositories.SchoolModel.findOne({
      _id: new Types.ObjectId(driver.schoolId),
    });

    if (school) {
      schoolName = school.schoolName; // assuming School model has `name` field
    }
  }

  // 3️⃣ Return response with driver data + school name
  return {
    message: 'Driver fetched successfully',
    data: {
      ...driver.toObject(),
      schoolName,
    },
  };
}



  async addDriverByAdmin(adminId: string, body: any) {
    const { fullname, email, password } = body;
    if (!fullname || !email || !password) {
      throw new Error('fullname, email and password are required');
    }
    const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: new Types.ObjectId(adminId) });
    if (!school) throw new Error('School not found');

    const existing = await this.databaseService.repositories.driverModel.findOne({ email });
    if (existing) throw new Error('A driver with this email already exists');

    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);

    const driver = await this.databaseService.repositories.driverModel.create({
      fullname,
      email,
      phoneNo: body.phoneNo || '',
      alternatePhoneNo: body.alternatePhoneNo || '',
      password: hashedPassword,
      schoolId: school._id.toString(),
      status: 'active',
      userType: 'driver',
      NIC: body.NIC || '',
      address: body.address || '',
      expiryDateLicense: body.expiryDateLicense || '',
      expiryDateVehicleCard: body.expiryDateVehicleCard || '',
    });

    return { message: 'Driver added successfully', data: { id: driver._id, fullname: driver.fullname, email: driver.email, phoneNo: driver.phoneNo, status: driver.status } };
  }

}