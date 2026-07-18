/* eslint-disable prettier/prettier */
import { BadGatewayException, Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from "src/database/databaseservice";
import { FirebaseAdminService } from 'src/notification/firebase-admin.service'; 

import { Types } from 'mongoose';
import mongoose from 'mongoose';

import { AddAlertDto } from './dto/addAlertdto';
import { info } from 'console';





@Injectable()
export class alertService { 
  constructor(
   
    private databaseService: DatabaseService,
    private firebaseAdminService: FirebaseAdminService
    



    
   
  ) {}


  async addAlert(addAlertDto: AddAlertDto, adminId: string) {
    const { alertType, vanId, message, recipientType,  } = addAlertDto;
  
    // 1️⃣ Validate school
    const adminObjectId = new Types.ObjectId(adminId);
    const school = await this.databaseService.repositories.SchoolModel.findOne({
      admin: adminObjectId,
    });
  
    if (!school) {
      throw new UnauthorizedException("Invalid school or admin not authorized");
    }
  
    const notificationData: any = {
      schoolId: school._id.toString(),
      message: message || "",
      alertType,
      recipientType,
      date: new Date(),
    };
  
    let targetUsersFCM: string[] = []; 
  
    
  if (recipientType === "SPECIFIC_VAN") {
  if (!vanId) {
    throw new BadRequestException("vanId is required for SPECIFIC_VAN alerts");
  }

  const vanObjectId = new Types.ObjectId(vanId);

  const van = await this.databaseService.repositories.VanModel.findById(
    vanObjectId
  );

  if (!van) throw new NotFoundException("Van not found");

  if (!van.driverId)
    throw new NotFoundException("Driver not assigned to this van");

  notificationData.VanId = van._id.toString();

  // ⭐ DRIVER FCM
  const driver = await this.databaseService.repositories.driverModel.findOne({
    _id: van.driverId,
    isDelete: false,

  });

  if (driver?.fcmToken && driver.notificationToggle === true) {
    targetUsersFCM.push(driver.fcmToken);
  }

  // ⭐ VAN KE KIDS NIKALO
  const kids = await this.databaseService.repositories.KidModel.find({
    VanId: van._id.toString(),
  });

 


  // ⭐ KIDS SE PARENT IDS
  const parentIds = kids.map((k) => k.parentId);

  // ⭐ PARENTS NIKALO
  const parents = await this.databaseService.repositories.parentModel.find({
    _id: { $in: parentIds },
    userType: "parent",
    isDelete: false,
  });



const parentFCM = parents
  .filter((p) => p?.fcmToken && p.notificationToggle === true)
  .map((p) => p.fcmToken);

targetUsersFCM.push(...parentFCM);

  }
  
   
    else if (recipientType === "ALL_DRIVERS") {
   
      const vans = await this.databaseService.repositories.VanModel.find({
        schoolId: school._id.toString(),
        driverId: { $ne: null },
      });
  
      const driverIds = vans.map((v) => v.driverId);
  
      const drivers = await this.databaseService.repositories.driverModel.find({
        _id: { $in: driverIds },
        userType: "driver",
        isDelete: false,
      });
  
      targetUsersFCM = drivers
    .filter((d) => d?.fcmToken && d.notificationToggle === true)
    .map((d) => d.fcmToken);
}
  
    // 4️⃣ ALL_PARENTS → Fetch all parents of the school
    else if (recipientType === "ALL_PARENTS") {
      // 1. Kids of the school
      const kids = await this.databaseService.repositories.KidModel.find({
        schoolId: school._id.toString(),
      });
  
    const parentIds = [...new Set(kids.map((k) => k.parentId))];
  
      const parents = await this.databaseService.repositories.parentModel.find({
        _id: { $in: parentIds },
        userType: "parent",
        isDelete: false,
      });
  
     targetUsersFCM = parents
  .filter((p) => p?.fcmToken && p.notificationToggle === true)
  .map((p) => p.fcmToken);
    }
  
   
    else {
      throw new BadRequestException("Invalid recipientType value");
    }
  
   
    const notification =
      new this.databaseService.repositories.notificationModel(notificationData);
    const savedNotification = await notification.save();


      // Sending notification to each device
    for (const token of targetUsersFCM) {
        const payload = {
            notification: {
                title: alertType,
                body: message,
            },
        };
        await this.firebaseAdminService.sendToDevice(token, payload);
    }

  
    // 7️⃣ Final Response
    return {
      message: "Alert created successfully",
      data: savedNotification,
      targetFCMs: targetUsersFCM,
    };
  }
  

async getAlerts(adminId: string, page = 1, limit = 10) {
  const skip = (page - 1) * limit;

  
  const adminObjectId = new Types.ObjectId(adminId);

  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException("Invalid admin or school not found");
  }

  const schoolId = school._id.toString();

  // 2️⃣ Aggregation (filtered by schoolId)
  const alerts = await this.databaseService.repositories.notificationModel.aggregate([
{
  $match: {
    schoolId: schoolId,
    $or: [
      { infoType: { $exists: false } },
      { infoType: { $ne: "Information" } },
   
    ]
  }
},
    {
      $lookup: {
        from: "vans",
        let: { vanId: "$VanId" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$vanId"] } } },
          { $project: { carNumber: 1, _id: 0 } },
        ],
        as: "vanInfo",
      },
    },
    {
      $unwind: {
        path: "$vanInfo",
        preserveNullAndEmptyArrays: true, 
      },
    },
    {
      $project: {
        _id: 1,
        message: 1,
        alertType: 1,
        recipientType: 1,
        date: 1,
        status: 1,
        schoolId: 1,
        VanId: 1,
        vanNumber: "$vanInfo.carNumber",
        infoType: 1,
        infoType2: 1
      },
    },
    { $skip: skip },
    { $limit: limit },
  ]);

  // 3️⃣ Total count
  const total = await this.databaseService.repositories.notificationModel.countDocuments({
    schoolId: schoolId,
    infoType: { $ne: "Information" },
    infoType2: { $ne: "forParents" }
  });

  // 4️⃣ Return response with same structure as other APIs
  return {
    message: "Alerts fetched successfully",
    data: alerts,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}


async getAlertById(adminId: string, alertId: string) {
  // 1️⃣ Convert IDs to ObjectId
  const adminObjectId = new Types.ObjectId(adminId);
  const alertObjectId = new Types.ObjectId(alertId);

  // 2️⃣ Admin se schoolId nikaalo
  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException('Invalid admin or school not found');
  }

  const schoolId = school._id;

  // 3️⃣ Specific alert find karo (schoolId ke sath match)
  const alert = await this.databaseService.repositories.notificationModel.findOne({
    _id: alertObjectId,
    schoolId: schoolId,
  });

  if (!alert) {
    throw new NotFoundException('Alert not found or not authorized');
  }

  // 4️⃣ Optional vanNumber handle karo
  const responseData: any = {
    _id: alert._id,
    message: alert.message,
    alertType: alert.alertType,
    recipientType: alert.recipientType,
    status: alert.status,
    date: alert.date,
    schoolId: alert.schoolId,
    schoolName: school?.schoolName
  };

  if (alert.VanId) {
    const van = await this.databaseService.repositories.VanModel.findById(alert.VanId, {
      carNumber: 1,
      _id: 0,
    });

    if (van) {
      responseData.VanId = alert.VanId;
      responseData.vanNumber = van.carNumber; // fixed name consistency
    }
  }

  // 5️⃣ Final response
  return {
    message: 'Alert fetched successfully',
    data: responseData,
  };
}

async editAlert(adminId: string, alertId: string, updateData: any) {
  const adminObjectId = new Types.ObjectId(adminId);
  const alertObjectId = new Types.ObjectId(alertId);

  // 1️⃣ Admin se school find karo
  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException('Invalid admin or school not found');
  }

  // 2️⃣ Alert document fetch karo
  const existingAlert = await this.databaseService.repositories.notificationModel.findOne({
    _id: alertObjectId,
    schoolId: school._id.toString(),
  });

  if (!existingAlert) {
    throw new NotFoundException('Alert not found');
  }

  // 3️⃣ Update fields prepare karo
  const { alertType, vanId, message, recipientType } = updateData;

 
  if (alertType) existingAlert.alertType = alertType;
  if (message) existingAlert.message = message;
  if (recipientType) existingAlert.recipientType = recipientType;

  
  if (recipientType === 'SPECIFIC_VAN') {
    if (!vanId) {
      throw new BadRequestException('vanId is required for SPECIFIC_VAN alerts');
    }

    const vanObjectId = new Types.ObjectId(vanId);
    const van = await this.databaseService.repositories.VanModel.findById(vanId);

    if (!van) {
      throw new NotFoundException('Van not found');
    }

    if (!van.driverId) {
      throw new NotFoundException('Driver not assigned to this van');
    }

    // VanId add/update karo
    existingAlert.VanId = vanId;
  }

  // 5️⃣ Agar type ALL_DRIVERS ya ALL_PARENTS ho gaya
  else if (recipientType === 'ALL_DRIVERS' || recipientType === 'ALL_PARENTS') {
    // agar pehle koi vanId tha to hata do
    existingAlert.VanId = undefined;
  }

  // 6️⃣ Invalid recipientType
  else if (recipientType && !['SPECIFIC_VAN', 'ALL_DRIVERS', 'ALL_PARENTS'].includes(recipientType)) {
    throw new BadRequestException('Invalid recipientType value');
  }

  // 7️⃣ Save changes
  const updatedAlert = await existingAlert.save();

  // 8️⃣ Response return
  return {
    message: 'Alert updated successfully',
    data: updatedAlert,
  };
}



