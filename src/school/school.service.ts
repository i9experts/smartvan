/* eslint-disable prettier/prettier */
import { Injectable, OnModuleInit, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Types } from 'mongoose';
import * as nodemailer from 'nodemailer';
import { DatabaseService } from 'src/database/databaseservice';
import { OtpService } from 'src/user/schema/otp/otp.service';
import { SchoolDocument } from './school.schema';
import { SchoolLead, SchoolLeadDocument } from './school-lead.schema';
import { Campaign, CampaignDocument } from './campaign.schema';
import { LEAD_EMAIL_TEMPLATES } from './lead-email-templates';
import { WhatsappService } from 'src/whatsapp/whatsapp.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { FEATURE_KEYS, FEATURE_KEY_SET, effectiveFeatures, hasFeature } from './feature-keys';

@Injectable()
export class SchoolService implements OnModuleInit {
  constructor(
    private databaseService: DatabaseService,
    private readonly otpService: OtpService,
    private readonly jwtService: JwtService,
    @InjectModel(SchoolLead.name) private leadModel: Model<SchoolLeadDocument>,
    @InjectModel(Campaign.name) private campaignModel: Model<CampaignDocument>,
    private readonly whatsappService: WhatsappService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async onModuleInit() {
    this.migrateLegacyLeadStatuses().catch((err) =>
      console.error('[SchoolService] legacy lead status migration failed:', err?.message || err),
    );
  }

  @Cron('0 3 * * *') // daily at 03:00 — quiet hours, well away from peak trip traffic
  async syncStalledSchoolsIntoPipelineCron() {
    this.syncStalledSchoolsIntoPipeline().catch((err) =>
      console.error('[SchoolService] stalled-trial sync failed:', err?.message || err),
    );
  }

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

  private escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Finds an open (not Won/Lost) lead matching this email or phone — the
   * same school submitting the registration form twice, or getting
   * captured through two different channels (the form, then Contact Us,
   * then a CSV import someone re-ran), is one sales conversation, not
   * three pipeline cards. Returns null when nothing matches.
   */
  private async findOpenDuplicateLead(email?: string, phone?: string): Promise<SchoolLeadDocument | null> {
    const or: any[] = [];
    if (email?.trim()) or.push({ email: { $regex: `^${this.escapeRegExp(email.trim())}$`, $options: 'i' } });
    if (phone?.trim()) or.push({ phone: phone.trim() });
    if (or.length === 0) return null;
    return this.leadModel.findOne({ $or: or, status: { $nin: ['won', 'lost'] } });
  }

  // A superadmin can act on any lead; a sales employee only on the ones
  // assigned to them — an unassigned or someone-else's lead isn't theirs to
  // touch yet, even if they know its id.
  private assertLeadAccess(lead: SchoolLeadDocument, actor: { userId: string; role: string }) {
    if (actor.role === 'superadmin') return;
    if (actor.role === 'employee' && lead.assignedTo?.toString() === actor.userId) return;
    throw new ForbiddenException('You do not have access to this lead');
  }

  /**
   * Shared by every lead-capture source (website form, Contact Us, manual
   * add, spreadsheet import, stalled-trial sync, demand conversion) —
   * dedupes against any open lead sharing the email or phone before
   * creating a new one, so the same prospect never ends up as two cards.
   */
  private async createOrMergeLead(input: {
    schoolName: string; schoolType?: string; country?: string; city?: string; address?: string;
    vanCount?: string; studentCount?: string; adminName: string; designation?: string;
    email: string; phone?: string; plan?: string; currency?: string; challenges?: string;
    source: string; dedupNote: string; schoolId?: Types.ObjectId; initialStatus?: string;
    utmSource?: string; utmMedium?: string; utmCampaign?: string; assignedTo?: Types.ObjectId;
  }): Promise<{ lead: SchoolLeadDocument; created: boolean }> {
    const dup = await this.findOpenDuplicateLead(input.email, input.phone);
    if (dup) {
      dup.activity.push({
        type: 'note',
        summary: input.dedupNote,
        authorEmail: 'system',
        occurredAt: new Date(),
      } as any);
      if (input.schoolId && !dup.schoolId) dup.schoolId = input.schoolId;
      if (input.assignedTo && !dup.assignedTo) dup.assignedTo = input.assignedTo;
      // First-touch attribution — a lead that already has a campaign
      // shouldn't be re-attributed to whatever campaign happened to send
      // the duplicate submission.
      if (input.utmCampaign && !dup.utmCampaign) {
        dup.utmSource = input.utmSource;
        dup.utmMedium = input.utmMedium;
        dup.utmCampaign = input.utmCampaign;
        dup.campaignId = await this.resolveCampaignId(input.utmCampaign);
      }
      await dup.save();
      return { lead: dup, created: false };
    }
    const { dedupNote, initialStatus, utmSource, utmMedium, utmCampaign, ...rest } = input;
    const campaignId = await this.resolveCampaignId(utmCampaign);
    const lead = await this.leadModel.create({
      ...rest, status: initialStatus || 'new', utmSource, utmMedium, utmCampaign, campaignId,
    });
    return { lead, created: true };
  }

  async createLead(body: any) {
    const { lead } = await this.createOrMergeLead({
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
      source: 'website',
      dedupNote: 'Resubmitted the smartvan.pk registration form',
      utmSource: body.utmSource || body.utm_source,
      utmMedium: body.utmMedium || body.utm_medium,
      utmCampaign: body.utmCampaign || body.utm_campaign,
    });

    // Send email notification — fire-and-forget so a slow/failed SMTP send
    // never blocks or breaks the client's response (lead is already saved above)
    (async () => {
    try {
      const mailer = this.getMailer();
      await mailer.sendMail({
        from: `"SmartVan Website" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_USER,
        subject: `🆕 New School Registration — ${body.schoolName}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#1B3B69;padding:24px;border-radius:12px 12px 0 0"><img src="https://app.smartvan.pk/favicon-192.png" alt="SmartVan" width="56" height="56" style="display:block;margin:0 auto 10px;border-radius:12px">
              <h2 style="color:#FEC610;margin:0">New School Registration</h2>
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
                <tr><td style="padding:8px 0;color:#6b7280">Email</td><td style="padding:8px 0;font-weight:600;color:#1B3B69">${body.email}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Phone</td><td style="padding:8px 0;font-weight:600;color:#1a1a2e">${body.phone}</td></tr>
                <tr><td colspan="2" style="padding:12px 0 4px;border-top:1px solid #e5e7eb"></td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Plan</td><td style="padding:8px 0;font-weight:600;color:#1a1a2e">${body.plan}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280">Currency</td><td style="padding:8px 0;font-weight:600;color:#1a1a2e">${body.currency}</td></tr>
                ${body.challenges ? `<tr><td style="padding:8px 0;color:#6b7280;vertical-align:top">Challenges</td><td style="padding:8px 0;color:#1a1a2e">${body.challenges}</td></tr>` : ''}
              </table>
              <div style="margin-top:20px;text-align:center">
                <a href="https://app.smartvan.pk/auth/login" style="background:#1B3B69;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View in Admin Panel →</a>
              </div>
            </div>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('Email notification failed:', emailErr.message);
    }
    })();

    return {
      message: 'Registration submitted successfully',
      leadId: lead._id,
    };
  }

  /**
   * Parent Intelligence surfaces "unmet demand" — parents naming a school
   * that hasn't onboarded — as pure counts, with no single admin contact of
   * its own (it's several individual parents, not one school signup). This
   * turns one of those into a real lead, using a specific parent's own
   * contact details as the way in rather than inventing placeholder data.
   */
  async createLeadFromDemand(
    input: { schoolName: string; contactName: string; contactEmail: string; contactPhone?: string; city?: string },
    actor: { email: string },
  ) {
    const { lead, created } = await this.createOrMergeLead({
      schoolName: input.schoolName,
      adminName: input.contactName,
      email: input.contactEmail,
      phone: input.contactPhone,
      city: input.city,
      source: 'parent_demand',
      dedupNote: `Parent demand converted again by ${actor.email}`,
    });
    if (created) {
      lead.activity.push({
        type: 'note',
        summary: `Converted from parent demand — a parent named this school at registration/add-kid`,
        authorEmail: actor.email,
        occurredAt: new Date(),
      } as any);
      await lead.save();
    }
    return { message: created ? 'Lead created from parent demand' : 'An open lead already existed — merged into it', data: lead };
  }

  /**
   * Schools with real vans on file but no paid subscription are the
   * activation-funnel signal from the billing side (see getPlanBreakdown's
   * unbilledSchoolsWithVans) — this pulls each one that isn't already
   * tracked anywhere into the pipeline as a Trial-stage lead, so the sales
   * team can see and work them instead of them sitting invisible until
   * someone happens to check the billing tab. Runs on a daily @Cron below
   * and on demand via the superadmin "Sync now" button.
   */
  async syncStalledSchoolsIntoPipeline() {
    const schools = await this.databaseService.repositories.SchoolModel.find(
      { subscriptionStatus: { $ne: 'active' } },
      { schoolName: 1, schoolEmail: 1, contactPerson: 1, contactNumber: 1, address: 1 },
    ).lean();

    let created = 0;
    for (const school of schools as any[]) {
      if (!school.schoolEmail) continue;

      const alreadyTracked = await this.leadModel.exists({ schoolId: school._id });
      if (alreadyTracked) continue;

      const vanCount = await this.databaseService.repositories.VanModel.countDocuments({
        schoolId: school._id.toString(),
      });
      if (vanCount === 0) continue;

      const { created: wasCreated, lead } = await this.createOrMergeLead({
        schoolName: school.schoolName,
        adminName: school.contactPerson || school.schoolName,
        email: school.schoolEmail,
        phone: school.contactNumber,
        address: school.address,
        source: 'stalled_trial',
        initialStatus: 'trial',
        schoolId: school._id,
        dedupNote: `Still has ${vanCount} van(s) on file with no active subscription`,
      });
      if (wasCreated) {
        lead.activity.push({
          type: 'note',
          summary: `Auto-added: has ${vanCount} van(s) on file but no active subscription`,
          authorEmail: 'system',
          occurredAt: new Date(),
        } as any);
        await lead.save();
        created++;
      }
    }

    return { message: 'Stalled trial schools synced', data: { created } };
  }

  async createLeadFromContactForm(input: {
    name: string; email: string; subject?: string; message: string;
    utmSource?: string; utmMedium?: string; utmCampaign?: string;
  }) {
    const { lead } = await this.createOrMergeLead({
      schoolName: input.subject?.trim() || `Contact Us — ${input.name}`,
      adminName: input.name,
      email: input.email,
      source: 'contact_us',
      dedupNote: `Sent another Contact Us message: "${input.message}"`,
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
    });
    lead.activity.push({
      type: 'note',
      summary: input.message,
      authorEmail: 'system',
      occurredAt: new Date(),
    } as any);
    await lead.save();
    return lead;
  }

  async createLeadManually(body: any, actor: { userId: string; email: string; role: string }) {
    if (!body.schoolName?.trim()) throw new BadRequestException('School name is required');
    if (!body.adminName?.trim()) throw new BadRequestException('Contact name is required');
    if (!body.email?.trim()) throw new BadRequestException('Email is required');

    const { lead, created } = await this.createOrMergeLead({
      schoolName: body.schoolName.trim(),
      schoolType: body.schoolType,
      country: body.country,
      city: body.city,
      address: body.address,
      vanCount: body.vanCount,
      studentCount: body.studentCount,
      adminName: body.adminName.trim(),
      designation: body.designation,
      email: body.email.trim(),
      phone: body.phone,
      plan: body.plan,
      currency: body.currency,
      challenges: body.challenges,
      source: 'manual',
      dedupNote: `Added again manually by ${actor.email}`,
      // A rep who adds their own lead is already working it.
      assignedTo: actor.role === 'employee' ? (new Types.ObjectId(actor.userId) as any) : undefined,
    });
    return { message: created ? 'Lead added' : 'An open lead already existed — merged into it', data: lead };
  }

  /**
   * Spreadsheet import — one row at a time, each going through the same
   * dedup as every other lead source. Keeps going on a bad row rather than
   * failing the whole batch, so one malformed row in a 200-row sheet
   * doesn't cost the other 199.
   */
  async importLeads(rows: any[], actor: { email: string }) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('No rows to import');
    }
    if (rows.length > 500) {
      throw new BadRequestException('Import is limited to 500 rows at a time');
    }

    let created = 0;
    let merged = 0;
    const failed: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const schoolName = String(row.schoolName || '').trim();
      const adminName = String(row.adminName || '').trim();
      const email = String(row.email || '').trim();
      if (!schoolName || !adminName || !email) {
        failed.push({ row: i + 1, reason: 'Missing schoolName, adminName or email' });
        continue;
      }
      try {
        const { created: wasCreated } = await this.createOrMergeLead({
          schoolName,
          schoolType: row.schoolType,
          country: row.country,
          city: row.city,
          address: row.address,
          vanCount: row.vanCount != null ? String(row.vanCount) : undefined,
          studentCount: row.studentCount != null ? String(row.studentCount) : undefined,
          adminName,
          designation: row.designation,
          email,
          phone: row.phone != null ? String(row.phone) : undefined,
          plan: row.plan,
          currency: row.currency,
          challenges: row.challenges,
          source: 'import',
          dedupNote: `Re-imported from a spreadsheet by ${actor.email}`,
        });
        if (wasCreated) created++; else merged++;
      } catch (e: any) {
        failed.push({ row: i + 1, reason: e?.message || 'Unknown error' });
      }
    }

    return { message: 'Import complete', data: { created, merged, failed } };
  }

