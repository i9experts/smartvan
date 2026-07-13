/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from "src/database/databaseservice";
import { OtpService } from 'src/user/schema/otp/otp.service';
import * as crypto from 'crypto';
import { AddStudentDto } from './dto/addStudent.dto';
import { Types } from 'mongoose';
import { EditStudentDto } from './dto/editStudent.dto';
import { WhatsappService } from 'src/whatsapp/whatsapp.service';
import { FirebaseAdminService } from 'src/notification/firebase-admin.service';
import { BillingService } from 'src/billing/billing.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';

import mongoose from 'mongoose';



@Injectable()
export class AdminService {
  
  constructor(
   
    private databaseService: DatabaseService,
    private readonly otpService: OtpService, 

    private readonly jwtService: JwtService,
    private readonly whatsappService: WhatsappService,
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly billingService: BillingService,
    private readonly auditLogService: AuditLogService
  ) {}
  
async createAdminAndSchool(body: any) {
  const { adminInfo, schoolInfo } = body;

  const existingAdmin = await this.databaseService.repositories.AdminModel.findOne({
    email: adminInfo.email,
  });

  if (existingAdmin) {
    throw new BadRequestException("Admin with this email already exists");
  }

  const randomPassword = crypto.randomBytes(6).toString('hex'); // 12 char ka password
  const hashedPassword = await bcrypt.hash(randomPassword, 10);


  const admin = await this.databaseService.repositories.AdminModel.create({
    ...adminInfo,
    password: hashedPassword,
  });


  const school = await this.databaseService.repositories.SchoolModel.create({
    ...schoolInfo,
    admin: admin._id,
  });

  const token = this.jwtService.sign(
    {
      sub: admin._id,
      email: admin.email,
      role: admin.role,
    },
    { expiresIn: '30d' }
  );


  const cleanAdmin = await this.databaseService.repositories.AdminModel
    .findById(admin._id)
    .select('-password -createdAt -updatedAt -__v');

  const cleanSchool = await this.databaseService.repositories.SchoolModel
    .findById(school._id)
    .select('-createdAt -updatedAt -__v');

    await this.otpService.sendPassword(adminInfo.email, randomPassword);

  return {
    message: 'Admin and school created successfully.',
    data: {
      token,
      admin: cleanAdmin,
      school: cleanSchool,
    },
  };
}


async editSchoolProfileByAdmin(adminId: string, body: any) {
  const { schoolInfo, adminInfo } = body;
  const admin = await this.databaseService.repositories.AdminModel.findById(adminId);
  if (!admin) throw new NotFoundException('Admin not found');
  const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminId });
  if (!school) throw new NotFoundException('School not found');
  if (adminInfo && Object.keys(adminInfo).length > 0) {
    const updateFields: any = {};
    if (adminInfo.name) updateFields.name = adminInfo.name;
    await this.databaseService.repositories.AdminModel.updateOne({ _id: adminId }, { $set: updateFields });
  }
  if (schoolInfo && Object.keys(schoolInfo).length > 0) {
    const allowedFields = ['schoolName', 'schoolEmail', 'contactPerson', 'contactNumber', 'address', 'branchName', 'startTime', 'endTime', 'maxTripDuration', 'bufferTime', 'currency', 'country', 'timezone'];
    const filtered: any = {};
    allowedFields.forEach(f => { if (schoolInfo[f] !== undefined) filtered[f] = schoolInfo[f]; });
    await this.databaseService.repositories.SchoolModel.updateOne({ _id: school._id }, { $set: filtered });
  }
  return { message: 'Profile updated successfully' };
}

async editAdminAndSchool(body: any) {
  const { schoolId, adminInfo, schoolInfo } = body;

  const school = await this.databaseService.repositories.SchoolModel.findById(schoolId);
  if (!school) {
    throw new NotFoundException('School not found');
  }

  const admin = await this.databaseService.repositories.AdminModel.findById(school.admin);
  if (!admin) {
    throw new NotFoundException('Admin linked to this school not found');
  }

  let newEmail: string | null = null;

  // 🔹 Update admin info
  if (adminInfo && Object.keys(adminInfo).length > 0) {
    // Agar email change ho rahi hai
    if (adminInfo.email && adminInfo.email !== admin.email) {
      newEmail = adminInfo.email;

      // Generate random password
      const randomPassword = crypto.randomBytes(6).toString('hex'); // 12 chars
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      // Update admin with new email + new password
      await this.databaseService.repositories.AdminModel.updateOne(
        { _id: admin._id },
        { $set: { ...adminInfo, password: hashedPassword } }
      );

      // Send new password to the new email
      await this.otpService.sendPassword(newEmail, randomPassword);
    } else {
      // Agar email change nahi, normal update
      await this.databaseService.repositories.AdminModel.updateOne(
        { _id: admin._id },
        { $set: adminInfo }
      );
    }
  }

  // 🔹 Update school info
  if (schoolInfo && Object.keys(schoolInfo).length > 0) {
    await this.databaseService.repositories.SchoolModel.updateOne(
      { _id: schoolId },
      { $set: schoolInfo }
    );
  }

  // 🔹 Fetch updated admin & school
  const updatedAdmin = await this.databaseService.repositories.AdminModel.findById(admin._id).select(
    '-password -otp -otpExpiresAt -__v -createdAt -updatedAt'
  );

  const updatedSchool = await this.databaseService.repositories.SchoolModel.findById(schoolId).select(
    '-__v -createdAt -updatedAt'
  );

  return {
    message: 'Admin and School updated successfully',
    data: {
      admin: updatedAdmin,
      school: updatedSchool,
    },
  };
}


async getSchoolById(schoolId: string) {
  // 1️⃣ Find school and populate admin (excluding sensitive fields)
  const school = await this.databaseService.repositories.SchoolModel
    .findById(schoolId)
    .populate({
      path: 'admin',
      select: '-password -createdAt -otp -expiresOtp -updatedAt -__v' // ❌ ye fields hide kar dega
    });

  if (!school) {
    throw new NotFoundException('School not found');
  }

  
  return {
    message: 'School fetched successfully',
    data: school,
  };
}




