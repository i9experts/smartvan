/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/databaseservice';

export interface InstitutionHealth {
  schoolId: string;
  schoolName: string;
  score: number;
  riskTier: 'healthy' | 'at_risk' | 'critical';
  isNew: boolean;
  signals: {
    engagementPercent: number;
    activeUsers: number;
    totalUsers: number;
    openTickets: number;
    avgResolutionHours: number | null;
    billingStatus: string;
    premiumStatus: string;
    autoRenew: boolean;
  };
}

export interface InstitutionHealthOverview {
  summary: { healthy: number; atRisk: number; critical: number; avgScore: number };
  institutions: InstitutionHealth[];
}

// "Open" = still needs admin action — mirrors STATUS_CONFIG on the admin
// frontend's Complaints page (pending/reviewed/resolved/rejected).
const OPEN_TICKET_STATUSES = new Set(['pending', 'reviewed']);
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

@Injectable()
export class InstitutionHealthService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getOverview(): Promise<InstitutionHealthOverview> {
    const now = Date.now();
    const schools = await this.databaseService.repositories.SchoolModel.find(
      {},
      { schoolName: 1, status: 1, subscriptionStatus: 1, premiumSubscriptionStatus: 1, autoRenew: 1, createdAt: 1 },
    ).lean();
    const schoolIds = schools.map((s: any) => s._id.toString());

    const [parents, drivers, reports] = await Promise.all([
      this.databaseService.repositories.parentModel
        .find({ schoolId: { $in: schoolIds } }, { schoolId: 1, lastLoginAt: 1 })
        .lean(),
      this.databaseService.repositories.driverModel
        .find({ schoolId: { $in: schoolIds } }, { schoolId: 1, lastLoginAt: 1 })
        .lean(),
      this.databaseService.repositories.reportModel
        .find(
          { schoolId: { $in: schoolIds }, createdAt: { $gte: new Date(now - NINETY_DAYS_MS) } },
          { schoolId: 1, status: 1, createdAt: 1, resolvedAt: 1 },
        )
        .lean(),
    ]);

    const usersBySchool: Record<string, { total: number; activeRecently: number }> = {};
    const addUser = (schoolId: string, lastLoginAt: any) => {
      if (!schoolId) return;
      const bucket = (usersBySchool[schoolId] ||= { total: 0, activeRecently: 0 });
      bucket.total += 1;
      if (lastLoginAt && now - new Date(lastLoginAt).getTime() <= THIRTY_DAYS_MS) bucket.activeRecently += 1;
    };
    (parents as any[]).forEach((p: any) => addUser(p.schoolId, p.lastLoginAt));
    (drivers as any[]).forEach((d: any) => addUser(d.schoolId, d.lastLoginAt));

    const reportsBySchool: Record<string, any[]> = {};
    (reports as any[]).forEach((r: any) => {
      if (!r.schoolId) return;
      (reportsBySchool[r.schoolId] ||= []).push(r);
    });

    const institutions: InstitutionHealth[] = schools.map((s: any) => {
      const sid = s._id.toString();
      const userStats = usersBySchool[sid] || { total: 0, activeRecently: 0 };
      const engagementPercent =
        userStats.total > 0 ? Math.round((userStats.activeRecently / userStats.total) * 100) : 0;

      const schoolReports = reportsBySchool[sid] || [];
      const openTickets = schoolReports.filter((r) => OPEN_TICKET_STATUSES.has(r.status || 'pending')).length;
      const resolved = schoolReports.filter((r) => r.resolvedAt);
      const avgResolutionHours =
        resolved.length > 0
          ? Math.round(
              resolved.reduce(
                (sum, r) => sum + (new Date(r.resolvedAt).getTime() - new Date(r.createdAt).getTime()),
                0,
              ) /
                resolved.length /
                (60 * 60 * 1000),
            )
          : null;

      const billingStatus = s.subscriptionStatus || 'no_subscription';
      const premiumStatus = s.premiumSubscriptionStatus || 'inactive';
      const billingFailed = billingStatus === 'payment_failed' || premiumStatus === 'payment_failed';

      // Engagement: 0-40, scaled from the % of parents/drivers who logged
      // in within the last 30 days — the strongest day-to-day "are they
      // actually using this" signal available in the data model.
      const engagementPoints = Math.round((engagementPercent / 100) * 40);

      // Support load: 0-30, starts full and loses points for open-ticket
      // volume and slow resolution — a school generating a steady stream
      // of unresolved complaints is at real risk regardless of how
      // engaged its users otherwise look.
      let supportPoints = 30 - Math.min(openTickets * 4, 20);
      if (avgResolutionHours !== null && avgResolutionHours > 72) supportPoints -= 10;
      supportPoints = Math.max(0, supportPoints);

      // Billing: 0-30 — a failed payment on either subscription zeroes
      // this out immediately regardless of the other signals, since it's
      // the most direct churn predictor available.
      let billingPoints: number;
      if (billingFailed) billingPoints = 0;
      else if (billingStatus === 'active') billingPoints = s.autoRenew === false ? 25 : 30;
      else if (premiumStatus === 'active') billingPoints = 25;
      else if (billingStatus === 'no_subscription') billingPoints = 15;
      else billingPoints = 5;

      const score = Math.max(0, Math.min(100, engagementPoints + supportPoints + billingPoints));
      const riskTier: InstitutionHealth['riskTier'] = score >= 70 ? 'healthy' : score >= 40 ? 'at_risk' : 'critical';
      const isNew = now - new Date(s.createdAt).getTime() <= THIRTY_DAYS_MS;

      return {
        schoolId: sid,
        schoolName: s.schoolName || 'Unnamed',
        score,
        riskTier,
        isNew,
        signals: {
          engagementPercent,
          activeUsers: userStats.activeRecently,
          totalUsers: userStats.total,
          openTickets,
          avgResolutionHours,
          billingStatus,
          premiumStatus,
          autoRenew: !!s.autoRenew,
        },
      };
    });

    institutions.sort((a, b) => a.score - b.score);

    const healthy = institutions.filter((i) => i.riskTier === 'healthy').length;
    const atRisk = institutions.filter((i) => i.riskTier === 'at_risk').length;
    const critical = institutions.filter((i) => i.riskTier === 'critical').length;
    const avgScore = institutions.length
      ? Math.round(institutions.reduce((sum, i) => sum + i.score, 0) / institutions.length)
      : 0;

    return {
      summary: { healthy, atRisk, critical, avgScore },
      institutions,
    };
  }
}