  // Superadmin sees every lead; a sales employee sees only the pipeline
  // assigned to them — their own working list, not everyone else's leads.
  async getAllLeads(actor: { userId: string; role: string }) {
    const filter = actor.role === 'employee' ? { assignedTo: actor.userId } : {};
    const leads = await this.leadModel.find(filter).sort({ createdAt: -1 }).lean();
    return { message: 'Leads fetched', data: leads };
  }

  async updateLeadStatus(id: string, status: string, actor: { userId: string; email: string; role: string }) {
    const valid = ['new', 'contacted', 'demo', 'trial', 'won', 'lost'];
    if (!valid.includes(status)) throw new BadRequestException('Invalid status');

    const lead = await this.leadModel.findById(id);
    if (!lead) throw new BadRequestException('Lead not found');
    this.assertLeadAccess(lead, actor);

    const previousStatus = lead.status;
    let provisioned = false;

    // Moving into 'trial' is the moment the school actually gets an
    // account — provision it the same way createInstitutionDirectly does.
    // Skipped if this lead is already linked (re-entering 'trial' is then
    // just a status change, not a second account).
    if (status === 'trial' && !lead.schoolId) {
      const result = await this.provisionSchoolAndAdmin({
        schoolName: lead.schoolName,
        adminName: lead.adminName,
        email: lead.email,
        phone: lead.phone,
        address: lead.city + ', ' + lead.country,
        currentPlan: lead.plan || 'Professional',
      });
      if (result) {
        lead.schoolId = result.school._id as any;
        provisioned = true;
      } else {
        // An admin with this email already exists (e.g. provisioned
        // separately) — link to that school rather than leaving this lead
        // unlinked forever.
        const escaped = lead.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existingSchool = await this.databaseService.repositories.SchoolModel.findOne({
          schoolEmail: { $regex: `^${escaped}$`, $options: 'i' },
        });
        if (existingSchool) lead.schoolId = existingSchool._id as any;
      }
    }

    lead.status = status;
    if (status === 'won' && previousStatus !== 'won') lead.wonAt = new Date();
    lead.activity.push({
      type: 'status_change',
      summary: provisioned
        ? 'Moved to Trial — account provisioned and credentials emailed'
        : `Status changed: ${previousStatus} → ${status}`,
      authorEmail: actor.email,
      occurredAt: new Date(),
    } as any);
    await lead.save();

    this.auditLogService.record('lead_status_changed', actor.userId, actor.email, actor.role, {
      leadId: lead._id.toString(),
      schoolName: lead.schoolName,
      from: previousStatus,
      to: status,
    });

    return {
      message: provisioned
        ? 'Lead moved to Trial — admin account created and credentials emailed'
        : 'Status updated',
      data: lead,
    };
  }