async getAllSchoolsBySuperAdmin(page = 1, limit = 10, search?: string) {
  const skip = (page - 1) * limit;

  // ✅ Filter for search
  const filter: any = {};
  if (search) {
    filter.schoolName = { $regex: search, $options: 'i' };
  }

  // ✅ Total count
  const total = await this.databaseService.repositories.SchoolModel.countDocuments(filter);

  // ✅ Fetch schools
  const schools = await this.databaseService.repositories.SchoolModel.find(
    filter,
    {
      schoolName: 1,
      contactPerson: 1,
      allowedVans: 1,
      allowedRoutes: 1,
      contactNumber: 1,
      status: 1,
    }
  )
    .skip(skip)
    .limit(limit);

  // ✅ Counts (parallel)
  const data = await Promise.all(
    schools.map(async (school) => {

      const schoolId = school._id.toString();

      // 🔹 Kids count
      const kidsCount = await this.databaseService.repositories.KidModel.countDocuments({
        schoolId: schoolId,
      });

      // 🔹 Vans count
      const vansCount = await this.databaseService.repositories.VanModel.countDocuments({
        schoolId: schoolId,
      });

      // 🔹 Routes count
      const routesCount = await this.databaseService.repositories.routeModel.countDocuments({
        schoolId: schoolId,
      });

      return {
        schoolId: school._id,
        schoolName: school.schoolName,
        contactPerson: school.contactPerson,
        vanLimit: school.allowedVans,
        routesLimit: school.allowedRoutes,
        contactNumber: school.contactNumber,
        status: school.status,
        image: school.schoolImage,

        totalKids: kidsCount,
        totalVans: vansCount,
        totalRoutes: routesCount,
      };
    })
  );

  // ✅ Response
  return {
    message: 'Schools fetched successfully',
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async resendOtpForResetPassword(email: string) {
  try {
    // 🔍 Admin model use karo
    const admin = await this.databaseService.repositories.AdminModel.findOne({ email });

    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }


    // 🔑 New OTP generate karo
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // ✍️ Save OTP
    admin.otp = newOtp;
    admin.otpExpiresAt = otpExpiresAt;
    await admin.save();

    // 📧 Send OTP email
    await this.otpService.sendOtp(admin.email, newOtp);

    return {
      message: 'OTP sent successfully to your email for password reset',
      data: {
        adminId: admin._id,
        otp: admin.otp, // ⚠️ sirf testing/debug ke liye response me bhejna
      },
    };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'Resend OTP for password reset failed');
  }
}


async forgotPasswordService(email: string) {
  // 1️⃣ User check karo
  const admin = await this.databaseService.repositories.AdminModel.findOne({ email });

  if (!admin) {
    return { message: 'User not found' };
  }

  // 2️⃣ OTP generate karo (6 digit random)
  const otp = crypto.randomInt(100000, 999999).toString();

  // 3️⃣ OTP expiry time set karo (5 min baad expire)
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // 4️⃣ DB me admin ko update karo OTP aur expiry ke sath
  admin.otp = otp;
  admin.otpExpiresAt = otpExpiresAt;
  await admin.save();

  // 5️⃣ Email bhejo OTP
  await this.otpService.sendOtp(admin.email, otp);

    const newToken = this.jwtService.sign(
    {
      sub: admin._id,
      email: admin.email,
      role: admin.role,
    },
    { expiresIn: '30d' }
  );

  return {
    message: 'OTP sent on email for password reset.',
    data: {
      otp,
      token: newToken, // ⚠️ sirf testing/debug ke liye return karna, production me usually return nahi karte
    },
  };
}

async resetPassword(email: string, otp: string, newPassword: string) {
  try {
    // 🔍 Admin model use karo
    const admin = await this.databaseService.repositories.AdminModel.findOne({ email });
    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    console.log ("wali", email, otp, newPassword)

    
   if (admin.otp !== otp.toString()) {
  console.log("DB OTP:", admin.otp, " Provided OTP:", otp); // Debugging
  throw new UnauthorizedException('Invalid OTP');
}

   
    const now = new Date();
    if (!admin.otpExpiresAt || now > admin.otpExpiresAt) {
      throw new UnauthorizedException('OTP has expired');
    }

   
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    
    admin.password = hashedPassword;
    admin.otp = null;
    admin.otpExpiresAt = null;
    await admin.save();

    return {
      message: 'Your password has been changed successfully',
    };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'Password reset failed');
  }
}

async loginAdmin(loginData: any) {
  try {
    const {  email, password } = loginData;
    console.log(email)

   const admin = await this.databaseService.repositories.AdminModel.findOne({ email });
    if (!admin) {
      throw new UnauthorizedException('Invalid credentials' );
    }

    const isPasswordMatch = await bcrypt.compare(password, admin.password);
    if (!isPasswordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const newToken = this.jwtService.sign(
    {
      sub: admin._id,
      email: admin.email,
      role: admin.role,
    },
    { expiresIn: '30d' }
  );

    this.auditLogService.record(
      'logged in',
      admin._id.toString(),
      admin.email,
      admin.role,
    );

    return {
      message: 'Login successful',
      data: {
      token: newToken,
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
      },
    };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'Login failed');
  }
}

async getProfile(userId: string) {
  console.log(userId)
  try {
    if (!userId ) {
      throw new UnauthorizedException('Invalid user credentials');
    }
     const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: new mongoose.Types.ObjectId(userId) 
    });
    if (!school) {
      throw new UnauthorizedException('school not found');
    }

    
    return {
      message: 'school profile fetched successfully',
      data: school,
    };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'Failed to fetch school profile');
  }
}

async getallschool() {

  // 1️⃣ Sare schools nikaalo
  const schools = await this.databaseService.repositories.SchoolModel
    .find()
    .sort({ _id: -1 })
    .lean();

  // 2️⃣ Har school par loop chalao
  const updatedSchools = [];

  for (let school of schools) {

    const schoolId = school._id;

    // 3️⃣ Vans count
    const totalVans = await this.databaseService.repositories.VanModel.countDocuments({
      schoolId: schoolId,
    });

    // 4️⃣ Kids count
    const totalKids = await this.databaseService.repositories.KidModel.countDocuments({
      schoolId: schoolId,
    });

    // 5️⃣ Routes count
    const totalRoutes = await this.databaseService.repositories.routeModel.countDocuments({
      schoolId: schoolId,
    });

    // 6️⃣ School object me counts add karo
    updatedSchools.push({
      ...school,
      totalVans,
      totalKids,
      totalRoutes,
    });
  }

  // 7️⃣ Final response
  return {
    message: 'All school fetched successfully',
    data: updatedSchools,
  };
}
  async addKid(AddStudentDto: AddStudentDto, AdminId: string, parentEmail: string, parentPhone?: string) {

const adminObjectId = new Types.ObjectId(AdminId);

  const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });

  if (!school) {
    throw new UnauthorizedException('School not found');
  }

  
 
  let parent = await this.databaseService.repositories.parentModel.findOne({ email: parentEmail });

  const isNewParent = !parent;

  if (!parent) {
    const username = parentEmail.split('@')[0];
    
    const randomPassword = crypto.randomBytes(6).toString('hex'); 


  const hashedPassword = await bcrypt.hash(randomPassword, 10);

  await this.otpService.sendPassword(parentEmail, randomPassword);

    parent = new this.databaseService.repositories.parentModel({
      email: parentEmail,
      fullname: username,
      schoolId: school._id,
      password: hashedPassword,
      isVerified: true,
      ...(parentPhone ? { phoneNo: parentPhone } : {}),
    });
    parent = await parent.save();

    // Also send login credentials via WhatsApp if we have a phone number —
    // fire-and-forget, never blocks account creation.
    if (parentPhone) {
      this.whatsappService
        .sendLoginCredentials(parentPhone, username, parentEmail, randomPassword, school.schoolName)
        .catch((err) => console.error('New parent WhatsApp send failed:', err?.message || err));
    }
  }


  const newKid = new this.databaseService.repositories.KidModel({
    ...AddStudentDto,
    schoolId: school._id,
    parentId: parent._id,
  });

  const savedKid = await newKid.save();

  // Notify an EXISTING parent (WhatsApp + push) that a child was linked
  // to their account — fire-and-forget.
  if (!isNewParent) {
    this.notifyExistingParentOfNewStudent(parent, savedKid, school).catch(
      (err) => console.error('Existing parent notify failed:', err?.message || err),
    );
  }

  // Step 5: Return response
  return {
    message: 'Kid added successfully',
    data: savedKid,
  };
}

