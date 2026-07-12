/* eslint-disable prettier/prettier */
import { BadGatewayException, Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from "src/database/databaseservice";
import { CreateKidDto } from './dto/CreateKid.dto';
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { FirebaseAdminService } from 'src/notification/firebase-admin.service';
import { WhatsappService } from 'src/whatsapp/whatsapp.service';
import { Kid } from './kid.schema';
import { title } from 'process';





@Injectable()
export class KidService { 
  constructor(
   
    private databaseService: DatabaseService,
    private firebaseAdminService: FirebaseAdminService,
    private whatsappService: WhatsappService

   
  ) {}

  
async addKid(CreateKidDto: CreateKidDto, userId: string, userType: string) {
  // Step 1: Only parents allowed
  if (userType !== 'parent') {
    throw new UnauthorizedException('Only parent can add kids');
  }

  // Step 2: Get parent
  const Parent = await this.databaseService.repositories.parentModel.findById(userId);

  if (!Parent) {
    throw new UnauthorizedException('Parent not found');
  }

  let driver = null;
  let van = null;

  // Step 3: Van validation (if provided)
  if (CreateKidDto.VanId) {
    van = await this.databaseService.repositories.VanModel.findById(
      CreateKidDto.VanId,
    );

    if (!van) {
      throw new NotFoundException('Van not found');
    }

    if (van.status !== 'active') {
      throw new BadRequestException('Van is not active, cannot assign kid');
    }

    // Step 4: Get driver of van
    if (van.driverId) {
      driver = await this.databaseService.repositories.driverModel.findOne({
        _id: van.driverId,
        isDelete: false,
      });
    }
  }

  // Step 5: Create kid
  const newKid = new this.databaseService.repositories.KidModel({
    ...CreateKidDto,
    parentId: Parent._id,
  });

  let savedKid;
  try {
    savedKid = await newKid.save();
  } catch (err) {
    if (err.name === 'ValidationError') {
      throw new BadRequestException(err.message);
    }
    throw err;
  }

  // Step 5b: Notify the school (via WhatsApp) that a new student is
  // pending verification — fire-and-forget, never blocks kid creation.
  if (CreateKidDto.schoolId) {
    this.notifySchoolOfNewStudent(CreateKidDto.schoolId, Parent, savedKid).catch(
      (err) => console.error('School new-student notify failed:', err?.message || err),
    );
  }

  // Step 6: Send notification ONLY if driver exists
  if (driver) {
    const title = 'New Kid Assigned';
    const message = `A new kid has been assigned to your van ${van.carNumber}`;

    // 🔔 Push notification
    if (driver.fcmToken && driver.notificationToggle === true) {
      await this.firebaseAdminService.sendToDevice(driver.fcmToken, {
        notification: {
          title,
          body: message,
        },
      });
    }

    // 💾 Save notification
    await this.databaseService.repositories.notificationModel.create({
      type: 'admin',
      driverId: driver._id.toString(),
      schoolId: van.schoolId,

      infoType: 'Information',
      title,
      message,
      actionType: 'KID_ASSIGNED_TO_VAN',
      status: 'sent',
      date: new Date(),
    });
  }

  // Step 7: Response
  return {
    message: 'Kid added successfully',
    data: savedKid,
  };
}

// Notifies the school's registered contact number via WhatsApp when a
// parent self-adds a kid and links a school — so the admin knows to
// verify/activate the student on their dashboard. Uses the school's own
// WABA credentials if connected, otherwise falls back to the platform's
// default WhatsApp number.
private async notifySchoolOfNewStudent(schoolId: string, parent: any, kid: any) {
  const school = await this.databaseService.repositories.SchoolModel.findById(schoolId);
  if (!school || !school.contactNumber) return;

  const message = `New student pending verification 🎒\n\nStudent: ${kid.fullname || 'N/A'}\nParent: ${parent.fullname || parent.email}\nContact: ${parent.phoneNo || parent.email}\n\nPlease review and verify this student in your SmartVan admin dashboard.`;

  if (school.waConnected && school.waPhoneNumberId && school.waAccessToken) {
    await this.whatsappService.sendWithSchoolCredentials(
      school.waPhoneNumberId,
      school.waAccessToken,
      school.contactNumber,
      message,
    );
  } else {
    await this.whatsappService.sendTextMessage(school.contactNumber, message);
  }
}

async getKids(userId: string, userType: string) {


  if (userType !== 'parent') {

    const driver =
      await this.databaseService.repositories.driverModel.findById(userId);
    if (!driver) throw new UnauthorizedException('Driver not found');

    const van =
      await this.databaseService.repositories.VanModel.findOne({
        driverId: driver._id
      });
    if (!van) throw new BadRequestException('Van not found');

   
 if (van.status !== "active") {
    throw new BadRequestException('Van is not active');
  }
   

    const kids =
      await this.databaseService.repositories.KidModel.aggregate([

        { $match: { VanId: van._id.toString() }},


        {
          $lookup: {
            from: "vans",
            let: { vanObjId: { $toObjectId: "$VanId" }},
            pipeline: [
              { $match: { $expr: { $eq: ["$_id","$$vanObjId"] }}},
              { $project:{ carNumber:1, vanNumber:1 }}
            ],
            as: "van"
          }
        },
        { $unwind:{ path:"$van", preserveNullAndEmptyArrays:true }},

        // DRIVER LOOKUP
        {
          $lookup:{
            from:"drivers",
            localField:"van.driverId",
            foreignField:"_id",
            pipeline:[
              { $project:{ fullname:1, phoneNo:1 }}
            ],
            as:"driver"
          }
        },
        { $unwind:{ path:"$driver", preserveNullAndEmptyArrays:true }},

          {
          $lookup: {
            from: "schools",
            let: { schoolObjId: { $toObjectId: "$schoolId" } },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$schoolObjId"] }
                }
              },
              {
                $project: {
                  schoolName: 1,
                  schoolEmail: 1
                }
              }
            ],
            as: "school"
          }
        },
        {
          $unwind: {
            path: "$school",
            preserveNullAndEmptyArrays: true
          }
        }

      ]);

    return {
      message:'Kids fetched successfully',
      data:kids
    };
  }


  const parent =
    await this.databaseService.repositories.parentModel.findById(userId);
  if (!parent) throw new UnauthorizedException('Parent not found');

  const kids =
    await this.databaseService.repositories.KidModel.aggregate([

      { $match:{ parentId: parent._id }},


      {
        $lookup:{
          from:"vans",
          let:{ vanObjId:{ $toObjectId:"$VanId" }},
          pipeline:[
            { $match:{ $expr:{ $eq:["$_id","$$vanObjId"] }}},
            { $project:{ carNumber:1, vanNumber:1, driverId:1, status:1 }}
          ],
          as:"van"
        }
      },
      { $unwind:{ path:"$van", preserveNullAndEmptyArrays:true }},

      // DRIVER LOOKUP
      {
        $lookup:{
          from:"drivers",
          localField:"van.driverId",
          foreignField:"_id",
          pipeline:[
            { $project:{ fullname:1, phoneNo:1 }}
          ],
          as:"driver"
        }
      },
      { $unwind:{ path:"$driver", preserveNullAndEmptyArrays:true }},

        {
          $lookup: {
            from: "schools",
            let: { schoolObjId: { $toObjectId: "$schoolId" } },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$schoolObjId"] }
                }
              },
              {
                $project: {
                  schoolName: 1,
                  schoolEmail: 1
                }
              }
            ],
            as: "school"
          }
        },
        {
          $unwind: {
            path: "$school",
            preserveNullAndEmptyArrays: true
          }
        },

    ]);

  return {
    message:'Kids fetched successfully',
    data:kids
  };
}