async deleteAlert(adminId: string, alertId: string) {
  const adminObjectId = new Types.ObjectId(adminId);
  const alertObjectId = new Types.ObjectId(alertId);

  // 1️⃣ Pehle check karo school admin ka hi hai ya nahi
  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException('Invalid admin or school not found');
  }

  const schoolId = school._id;

  // 2️⃣ Alert delete karo
  const deletedAlert = await this.databaseService.repositories.notificationModel.findOneAndDelete({
    _id: alertObjectId,
    schoolId: schoolId,
  });

  if (!deletedAlert) {
    throw new NotFoundException('Alert not found');
  }

  return {
    message: 'Alert deleted successfully',
  };
}



async getAlertsForParent(parentId: string) {
  const kids = await this.databaseService.repositories.KidModel.find({
    parentId: new Types.ObjectId(parentId), 
  });

  const parent = await this.databaseService.repositories.parentModel.findById(parentId);

  if (!parent) {
    throw new NotFoundException('Parent not found');
  }

   if (parent.isDelete === true) {
    throw new BadRequestException('Parent account is deleted');
  }

  

  if (!kids.length) {
    return {
      message: 'No alerts found for this parent',
      data: { notifications: [] },
    };
  }

  const vanIds = kids
    .map(k => k.VanId)
    .filter(v => v)
    .map(v => new Types.ObjectId(v)); 

  const schoolIds = kids.map(k => new Types.ObjectId(k.schoolId)); 

  const notifications = await this.databaseService.repositories.notificationModel.find({
    $and: [
      { schoolId: { $in: schoolIds } },
      { $or: [
          { recipientType: 'ALL_PARENTS' },
          { recipientType: 'SPECIFIC_VAN', VanId: { $in: vanIds } },
            { parentId: parentId },
        ]
      }
    ]
  }).sort({ date: -1 });

  return {
    message: notifications.length
      ? 'Alerts fetched successfully'
      : 'No alerts found for this parent',
    data: { notifications },
  };
}