// Notifies an existing parent (WhatsApp + push) that the school linked a
// new child to their account. Fire-and-forget — failures are logged only.
private async notifyExistingParentOfNewStudent(parent: any, kid: any, school: any) {
  if (parent.phoneNo) {
    await this.whatsappService.sendParentWelcome(
      parent.phoneNo,
      parent.fullname,
      kid.fullname || 'your child',
      school.schoolName,
    );
  }

  if (parent.fcmToken && parent.notificationToggle !== false) {
    await this.firebaseAdminService.sendToDevice(parent.fcmToken, {
      notification: {
        title: 'Child Added',
        body: `${kid.fullname || 'Your child'} has been added to ${school.schoolName} on SmartVan.`,
      },
    });
  }
}


// async getKids(AdminId: string, query: any) {
//   const adminObjectId = new Types.ObjectId(AdminId);

//   const school = await this.databaseService.repositories.SchoolModel.findOne({
//     admin: adminObjectId,
//   });

//   if (!school) {
//     throw new UnauthorizedException("School not found");
//   }

//   const page = Math.max(1, parseInt(query.page as string, 10) || 1);
//   const limit = Math.max(1, parseInt(query.limit as string, 10) || 10);

//   const kidsName =
//     typeof query.kidsName === "string" ? query.kidsName.trim() : "";
//   const parentName =
//     typeof query.parentName === "string" ? query.parentName.trim() : "";
//   const driverName =
//     typeof query.driverName === "string" ? query.driverName.trim() : "";
//   const carNumber =
//     typeof query.carNumber === "string" ? query.carNumber.trim() : "";

//   const skip = (page - 1) * limit;

//   const basePipeline: any[] = [
//     {
//       $match: {
//         schoolId: school._id.toString(),
//         ...(kidsName
//           ? {
//               fullname: { $regex: kidsName, $options: "i" },
//             }
//           : {}),
//       },
//     },

//     // Convert VanId to ObjectId for Van lookup
//     {
//       $addFields: {
//         vanObjectId: {
//           $cond: {
//             if: {
//               $and: [
//                 { $ne: ["$VanId", null] },
//                 { $ne: ["$VanId", ""] },
//               ],
//             },
//             then: { $toObjectId: "$VanId" },
//             else: null,
//           },
//         },
//       },
//     },

//     // Parent lookup
//     {
//       $lookup: {
//         from: "parents",
//         localField: "parentId",
//         foreignField: "_id",
//         as: "parent",
//       },
//     },
//     {
//       $unwind: {
//         path: "$parent",
//         preserveNullAndEmptyArrays: true,
//       },
//     },

//     // Van lookup
//     {
//       $lookup: {
//         from: "vans",
//         localField: "vanObjectId",
//         foreignField: "_id",
//         as: "van",
//       },
//     },
//     {
//       $unwind: {
//         path: "$van",
//         preserveNullAndEmptyArrays: true,
//       },
//     },


//     {
//       $lookup: {
//         from: "routes",
//         localField: "VanId",   // Kid table
//         foreignField: "vanId", // Route table
//         as: "route",
//       },
//     },
//     {
//       $unwind: {
//         path: "$route",
//         preserveNullAndEmptyArrays: true,
//       },
//     },

//     // Driver lookup
//     {
//       $lookup: {
//         from: "drivers",
//         localField: "van.driverId",
//         foreignField: "_id",
//         as: "driver",
//       },
//     },
//     {
//       $unwind: {
//         path: "$driver",
//         preserveNullAndEmptyArrays: true,
//       },
//     },
//   ];

//   const andFilters: any[] = [];

//   if (parentName) {
//     andFilters.push({
//       "parent.fullname": { $regex: parentName, $options: "i" },
//     });
//   }

//   if (driverName) {
//     andFilters.push({
//       "driver.fullname": { $regex: driverName, $options: "i" },
//     });
//   }

//   if (carNumber) {
//     andFilters.push({
//       "van.carNumber": { $regex: carNumber, $options: "i" },
//     });
//   }

//   if (andFilters.length) {
//     basePipeline.push({
//       $match: { $and: andFilters },
//     });
//   }

//   const dataPipeline: any[] = [
//     ...basePipeline,
//     { $sort: { createdAt: -1 } },
//     {
//       $project: {
//         student: {
//           id: { $toString: "$_id" },
//           parentId: {
//             $cond: [
//               { $ifNull: ["$parentId", false] },
//               { $toString: "$parentId" },
//               null,
//             ],
//           },
//           vanId: "$VanId",
//           schoolId: "$schoolId",
//           fullname: { $ifNull: ["$fullname", ""] },
//           gender: { $ifNull: ["$gender", ""] },
//           grade: { $ifNull: ["$grade", ""] },
//           image: { $ifNull: ["$image", ""] },
//           status: { $ifNull: ["$status", ""] },
//           age: { $ifNull: ["$age", null] },
//           dob: { $ifNull: ["$dob", null] },
//         },
//         parent: {
//           id: {
//             $cond: [
//               { $ifNull: ["$parent._id", false] },
//               { $toString: "$parent._id" },
//               null,
//             ],
//           },
//           fullname: { $ifNull: ["$parent.fullname", ""] },
//           email: { $ifNull: ["$parent.email", ""] },
//           phoneNo: { $ifNull: ["$parent.phoneNo", ""] },
//           address: { $ifNull: ["$parent.address", ""] },
//         },
//         van: {
//           id: {
//             $cond: [
//               { $ifNull: ["$van._id", false] },
//               { $toString: "$van._id" },
//               null,
//             ],
//           },
//           vehicleType: { $ifNull: ["$van.vehicleType", ""] },
//           carNumber: { $ifNull: ["$van.carNumber", ""] },
//         },
//         route: {
//           id: {
//             $cond: [
//               { $ifNull: ["$route._id", false] },
//               { $toString: "$route._id" },
//               null,
//             ],
//           },
//           title: { $ifNull: ["$route.title", ""] },
//         },
//         driver: {
//           id: {
//             $cond: [
//               { $ifNull: ["$driver._id", false] },
//               { $toString: "$driver._id" },
//               null,
//             ],
//           },
//           fullname: { $ifNull: ["$driver.fullname", ""] },
//           phoneNo: { $ifNull: ["$driver.phoneNo", ""] },
//         },
//         _id: 0,
//       },
//     },
//     { $skip: skip },
//     { $limit: limit },
//   ];