  async getLeadById(id: string, actor: { userId: string; role: string }) {
    const lead = await this.leadModel.findById(id);
    if (!lead) throw new BadRequestException('Lead not found');
    this.assertLeadAccess(lead, actor);
    return { message: 'Lead fetched', data: lead };
  }

  async addLeadActivity(
    id: string,
    input: { type: string; summary: string },
    actor: { userId: string; email: string; role: string },
  ) {
    const validTypes = ['note', 'call', 'whatsapp', 'meeting'];
    if (!validTypes.includes(input.type)) throw new BadRequestException('Invalid activity type');
    if (!input.summary?.trim()) throw new BadRequestException('Summary is required');

    const lead = await this.leadModel.findById(id);
    if (!lead) throw new BadRequestException('Lead not found');
    this.assertLeadAccess(lead, actor);

    lead.activity.push({
      type: input.type,
      summary: input.summary.trim(),
      authorEmail: actor.email,
      occurredAt: new Date(),
    } as any);
    await lead.save();

    return { message: 'Activity logged', data: lead };
  }

  async addLeadTask(id: string, input: { title: string; dueAt?: string }, actor: { userId: string; role: string }) {
    if (!input.title?.trim()) throw new BadRequestException('Title is required');

    const lead = await this.leadModel.findById(id);
    if (!lead) throw new BadRequestException('Lead not found');
    this.assertLeadAccess(lead, actor);

    lead.tasks.push({
      title: input.title.trim(),
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      done: false,
      createdAt: new Date(),
    } as any);
    await lead.save();

    return { message: 'Task added', data: lead };
  }

