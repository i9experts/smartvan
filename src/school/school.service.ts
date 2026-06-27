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

    const lead = await this.leadModel.findById(id);
    if (!lead) throw new BadRequestException('Lead not found');

    // If activating — auto-provision admin account + school
    if (status === 'activated' && lead.status !== 'activated') {
      // Check if admin already exists
      const existing = await this.databaseService.repositories.AdminModel.findOne({
        email: lead.email,
      });

      if (!existing) {
        const crypto = require('crypto');
        const bcrypt = require('bcrypt');

        // Generate random password
        const randomPassword = crypto.randomBytes(6).toString('hex');
        const hashedPassword = await bcrypt.hash(randomPassword, 10);

        // Create admin account
        const admin = await this.databaseService.repositories.AdminModel.create({
          name: lead.adminName,
          email: lead.email,
          phoneNo: lead.phone,
          password: hashedPassword,
          role: 'admin',
          isVerified: true,
        });

        // Create school record
        await this.databaseService.repositories.SchoolModel.create({
          schoolName: lead.schoolName,
          schoolEmail: lead.email,
          contactPerson: lead.adminName,
          contactNumber: lead.phone,
          address: lead.city + ', ' + lead.country,
          currentPlan: lead.plan || 'Professional',
          status: 'active',
          admin: admin._id,
        });

        // Send welcome email with credentials
        try {
          const mailer = this.getMailer();
          await mailer.sendMail({
            from: '"SmartVan Team" <' + process.env.EMAIL_USER + '>',
            to: lead.email,
            subject: 'Welcome to SmartVan — Your Account is Ready!',
            html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">' +
              '<div style="background:#1B2B6B;padding:28px;border-radius:12px 12px 0 0;text-align:center">' +
              '<h1 style="color:#FFB800;margin:0;font-size:24px">Welcome to SmartVan!</h1>' +
              '<p style="color:rgba(255,255,255,0.7);margin:8px 0 0">Your school transport management account is ready</p>' +
              '</div>' +
              '<div style="background:#f8f9fc;padding:28px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb">' +
              '<p style="color:#1a1a2e;font-size:15px">Dear <strong>' + lead.adminName + '</strong>,</p>' +
              '<p style="color:#6b7280;font-size:14px;line-height:1.7">Your SmartVan account for <strong>' + lead.schoolName + '</strong> has been activated. Here are your login credentials:</p>' +
              '<div style="background:#1B2B6B;border-radius:10px;padding:20px;margin:20px 0;text-align:center">' +
              '<p style="color:rgba(255,255,255,0.6);font-size:12px;margin:0 0 4px">Login Email</p>' +
              '<p style="color:#FFB800;font-size:18px;font-weight:700;margin:0 0 16px">' + lead.email + '</p>' +
              '<p style="color:rgba(255,255,255,0.6);font-size:12px;margin:0 0 4px">Temporary Password</p>' +
              '<p style="color:#FFB800;font-size:24px;font-weight:800;letter-spacing:3px;margin:0">' + randomPassword + '</p>' +
              '</div>' +
              '<div style="text-align:center;margin:20px 0">' +
              '<a href="https://smartvanride.com/auth/login" style="background:#FFB800;color:#1B2B6B;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">Login to Admin Panel →</a>' +
              '</div>' +
              '<p style="color:#6b7280;font-size:13px;line-height:1.7">Please change your password after first login. If you need any help, reply to this email or WhatsApp us.</p>' +
              '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">' +
              '<p style="color:#9ca3af;font-size:12px;text-align:center">SmartVan — School Transport Intelligence | smartvan.pk</p>' +
              '</div></div>',
          });
        } catch (emailErr) {
          console.error('Welcome email failed:', emailErr.message);
        }
      }
    }

    // Update lead status
    lead.status = status;
    await lead.save();

    return {
      message: status === 'activated'
        ? 'Lead activated — admin account created and credentials emailed'
        : 'Status updated',
      data: lead,
    };
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