// async getAlertsForDriver(driverId: string) {

//   const driverObjectId = new Types.ObjectId(driverId);
//   console.log(driverObjectId)

//   const driver = await this.databaseService.repositories.driverModel.findById(
//    driverObjectId
//   );

//   const van = await this.databaseService.repositories.VanModel.findOne({
//     driverId: driverObjectId,
//   });

//   const vanId = van._id;


//   if (!driver) {
//     return {
//       message: "Driver not found",
//       data: { notifications: [] }
//     };
//   }

//     if (driver.isDelete === true) { 
//     throw new BadRequestException('Driver account is deleted');
//   }

//   const driverIdString = driverObjectId.toString();

//   console.log("Driver ID String:", driverIdString);


  
// const notifications =
//   await this.databaseService.repositories.notificationModel.find({
//     $and: [
//       {
//         $or: [
//           { recipientType: "ALL_DRIVERS" },
//           { recipientType: "SPECIFIC_VAN", VanId: vanId },
//           { VanId: vanId },
//           { driverId: driverObjectId.toString() } 
//         ]
//       },
//       { type: { $ne: "driver" } },
//       { infoType2: { $ne: "forParents" } }
//     ]
//   })
//     .sort({ date: -1 });

//   return {
//     message: notifications.length
//       ? "Driver alerts fetched successfully"
//       : "No alerts found for drivers",
//     data: { notifications },
//   };
// }