  async updateLeadTask(
    id: string,
    taskId: string,
    input: { done?: boolean; title?: string; dueAt?: string },
    actor: { userId: string; role: string },
  ) {
    const lead = await this.leadModel.findById(id);
    if (!lead) throw new BadRequestException('Lead not found');
    this.assertLeadAccess(lead, actor);

    const task = (lead.tasks as any).id(taskId);
    if (!task) throw new BadRequestException('Task not found');

    if (input.title !== undefined) task.title = input.title.trim();
    if (input.dueAt !== undefined) task.dueAt = input.dueAt ? new Date(input.dueAt) : undefined;
    if (input.done !== undefined) {
      task.done = input.done;
      task.completedAt = input.done ? new Date() : undefined;
    }
    await lead.save();

    return { message: 'Task updated', data: lead };
  }

  getLeadEmailTemplates() {
    return { message: 'Templates fetched', data: LEAD_EMAIL_TEMPLATES };
  }

  async sendLeadEmail(
    id: string,
    input: { subject: string; body: string },
    actor: { userId: string; email: string; role: string },
  ) {
    if (!input.subject?.trim() || !input.body?.trim()) {
      throw new BadRequestException('Subject and body are required');
    }

    const lead = await this.leadModel.findById(id);
    if (!lead) throw new BadRequestException('Lead not found');
    this.assertLeadAccess(lead, actor);

    const mailer = this.getMailer();
    await mailer.sendMail({
      from: `"SmartVan Team" <${process.env.EMAIL_USER}>`,
      to: lead.email,
      replyTo: actor.email,
      subject: input.subject.trim(),
      text: input.body,
    });

    lead.activity.push({
      type: 'email',
      summary: `Sent: "${input.subject.trim()}"`,
      authorEmail: actor.email,
      occurredAt: new Date(),
    } as any);
    await lead.save();

    return { message: 'Email sent', data: lead };
  }