// async assignVanToStudents(
//   kidIds: string[],
//   vanId: string,
//   adminId: string,
// ) {


//   const adminObjectId = new Types.ObjectId(adminId);

//   const school = await this.databaseService.repositories.SchoolModel.findOne({
//     admin: adminObjectId,
//   });

//   if (!school) {
//     throw new UnauthorizedException('School not found');
//   }

//   const schoolIdString = school._id.toString();

//   const van = await this.databaseService.repositories.VanModel.findOne({
//     _id: vanId,
//     schoolId: schoolIdString,
//   });



//   if (!van) {
//     throw new BadGatewayException('Van not found in this school');
//   }

//   if (van.status !== "active") {
//     throw new BadRequestException('Van is not active');
//   }

 

//   console.log(van)

//   const driverId = van.driverId;
//   if (!driverId) {
//     throw new BadRequestException('Driver not found for this van'); 
//   }

//   const driver = await this.databaseService.repositories.driverModel.findOne({
//     _id: driverId,  
//     schoolId: schoolIdString,
//     isDelete: false,
//   });

//   if (!driver) {
//     throw new BadRequestException('Driver not found for this van'); 
//   }

//   if (driver.status !== "active") {   
//     throw new BadRequestException('Driver is not active');
//   }

//   const kidObjectIds = kidIds.map(id => new Types.ObjectId(id));
//   console.log(kidObjectIds)

//   // 1️⃣ Update Kids
//   await this.databaseService.repositories.KidModel.updateMany(
//     {
//       _id: { $in: kidObjectIds },
//       schoolId: schoolIdString,
//     },
//     {
//       $set: {
//         VanId: vanId,
//       },
//     },
//   );

//   // 2️⃣ Fetch Kids
//   const kids = await this.databaseService.repositories.KidModel.find(
//     {
//       _id: { $in: kidObjectIds },
//       schoolId: schoolIdString,
//     },
//     {
//       parentId: 1,
//       fullname: 1,
//     },
//   );


//   // 3️⃣ Unique Parent IDs
//   const uniqueParentIds = [
//     ...new Set(
//       kids
//         .filter(k => k.parentId)
//         .map(k => k.parentId.toString()),
//     ),
//   ];

//   // 4️⃣ Send Notification
//   for (const parentId of uniqueParentIds) {

//    const parent = await this.databaseService.repositories.parentModel.findOne({
//   _id: parentId,
//   isDelete: false,
// });

//     if (!parent || parent.isDelete === true) continue;

//     const title = "Van Assigned";

//     // Parent ke kids filter
//     const kidsOfParent = kids.filter(
//       k => k.parentId && k.parentId.toString() === parentId,
//     );

//     const kidNames = kidsOfParent.map(k => k.fullname).join(", ");

//     const message = `Your child ${kidNames} has been assigned to the van.`;

//     console.log (parent);

//     // 🔔 Push Notification
//     if (parent.fcmToken) {
//       await this.firebaseAdminService.sendToDevice(
//         parent.fcmToken,
//         {
//           notification: {
//             title,
//             body: message,
//           },
//         },
//       );
//     }

//     // 💾 Save Notification
//     await this.databaseService.repositories.notificationModel.create({
//       type: "admin",
//       parentId: parent._id.toString(),
//       schoolId: schoolIdString,
//       infoType: "Information",
//       infoType2: "forParents",
//       VanId: vanId,
//       title,
//       message,
//       actionType: "VAN_ASSIGNED",
//       status: "sent",
//       date: new Date(),
//     });
//   }

  

//   return {
//     message: "Van assigned & parents notified successfully",
//   };
// }

