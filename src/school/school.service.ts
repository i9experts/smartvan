/* eslint-disable prettier/prettier */
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Types } from 'mongoose';
import * as nodemailer from 'nodemailer';
import { DatabaseService } from 'src/database/databaseservice';
import { OtpService } from 'src/user/schema/otp/otp.service';
import { SchoolDocument } from './school.schema';
import { SchoolLead, SchoolLeadDocument } from './school-lead.schema';

@Injectable()
export class SchoolService {
  constructor(
    private databaseService: DatabaseService,
    private readonly otpService: OtpService,
    private readonly jwtService: JwtService,
    @InjectModel(SchoolLead.name) private leadModel: Model<SchoolLeadDocument>,
  ) {}

  // ── Email helper ──────────────────────────────────────────────
  private getMailer() {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  // ── Lead methods ──────────────────────────────────────────────
  async createLead(body: any) {
    const lead = await this.leadModel.create({
      schoolName:   body.schoolName,
      schoolType:   body.schoolType,
      country:      body.country,
      city:         body.city,
      address:      body.address,
      vanCount:     body.vanCount,
      studentCount: body.studentCount,
      adminName:    body.adminName,
      designation:  body.designation,
      email:        body.email,
      phone:        body.phone,
      plan:         body.plan,
      currency:     body.currency,
      challenges:   body.challenges,
      status:       'new',
    });

    // Send email notification
    try {
      const mailer = this.getMailer();
      await mailer.sendMail({
        from: `"SmartVan Website" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_USER,
        subject: `🆕 New School Registration — ${body.schoolName}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#1B2B6B;padding:24px;border-radius:12px 12px 0 0">
              <h2 style="color:#FFB800;margin:0">New School Registration</h2>
              <p style="color:rgba(255,255,255,0.7);margin:4px 0 0">Submitted via smartvan.pk</p>
            </div>
            <div style="background:#f8f9fc;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb">
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr><td style="padding:8px 0;color:#6b7280;width:40%">School Name</td><td style="padding:8px 0;font-weight:600;color:#1a1a2e">${body.schoolName}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">School Type</td><td style="padding:8px 0;font-weight:600;color:#1a1a2e">${body.schoolType}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Country</td><td style="padding:8px 0;font-weight:600;color:#1a1a2e">${body.country}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">City</td><td style="padding:8px 0;font-weight:600;color:#1a1a2e">${body.city}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Fleet Size</td><td style="padding:8px 0;font-weight:600;color:#1a1a2e">${body.vanCount} vans / ${body.studentCount} students</td></tr>
                <tr><td colspan="2" style="padding:12px 0 4px;border-top:1px solid #e5e7eb"></td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Admin Name</td><td style="padding:8px 0;font-weight:600;color:#1a1a2e">${body.adminName}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Designation</td><td style="padding:8px 0;font-weight:600;color:#1a1a2e">${body.designation}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Email</td><td style="padding:8px 0;font-weight:600;color:#1B2B6B">${body.email}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Phone</td><td style="padding:8px 0;font-weight:600;color:#1a1a2e">${body.phone}</td></tr>
                <tr><td colspan="2" style="padding:12px 0 4px;border-top:1px solid #e5e7eb"></td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Plan</td><td style="padding:8px 0;font-weight:600;color:#1a1a2e">${body.plan}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Currency</td><td style="padding:8px 0;font-weight:600;color:#1a1a2e">${body.currency}</td></tr>
                ${body.challenges ? `<tr><td style="padding:8px 0;color:#6b7280;vertical-align:top">Challenges</td><td style="padding:8px 0;color:#1a1a2e">${body.challenges}</td></tr>` : ''}
              </table>
              <div style="margin-top:20px;text-align:center">
                <a href="https://smartvanride.com/auth/login" style="background:#1B2B6B;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View in Admin Panel →</a>
              </div>
            </div>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('Email notification failed:', emailErr.message);
    }

    return {
      message: 'Registration submitted successfully',
      leadId: lead._id,
    };
  }

  async getAllLeads() {
    const leads = await this.leadModel.find().sort({ createdAt: -1 }).lean();
    return { message: 'Leads fetched', data: leads };
  }

  async updateLeadStatus(id: string, status: string) {
    const valid = ['new', 'contacted', 'activated', 'rejected'];
    if (!valid.includes(status)) throw new BadRequestException('Invalid status');
    const lead = await this.leadModel.findByIdAndUpdate(id, { status }, { new: true });
    if (!lead) throw new BadRequestException('Lead not found');
    return { message: 'Status updated', data: lead };
  }

  // ── Existing methods ──────────────────────────────────────────
  async getkidsProfile(userId: string) {
    try {
      if (!userId) throw new UnauthorizedException('Invalid user credentials');
      const school: SchoolDocument | null = await this.databaseService.repositories.SchoolModel.findOne({
        admin: new Types.ObjectId(userId),
      });
      if (!school) throw new UnauthorizedException('School not found');
      const kids = await this.databaseService.repositories.KidModel.find({ schoolId: school._id.toString() });
      return { message: 'kids fetched successfully', data: kids };
    } catch (error) {
      throw new UnauthorizedException(error.message || 'Failed to fetch kids');
    }
  }

  async getVansProfile(userId: string) {
    try {
      if (!userId) throw new UnauthorizedException('Invalid user credentials');
      const school: SchoolDocument | null = await this.databaseService.repositories.SchoolModel.findOne({
        admin: new Types.ObjectId(userId),
      });
      if (!school) throw new UnauthorizedException('School not found');
      const vans = await this.databaseService.repositories.VanModel.find({ schoolId: school._id.toString() });
      return { message: 'vans fetched successfully', data: vans };
    } catch (error) {
      throw new UnauthorizedException(error.message || 'Failed to fetch vans');
    }
  }

  async getDriversProfile(userId: string) {
    try {
      if (!userId) throw new UnauthorizedException('Invalid user credentials');
      const school: SchoolDocument | null = await this.databaseService.repositories.SchoolModel.findOne({
        admin: new Types.ObjectId(userId),
      });
      if (!school) throw new UnauthorizedException('School not found');
      const drivers = await this.databaseService.repositories.driverModel
        .find({ schoolId: school._id.toString(), isDelete: { $ne: true }, status: 'active' })
        .sort({ _id: -1 })
        .lean();
      return {
        message: 'drivers fetched successfully',
        data: {
          totalDrivers: drivers.length,
          drivers: drivers.map(d => ({
            id: d._id, schoolId: d.schoolId, fullname: d.fullname,
            email: d.email, phoneNo: d.phoneNo, NIC: d.NIC,
            alternatePhoneNo: d.alternatePhoneNo, address: d.address,
            driverImage: d.image, isDelete: d.isDelete,
          })),
        },
      };
    } catch (error) {
      throw new UnauthorizedException(error.message || 'Failed to fetch drivers');
    }
  }

  async getAllSchools() {
    return this.databaseService.repositories.SchoolModel.find().sort({ _id: -1 }).lean();
  }

  async changeSchoolStatusByAdmin(schoolId: string, status: string) {
    if (status !== 'active' && status !== 'inActive') {
      throw new BadRequestException('Invalid status value');
    }
    const school = await this.databaseService.repositories.SchoolModel.findById(schoolId);
    if (!school) throw new UnauthorizedException('School not found');
    school.status = status;
    await school.save();
    return { message: `School status updated to ${status}`, schoolId: school._id, status: school.status };
  }
}