  // Called from billing.service.ts whenever a school's payment is confirmed
  // (webhook, manual mark-paid, or the self-heal Stripe sync) — if that
  // school was provisioned from a lead still open in the pipeline, this is
  // the deal closing. Idempotent and silent when there's no linked lead, or
  // it's already Won/Lost, so it's safe to call from every success path.
  async markLeadWonIfLinked(schoolId: Types.ObjectId | string | any, note: string) {
    const lead = await this.leadModel.findOne({
      schoolId,
      status: { $nin: ['won', 'lost'] },
    });
    if (!lead) return;

    const previousStatus = lead.status;
    lead.status = 'won';
    lead.wonAt = new Date();
    lead.activity.push({
      type: 'status_change',
      summary: note,
      authorEmail: 'system',
      occurredAt: new Date(),
    } as any);
    await lead.save();

    this.auditLogService.record('lead_status_changed', 'system', 'system', 'superadmin', {
      leadId: lead._id.toString(),
      schoolName: lead.schoolName,
      from: previousStatus,
      to: 'won',
    });
  }

  // One-time, idempotent: renames the old 4-stage status values to the new
  // 6-stage pipeline, and backfills schoolId for leads that already have a
  // provisioned account (set only going forward by updateLeadStatus) by
  // matching the school's email. Safe to run on every boot — the renames
  // only ever match the old string values, and the backfill only touches
  // leads still missing schoolId.
  async migrateLegacyLeadStatuses() {
    await this.leadModel.updateMany({ status: 'activated' }, { $set: { status: 'trial' } });
    await this.leadModel.updateMany({ status: 'rejected' }, { $set: { status: 'lost' } });

    const unlinked = await this.leadModel.find({
      status: { $in: ['trial', 'won'] },
      schoolId: { $exists: false },
    });
    for (const lead of unlinked) {
      const escaped = lead.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const school = await this.databaseService.repositories.SchoolModel.findOne({
        schoolEmail: { $regex: `^${escaped}$`, $options: 'i' },
      });
      if (school) {
        lead.schoolId = school._id as any;
        await lead.save();
      }
    }
  }

  /**
   * Shared by lead activation and the superadmin's direct "+ Add
   * Institution" flow — creates the admin account + school record, then
   * emails the generated credentials. No-ops (returns null) if an admin
   * with this email already exists, matching updateLeadStatus's original
   * idempotency guard.
   */
  private async provisionSchoolAndAdmin(input: {
    schoolName: string;
    adminName: string;
    email: string;
    phone: string;
    address: string;
    currentPlan?: string;
    featureTier?: 'basic' | 'premium';
  }) {
    const existing = await this.databaseService.repositories.AdminModel.findOne({
      email: input.email,
    });
    if (existing) return null;

    const crypto = require('crypto');
    const bcrypt = require('bcrypt');

    // Generate random password
    const randomPassword = crypto.randomBytes(6).toString('hex');
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    // Create admin account
    const admin = await this.databaseService.repositories.AdminModel.create({
      name: input.adminName,
      email: input.email,
      phoneNo: input.phone,
      password: hashedPassword,
      role: 'admin',
      isVerified: true,
    });

    // Create school record
    const school = await this.databaseService.repositories.SchoolModel.create({
      schoolName: input.schoolName,
      schoolEmail: input.email,
      contactPerson: input.adminName,
      contactNumber: input.phone,
      address: input.address,
      currentPlan: input.currentPlan || 'Professional',
      status: 'active',
      featureTier: input.featureTier || 'basic',
      admin: admin._id,
    });

    // Send WhatsApp welcome — fire-and-forget, never block activation on delivery
    if (input.phone) {
      this.whatsappService.sendSchoolWelcome(input.phone, input.adminName, input.schoolName)
        .catch((err) => console.error('WhatsApp school welcome failed:', err));
    }

    // Send welcome email with credentials
    try {
      const mailer = this.getMailer();
      await mailer.sendMail({
        from: '"SmartVan Team" <' + process.env.EMAIL_USER + '>',
        to: input.email,
        subject: 'Welcome to SmartVan — Your Account is Ready!',
        html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">' +
          '<div style="background:#1B3B69;padding:28px;border-radius:12px 12px 0 0;text-align:center">' +
          '<img src="https://app.smartvan.pk/favicon-192.png" alt="SmartVan" width="56" height="56" style="display:block;margin:0 auto 10px;border-radius:12px"><h1 style="color:#FEC610;margin:0;font-size:24px">Welcome to SmartVan!</h1>' +
          '<p style="color:rgba(255,255,255,0.7);margin:8px 0 0">Your school transport management account is ready</p>' +
          '</div>' +
          '<div style="background:#f8f9fc;padding:28px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb">' +
          '<p style="color:#1a1a2e;font-size:15px">Dear <strong>' + input.adminName + '</strong>,</p>' +
          '<p style="color:#6b7280;font-size:14px;line-height:1.7">Your SmartVan account for <strong>' + input.schoolName + '</strong> has been activated. Here are your login credentials:</p>' +
          '<div style="background:#1B3B69;border-radius:10px;padding:20px;margin:20px 0;text-align:center">' +
          '<p style="color:rgba(255,255,255,0.6);font-size:12px;margin:0 0 4px">Login Email</p>' +
          '<p style="color:#FEC610;font-size:18px;font-weight:700;margin:0 0 16px">' + input.email + '</p>' +
          '<p style="color:rgba(255,255,255,0.6);font-size:12px;margin:0 0 4px">Temporary Password</p>' +
          '<p style="color:#FEC610;font-size:24px;font-weight:800;letter-spacing:3px;margin:0">' + randomPassword + '</p>' +
          '</div>' +
          '<div style="text-align:center;margin:20px 0">' +
          '<a href="https://app.smartvan.pk/auth/login" style="background:#FEC610;color:#1B3B69;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">Login to Admin Panel →</a>' +
          '</div>' +
          '<p style="color:#6b7280;font-size:13px;line-height:1.7">Please change your password after first login. If you need any help, reply to this email or WhatsApp us.</p>' +
          '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">' +
          '<p style="color:#9ca3af;font-size:12px;text-align:center">SmartVan — School Transport Intelligence | smartvan.pk</p>' +
          '</div></div>',
      });
    } catch (emailErr) {
      console.error('Welcome email failed:', emailErr.message);
    }

    return { admin, school, randomPassword };
  }