async assignVanToStudents(
  kidIds: string[],
  vanId: string,
  adminId: string,
) {
  const adminObjectId = new Types.ObjectId(adminId);

  // 1️⃣ Check School
  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException('School not found');
  }

  const schoolIdString = school._id.toString();

  // 2️⃣ Check Van
  const van = await this.databaseService.repositories.VanModel.findOne({
    _id: vanId,
    schoolId: schoolIdString,
  });

  if (!van) {
    throw new BadRequestException('Van not found in this school');
  }

  if (van.status !== "active") {
    throw new BadRequestException('Van is not active');
  }

  // 3️⃣ Check Driver
  if (!van.driverId) {
    throw new BadRequestException('Driver not assigned to this van');
  }

  const driver = await this.databaseService.repositories.driverModel.findOne({
    _id: van.driverId,
    schoolId: schoolIdString,
    isDelete: false,
  });

  if (!driver || driver.status !== "active") {
    throw new BadRequestException('Driver not active');
  }

  const driverId = van.driverId;

  // 4️⃣ Convert IDs
  const kidObjectIds = kidIds.map(id => new Types.ObjectId(id));

  // 5️⃣ Fetch Kids
  const kids = await this.databaseService.repositories.KidModel.find({
    _id: { $in: kidObjectIds },
    schoolId: schoolIdString,
  });

  // 6️⃣ Categorize Kids
  const assignableKids = [];
  const alreadySameVan = [];
  const differentVanKids = [];

  for (const kid of kids) {
    if (!kid.VanId) {
      assignableKids.push(kid);
    } 
    else if (kid.VanId.toString() === vanId) {
      alreadySameVan.push(kid);
    } 
    else {
      differentVanKids.push(kid);
    }
  }

  // 7️⃣ Assign ONLY valid kids
  const assignableIds = assignableKids.map(k => k._id);

  if (assignableIds.length > 0) {
    await this.databaseService.repositories.KidModel.updateMany(
      { _id: { $in: assignableIds } },
      { $set: { VanId: vanId } },
    );
  }

  // 8️⃣ Fetch updated kids (for parent notification)
  const updatedKids = await this.databaseService.repositories.KidModel.find(
    { _id: { $in: assignableIds } },
    { parentId: 1, fullname: 1 },
  );

  // 9️⃣ Unique Parents
  const uniqueParentIds = [
    ...new Set(
      updatedKids
        .filter(k => k.parentId)
        .map(k => k.parentId.toString()),
    ),
  ];

  // 🔔 Parent Notifications
  for (const parentId of uniqueParentIds) {
    const parent = await this.databaseService.repositories.parentModel.findOne({
      _id: parentId,
      isDelete: false,
    });

    if (!parent) continue;

    const kidsOfParent = updatedKids.filter(
      k => k.parentId && k.parentId.toString() === parentId,
    );

    const kidNames = kidsOfParent.map(k => k.fullname).join(", ");

    const title = "Van Assigned";
    const message = `Your child ${kidNames} has been assigned to the van.`;

    // Push
    if (parent.fcmToken && parent.notificationToggle === true) {
      console.log(parent.fcmToken);
      await this.firebaseAdminService.sendToDevice(parent.fcmToken, {
        notification: {
          title,
          body: message,
        },
      });
    }

    // Save DB
    await this.databaseService.repositories.notificationModel.create({
      type: "admin",
      parentId: parent._id.toString(),
      schoolId: schoolIdString,
      VanId: vanId,
      infoType: "Information",
      infoType2: "forParents",
      title,
      message,
      actionType: "VAN_ASSIGNED",
      status: "sent",
      date: new Date(),
    });
  }

  // 🚐 DRIVER NOTIFICATION (NEW)
  const assignedCount = assignableKids.length;

  if (assignedCount > 0) {
    const driverData =
      await this.databaseService.repositories.driverModel.findOne({
        _id: driverId,
        isDelete: false,
      });

    if (driverData) {
      const driverTitle = "New Students Assigned";
      const driverMessage = `${assignedCount} new student(s) assigned to your van.`;

      // Push
      if (driverData.fcmToken && driverData.notificationToggle === true) {
        await this.firebaseAdminService.sendToDevice(
          driverData.fcmToken,
          {
            notification: {
              title: driverTitle,
              body: driverMessage,
            },
          },
        );
      }

      // Save DB
      await this.databaseService.repositories.notificationModel.create({
        type: "admin",
        driverId: driverId.toString(),
        schoolId: schoolIdString,
        VanId: vanId,
        infoType: "Information",
        title: driverTitle,
        message: driverMessage,
        actionType: "DRIVER_NEW_STUDENTS_ASSIGNED",
        status: "sent",
        date: new Date(),
      });
    }
  }

  // 🔥 FINAL RESPONSE
  return {
    message: "Van assignment processed successfully",

    summary: {
      totalRequested: kidIds.length,
      assigned: assignableKids.length,
      alreadySameVan: alreadySameVan.length,
      differentVan: differentVanKids.length,
    },

    details: {
      assignedKids: assignableKids.map(k => ({
        id: k._id,
        name: k.fullname,
      })),

      alreadySameVanKids: alreadySameVan.map(k => ({
        id: k._id,
        name: k.fullname,
        reason: "ALREADY_ASSIGNED_TO_THIS_VAN",
      })),

      differentVanKids: differentVanKids.map(k => ({
        id: k._id,
        name: k.fullname,
        reason: "ASSIGNED_TO_OTHER_VAN",
      })),
    },

    driverNotification: {
      sent: assignableKids.length > 0,
      assignedCount: assignableKids.length,
    },
  };
}
async assignVanToDriver(
  driverId: string,
  vanId: string,
  adminId: string,
) {

  const adminObjectId = new Types.ObjectId(adminId);
  const driverObjectId = new Types.ObjectId(driverId);

  // 1️⃣ Check School
  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException('School not found');
  }

  const schoolIdString = school._id.toString();

  // 2️⃣ Find Driver
const driver = await this.databaseService.repositories.driverModel.findOne({
  _id: driverObjectId,
  schoolId: schoolIdString,
  isDelete: false,
});



  if (driver.status !== "active") {
    throw new BadRequestException('Driver is not active');
  }

  

  if (!driver) {
    throw new BadRequestException('Driver not found in this school');
  }

  const existingVan = await this.databaseService.repositories.VanModel.findOne({
  driverId: driverObjectId,
});

if (existingVan) {
  throw new BadRequestException('Driver is already assigned to another van');
}

  // 3️⃣ Find Van
  const van = await this.databaseService.repositories.VanModel.findOne({
    _id: vanId,
    schoolId: schoolIdString,
  });

  if (!van) {
    throw new BadGatewayException('Van not found in this school');
  }

  if (van.status !== "active") {
    throw new BadRequestException('Van is not active');
  }

  if (van.driverId) {
    return {
      message: 'Van already assigned',
      data: van,
    };
  }

  // 4️⃣ Assign Driver
  van.driverId = driverObjectId;
  const updatedVan = await van.save();

  // 5️⃣ Send Notification to Driver
  const title = "Van Assigned";
  const message = "You have been assigned a new van.";

  if (driver.fcmToken && driver.notificationToggle === true) {
    await this.firebaseAdminService.sendToDevice(
      driver.fcmToken,
      {
        notification: {
          title,
          body: message,
        },
        data: {
          vanId: van._id.toString(),
          status: "VAN_ASSIGNED",
          time: new Date().toISOString(),
        },
      },
    );
  }

  // 6️⃣ Save Notification in DB
  await this.databaseService.repositories.notificationModel.create({
    type: "admin",
    schoolId: schoolIdString,
    driverId: driver._id.toString(),
    infoType: "Information",
    VanId: van._id.toString(),
    title,
    message,
    actionType: "VAN_ASSIGNED",
    status: "sent",
    date: new Date(),
  });

  return {
    message: 'Van assigned successfully & driver notified',
    data: updatedVan,
  };
}

