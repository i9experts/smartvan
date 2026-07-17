/* eslint-disable prettier/prettier */
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DatabaseService } from 'src/database/databaseservice';
import { Types } from 'mongoose';
import { FirebaseAdminService } from '../notification/firebase-admin.service';


@Injectable()
export class ReportService {
  constructor(
  private databaseService: DatabaseService,
  private firebaseAdminService: FirebaseAdminService,
  ) {}

 async createReport(body: any, parentId: string) {
  if (!parentId) {
    throw new UnauthorizedException('Invalid parent token');
  }

  const { kidId, issueType, description, image, dateOfIncident, audio, video, type } = body;

  
const kid = await this.databaseService.repositories.KidModel.findOne({
  _id: new Types.ObjectId(kidId),
  parentId: new Types.ObjectId(parentId), 
});
  
  if (!kid) {
    throw new BadRequestException('Kid not found for this parent');
  }

  const schoolId = kid.schoolId;


  let driverId: string | null = null;
  if (kid.VanId) {
 
    const van = await this.databaseService.repositories.VanModel.findById(
      new Types.ObjectId(kid.VanId),
    );

    if (van && van.driverId) {
  
      driverId = van.driverId.toString();
    }
  }


  const report = new this.databaseService.repositories.reportModel({
    kidId: kid._id.toString(),
    driverId: driverId,
    parentId: parentId,
    schoolId: schoolId,
    type,
    issueType,
    description,
    image,
    dateOfIncident,
    audio,
    video,
    
  });

  await report.save();

  return {
    message: 'Report created successfully',
    data: report,
  };
}

async createDriverReport(body: any, driverId: string) {
  if (!driverId) {
    throw new UnauthorizedException('Invalid driver token');
  }

  const { issueType, description, image, audio , video, type } = body;

  if (!issueType || !description) {
    throw new BadRequestException('Issue type and description are required');
  }

 
  const driver = await this.databaseService.repositories.driverModel.findById(
    new Types.ObjectId(driverId)
  );

  if (!driver) {
    throw new BadRequestException('Driver not found');
  }

  const schoolId = driver.schoolId
 
  const report = new this.databaseService.repositories.reportModel({
    driverId: driver._id.toString(),
    schoolId: schoolId,
    issueType,
    type,
    description,
    image,
    audio,
    video,
    createdAt: new Date(), 
  });

  await report.save();

  return {
    message: 'Report submitted successfully by driver',
    data: report,
  };
}


  async getReportsForAdmin(
    adminId: string,
    userType: string,
    query: any,
  ) {
    const adminObjectId = new Types.ObjectId(adminId);

    
    const page = Math.max(1, parseInt(query.page as string, 10) || 1);
    const limit = Math.max(1, parseInt(query.limit as string, 10) || 10);
    const skip = (page - 1) * limit;

    
   const status = typeof query.status === "string" ? query.status.trim() : "";
const typeFilter = typeof query.type === "string" ? query.type.trim() : "";

    let matchFilter: any = {};


    if (userType === "admin") {
      const school = await this.databaseService.repositories.SchoolModel.findOne({
        admin: adminObjectId,
      });

      if (!school) throw new UnauthorizedException("Invalid admin or school not found");
      matchFilter.schoolId = school._id.toString();
    } else if (userType === "superadmin") {
      matchFilter = {}; // no restriction
    } else {
      throw new UnauthorizedException("Invalid user type");
    }


    if (typeFilter && ["driverReport", "parentReport"].includes(typeFilter)) {
      matchFilter.type = typeFilter;
    }

 
    if (status) {
      matchFilter.status = status;
    }

  
    const total = await this.databaseService.repositories.reportModel.countDocuments(matchFilter);

    
    const reports = await this.databaseService.repositories.reportModel.aggregate([
      { $match: matchFilter },

   
      {
        $lookup: {
          from: "drivers",
          let: { drvId: "$driverId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$$drvId", null] },
                    { $eq: ["$_id", { $toObjectId: "$$drvId" }] },
                  ],
                },
              },
            },
            { $project: { fullname: 1 } },
          ],
          as: "driver",
        },
      },
      { $unwind: { path: "$driver", preserveNullAndEmptyArrays: true } },

      
      {
        $lookup: {
          from: "vans",
          let: { drvId: "$driverId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$$drvId", null] },
                    { $eq: ["$driverId", { $toObjectId: "$$drvId" }] },
                  ],
                },
              },
            },
            { $project: { carNumber: 1 } },
          ],
          as: "van",
        },
      },
      { $unwind: { path: "$van", preserveNullAndEmptyArrays: true } },

      // Parent lookup
      {
        $lookup: {
          from: "parents",
          let: { pId: "$parentId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$$pId", null] },
                    { $eq: ["$_id", { $toObjectId: "$$pId" }] },
                  ],
                },
              },
            },
            { $project: { fullname: 1 } },
          ],
          as: "parent",
        },
      },
      { $unwind: { path: "$parent", preserveNullAndEmptyArrays: true } },

      // Kid lookup
      {
        $lookup: {
          from: "kids",
          let: { kId: "$kidId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$$kId", null] },
                    { $eq: ["$_id", { $toObjectId: "$$kId" }] },
                  ],
                },
              },
            },
            { $project: { fullname: 1 } },
          ],
          as: "kid",
        },
      },
      { $unwind: { path: "$kid", preserveNullAndEmptyArrays: true } },

      // School lookup
      {
        $lookup: {
          from: "schools",
          let: { sId: "$schoolId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ["$$sId", null] },
                    { $ne: ["$$sId", ""] },
                    { $eq: ["$_id", { $toObjectId: "$$sId" }] },
                  ],
                },
              },
            },
            { $project: { schoolName: 1 } },
          ],
          as: "school",
        },
      },
      { $unwind: { path: "$school", preserveNullAndEmptyArrays: true } },

      // Final projection
      {
        $project: {
          _id: 1,
          schoolId: 1,
          schoolName: "$school.schoolName",
          issueType: 1,
          description: 1,
          image: 1,
          audio: 1,
          video: 1,
          type: 1,
          dateOfIncident: 1,
          status: 1,
          createdAt: 1,
          driverName: "$driver.fullname",
          vanCarNumber: "$van.carNumber",
          parentName: { $cond: [{ $ne: ["$type", "driverReport"] }, "$parent.fullname", "$$REMOVE"] },
          kidName: { $cond: [{ $ne: ["$type", "driverReport"] }, "$kid.fullname", "$$REMOVE"] },
        },
      },

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    // Return paginated response
    return {
      message: "Reports fetched successfully",
      data: reports,
      userType,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }







async changeComplaintStatus(
  adminId: string,
  reportId: string,
  newStatus: string,
  adminRemarks?: string,
) {

  const adminObjectId = new Types.ObjectId(adminId);

  // ✅ School find
  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException('Invalid admin or school not found');
  }

  const schoolId = school._id.toString();

  // ✅ Report find
  const report = await this.databaseService.repositories.reportModel.findOne({
    _id: new Types.ObjectId(reportId),
    schoolId: schoolId,
  });

  if (!report) {
    throw new BadRequestException('Report not found for this school');
  }

  // ✅ Update status
  report.status = newStatus;
  report.adminRemarks = adminRemarks;

  if ((newStatus === 'resolved' || newStatus === 'rejected') && !report.resolvedAt) {
    report.resolvedAt = new Date();
  }

  await report.save();

  // =========================
  // 🔔 NOTIFICATION PART START
  // =========================

  if (report.parentId) {

    const parent = await this.databaseService.repositories.parentModel.findOne({
      _id: report.parentId,
      isDelete: false,
    });

    if (parent && parent.isDelete !== true) {

      const title = "Complaint Status Updated";

      const message = `Your complaint status has been updated to ${newStatus}.`;

      // 🔹 Push Notification
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

      // 🔹 Save Notification in DB
      await this.databaseService.repositories.notificationModel.create({
        type: "admin",
        schoolId: schoolId,
        parentId: parent._id.toString(),
        infoType: "Information",
         infoType2: "forParents",
        title,
        message,
        actionType: "COMPLAINT_STATUS_UPDATE",
        status: "sent",
        date: new Date(),
      });
    }
  }

  if (report.driverId && !report.parentId) {

    const driver = await this.databaseService.repositories.driverModel.findOne({
      _id: report.driverId,
      isDelete: false,
    });

    if (driver && driver.isDelete !== true) {

      const title = "Complaint Status Updated";

      const message = `Your complaint status has been updated to ${newStatus}.`;

      // 🔹 Push Notification
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

      // 🔹 Save Notification in DB
      await this.databaseService.repositories.notificationModel.create({
        type: "admin",
        schoolId: schoolId,
        driverId: driver._id.toString(),
        infoType: "Information",
        title,
        message,
        actionType: "COMPLAINT_STATUS_UPDATE",
        status: "sent",
        date: new Date(),
      });
    }
  }




  return {
    message: 'Report status updated successfully',
    data: report,
  };
}

async getComplaintById(adminId: string, reportId: string) {

  const adminObjectId = new Types.ObjectId(adminId);


  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException('Invalid admin or school not found');
  }

  const schoolId = school._id.toString();


  const report = await this.databaseService.repositories.reportModel.findOne({
    _id: new Types.ObjectId(reportId),
    schoolId: schoolId,
  });

  if (!report) {
    throw new BadRequestException('Report not found for this school');
  }

  return {
    message: 'Report fetched successfully',
    data: report,
  };
}


async addFaq(data: any) {

    const existing = await this.databaseService.repositories.FAQModel.findOne();
    if (existing) {
      throw new BadRequestException('FAQ document already exists. Please update instead.');
    }

    const faq = new this.databaseService.repositories.FAQModel(data);
    return faq.save();
  }

   async getFaq(): Promise<any> {
    const faq = await this.databaseService.repositories.FAQModel.findOne(); // sirf ek hi document hai
    if (!faq) {
      throw new BadRequestException('FAQ document not found');
    }

    return {
      data: faq,   // 👈 response wrap in "data"
    };
  }