  /** Superadmin: create a school + admin account directly, bypassing the lead review flow. */
  async createInstitutionDirectly(body: {
    schoolName: string;
    adminName: string;
    email: string;
    phone: string;
    address?: string;
    featureTier?: 'basic' | 'premium';
  }) {
    if (!body.schoolName || !body.adminName || !body.email || !body.phone) {
      throw new BadRequestException('schoolName, adminName, email and phone are required');
    }
    const existing = await this.databaseService.repositories.AdminModel.findOne({ email: body.email });
    if (existing) {
      throw new BadRequestException('An admin account with this email already exists');
    }

    const result = await this.provisionSchoolAndAdmin({
      schoolName: body.schoolName,
      adminName: body.adminName,
      email: body.email,
      phone: body.phone,
      address: body.address || '',
      featureTier: body.featureTier || 'basic',
    });

    return {
      message: 'Institution created — credentials emailed to the admin',
      data: { schoolId: result?.school._id, adminId: result?.admin._id },
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
    return this.databaseService.repositories.SchoolModel.find(
      {},
      {
        schoolName: 1,
        schoolImage: 1,
        schoolEmail: 1,
        contactPerson: 1,
        contactNumber: 1,
        address: 1,
        branchName: 1,
        currentPlan: 1,
        status: 1,
        allowedVans: 1,
        allowedStudents: 1,
        allowedRoutes: 1,
        timezone: 1,
        createdAt: 1,
        // Deliberately excluded: waAccessToken, waPhoneNumberId, waPhoneNumber,
        // paymentMethod, billingCycle, lat, long — sensitive/internal fields
        // that don't belong in a general schools listing.
      },
    ).sort({ _id: -1 }).lean();
  }

  async changeSchoolStatusByAdmin(schoolId: string, status: string, actor?: { userId: string; email: string; role: string }) {
    if (status !== 'active' && status !== 'inActive') {
      throw new BadRequestException('Invalid status value');
    }
    const school = await this.databaseService.repositories.SchoolModel.findById(schoolId);
    if (!school) throw new UnauthorizedException('School not found');
    school.status = status;
    await school.save();

    if (actor) {
      this.auditLogService.record(
        status === 'active' ? 'school_activated' : 'school_suspended',
        actor.userId,
        actor.email,
        actor.role,
        { schoolId: school._id.toString(), schoolName: (school as any).schoolName },
      );
    }

    return { message: `School status updated to ${status}`, schoolId: school._id, status: school.status };
  }

  // ── Feature tier (Basic vs Premium) ───────────────────────────────

  getFeatureRegistry() {
    return { message: 'Feature registry', data: FEATURE_KEYS };
  }

  /** A school admin/staff's own effective feature set, for sidebar/paywall rendering. */
  async getMyFeatures(schoolId: string) {
    const school: any = await this.databaseService.repositories.SchoolModel.findById(schoolId).lean();
    if (!school) throw new UnauthorizedException('School not found');
    return {
      message: 'Features fetched',
      data: {
        featureTier: school.featureTier || 'basic',
        enabledFeatures: school.enabledFeatures || [],
        disabledFeatures: school.disabledFeatures || [],
        effectiveFeatures: [...effectiveFeatures(school)],
        premiumSubscriptionStatus: school.premiumSubscriptionStatus || 'inactive',
      },
    };
  }

  /** Superadmin: view one school's current tier/overrides alongside the full registry. */
  async getSchoolFeatureSettings(schoolId: string) {
    const school: any = await this.databaseService.repositories.SchoolModel.findById(schoolId).lean();
    if (!school) throw new UnauthorizedException('School not found');
    return {
      message: 'Feature settings fetched',
      data: {
        schoolId: school._id,
        schoolName: school.schoolName,
        featureTier: school.featureTier || 'basic',
        enabledFeatures: school.enabledFeatures || [],
        disabledFeatures: school.disabledFeatures || [],
        effectiveFeatures: [...effectiveFeatures(school)],
        premiumSubscriptionStatus: school.premiumSubscriptionStatus || 'inactive',
        registry: FEATURE_KEYS,
      },
    };
  }

  /** Superadmin: set a school's tier and/or per-feature overrides. */
  async updateSchoolFeatureTier(
    schoolId: string,
    body: { featureTier?: string; enabledFeatures?: string[]; disabledFeatures?: string[] },
    actor?: { userId: string; email: string; role: string },
  ) {
    const school = await this.databaseService.repositories.SchoolModel.findById(schoolId);
    if (!school) throw new UnauthorizedException('School not found');

    const update: Record<string, any> = {};
    if (body.featureTier !== undefined) {
      if (body.featureTier !== 'basic' && body.featureTier !== 'premium') {
        throw new BadRequestException("featureTier must be 'basic' or 'premium'");
      }
      update.featureTier = body.featureTier;
    }
    if (body.enabledFeatures !== undefined) {
      const invalid = body.enabledFeatures.filter((k) => !FEATURE_KEY_SET.has(k));
      if (invalid.length) throw new BadRequestException(`Unknown feature key(s): ${invalid.join(', ')}`);
      update.enabledFeatures = body.enabledFeatures;
    }
    if (body.disabledFeatures !== undefined) {
      const invalid = body.disabledFeatures.filter((k) => !FEATURE_KEY_SET.has(k));
      if (invalid.length) throw new BadRequestException(`Unknown feature key(s): ${invalid.join(', ')}`);
      update.disabledFeatures = body.disabledFeatures;
    }

    Object.assign(school, update);
    await school.save();

    if (actor) {
      this.auditLogService.record(
        'school_feature_tier_updated',
        actor.userId,
        actor.email,
        actor.role,
        { schoolId: school._id.toString(), schoolName: (school as any).schoolName, ...update },
      );
    }

    return this.getSchoolFeatureSettings(schoolId);
  }

  /** Superadmin: per-feature adoption across every school — how many have
   * it via their tier's default vs. a hand-tuned override. */
  async getAppsModulesOverview() {
    const schools = await this.databaseService.repositories.SchoolModel.find(
      {},
      { featureTier: 1, enabledFeatures: 1, disabledFeatures: 1 },
    ).lean();

    const adoption = FEATURE_KEYS.map((def) => {
      let schoolCount = 0;
      let viaOverrideCount = 0;
      schools.forEach((s: any) => {
        const has = hasFeature(s, def.key);
        if (has) {
          schoolCount += 1;
          const tier = s.featureTier === 'premium' ? 'premium' : 'basic';
          // On via an override when the tier's own default wouldn't grant it.
          const tierDefaultHas = def.tier === 'basic' || tier === 'premium';
          if (!tierDefaultHas) viaOverrideCount += 1;
        }
      });
      return {
        key: def.key,
        label: def.label,
        description: def.description,
        tier: def.tier,
        backendEnforced: def.backendEnforced,
        schoolCount,
        viaOverrideCount,
        adoptionPercent: schools.length > 0 ? Math.round((schoolCount / schools.length) * 100) : 0,
      };
    });

    return {
      message: 'Apps & modules overview fetched',
      data: { totalSchools: schools.length, features: adoption },
    };
  }

  // ── Sales Ops Phase 3: Campaigns & attribution ────────────────────────

  async createCampaign(body: any, actor: { userId: string; email: string }) {
    if (!body.name?.trim()) throw new BadRequestException('Campaign name is required');
    if (!body.utmCampaign?.trim()) throw new BadRequestException('A utm_campaign key is required — it\'s what ties leads back to this campaign');

    const existing = await this.campaignModel.findOne({ utmCampaign: body.utmCampaign.trim() });
    if (existing) throw new BadRequestException('A campaign with this utm_campaign key already exists');

    const campaign = await this.campaignModel.create({
      name: body.name.trim(),
      channel: body.channel,
      utmSource: body.utmSource,
      utmMedium: body.utmMedium,
      utmCampaign: body.utmCampaign.trim(),
      spend: Number(body.spend) || 0,
      currency: body.currency || 'PKR',
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      status: body.status || 'active',
      createdBy: new Types.ObjectId(actor.userId),
    });

    this.auditLogService.record('campaign_created', actor.userId, actor.email, 'superadmin', {
      campaignId: campaign._id.toString(),
      name: campaign.name,
    });

    return { message: 'Campaign created', data: campaign };
  }

  async updateCampaign(id: string, body: any) {
    const campaign = await this.campaignModel.findById(id);
    if (!campaign) throw new BadRequestException('Campaign not found');

    if (body.name !== undefined) campaign.name = body.name.trim();
    if (body.channel !== undefined) campaign.channel = body.channel;
    if (body.spend !== undefined) campaign.spend = Number(body.spend) || 0;
    if (body.currency !== undefined) campaign.currency = body.currency;
    if (body.startDate !== undefined) campaign.startDate = body.startDate ? new Date(body.startDate) : undefined;
    if (body.endDate !== undefined) campaign.endDate = body.endDate ? new Date(body.endDate) : undefined;
    if (body.status !== undefined) campaign.status = body.status;
    // utmSource/utmMedium/utmCampaign are intentionally not editable here —
    // changing them after launch would silently orphan every lead already
    // attributed under the old key.

    await campaign.save();
    return { message: 'Campaign updated', data: campaign };
  }

  async deleteCampaign(id: string) {
    const result = await this.campaignModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) throw new BadRequestException('Campaign not found');
    // Leads already attributed keep their campaignId — deleting the campaign
    // only stops new leads from matching it; it's not a data-loss operation.
    return { message: 'Campaign deleted' };
  }