async verifyStudentsByAdmin(
  kidIds: string[],
  adminId: string,
  status: string,
) {

  const adminObjectId = new Types.ObjectId(adminId);

  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException('School not found');
  }

  const schoolIdString = school._id.toString();

  if (status !== 'active' && status !== 'inActive') {
    throw new BadRequestException('Invalid status value');
  }

  const kidObjectIds = kidIds.map(id => new Types.ObjectId(id));

  // 3️⃣ Update Kids
  const result = await this.databaseService.repositories.KidModel.updateMany(
    {
      _id: { $in: kidObjectIds },
      schoolId: schoolIdString,
    },
    {
      $set: {
        verifiedBySchool: true,
        status: status,
      },
    },
  );

  // 4️⃣ Fetch Updated Kids
  const kids = await this.databaseService.repositories.KidModel.find(
    {
      _id: { $in: kidObjectIds },
      schoolId: schoolIdString,
    },
    {
      parentId: 1,
      fullname: 1,
    },
  );

  // 5️⃣ Unique Parent IDs
  const uniqueParentIds = [
    ...new Set(
      kids
        .filter(k => k.parentId)
        .map(k => k.parentId.toString()),
    ),
  ];

  // 6️⃣ Send Notification to Each Parent
  for (const parentId of uniqueParentIds) {

    
   const parent = await this.databaseService.repositories.parentModel.findOne({
  _id: parentId,
  isDelete: false,
});

    if (!parent || parent.isDelete === true) continue;

    const title = "Student Verification Update";

    // yahan student names add kiye gaye
    const kidsOfParent = kids.filter(
      k => k.parentId && k.parentId.toString() === parentId,
    );

    const kidNames = kidsOfParent.map(k => k.fullname).join(", ");

    const message =
      status === "active"
        ? `Your child ${kidNames} has been approved by the school.`
        : `Your child ${kidNames} has been marked inactive by the school.`;

    // 🔔 Push
    if (parent.fcmToken && parent.notificationToggle === true) {
      await this.firebaseAdminService.sendToDevice(
        parent.fcmToken,
        {
          notification: {
            title,
            body: message,
          },
        },
      );
    }

    // 💬 WhatsApp — uses the school's own WABA if connected, else platform default
    if (parent.phoneNo) {
      try {
        if (school.waConnected && school.waPhoneNumberId && school.waAccessToken) {
          await this.whatsappService.sendWithSchoolCredentials(
            school.waPhoneNumberId,
            school.waAccessToken,
            parent.phoneNo,
            message,
          );
        } else {
          await this.whatsappService.sendTextMessage(parent.phoneNo, message);
        }
      } catch (err) {
        console.error('Parent verification WhatsApp send failed:', err?.message || err);
      }
    }

    await this.databaseService.repositories.notificationModel.create({
      type: "admin",
      schoolId: schoolIdString,
      parentId: parent._id.toString(),
      infoType: "Information",
      title,
      message,
      actionType: "STUDENT_VERIFIED",
      status: "sent",
      date: new Date(),
    });
  }

  return {
    message: 'Students updated successfully & parents notified',
    modifiedCount: result.modifiedCount,
  };
}

// async removeVanFromKids(
//   kidIds: string[],
// ) {

//   const kidObjectIds = kidIds.map(id => new Types.ObjectId(id));

//   // 1️⃣ Remove Van
//   const result =
//     await this.databaseService.repositories.KidModel.updateMany(
//       {
//         _id: { $in: kidObjectIds },
//       },
//       {
//         $set: {
//           VanId: null,
//         },
//       },
//     );

//   // 2️⃣ Fetch Kids (parent + name)
//   const kids =
//     await this.databaseService.repositories.KidModel.find(
//       {
//         _id: { $in: kidObjectIds },
//       },
//       {
//         parentId: 1,
//         fullname: 1,
//         schoolId: 1,
//       },
//     );

//   // 3️⃣ Unique Parent IDs
//   const uniqueParentIds = [
//     ...new Set(
//       kids
//         .filter(k => k.parentId)
//         .map(k => k.parentId.toString()),
//     ),
//   ];

//   // 4️⃣ Send Notification (ONE per parent)
//   for (const parentId of uniqueParentIds) {

//     const parent =
//       await this.databaseService.repositories.parentModel.findOne({
//         _id: parentId,
//         isDelete: false,
//       });

//     if (!parent) continue;

//     const title = "Van Removed";

//     // Parent ke kids filter
//     const kidsOfParent = kids.filter(
//       k => k.parentId && k.parentId.toString() === parentId,
//     );

//     const kidNames = kidsOfParent.map(k => k.fullname).join(", ");

//     const message = `Your child ${kidNames} has been removed from the van.`;

//     // 🔔 Push Notification
//     if (parent.fcmToken) {
//       await this.firebaseAdminService.sendToDevice(
//         parent.fcmToken,
//         {
//           notification: {
//             title,
//             body: message,
//           },
//         },
//       );
//     }

//     // 💾 Save Notification
//     await this.databaseService.repositories.notificationModel.create({
//       type: "admin",
//       parentId: parent._id.toString(),
//       schoolId: kidsOfParent[0]?.schoolId, // kisi ek kid ka school
//       infoType: "Information",
//       infoType2: "forParents",
//       VanId: null,
//       title,
//       message,
//       actionType: "VAN_REMOVED",
//       status: "sent",
//       date: new Date(),
//     });
//   }

//   return {
//     message: 'Van removed from kids successfully & parents notified',
//     modifiedCount: result.modifiedCount,
//   };
// }

