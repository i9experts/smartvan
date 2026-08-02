/* eslint-disable prettier/prettier */
import { Injectable, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { DatabaseService } from 'src/database/databaseservice';
import { SCHOOL_STAFF_PERMISSION_KEYS } from './school-staff.schema';

@Injectable()
export class SchoolStaffService {
  constructor(
    private databaseService: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  getAvailablePermissions() {
    return { message: 'Available permissions', data: SCHOOL_STAFF_PERMISSION_KEYS };
  }

  private async resolveSchool(adminId: string) {
    const school = await this.databaseService.repositories.SchoolModel.findOne({
      admin: new Types.ObjectId(adminId),
    });
    if (!school) throw new UnauthorizedException('School not found for this admin');
    return school;
  }

  async createStaff(adminId: string, body: any) {
    const { fullname, email, password, phoneNo, roleTitle, permissions } = body;
    if (!fullname || !email || !password) {
      throw new BadRequestException('Full name, email and password are required');
    }

    const invalidPerms = (permissions || []).filter((p: string) => !SCHOOL_STAFF_PERMISSION_KEYS.includes(p as any));
    if (invalidPerms.length > 0) {
      throw new BadRequestException(`Invalid permission(s): ${invalidPerms.join(', ')}`);
    }

    const school = await this.resolveSchool(adminId);

    const existing = await this.databaseService.repositories.schoolStaffModel.findOne({ email });
    if (existing) throw new BadRequestException('A staff member with this email already exists');

    const hashedPassword = await bcrypt.hash(password, 10);
    const staff = await this.databaseService.repositories.schoolStaffModel.create({
      fullname,
      email,
      password: hashedPassword,
      phoneNo,
      roleTitle,
      schoolId: school._id.toString(),
      permissions: permissions || [],
      status: 'active',
      createdBy: new Types.ObjectId(adminId),
    });

    return {
      message: 'Staff member created successfully',
      data: {
        id: staff._id,
        fullname: staff.fullname,
        email: staff.email,
        roleTitle: staff.roleTitle,
        permissions: staff.permissions,
        status: staff.status,
      },
    };
  }

  async getAllStaff(adminId: string) {
    const school = await this.resolveSchool(adminId);
    const staff = await this.databaseService.repositories.schoolStaffModel
      .find({ schoolId: school._id.toString() }, { password: 0 })
      .sort({ createdAt: -1 });
    return { message: 'Staff fetched successfully', data: staff };
  }

  async updateStaff(adminId: string, staffId: string, body: any) {
    const school = await this.resolveSchool(adminId);
    const staff = await this.databaseService.repositories.schoolStaffModel.findOne({
      _id: staffId,
      schoolId: school._id.toString(),
    });
    if (!staff) throw new NotFoundException('Staff member not found for this school');

    if (body.permissions) {
      const invalidPerms = body.permissions.filter((p: string) => !SCHOOL_STAFF_PERMISSION_KEYS.includes(p as any));
      if (invalidPerms.length > 0) {
        throw new BadRequestException(`Invalid permission(s): ${invalidPerms.join(', ')}`);
      }
      staff.permissions = body.permissions;
    }
    if (body.fullname) staff.fullname = body.fullname;
    if (body.phoneNo !== undefined) staff.phoneNo = body.phoneNo;
    if (body.roleTitle !== undefined) staff.roleTitle = body.roleTitle;
    if (body.status) staff.status = body.status;

    await staff.save();

    return {
      message: 'Staff member updated successfully',
      data: {
        id: staff._id,
        fullname: staff.fullname,
        roleTitle: staff.roleTitle,
        permissions: staff.permissions,
        status: staff.status,
      },
    };
  }

  async deleteStaff(adminId: string, staffId: string) {
    const school = await this.resolveSchool(adminId);
    const result = await this.databaseService.repositories.schoolStaffModel.findOneAndDelete({
      _id: staffId,
      schoolId: school._id.toString(),
    });
    if (!result) throw new NotFoundException('Staff member not found for this school');

    return { message: 'Staff member removed successfully' };
  }

  async loginStaff(email: string, password: string) {
    const staff = await this.databaseService.repositories.schoolStaffModel.findOne({ email });
    if (!staff) throw new UnauthorizedException('Invalid credentials');
    if (staff.status !== 'active') throw new UnauthorizedException('Account is inactive');

    const isMatch = await bcrypt.compare(password, staff.password);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwtService.sign(
      {
        sub: staff._id,
        email: staff.email,
        role: 'school_staff',
        schoolId: staff.schoolId,
        permissions: staff.permissions,
      },
      { expiresIn: '30d' },
    );

    return {
      message: 'Login successful',
      data: {
        token,
        user: {
          id: staff._id,
          fullname: staff.fullname,
          email: staff.email,
          roleTitle: staff.roleTitle,
          role: 'school_staff',
          schoolId: staff.schoolId,
          permissions: staff.permissions,
        },
      },
    };
  }
}