async getParentReports(
  parentId: string,
  page = 1,
  limit = 10,
  status?: string,
) {
  if (!parentId) {
    throw new UnauthorizedException('Invalid parent token');
  }

  const skip = (page - 1) * limit;

  // ✅ filter
  const filter: any = {
    parentId: parentId,
  };

  if (status) {
    filter.status = status;
  }

  // ✅ total count
  const total = await this.databaseService.repositories.reportModel.countDocuments(filter);

  // ✅ reports fetch
  const reports = await this.databaseService.repositories.reportModel
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // ✅ loop + attach kid & parent name
  const finalData = [];

  for (let report of reports) {
    // 🔹 kid find
    const kid = await this.databaseService.repositories.KidModel.findById(report.kidId);

    let kidName = null;
    let parentName = null;

    if (kid) {
      kidName = kid.fullname;

      // 🔹 parent find
      const parent = await this.databaseService.repositories.parentModel.findById(kid.parentId);

      if (parent) {
        parentName = parent.fullname;
      }
    }

    finalData.push({
      ...report.toObject(),
      kidName,
      parentName,
    });
  }

  return {
    message: 'Reports fetched successfully',
    total,
    page,
    limit,
    data: finalData,
  };
}

async getDriverReports(
  driverId: string,
  page = 1,
  limit = 10,
  status?: string,
) {
  if (!driverId) {
    throw new UnauthorizedException('Invalid driver token');
  }

  const skip = (page - 1) * limit;

  // ✅ filter
  const filter: any = {
    driverId: driverId,
     parentId: { $exists: false },
  };

  if (status) {
    filter.status = status;
  }

  // ✅ total count
  const total = await this.databaseService.repositories.reportModel.countDocuments(filter);

  // ✅ reports fetch
  const reports = await this.databaseService.repositories.reportModel
    .find({
    ...filter, // 👈 correct way
  })

    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const finalData = [];

  for (let report of reports) {

    let driverName = null;
    let carNumber = null;

    // 🔹 driver find
    const driver = await this.databaseService.repositories.driverModel.findById(report.driverId);

    if (driver) {
      driverName = driver.fullname;
    }

    const driverObjectId = new Types.ObjectId(report.driverId);
    // 🔹 van find (driverId se)
    const van = await this.databaseService.repositories.VanModel.findOne({
      driverId: driverObjectId,
    });

    if (van) {
      carNumber = van.carNumber;
    }

    finalData.push({
      ...report.toObject(),
      driverName,
      carNumber,
    });
  }

  return {
    message: 'Driver reports fetched successfully',
    total,
    page,
    limit,
    data: finalData,
  };
}

async getReportByIdByParent(reportId: string, parentId: string) {
  if (!parentId) {
    throw new UnauthorizedException('Invalid parent token');
  }

  // ✅ report find
  const report = await this.databaseService.repositories.reportModel.findOne({
    _id: reportId,
    parentId: parentId,
  }).lean();

  if (!report) {
    throw new BadRequestException('Report not found');
  }

  let kidName = null;
  let parentName = null;
  let driverName = null;
  let vanName = null;

  // ✅ Kid
  const kid = await this.databaseService.repositories.KidModel.findById(report.kidId).lean();

  if (kid) {
    kidName = kid.fullname;

    // ✅ Parent
    const parent = await this.databaseService.repositories.parentModel.findById(kid.parentId).lean();
    if (parent) {
      parentName = parent.fullname;
    }
  }

  // ✅ Driver
  if (report.driverId) {
    const driver = await this.databaseService.repositories.driverModel.findById(report.driverId).lean();
    if (driver) {
      driverName = driver.fullname;
    }
   
   const driverObjectId = new Types.ObjectId(report.driverId);
    // ✅ Van (driverId se)
    const van = await this.databaseService.repositories.VanModel.findOne({
      driverId: driverObjectId,
    }).lean();

    if (van) {
      vanName = van.carNumber; // ya jo bhi key hai
    }
  }

  return {
    message: 'Report fetched successfully',
    data: {
      ...report,
      kidName,
      parentName,
      driverName,
      vanName,
    },
  };
}

async getReportByIdByDriver(reportId: string, driverId: string) {
  if (!driverId) {
    throw new UnauthorizedException('Invalid driver token');
  }

  // ✅ report find (driverId se match)
  const report = await this.databaseService.repositories.reportModel.findOne({
    _id: reportId,
    driverId: driverId,
  }).lean();

  if (!report) {
    throw new BadRequestException('Report not found');
  }

  let driverName = null;
  let vanNumber = null;

  // ✅ Driver
  const driver = await this.databaseService.repositories.driverModel
    .findById(report.driverId)
    .lean();

  if (driver) {
    driverName = driver.fullname;
  }

  // ✅ Van (driverId se)
  const driverObjectId = new Types.ObjectId(report.driverId);

  const van = await this.databaseService.repositories.VanModel.findOne({
    driverId: driverObjectId,
  }).lean();

  if (van) {
    vanNumber = van.carNumber; // field name according to your schema
  }

  return {
    message: 'Report fetched successfully',
    data: {
      ...report,
      driverName,
      vanNumber,
    },
  };
}

}