async removeVanFromKids(kidIds: string[]) {

  const kidObjectIds = kidIds.map(id => new Types.ObjectId(id));

  // 1️⃣ Fetch kids FIRST (old VanId preserve)
  const kids =
    await this.databaseService.repositories.KidModel.find(
      {
         _id: { $in: kidObjectIds },
         VanId: { $ne: null }, // ✅ ONLY those who actually had a van
  },
      {
        parentId: 1,
        fullname: 1,
        schoolId: 1,
        VanId: 1,
      },
    );

  // 2️⃣ Unique Parent IDs
  const uniqueParentIds = [
    ...new Set(
      kids
        .filter(k => k.parentId)
        .map(k => k.parentId.toString()),
    ),
  ];

  // 3️⃣ Unique Van IDs (OLD)
  const uniqueVanIds = [
    ...new Set(
      kids
        .filter(k => k.VanId)
        .map(k => k.VanId.toString()),
    ),
  ].map(id => new Types.ObjectId(id)); // 🔥 convert back to ObjectId

  // 4️⃣ Remove Van
  const result =
    await this.databaseService.repositories.KidModel.updateMany(
      {
        _id: { $in: kidObjectIds },
      },
      {
        $set: {
          VanId: null,
        },
      },
    );

  // ===========================
  // 🔔 PARENT NOTIFICATIONS
  // ===========================
  for (const parentId of uniqueParentIds) {

    const parent =
      await this.databaseService.repositories.parentModel.findOne({
        _id: new Types.ObjectId(parentId),
        isDelete: false,
      });

    if (!parent) continue;

    const kidsOfParent = kids.filter(
      k => k.parentId && k.parentId.toString() === parentId,
    );

    const kidNames = kidsOfParent.map(k => k.fullname).join(", ");

    const title = "Van Removed";
    const message = `Your child ${kidNames} has been removed from the van.`;

    // 🔔 FCM
    if (parent.fcmToken && parent.notificationToggle === true) {
      await this.firebaseAdminService.sendToDevice(
        parent.fcmToken,
        {
          notification: {
            title,
            body: message,
          },
        },
      );
    }

    // 💾 Save Notification
    await this.databaseService.repositories.notificationModel.create({
      type: "admin",
      parentId: parent._id.toString(), // 🔥 ObjectId hi rakha
      schoolId: kidsOfParent[0]?.schoolId,
      infoType: "Information",
      infoType2: "forParents",
      VanId: null,
      title,
      message,
      actionType: "VAN_REMOVED",
      status: "sent",
      date: new Date(),
    });
  }

  // ===========================
  // 🚐 DRIVER NOTIFICATIONS
  // ===========================

  // 5️⃣ Fetch Vans
  const vans =
    await this.databaseService.repositories.VanModel.find({
      _id: { $in: uniqueVanIds },
    });

  for (const van of vans) {

    // ❌ No driver → skip
    if (!van.driverId) continue;

    const driver =
      await this.databaseService.repositories.driverModel.findOne({
        _id: van.driverId, // 🔥 already ObjectId
        isDelete: false,
      });

    if (!driver) continue;

    const kidsOfVan = kids.filter(
      k =>
        k.VanId &&
        k.VanId.toString() === van._id.toString(),
    );

    if (kidsOfVan.length === 0) continue;

    const kidNames = kidsOfVan.map(k => k.fullname).join(", ");

    const title = "Kids Removed From Van";
    const message = `Kids ${kidNames} have been removed from your van.`;

    // 🔔 FCM
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

    // 💾 Save Notification
    await this.databaseService.repositories.notificationModel.create({
      type: "admin",
      driverId: driver._id.toString(), // 🔥 ObjectId
      VanId: van._id.toString(),       // 🔥 ObjectId
      schoolId: kidsOfVan[0]?.schoolId,
      infoType: "Information",
      title,
      message,
      actionType: "KIDS_REMOVED_FROM_VAN",
      status: "sent",
      date: new Date(),
    });
  }

  return {
    message: 'Van removed from kids successfully & parents & drivers notified',
    modifiedCount: result.modifiedCount,
  };
}




async updateKid(parentId: string, kidId: string, createKidDto: CreateKidDto) {
    // 🔹 Step 1: Driver check
    const parent = await this.databaseService.repositories.parentModel.findById(parentId);
    if (!parent) {
      throw new BadRequestException('parents not found');
    }

    // 🔹 Step 2: Van check
    const kid  = await this.databaseService.repositories.KidModel.findById(kidId);
    if (!kid) {
      throw new BadRequestException('kid not found');
    }

      if (createKidDto.VanId) {

    // Agar already van assigned hai
    if (kid.VanId) {
      throw new BadRequestException(
        'Kid already assigned to a van. Ask admin to remove van first.',
      );
    }

    // Optional: Agar tum chaho active check bhi yahan laga sakte ho
    const van = await this.databaseService.repositories.VanModel.findById(createKidDto.VanId);

    if (!van) {
      throw new NotFoundException('Van not found');
    }
  }

    // 🔹 Step 3: Update van with DTO
    const updatedKid = await this.databaseService.repositories.KidModel.findByIdAndUpdate(
      kidId,
     { $set: { ...createKidDto } }, // 👈 spread use karo
      { new: true },
    );

    return {
      message: 'kid updated successfully',
      data: updatedKid,
    };
  }

  async getParentActiveTrips(parentId: string) {

    // new changes
   const parentobjId = new Types.ObjectId(parentId);

     const parent = await this.databaseService.repositories.parentModel.findById(parentobjId);

      if (!parent) { 
        throw new BadRequestException('Parent not found');  
        }

        // const schoolId = parent.schoolId;

        // if (!schoolId) {  
        //   throw new BadRequestException('Parent is not associated with any school');
        // }
   
    const kids = await this.databaseService.repositories.KidModel.find(
      
      { parentId: new Types.ObjectId(parentId), status: "active" },
      { VanId: 1, fullname: 1, image: 1, status: 1 }
    );

    console.log (kids)

    // end new changes 
  
    if (!kids || kids.length === 0) {
  throw new NotFoundException('Kids not found');
}

  
    
    const vanIds = kids.map(k => k.VanId);
    const uniqueVanIds = [...new Set(vanIds)];
  
   
// const vanIds = kids
//   .map(k => k.VanId)
//   .filter(Boolean); // null / undefined hata do

//   if (vanIds.length === 0) {
//   return []; 
// }


// const activeVans = await this.databaseService.repositories.VanModel.find({
//   _id: { $in: vanIds },
//   status: 'active'
// }).select('_id');

// if (activeVans.length === 0) {
//   return []; 
// }

// // 3) active vans ki ids nikaal lo
// const activeVanIds = activeVans.map(v => v._id.toString());

// // 4) unique active van ids
// const uniqueVanIds = [...new Set(activeVanIds)];
   
    const kidsByVan = kids.reduce((acc, kid) => {
      if (!acc[kid.VanId]) acc[kid.VanId] = [];
      acc[kid.VanId].push({
        id: kid._id.toString(),
        name: kid.fullname,
        image: kid?.image || "",
        status: kid?.status || "",
      });
      return acc;
    }, {});
  
    // Date filter for "today"
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
  
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
  
    // Step 4: Trips fetch
    const trips = await this.databaseService.repositories.TripModel.aggregate([
      {
        $match: {
          vanId: { $in: uniqueVanIds },
          status: { $ne: "end" },
          "tripStart.startTime": {
            $gte: todayStart,
            $lte: todayEnd
          }
        }
      },
      {
        $lookup: {
          from: "vans",
          let: { tripVanId: { $toObjectId: "$vanId" } },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$tripVanId"] } } },
            {
              $lookup: {
                from: "drivers",
                localField: "driverId",
                foreignField: "_id",
                as: "driver"
              }
            },
            { $unwind: { path: "$driver", preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: "schools",
                let: { schoolIdStr: "$schoolId" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: ["$_id", { $toObjectId: "$$schoolIdStr" }]
                      }
                    }
                  },
                  { $project: { contactNumber: 1 } }
                ],
                as: "school"
              }
            },
            { $unwind: { path: "$school", preserveNullAndEmptyArrays: true } }
          ],
          as: "van"
        }
      },
      { $unwind: { path: "$van", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          tripId: "$_id",
          vanId: "$vanId",
          Vanstatus: "$van.status",
          kids: 1, // <<----- IMPORTANT: return kids from DB
          startTime: "$tripStart.startTime",
          status: 1,
          type: 1,
          locations: 1,
          carNumber: "$van.carNumber",
          assignRoute: "$van.assignRoute",
          driverFullname: "$van.driver.fullname",
          driverImage: "$van.driver.image",
          driverPhoneNo: "$van.driver.phoneNo",
          schoolContact: "$van.school.contactNumber",
          _id: 0
        }
      }
    ]);
  
    // Step 5: Merge kids status
    const tripsWithKids = trips.map(t => {
      const vanKids = kidsByVan[t.vanId] || [];
  
      const kidsWithStatus = vanKids.map(k => {
        const tripKid = t.kids?.find(x => x.kidId === k.id);
  
        return {
          ...k,
          pickupStatus: tripKid? true : false ,
          pickupTime: tripKid?.time || null,
          lat: tripKid?.lat || null,
          long: tripKid?.long || null
        };
      });
  
      return {
        ...t,
        kids: kidsWithStatus
      };
    });
  
    return { data: tripsWithKids };
  }
  
  