//   const kids =
//     await this.databaseService.repositories.KidModel.aggregate(dataPipeline);

//   const countPipeline: any[] = [...basePipeline, { $count: "total" }];

//   const countResult =
//     await this.databaseService.repositories.KidModel.aggregate(countPipeline);

//   const total = countResult[0]?.total || 0;

//   return {
//     message: "Kids fetched successfully",
//     data: kids,
//     pagination: {
//       total,
//       page,
//       limit,
//       totalPages: Math.ceil(total / limit),
//     },
//   };
// }


async getKids(AdminId: string, query: any) {
  const adminObjectId = new Types.ObjectId(AdminId);

  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException("School not found");
  }

  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const limit = Math.max(1, parseInt(query.limit as string, 10) || 10);

  const kidsName =
    typeof query.kidsName === "string" ? query.kidsName.trim() : "";

  const parentName =
    typeof query.parentName === "string" ? query.parentName.trim() : "";

  const driverName =
    typeof query.driverName === "string" ? query.driverName.trim() : "";

  const carNumber =
    typeof query.carNumber === "string" ? query.carNumber.trim() : "";

  // grade is a free-text string (e.g. "Grade 3", "Nursery", "O-Level")
  const grade =
    typeof query.grade === "string" && query.grade.trim() ? query.grade.trim() : null;

  const skip = (page - 1) * limit;

  const basePipeline: any[] = [
    {
      $match: {
        schoolId: school._id.toString(),
        ...(kidsName
          ? {
              fullname: { $regex: kidsName, $options: "i" },
            }
          : {}),
      },
    },

    {
      $addFields: {
        vanObjectId: {
          $cond: {
            if: {
              $and: [{ $ne: ["$VanId", null] }, { $ne: ["$VanId", ""] }],
            },
            then: { $toObjectId: "$VanId" },
            else: null,
          },
        },
      },
    },

    {
      $lookup: {
        from: "parents",
        localField: "parentId",
        foreignField: "_id",
        as: "parent",
      },
    },
    {
      $unwind: {
        path: "$parent",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $lookup: {
        from: "vans",
        localField: "vanObjectId",
        foreignField: "_id",
        as: "van",
      },
    },
    {
      $unwind: {
        path: "$van",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $lookup: {
        from: "drivers",
        localField: "van.driverId",
        foreignField: "_id",
        as: "driver",
      },
    },
    {
      $unwind: {
        path: "$driver",
        preserveNullAndEmptyArrays: true,
      },
    },
  ];

  const andFilters: any[] = [];

  if (parentName) {
    andFilters.push({
      "parent.fullname": { $regex: parentName, $options: "i" },
    });
  }

  if (driverName) {
    andFilters.push({
      "driver.fullname": { $regex: driverName, $options: "i" },
    });
  }

  if (carNumber) {
    andFilters.push({
      "van.carNumber": { $regex: carNumber, $options: "i" },
    });
  }

  // grade filter
  if (grade !== null) {
    andFilters.push({
      grade: { $regex: grade, $options: "i" },
    });
  }

  if (andFilters.length) {
    basePipeline.push({
      $match: { $and: andFilters },
    });
  }

  const dataPipeline: any[] = [
    ...basePipeline,
    { $sort: { createdAt: -1 } },
    {
      $project: {
        student: {
          id: { $toString: "$_id" },
          parentId: {
            $cond: [
              { $ifNull: ["$parentId", false] },
              { $toString: "$parentId" },
              null,
            ],
          },
          vanId: "$VanId",
          schoolId: "$schoolId",
          fullname: { $ifNull: ["$fullname", ""] },
          gender: { $ifNull: ["$gender", ""] },
          grade: { $ifNull: ["$grade", ""] },
          image: { $ifNull: ["$image", ""] },
          status: { $ifNull: ["$status", ""] },
          age: { $ifNull: ["$age", null] },
          dob: { $ifNull: ["$dob", null] },
          createdAt: "$createdAt",
          homeAddress: { $ifNull: ["$homeAddress", ""] },
          homeLat: { $ifNull: ["$homeLat", null] },
          homeLng: { $ifNull: ["$homeLng", null] },
        },
        parent: {
          id: {
            $cond: [
              { $ifNull: ["$parent._id", false] },
              { $toString: "$parent._id" },
              null,
            ],
          },
          fullname: { $ifNull: ["$parent.fullname", ""] },
          email: { $ifNull: ["$parent.email", ""] },
          phoneNo: { $ifNull: ["$parent.phoneNo", ""] },
          address: { $ifNull: ["$parent.address", ""] },
        },
        van: {
          id: {
            $cond: [
              { $ifNull: ["$van._id", false] },
              { $toString: "$van._id" },
              null,
            ],
          },
          vehicleType: { $ifNull: ["$van.vehicleType", ""] },
          carNumber: { $ifNull: ["$van.carNumber", ""] },
        },
        driver: {
          id: {
            $cond: [
              { $ifNull: ["$driver._id", false] },
              { $toString: "$driver._id" },
              null,
            ],
          },
          fullname: { $ifNull: ["$driver.fullname", ""] },
          phoneNo: { $ifNull: ["$driver.phoneNo", ""] },
        },
        _id: 0,
      },
    },
    { $skip: skip },
    { $limit: limit },
  ];

  const kids =
    await this.databaseService.repositories.KidModel.aggregate(dataPipeline);

  const countPipeline: any[] = [...basePipeline, { $count: "total" }];

  const countResult =
    await this.databaseService.repositories.KidModel.aggregate(countPipeline);

  const total = countResult[0]?.total || 0;

  return {
    message: "Kids fetched successfully",
    data: kids,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async getKidsBySuperAdmin(SuperAdminId: string, query: any) {
  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const limit = Math.max(1, parseInt(query.limit as string, 10) || 10);

  const kidsName =
    typeof query.kidsName === "string" ? query.kidsName.trim() : "";

  const parentName =
    typeof query.parentName === "string" ? query.parentName.trim() : "";

  const driverName =
    typeof query.driverName === "string" ? query.driverName.trim() : "";

  const carNumber =
    typeof query.carNumber === "string" ? query.carNumber.trim() : "";

  const schoolId =
    typeof query.schoolId === "string" ? query.schoolId.trim() : "";

  const grade =
    typeof query.grade === "string" && query.grade.trim() ? query.grade.trim() : null;

  const skip = (page - 1) * limit;

  // 🔹 Base pipeline
  const basePipeline: any[] = [
    {
      $match: {
        ...(schoolId ? { schoolId: schoolId } : {}), // 👈 main change

        ...(kidsName
          ? {
              fullname: { $regex: kidsName, $options: "i" },
            }
          : {}),
      },
    },

    {
      $addFields: {
        vanObjectId: {
          $cond: {
            if: {
              $and: [{ $ne: ["$VanId", null] }, { $ne: ["$VanId", ""] }],
            },
            then: { $toObjectId: "$VanId" },
            else: null,
          },
        },
      },
    },

    // 🔹 Parent
    {
      $lookup: {
        from: "parents",
        localField: "parentId",
        foreignField: "_id",
        as: "parent",
      },
    },
    { $unwind: { path: "$parent", preserveNullAndEmptyArrays: true } },

    // 🔹 Van
    {
      $lookup: {
        from: "vans",
        localField: "vanObjectId",
        foreignField: "_id",
        as: "van",
      },
    },
    { $unwind: { path: "$van", preserveNullAndEmptyArrays: true } },

    // 🔹 Driver
    {
      $lookup: {
        from: "drivers",
        localField: "van.driverId",
        foreignField: "_id",
        as: "driver",
      },
    },
    { $unwind: { path: "$driver", preserveNullAndEmptyArrays: true } },
  ];

  // 🔹 Filters
  const andFilters: any[] = [];

  if (parentName) {
    andFilters.push({
      "parent.fullname": { $regex: parentName, $options: "i" },
    });
  }

  if (driverName) {
    andFilters.push({
      "driver.fullname": { $regex: driverName, $options: "i" },
    });
  }

  if (carNumber) {
    andFilters.push({
      "van.carNumber": { $regex: carNumber, $options: "i" },
    });
  }

  if (grade !== null) {
    andFilters.push({ grade: { $regex: grade, $options: "i" } });
  }

  if (andFilters.length) {
    basePipeline.push({
      $match: { $and: andFilters },
    });
  }

  // 🔹 Data pipeline
  const dataPipeline: any[] = [
    ...basePipeline,
    { $sort: { createdAt: -1 } },
    {
      $project: {
        student: {
          id: { $toString: "$_id" },
          parentId: {
            $cond: [
              { $ifNull: ["$parentId", false] },
              { $toString: "$parentId" },
              null,
            ],
          },
          vanId: "$VanId",
          schoolId: "$schoolId",
          fullname: { $ifNull: ["$fullname", ""] },
          gender: { $ifNull: ["$gender", ""] },
          grade: { $ifNull: ["$grade", ""] },
          image: { $ifNull: ["$image", ""] },
          status: { $ifNull: ["$status", ""] },
          age: { $ifNull: ["$age", null] },
          dob: { $ifNull: ["$dob", null] },
          createdAt: "$createdAt",
          homeAddress: { $ifNull: ["$homeAddress", ""] },
          homeLat: { $ifNull: ["$homeLat", null] },
          homeLng: { $ifNull: ["$homeLng", null] },
        },
        parent: {
          id: {
            $cond: [
              { $ifNull: ["$parent._id", false] },
              { $toString: "$parent._id" },
              null,
            ],
          },
          fullname: { $ifNull: ["$parent.fullname", ""] },
          email: { $ifNull: ["$parent.email", ""] },
          phoneNo: { $ifNull: ["$parent.phoneNo", ""] },
          address: { $ifNull: ["$parent.address", ""] },
        },
        van: {
          id: {
            $cond: [
              { $ifNull: ["$van._id", false] },
              { $toString: "$van._id" },
              null,
            ],
          },
          vehicleType: { $ifNull: ["$van.vehicleType", ""] },
          carNumber: { $ifNull: ["$van.carNumber", ""] },
        },
        driver: {
          id: {
            $cond: [
              { $ifNull: ["$driver._id", false] },
              { $toString: "$driver._id" },
              null,
            ],
          },
          fullname: { $ifNull: ["$driver.fullname", ""] },
          phoneNo: { $ifNull: ["$driver.phoneNo", ""] },
        },
        _id: 0,
      },
    },
    { $skip: skip },
    { $limit: limit },
  ];

  const kids =
    await this.databaseService.repositories.KidModel.aggregate(dataPipeline);

  // 🔹 Count
  const countPipeline: any[] = [...basePipeline, { $count: "total" }];

  const countResult =
    await this.databaseService.repositories.KidModel.aggregate(countPipeline);

  const total = countResult[0]?.total || 0;

  return {
    message: "Kids fetched successfully",
    data: kids,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}


async editStudent(KidId: string, AdminId: string, editStudentDto: EditStudentDto) {
  const adminObjectId = new Types.ObjectId(AdminId);

  // Step 1: Find school by admin
  const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
  if (!school) {
    throw new UnauthorizedException('School not found');
  }

  // Step 2: Find kid by id and schoolId (security check)
  const kid = await this.databaseService.repositories.KidModel.findOne({
    _id: KidId,
    schoolId: school._id,
  });

  if (!kid) {
    throw new UnauthorizedException ('Kid not found');
  }

  // Step 3: Update kid with DTO
  const updatedKid = await this.databaseService.repositories.KidModel.findByIdAndUpdate(
    KidId,
    { $set: editStudentDto },
    { new: true }, // return updated document
  );

  return {
    message: 'Kid updated successfully',
    data: updatedKid,
  };
}

async removeKids(AdminId: string, kidIds: string[]) {
  const adminObjectId = new Types.ObjectId(AdminId);

  // Step 1: Find school by admin
  const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
  if (!school) {
    throw new UnauthorizedException('School not found');
  }

  // Step 2: Actually delete the kids whose schoolId matches — the UI
  // presents this as a permanent delete (trash icon), so it should behave
  // like one. Previously this only ever ran an update with a broken
  // ObjectId-vs-string comparison against schoolId, so it silently
  // matched zero documents and never removed anything.
  const result = await this.databaseService.repositories.KidModel.deleteMany(
    { _id: { $in: kidIds }, schoolId: school._id.toString() },
  );

  return {
    message: 'Kids removed successfully',
    deletedCount: result.deletedCount,
  };
}

async getKidById(kidId: string, AdminId: string) {


    const adminObjectId = new Types.ObjectId(AdminId);

  // Step 1: Find school by admin
  const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
  if (!school) {
    throw new UnauthorizedException('School not found');
  }
  // 1. Kid find karo
  const kid = await this.databaseService.repositories.KidModel.findById(kidId);

  if (!kid) {
    throw new BadRequestException("Kid not found");
  }

  // 2. Parent find karo using parentId
  const parent = await this.databaseService.repositories.parentModel.findById(kid.parentId);
  const van = await this.databaseService.repositories.VanModel.findById(kid.VanId);





  // 3. Response banao (kid + parent email)
  return {
    message: "Kid fetched successfully",
    data: {
      id: kid._id,
      fullname: kid.fullname,
      age: kid.age,
      grade: kid.grade,
      gender: kid.gender,
      dob: kid.dob,
      schoolId: school._id,
      parentId: kid.parentId,
      VanId: kid.VanId || null,
      image: kid.image || "",
      status: kid.status || "pending",
      parentEmail: parent ? parent.email : null,
      parentName: parent? parent.fullname : null ,
      parentContact: parent ? parent.phoneNo : null,
      parentAddress: parent ? parent.address : null,
      vehicleType: van ? van.vehicleType : null,
      route: van ? van.assignRoute : null,
      carNumber: van ? van.carNumber : null,
      schoolName: school.schoolName


    }
  };
}

async getVansBySchoolAdmin(adminId: string, query: any) {
  const adminObjectId = new Types.ObjectId(adminId);
  console.log("query =>", query);


  const school = await this.databaseService.repositories.SchoolModel.findOne({
    admin: adminObjectId,
  });

  if (!school) {
    throw new UnauthorizedException("School not found");
  }

  // pagination
  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const limit = Math.max(1, parseInt(query.limit as string, 10) || 10);
  const skip = (page - 1) * limit;

  // filters
  const driverName =
    typeof query.driverName === "string" ? query.driverName.trim() : "";
  const carNumber =
    typeof query.carNumber === "string" ? query.carNumber.trim() : "";

  // ---------- Base pipeline (shared) ----------
  const basePipeline: any[] = [
    {
      $match: {
        schoolId: school._id.toString(),
      },
    },
    // handle driverId as string OR ObjectId
    {
      $addFields: {
        driverObjectId: {
          $cond: [
            {
              $and: [
                { $ifNull: ["$driverId", false] },
                { $eq: [{ $type: "$driverId" }, "string"] },
              ],
            },
            { $toObjectId: "$driverId" },
            "$driverId",
          ],
        },
      },
    },
    {
      $lookup: {
        from: "drivers",
        localField: "driverObjectId",
        foreignField: "_id",
        as: "driver",
      },
    },
    {
      $unwind: {
        path: "$driver",
        preserveNullAndEmptyArrays: true,
      },
    },
  ];

  // ---------- Dynamic filters (OR logic) ----------
  const orFilters: any[] = [];

  if (driverName) {
    orFilters.push({
      "driver.fullname": { $regex: driverName, $options: "i" },
    });
  }

  if (carNumber) {
    orFilters.push({
      carNumber: { $regex: carNumber, $options: "i" },
    });
  }

  if (orFilters.length) {
    basePipeline.push({
      $match: {
        $or: orFilters,
      },
    });
  }

  // ---------- Data pipeline ----------
  const dataPipeline: any[] = [
    ...basePipeline,
    { $sort: { createdAt: -1 } },
    {
      $project: {
        _id: 0,
        van: {
          id: { $toString: "$_id" },
          schoolId: "$schoolId",
          driverId: {
            $cond: [
              { $ifNull: ["$driverId", false] },
              { $toString: "$driverId" },
              null,
            ],
          },
          venImage: { $ifNull: ["$venImage", ""] },
          vehicleType: { $ifNull: ["$vehicleType", ""] },
          assignRoute: { $ifNull: ["$assignRoute", ""] },
          carNumber: { $ifNull: ["$carNumber", ""] },
          condition: { $ifNull: ["$condition", "good"] },
          deviceId: { $ifNull: ["$deviceId", ""] },
          status: { $ifNull: ["$status", "inactive"] },
        },
        driver: {
          id: {
            $cond: [
              { $ifNull: ["$driver._id", false] },
              { $toString: "$driver._id" },
              null,
            ],
          },
          fullname: { $ifNull: ["$driver.fullname", ""] },
          email: { $ifNull: ["$driver.email", ""] },
          phoneNo: { $ifNull: ["$driver.phoneNo", ""] },
          image: { $ifNull: ["$driver.image", ""] },
        },
      },
    },
    { $skip: skip },
    { $limit: limit },
  ];

  const vans = await this.databaseService.repositories.VanModel.aggregate(
    dataPipeline as any,
  );


  const countPipeline: any[] = [...basePipeline, { $count: "total" }];

  const countResult =
    await this.databaseService.repositories.VanModel.aggregate(
      countPipeline as any,
    );

  const total = countResult[0]?.total || 0;

  return {
    message: "Vans fetched successfully",
    data: vans,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async changePassword(
  adminId: string,
  oldPassword: string,
  newPassword: string,
) {
  try {
    // 🔍 Model choose karo userType se
 
    const adminObjectId = new Types.ObjectId(adminId);
    const admin = await this.databaseService.repositories.AdminModel.findById(adminObjectId);
    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    // 🔑 Old password check karo
    const isMatch = await bcrypt.compare(oldPassword, admin.password);
    if (!isMatch) {
      throw new UnauthorizedException('Old password is incorrect');
    }

    // ✅ Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // ✍️ Save new password
    admin.password = hashedPassword;
    await admin.save();

    return {
      message: 'Your password has been changed successfully',
    };
  } catch (error) {
    throw new UnauthorizedException(error.message || 'Password change failed');
  }
}

async getVansBySuperAdmin(
  SuperAdminId: string, // (agar validate karna ho to use karo warna ignore bhi kar sakte ho)
  page = 1,
  limit = 10,
  search?: string,
  schoolId?: string, // 👈 new filter
) {
  const skip = (page - 1) * limit;

  // 🔹 Match filter
  const matchFilter: any = {
    ...(schoolId ? { schoolId: schoolId } : {}),

    ...(search
      ? { carNumber: { $regex: search, $options: 'i' } }
      : {}),
  };

  // 🔹 Aggregation pipeline
  const pipeline = [
    {
      $match: matchFilter,
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

    // 🔹 Final response
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
              title: { $ifNull: ['$$r.title', '' ] },
              tripType: { $ifNull: ['$$r.tripType', '' ] },
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

  // 🔹 Total count
  const total =
    await this.databaseService.repositories.VanModel.countDocuments(matchFilter);

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

async getKidByIdForSuperAdmin(kidId: string) {


   

  // Step 1: Find school by admin
 
  
  // 1. Kid find karo
  const kid = await this.databaseService.repositories.KidModel.findById(kidId);

  if (!kid) {
    throw new BadRequestException("Kid not found");
  }

  // 2. Parent find karo using parentId
  const parent = await this.databaseService.repositories.parentModel.findById(kid.parentId);
  const van = await this.databaseService.repositories.VanModel.findById(kid.VanId);
  const school = await this.databaseService.repositories.SchoolModel.findById(kid.schoolId);





  // 3. Response banao (kid + parent email)
  return {
    message: "Kid fetched successfully",
    data: {
      id: kid._id,
      fullname: kid.fullname,
      age: kid.age,
      grade: kid.grade,
      gender: kid.gender,
      dob: kid.dob,
      schoolId: school._id,
      parentId: kid.parentId,
      VanId: kid.VanId || null,
      image: kid.image || "",
      status: kid.status || "pending",
      parentEmail: parent ? parent.email : null,
      parentName: parent? parent.fullname : null ,
      parentContact: parent ? parent.phoneNo : null,
      parentAddress: parent ? parent.address : null,
      vehicleType: van ? van.vehicleType : null,
      route: van ? van.assignRoute : null,
      carNumber: van ? van.carNumber : null,
      schoolName: school.schoolName


    }
  };
}


async getAllDriversForSuperAdmin(
  page = 1,
  limit = 10,
  search?: string,
  status?: 'active' | 'inActive',
  schoolId?: string, // 👈 optional filter
) {

  const skip = (page - 1) * limit;

  // 1️⃣ Base query
  const query: any = {
    isDelete: false,
  };

  // 2️⃣ Search filter
  if (search) {
    query.fullname = { $regex: search, $options: 'i' };
  }

  // 3️⃣ Status filter
  if (status) {
    query.status = status;
  }

  // 4️⃣ School filter (IMPORTANT 🔥)
  if (schoolId) {
    query.schoolId = schoolId;
  }

  // 5️⃣ Fetch drivers
  const drivers = await this.databaseService.repositories.driverModel
    .find(query)
    .skip(skip)
    .limit(limit)
    .select('fullname email phoneNo status fcmToken image schoolId');

  // 6️⃣ Total count
  const total = await this.databaseService.repositories.driverModel.countDocuments(query);

  // 7️⃣ Response
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



  async connectWhatsApp(adminId: string, body: { wabaId: string; waPhoneNumberId: string; waAccessToken: string; waPhoneNumber: string }) {
    const adminObjectId = new Types.ObjectId(adminId);
    const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
    if (!school) throw new Error('School not found');

    // Test the credentials by sending a test request
    const axios = require('axios');
    try {
      await axios.get(`https://graph.facebook.com/v19.0/${body.waPhoneNumberId}`, {
        headers: { Authorization: `Bearer ${body.waAccessToken}` }
      });
    } catch (e: any) {
      throw new Error('Invalid WhatsApp credentials. Please check your Phone Number ID and Access Token.');
    }

    await this.databaseService.repositories.SchoolModel.updateOne(
      { _id: school._id },
      { $set: {
        wabaId: body.wabaId,
        waPhoneNumberId: body.waPhoneNumberId,
        waAccessToken: body.waAccessToken,
        waPhoneNumber: body.waPhoneNumber,
        waConnected: true,
      }}
    );

    return { message: 'WhatsApp connected successfully', waPhoneNumber: body.waPhoneNumber };
  }

  async disconnectWhatsApp(adminId: string) {
    const adminObjectId = new Types.ObjectId(adminId);
    const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
    if (!school) throw new Error('School not found');

    await this.databaseService.repositories.SchoolModel.updateOne(
      { _id: school._id },
      { $set: { wabaId: null, waPhoneNumberId: null, waAccessToken: null, waPhoneNumber: null, waConnected: false } }
    );

    return { message: 'WhatsApp disconnected successfully' };
  }

  async sendWhatsAppMessage(adminId: string, to: string, message: string) {
    const adminObjectId = new Types.ObjectId(adminId);
    const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: adminObjectId });
    if (!school) throw new Error('School not found');
    if (!school.waConnected || !school.waPhoneNumberId || !school.waAccessToken) {
      throw new Error('WhatsApp not connected. Please connect your WhatsApp number in Settings.');
    }

    const axios = require('axios');
    let cleaned = to.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    if (!cleaned.startsWith('92') && !cleaned.startsWith('971') && !cleaned.startsWith('966') && !cleaned.startsWith('974')) {
      cleaned = '92' + cleaned;
    }

    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${school.waPhoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleaned,
        type: 'text',
        text: { body: message },
      },
      { headers: { Authorization: `Bearer ${school.waAccessToken}`, 'Content-Type': 'application/json' } }
    );

    return { success: true, data: response.data };
  }

  // Cross-tenant platform overview for the Super Admin dashboard.
  // NOTE: "complaints" has no real backend concept yet (no Complaint model
  // exists — only a Support schema for contact links, which is unrelated).
  // Returning honest zeros there rather than fabricating numbers.
  async getSuperAdminOverview() {
    const { SchoolModel, VanModel, driverModel, parentModel, TripModel } = this.databaseService.repositories;

    const schools = await SchoolModel.find().lean();
    const totalInstitutions = schools.length;
    const activeInstitutions = schools.filter((s: any) => s.status === 'active').length;
    const inactiveInstitutions = totalInstitutions - activeInstitutions;

    const vans = await VanModel.find().lean();
    const totalFleet = vans.length;
    const activeFleet = vans.filter((v: any) => v.status === 'active').length;

    // "GPS online" = van currently on an ongoing trip with a location
    // update in the last 10 minutes. There's no persisted last-seen field
    // on Van directly, so we derive it from live trip data.
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const ongoingTrips = await TripModel.find({ status: 'ongoing' }).lean();
    const onlineVanIds = new Set<string>();
    for (const trip of ongoingTrips as any[]) {
      const locs = trip.locations || [];
      const last = locs[locs.length - 1];
      if (last?.time && new Date(last.time) >= tenMinAgo) {
        onlineVanIds.add(trip.vanId);
      }
    }
    const gpsOnline = onlineVanIds.size;
    const gpsOffline = Math.max(activeFleet - gpsOnline, 0);
    const avgHealth = activeFleet > 0 ? Math.round((gpsOnline / activeFleet) * 100) : 0;

    const drivers = await driverModel.find().lean();
    const totalDrivers = drivers.length;
    const activeDrivers = drivers.filter((d: any) => d.status === 'active').length;

    // App connection status — a user is "connected" once they've actually
    // logged in at least once (lastLoginAt set), not just been created.
    const parents = await parentModel.find().lean();
    const totalParents = parents.length;
    const connectedParents = (parents as any[]).filter((p) => !!p.lastLoginAt).length;
    const connectedDrivers = (drivers as any[]).filter((d) => !!d.lastLoginAt).length;

    const parentsBySchool: Record<string, any[]> = {};
    (parents as any[]).forEach((p) => {
      const sid = p.schoolId || 'unknown';
      if (!parentsBySchool[sid]) parentsBySchool[sid] = [];
      parentsBySchool[sid].push(p);
    });
    const driversBySchool: Record<string, any[]> = {};
    (drivers as any[]).forEach((d) => {
      const sid = d.schoolId || 'unknown';
      if (!driversBySchool[sid]) driversBySchool[sid] = [];
      driversBySchool[sid].push(d);
    });

    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    const todaysTrips = await TripModel.find({ createdAt: { $gte: startOfDay, $lte: endOfDay } }).lean();
    const tripsToday = todaysTrips.length;
    const completedToday = (todaysTrips as any[]).filter((t) => t.status === 'end').length;

    const vansBySchool: Record<string, any[]> = {};
    (vans as any[]).forEach((v) => {
      const sid = v.schoolId || 'unknown';
      if (!vansBySchool[sid]) vansBySchool[sid] = [];
      vansBySchool[sid].push(v);
    });

    const appConnectionsBySchool = (schools as any[]).map((s) => {
      const sid = s._id.toString();
      const schoolParents = parentsBySchool[sid] || [];
      const schoolDrivers = driversBySchool[sid] || [];
      const connectedSchoolParents = schoolParents.filter((p) => !!p.lastLoginAt).length;
      const connectedSchoolDrivers = schoolDrivers.filter((d) => !!d.lastLoginAt).length;
      return {
        schoolId: sid,
        schoolName: s.schoolName,
        parents: { total: schoolParents.length, connected: connectedSchoolParents },
        drivers: { total: schoolDrivers.length, connected: connectedSchoolDrivers },
      };
    });

    const snapshot = (schools as any[]).map((s) => {
      const schoolVans = vansBySchool[s._id.toString()] || [];
      const schoolOnline = schoolVans.filter((v) => onlineVanIds.has(v._id.toString())).length;
      const avgH = schoolVans.length > 0 ? Math.round((schoolOnline / schoolVans.length) * 100) : null;
      return {
        schoolId: s._id.toString(),
        schoolName: s.schoolName,
        status: s.status,
        totalVans: schoolVans.length,
        avgHealth: avgH,
      };
    });

    // Per-van pricing tiers (matches your actual Stripe price points)
    const priceMap: Record<string, number> = {
      car: 790, hiroof: 990, hiace: 990, bus: 1990, coach: 1990,
    };
    const vanPrice = (v: any) => priceMap[(v.vehicleType || '').toLowerCase()] ?? 990;

    let billingSchools: any[] = [];
    try {
      billingSchools = await this.billingService.getAllSchoolsBilling();
    } catch (err) {
      console.error('getAllSchoolsBilling failed in overview:', err?.message || err);
    }
    const billingBySchoolId: Record<string, any> = {};
    billingSchools.forEach((b: any) => { billingBySchoolId[b.schoolId.toString()] = b; });

    let activeSubscriptions = 0, inactiveSubscriptions = 0, paymentFailed = 0, expiringSoon = 0;
    let estimatedMonthlyRevenue = 0;
    const revenueBySchool: any[] = [];
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    for (const s of schools as any[]) {
      const sid = s._id.toString();
      const schoolVans = vansBySchool[sid] || [];
      const monthlyRevenue = schoolVans.reduce((sum, v) => sum + vanPrice(v), 0);
      const billing = billingBySchoolId[sid];

      if (billing) {
        if (billing.subscriptionStatus === 'active') {
          activeSubscriptions++;
          estimatedMonthlyRevenue += monthlyRevenue;
          revenueBySchool.push({ schoolId: sid, schoolName: s.schoolName, totalVans: schoolVans.length, monthlyRevenue, currency: 'PKR' });
        } else if (billing.subscriptionStatus === 'past_due') {
          paymentFailed++;
        } else {
          inactiveSubscriptions++;
        }

        if (billing.currentPeriodEnd && new Date(billing.currentPeriodEnd) <= thirtyDaysFromNow) {
          expiringSoon++;
        }
      } else {
        inactiveSubscriptions++;
      }
    }

    const averageRevenuePerSchool = activeSubscriptions > 0 ? Math.round(estimatedMonthlyRevenue / activeSubscriptions) : 0;
    const totalActiveVans = revenueBySchool.reduce((sum, r) => sum + r.totalVans, 0);
    const averageRevenuePerVehicle = totalActiveVans > 0 ? Math.round(estimatedMonthlyRevenue / totalActiveVans) : 0;

    return {
      message: 'Super admin overview fetched successfully',
      data: {
        institutions: {
          total: totalInstitutions,
          active: activeInstitutions,
          inactive: inactiveInstitutions,
          snapshot,
        },
        fleet: {
          total: totalFleet,
          active: activeFleet,
          gpsOnline,
          gpsOffline,
          avgHealth,
        },
        drivers: {
          total: totalDrivers,
          active: activeDrivers,
        },
        // App connection status — who has actually logged into the mobile
        // apps vs. just having an account created.
        appConnections: {
          parents: {
            total: totalParents,
            connected: connectedParents,
            rate: totalParents > 0 ? Math.round((connectedParents / totalParents) * 100) : 0,
          },
          drivers: {
            total: totalDrivers,
            connected: connectedDrivers,
            rate: totalDrivers > 0 ? Math.round((connectedDrivers / totalDrivers) * 100) : 0,
          },
          bySchool: appConnectionsBySchool,
        },
        trips: {
          today: tripsToday,
          completedToday,
        },
        // No Complaint model exists yet on the backend — see note above.
        complaints: {
          total: 0,
          open: 0,
          byCategory: [],
          avgResolutionHours: null,
          resolvedCount: 0,
        },
        billing: {
          activeSubscriptions,
          expiringSoon,
          paymentFailed,
          inactiveSubscriptions,
          estimatedMonthlyRevenue,
          averageRevenuePerSchool,
          averageRevenuePerVehicle,
          currency: 'PKR',
          revenueBySchool,
        },
      },
    };
  }

}