async getAlertsForDriver(driverId: string) {
  const driverObjectId = new Types.ObjectId(driverId);

  // 🔹 Driver fetch
  const driver = await this.databaseService.repositories.driverModel.findById(
    driverObjectId
  );

  if (!driver) {
    return {
      message: "Driver not found",
      data: { notifications: [] },
    };
  }

  if (driver.isDelete === true) {
    throw new BadRequestException('Driver account is deleted');
  }

  // 🔹 Van fetch (optional ho sakta hai)
  const van = await this.databaseService.repositories.VanModel.findOne({
    driverId: driverObjectId,
  });

  const vanId = van?._id; // ✅ safe

  // 🔹 Dynamic OR conditions
  const orConditions: any[] = [
    { recipientType: "ALL_DRIVERS" },
    { driverId: driverObjectId.toString() }
  ];

  // ✅ sirf tab add karo jab vanId exist kare
  if (vanId) {
    orConditions.push(
      { recipientType: "SPECIFIC_VAN", VanId: vanId },
      { VanId: vanId }
    );
  }

  // 🔹 Final query
  const notifications =
    await this.databaseService.repositories.notificationModel
      .find({
        $and: [
          { $or: orConditions },
          { type: { $ne: "driver" } },
          { infoType2: { $ne: "forParents" } },
        ],
      })
      .sort({ date: -1 });

  return {
    message: notifications.length
      ? "Driver alerts fetched successfully"
      : "No alerts found for drivers",
    data: { notifications },
  };
}
async getDriverNotificationsByParent(parentId: string) {

   const parentObjectId = new Types.ObjectId(parentId);

    const parent = await this.databaseService.repositories.parentModel.findById(parentId);

  if (!parent) {
    throw new NotFoundException('Parent not found');
  }

   if (parent.isDelete === true) {
    throw new BadRequestException('Parent account is deleted');
  }


    const notifications = await this.databaseService.repositories.notificationModel.find({
      parentId: parentObjectId,
      type: 'driver', 
    }).sort({ createdAt: -1 });

    
   

    return {
      message: 'Driver notifications fetched successfully',
      data: notifications,
    };
  }

async addSupportLink(body: any, adminId: string) {
  try {
    const { type, title, value, url, status } = body;

    // admin validation
    const adminObjectId = new Types.ObjectId(adminId);

    const admin = await this.databaseService.repositories.AdminModel.findById(
      adminObjectId,
    );

    if (!admin) {
      throw new UnauthorizedException('Invalid admin');
    }

    // 🧠 Create Support Link (optional fields handled safely)
    const support = new this.databaseService.repositories.supportModel({
      type,
      title: title || null,
      value: value || null,
      url: url || null,
      status: status || 'active',
      isDelete: false,
    });

    const saved = await support.save();

    return {
      message: 'Support link added successfully',
      data: saved,
    };
  } catch (error) {
    throw error;
  }
}

async getSupportLinks() {
  try {
    const links = await this.databaseService.repositories.supportModel
      .find({ isDelete: false })
      .sort({ createdAt: -1 }); // newest first

    return {
      message: 'Support links fetched successfully',
      data: links,
    };
  } catch (error) {
    throw error;
  }
}

async deleteSupportLink(id: string) {
  try {
    const support = await this.databaseService.repositories.supportModel.findById(id);

    if (!support) {
      throw new NotFoundException('Support link not found');
    }

    // ❌ Permanent delete
    await this.databaseService.repositories.supportModel.findByIdAndDelete(id);

    return {
      message: 'Support link deleted permanently',
      data: null,
    };
  } catch (error) {
    throw error;
  }
}

async sendAlertByDriver(driverId: string, message?: string, audioUrl?: string) {
  if (!message && !audioUrl) {
    throw new BadRequestException('Either a message or a voice note is required');
  }

  const driver = await this.databaseService.repositories.driverModel.findById(
    new Types.ObjectId(driverId),
  );
  if (!driver) {
    throw new NotFoundException('Driver not found');
  }

  const notification = new this.databaseService.repositories.notificationModel({
    type: 'driver_alert',
    recipientType: 'ADMIN',
    driverId: driver._id.toString(),
    schoolId: (driver as any).schoolId,
    message: message || '',
    audioUrl,
    date: new Date(),
  });
  await notification.save();

  return {
    message: 'Alert sent to school admin',
    data: notification,
  };
}

async getDriverAlertsForAdmin(adminId: string, page = 1, limit = 10) {
  const adminObjectId = new Types.ObjectId(adminId);
  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });
  if (!school) {
    throw new UnauthorizedException('Invalid admin or school not found');
  }

  const skip = (page - 1) * limit;
  const schoolId = school._id.toString();

  const [alerts, total] = await Promise.all([
    this.databaseService.repositories.notificationModel
      .find({ recipientType: 'ADMIN', schoolId })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.databaseService.repositories.notificationModel.countDocuments({
      recipientType: 'ADMIN',
      schoolId,
    }),
  ]);

  // Enrich with the driver's name — the raw notification only stores driverId.
  const driverIds = [...new Set(alerts.map((a: any) => a.driverId).filter(Boolean))];
  const drivers = await this.databaseService.repositories.driverModel
    .find({ _id: { $in: driverIds.map((id) => new Types.ObjectId(id as string)) } })
    .select('fullname')
    .lean();
  const driverNameById = new Map(drivers.map((d: any) => [d._id.toString(), d.fullname]));

  return {
    message: 'Driver alerts fetched',
    data: alerts.map((a: any) => ({
      ...a,
      driverName: driverNameById.get(a.driverId) || 'Unknown driver',
    })),
    total,
    page,
    limit,
  };
}

}