  /**
   * Every campaign with its funnel against real leads: signups (total
   * attributed), trials (reached a real account — schoolId set), won
   * (paying), and cost per paying customer (spend / won). Revenue in real
   * currency is deliberately left out of this v1 — that would mean this
   * module reaching into BillingService for live Stripe/plan pricing per
   * school, which risks a circular module dependency (BillingModule
   * already imports SchoolModule for the reverse hookup — see
   * markLeadWonIfLinked) for a number that's only trustworthy once there's
   * enough real campaign data to validate it against.
   */
  async getAllCampaigns() {
    const campaigns = await this.campaignModel.find().sort({ createdAt: -1 }).lean();

    const withMetrics = await Promise.all(
      (campaigns as any[]).map(async (c) => {
        const [signups, trials, won] = await Promise.all([
          this.leadModel.countDocuments({ campaignId: c._id }),
          this.leadModel.countDocuments({ campaignId: c._id, schoolId: { $exists: true } }),
          this.leadModel.countDocuments({ campaignId: c._id, status: 'won' }),
        ]);
        return {
          ...c,
          metrics: {
            signups,
            trials,
            won,
            costPerWon: won > 0 ? Math.round((c.spend / won) * 100) / 100 : null,
          },
        };
      }),
    );

    return { message: 'Campaigns fetched', data: withMetrics };
  }