async getParentDriversWithSchool(parentId: string) {
  const Kid = this.databaseService.repositories.KidModel;
  const Van = this.databaseService.repositories.VanModel;
  const User = this.databaseService.repositories.driverModel;
  const School = this.databaseService.repositories.SchoolModel;


  const kids = await Kid.find(
    { parentId: new Types.ObjectId(parentId) },
    {
      _id: 1,
      fullname: 1,
      gender: 1,
      grade: 1,
      image: 1,
      status: 1,
      verifiedBySchool: 1,
      VanId: 1,
      schoolId: 1,
    }
  ).lean();

  if (!kids || kids.length === 0) {
    return { data: [] };
  }


  const vanIds = Array.from(new Set(kids.map(k => k.VanId).filter(Boolean)));
  if (!vanIds || vanIds.length === 0) {
  return []; 
}

  const vanObjectIds = vanIds
    .filter(id => Types.ObjectId.isValid(id))
    .map(id => new Types.ObjectId(id));

  // 3) Vans fetch karo
  let vans: any[] = [];
  if (vanObjectIds.length > 0) {
    vans = await Van.find(
      { _id: { $in: vanObjectIds } },
      {
        _id: 1,
        carNumber: 1,
        venCapacity: 1,
        condition: 1,
        vehicleType: 1,
        status: 1,
        venImage: 1,
        assignRoute: 1,
        deviceId: 1,
        driverId: 1,
      }
    ).lean();
  }

  // 4) Drivers fetch karo
  const driverIds = Array.from(
    new Set(vans.map(v => v.driverId?.toString()).filter(Boolean))
  );
  let drivers: any[] = [];
  if (driverIds.length > 0) {
    drivers = await User.find(
      { _id: { $in: driverIds.map(id => new Types.ObjectId(id)) } },
      {
        _id: 1,
        fullname: 1,
        phoneNo: 1,
        image: 1,
        userType: 1,
        isVerified: 1,
        lat: 1,
        long: 1,
        address: 1,
        email: 1,
      }
    ).lean();
  }
  const driverMap = new Map(drivers.map(d => [d._id.toString(), d]));

  // 5) Schools fetch karo
  const schoolIds = Array.from(
    new Set(kids.map(k => k.schoolId).filter(Boolean))
  );
  let schoolMap = new Map<string, string>();
  if (schoolIds.length > 0) {
    const schools = await School.find(
      { _id: { $in: schoolIds.map(id => new Types.ObjectId(id)) } },
      { _id: 1, schoolName: 1 }
    ).lean();
    schoolMap = new Map(schools.map(s => [s._id.toString(), s.schoolName]));
  }

  // 6) Kids ko VanId ke hisaab se group karo
  const kidsByVan = new Map<string, any[]>();
  for (const k of kids) {
    const vId = k.VanId ? String(k.VanId) : '';
    const kidLite = {
      id: k._id,
      fullname: k.fullname ?? null,
      gender: k.gender ?? null,
      grade: k.grade ?? null,
      image: k.image ?? null,
      status: k.status ?? null,
      verifiedBySchool: !!k.verifiedBySchool,
      schoolId: k.schoolId ?? null,
      schoolName: k.schoolId ? schoolMap.get(k.schoolId) ?? null : null,
    };
    if (!vId || !Types.ObjectId.isValid(vId)) continue;
    if (!kidsByVan.has(vId)) kidsByVan.set(vId, []);
    kidsByVan.get(vId)!.push(kidLite);
  }

  // 7) Result: har van + driver + uske kids
  const result = vans.map(v => {
    const vId = v._id.toString();
    const kidsOfThisVan = kidsByVan.get(vId) ?? [];
    const driver = v.driverId ? driverMap.get(v.driverId.toString()) : null;

    return {
      van: {
        id: v._id,
        carNumber: v.carNumber ?? null,
        capacity: v.venCapacity ?? null,
        condition: v.condition ?? null,
        vehicleType: v.vehicleType ?? null,
        status: v.status ?? null,
        image: v.venImage ?? null,
        assignRoute: v.assignRoute ?? null,
        deviceId: v.deviceId ?? null,
      },
      driver,
      kids: kidsOfThisVan,
    };
  });

  // 8) Unassigned kids (VanId missing/invalid/not found)
  const assignedVanIds = new Set(vans.map(v => v._id.toString()));
  const unassignedKids = kids
    .filter(
      k =>
        !k.VanId ||
        !Types.ObjectId.isValid(String(k.VanId)) ||
        !assignedVanIds.has(String(k.VanId))
    )
    .map(k => ({
      id: k._id,
      fullname: k.fullname ?? null,
      gender: k.gender ?? null,
      grade: k.grade ?? null,
      image: k.image ?? null,
      status: k.status ?? null,
      verifiedBySchool: !!k.verifiedBySchool,
      vanId: k.VanId ?? null,
      schoolId: k.schoolId ?? null,
      schoolName: k.schoolId ? schoolMap.get(k.schoolId) ?? null : null,
    }));

  if (unassignedKids.length > 0) {
    result.push({
      van: null,
      driver: null,
      kids: unassignedKids,
    });
  }

  return { data: result };
}

async getTripHistoryByParent(
  parentId: string,
  date?: string,
  page: number = 1,
  limit: number = 10,
) {
  // ==============================
  // Step 1: Parent ke kids
  // ==============================
  const parentKids = await this.databaseService.repositories.KidModel.find(
    { parentId: new Types.ObjectId(parentId) }
  );

  if (!parentKids.length) {
    return {
      data: {
        total: 0,
        page,
        limit,
        totalPages: 0,
        trips: [],
      },
    };
  }

  const parentKidIds = parentKids.map(k => k._id.toString());
  const vanIds = [...new Set(parentKids.map(k => k.VanId))];
  console.log("Parent Kid IDs:", parentKidIds);

  // ==============================
  // Step 2: Match condition
  // ==============================
  const matchCondition: any = {
    vanId: { $in: vanIds },
    status: "end",
  };

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    matchCondition.updatedAt = {
      $gte: startOfDay,
      $lte: endOfDay,
    };
  }

  // ==============================
  // Step 3: Aggregation
  // ==============================
  const pipeline: any[] = [

    { $match: matchCondition },

    // ✅ VAN LOOKUP
    {
      $lookup: {
        from: "vans",
        let: { vanObjId: { $toObjectId: "$vanId" } },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$vanObjId"] } } }
        ],
        as: "van",
      },
    },
    { $unwind: { path: "$van", preserveNullAndEmptyArrays: true } },

    // ✅ DRIVER LOOKUP
    {
      $lookup: {
        from: "drivers",
        localField: "van.driverId",
        foreignField: "_id",
        as: "driver",
      },
    },
    { $unwind: { path: "$driver", preserveNullAndEmptyArrays: true } },

    // ✅ ROUTE LOOKUP
    {
      $lookup: {
        from: "routes",
        let: { routeObjId: { $toObjectId: "$routeId" } },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$routeObjId"] } } }
        ],
        as: "route",
      },
    },
    { $unwind: { path: "$route", preserveNullAndEmptyArrays: true } },

    // ======================
    // ✅ KIDS FIX START
    // ======================

    { $unwind: "$kids" },

    {
      $match: {
        "kids.kidId": { $in: parentKidIds },
      },
    },

    // 👉 Kids table se name lana
    {
      $lookup: {
        from: "kids",
        let: { kidObjId: { $toObjectId: "$kids.kidId" } },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$kidObjId"] } } },
          { $project: { fullname: 1, image: 1 } }
        ],
        as: "kidInfo",
      },
    },
    { $unwind: "$kidInfo" },

    // ======================
    // Group back
    // ======================
    {
      $group: {
        _id: "$_id",
        status: { $first: "$status" },
        type: { $first: "$type" },
        tripStart: { $first: "$tripStart" },
        tripEnd: { $first: "$tripEnd" },
        updatedAt: { $first: "$updatedAt" },

        van: { $first: "$van" },
        driver: { $first: "$driver" },
        route: { $first: "$route" },

        kids: {
          $push: {
            kidId: "$kids.kidId",
            name: "$kidInfo.fullname",
            image: "$kidInfo.image",
            time: "$kids.time",
            lat: "$kids.lat",
            long: "$kids.long",
            status: "$kids.status",
          },
        },
      },
    },

    { $sort: { updatedAt: -1 } },

    // ======================
    // Projection
    // ======================
    {
      $project: {
        _id: 1,
        status: 1,
        type: 1,
        tripStart: 1,
        tripEnd: 1,
        updatedAt: 1,

        van: {
          _id: "$van._id",
          vanNumber: "$van.vanNumber",
          carNumber: "$van.carNumber",
        },

        driver: {
          _id: "$driver._id",
          fullname: "$driver.fullname",
          phoneNo: "$driver.phoneNo",
        },

        route: {
          _id: "$route._id",
          title: "$route.title",
        },

        kids: 1,
      },
    },

    // Pagination
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
        ],
      },
    },
  ];


  const result = await this.databaseService.repositories.TripModel.aggregate(pipeline);

  const trips = result[0]?.data || [];
  const total = result[0]?.metadata[0]?.total || 0;

  return {
    data: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      trips,
    },
  };
}





// async getTripHistoryByDriver(
//   driverId: string,
//   page: number,
//   limit: number,
//   recent: boolean,
// ) {

//   const van = await this.databaseService.repositories.VanModel.findOne(
//     { driverId: new Types.ObjectId(driverId) },
//     { _id: 1 },
//   );

 
//   if (!van) {
//     return {
//       data: recent
//         ? []
//         : {
//             total: 0,
//             page,
//             limit,
//             totalPages: 0,
//             trips: [],
//           },
//     };
//   }

 
//   const startOfDay = new Date();
//   startOfDay.setHours(0, 0, 0, 0);

//   const endOfDay = new Date();
//   endOfDay.setHours(23, 59, 59, 999);


//   const matchCondition: any = {
//     vanId: van._id.toString(),
//     status: 'end',
//   };