  /** Resolves a utm_campaign value to the campaign it belongs to, if any — used by lead capture to set campaignId. */
  private async resolveCampaignId(utmCampaign?: string): Promise<Types.ObjectId | undefined> {
    if (!utmCampaign?.trim()) return undefined;
    const campaign = await this.campaignModel.findOne({ utmCampaign: utmCampaign.trim() }, { _id: 1 });
    return campaign?._id as any;
  }

  // ── Sales Ops Phase 3: team — assignment & leaderboard ────────────────

  async assignLead(id: string, employeeId: string | null, actor: { userId: string; email: string }) {
    const lead = await this.leadModel.findById(id);
    if (!lead) throw new BadRequestException('Lead not found');

    if (employeeId) {
      const employee = await this.databaseService.repositories.employeeModel.findById(employeeId);
      if (!employee) throw new BadRequestException('Employee not found');
      if (!employee.permissions.includes('manage_leads' as any)) {
        throw new BadRequestException('That employee does not have the Sales (manage_leads) permission');
      }
      lead.assignedTo = employee._id as any;
      lead.activity.push({
        type: 'note', summary: `Assigned to ${employee.name}`, authorEmail: actor.email, occurredAt: new Date(),
      } as any);
    } else {
      lead.assignedTo = undefined;
      lead.activity.push({
        type: 'note', summary: 'Unassigned', authorEmail: actor.email, occurredAt: new Date(),
      } as any);
    }
    await lead.save();
    return { message: 'Lead assignment updated', data: lead };
  }

  async getLeaderboard() {
    const salesReps = await this.databaseService.repositories.employeeModel.find(
      { permissions: 'manage_leads', status: 'active' },
      { name: 1, email: 1, monthlyTarget: 1 },
    ).lean();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const rows = await Promise.all(
      (salesReps as any[]).map(async (rep) => {
        const [wonThisMonth, totalAssigned, totalWon] = await Promise.all([
          this.leadModel.countDocuments({ assignedTo: rep._id, status: 'won', wonAt: { $gte: startOfMonth } }),
          this.leadModel.countDocuments({ assignedTo: rep._id, status: { $nin: ['won', 'lost'] } }),
          this.leadModel.countDocuments({ assignedTo: rep._id, status: 'won' }),
        ]);
        return {
          employeeId: rep._id,
          name: rep.name,
          email: rep.email,
          target: rep.monthlyTarget || 0,
          wonThisMonth,
          totalAssigned,
          totalWon,
          progressPercent: rep.monthlyTarget > 0 ? Math.round((wonThisMonth / rep.monthlyTarget) * 100) : null,
        };
      }),
    );

    rows.sort((a, b) => b.wonThisMonth - a.wonThisMonth);
    return { message: 'Leaderboard fetched', data: rows };
  }
}