//   if (recent) {
//     matchCondition.updatedAt = {
//       $gte: startOfDay,
//       $lte: endOfDay,
//     };
//   } else {
//     matchCondition.updatedAt = { $lt: startOfDay };
//   }


//   const pipeline: any[] = [
//     { $match: matchCondition },

   
//     {
//       $lookup: {
//         from: 'routes',
//         let: { routeId: { $toObjectId: '$routeId' } },
//         pipeline: [
//           { $match: { $expr: { $eq: ['$_id', '$$routeId'] } } },
//         ],
//         as: 'route',
//       },
//     },
//     { $unwind: { path: '$route', preserveNullAndEmptyArrays: true } },


//     {
//       $lookup: {
//         from: 'schools',
//         let: { schoolId: { $toObjectId: '$schoolId' } },
//         pipeline: [
//           { $match: { $expr: { $eq: ['$_id', '$$schoolId'] } } },
//         ],
//         as: 'school',
//       },
//     },
//     { $unwind: { path: '$school', preserveNullAndEmptyArrays: true } },

   
//     {
//       $lookup: {
//         from: 'vans',
//         let: { vanId: { $toObjectId: '$vanId' } },
//         pipeline: [
//           { $match: { $expr: { $eq: ['$_id', '$$vanId'] } } },
//         ],
//         as: 'van',
//       },
//     },
//     { $unwind: { path: '$van', preserveNullAndEmptyArrays: true } },

//     { $sort: { updatedAt: -1 } },
//   ];

//   // ================= RECENT =================
//   if (recent) {
//     const trips = await this.databaseService.repositories.TripModel.aggregate(
//       pipeline,
//     );

//     return { data: trips };
//   }

//   // ================= PAST (Pagination) =================
//   const totalResult =
//     await this.databaseService.repositories.TripModel.aggregate([
//       ...pipeline,
//       { $count: 'total' },
//     ]);

//   const total = totalResult[0]?.total || 0;

//   const trips =
//     await this.databaseService.repositories.TripModel.aggregate([
//       ...pipeline,
//       { $skip: (page - 1) * limit },
//       { $limit: limit },
//     ]);

//   return {
//     data: {
//       total,
//       page,
//       limit,
//       totalPages: Math.ceil(total / limit),
//       trips,
//     },
//   };
// }

async getTripHistoryByDriver(
  driverId: string,
  page: number,
  limit: number,
  recent: boolean,
) {
  const van = await this.databaseService.repositories.VanModel.findOne(
    { driverId: new Types.ObjectId(driverId) },
    { _id: 1 },
  );

  if (!van) {
    return {
      data: {
        total: 0,
        page,
        limit,
        totalPages: 0,
        trips: [],
      },
    };
  }

  // ===== TODAY RANGE =====
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // ===== MATCH CONDITION =====
  const matchCondition: any = {
    vanId: van._id.toString(),
    status: 'end',
  };

  if (recent) {
    matchCondition.updatedAt = {
      $gte: startOfDay,
      $lte: endOfDay,
    };
  } else {
    matchCondition.updatedAt = { $lt: startOfDay };
  }

  // ===== PIPELINE =====
  const pipeline: any[] = [
    { $match: matchCondition },

    {
      $lookup: {
        from: 'routes',
        let: { routeId: { $toObjectId: '$routeId' } },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$routeId'] } } },
        ],
        as: 'route',
      },
    },
    { $unwind: { path: '$route', preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: 'schools',
        let: { schoolId: { $toObjectId: '$schoolId' } },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$schoolId'] } } },
        ],
        as: 'school',
      },
    },
    { $unwind: { path: '$school', preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: 'vans',
        let: { vanId: { $toObjectId: '$vanId' } },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$vanId'] } } },
        ],
        as: 'van',
      },
    },
    { $unwind: { path: '$van', preserveNullAndEmptyArrays: true } },

    { $sort: { updatedAt: -1 } },
  ];

  // ===== COMMON PAGINATION (for BOTH cases) =====
  const totalResult =
    await this.databaseService.repositories.TripModel.aggregate([
      ...pipeline,
      { $count: 'total' },
    ]);

  const total = totalResult[0]?.total || 0;

  const trips =
    await this.databaseService.repositories.TripModel.aggregate([
      ...pipeline,
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]);

  return {
    data: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      trips,
    },
  };
}




async deleteKidByIdAndParent(parentId: string, kidId: string) {
 const Kid = this.databaseService.repositories.KidModel;

 
  if (!Types.ObjectId.isValid(parentId) || !Types.ObjectId.isValid(kidId)) {
    return { message: 'Invalid parentId or kidId' };
  }


  const result = await Kid.updateOne(
    { _id: new Types.ObjectId(kidId), parentId: new Types.ObjectId(parentId) },
    {
      $set: {
        parentId: null,
        schoolId: null,
        VanId: null,
        status: 'inActive',
      },
    }
  );

  
  if (result.modifiedCount > 0) {
    return { message: 'Kid marked as inActive and relations removed' };
  } else {
    return { message: 'Kid not found for this parent' };
  }
}



async assignVanByParent(parentId: string, dto: { kidId: string; vanId: string }) {

  const { kidId, vanId } = dto;

  // 🔹 1️⃣ Parent check
  const parent = await this.databaseService.repositories.parentModel.findById(parentId);
  if (!parent) {
    throw new BadRequestException('Parent not found');
  }

  // 🔹 2️⃣ Kid check
  const kid = await this.databaseService.repositories.KidModel.findById(kidId);
  if (!kid) {
    throw new BadRequestException('Kid not found');
  }


  console.log("walii")


 
  if (kid.VanId) {
    throw new BadRequestException(
      'Kid already has a van assigned. Remove it first.'
    );
  }

  // 🔹 5️⃣ Van check
  const van = await this.databaseService.repositories.VanModel.findById(vanId);
  if (!van) {
    throw new NotFoundException('Van not found');
  }

  // 🔹 6️⃣ Van must be active
  if (van.status !== 'active') {
    throw new BadRequestException('Van is not active');
  }

  // 🔹 7️⃣ Assign van to kid
  const updatedKid = await this.databaseService.repositories.KidModel.findByIdAndUpdate(
    kidId,
    {
      $set: { VanId: vanId },
    },
    { new: true },
  );

  return {
    message: 'Van assigned successfully to kid',
    data: updatedKid,
  };
}
}