/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/databaseservice';
import { BillingService } from 'src/billing/billing.service';

export interface RevenueInstitution {
  schoolId: string;
  schoolName: string;
  currency: string;
  tier: string;
  monthlyRevenue: number;
  vanBilling: number;
  premium: number;
  atRisk: boolean;
}

export interface RevenueAnalyticsOverview {
  totals: { mrrByCurrency: Record<string, number>; arrByCurrency: Record<string, number> };
  byTier: { basic: number; premium: number };
  premiumActiveCount: number;
  vanBillingMrrByCurrency: Record<string, number>;
  premiumMrrByCurrency: Record<string, number>;
  atRiskMrrByCurrency: Record<string, number>;
  topInstitutions: RevenueInstitution[];
  trend: { date: string; mrrByCurrency: Record<string, number> }[];
}

@Injectable()
export class RevenueAnalyticsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly billingService: BillingService,
  ) {}

  // Asia/Karachi has no DST (fixed UTC+5), so a constant offset is enough
  // to key each snapshot by the admin's own calendar day.
  private todayKarachi(): string {
    const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
    return now.toISOString().slice(0, 10);
  }

  async getOverview(): Promise<RevenueAnalyticsOverview> {
    const schools = await this.databaseService.repositories.SchoolModel.find(
      {},
      { schoolName: 1, featureTier: 1, premiumSubscriptionStatus: 1, subscriptionStatus: 1, currency: 1 },
    ).lean();

    const schoolIds = schools.map((s: any) => s._id.toString());
    const activeVans = await this.databaseService.repositories.VanModel.find(
      { schoolId: { $in: schoolIds }, status: 'active' },
      { schoolId: 1, vehicleType: 1, vehicleCategory: 1 },
    ).lean();
    const vansBySchoolId: Record<string, any[]> = {};
    activeVans.forEach((v: any) => {
      (vansBySchoolId[v.schoolId] ||= []).push(v);
    });

    const premiumPriceByCurrency: Record<string, number> = {
      PKR: Number(process.env.PREMIUM_PLAN_PRICE_PKR) || 0,
      USD: Number(process.env.PREMIUM_PLAN_PRICE_USD) || 0,
    };

    const vanBillingMrrByCurrency: Record<string, number> = {};
    const premiumMrrByCurrency: Record<string, number> = {};
    const atRiskMrrByCurrency: Record<string, number> = {};
    const byTier = { basic: 0, premium: 0 };
    let premiumActiveCount = 0;
    const institutions: RevenueInstitution[] = [];

    schools.forEach((s: any) => {
      const sid = s._id.toString();
      const currency = (s.currency || 'PKR').toUpperCase();
      const tier = s.featureTier === 'premium' ? 'premium' : 'basic';
      byTier[tier] += 1;

      const schoolVans = vansBySchoolId[sid] || [];
      const vanRevenue =
        s.subscriptionStatus === 'active' ? this.billingService.estimateMonthlyVanRevenue(schoolVans, currency) : 0;

      const premiumActive = s.premiumSubscriptionStatus === 'active';
      const premiumRevenue = premiumActive ? premiumPriceByCurrency[currency] || 0 : 0;
      if (premiumActive) premiumActiveCount += 1;

      if (vanRevenue > 0) vanBillingMrrByCurrency[currency] = (vanBillingMrrByCurrency[currency] || 0) + vanRevenue;
      if (premiumRevenue > 0) premiumMrrByCurrency[currency] = (premiumMrrByCurrency[currency] || 0) + premiumRevenue;

      // "At risk" = revenue counted above as active that's simultaneously
      // flagged payment_failed on one of the two subscriptions — money
      // that could vanish on the next failed dunning cycle, not a
      // separate pot.
      const atRisk = s.subscriptionStatus === 'payment_failed' || s.premiumSubscriptionStatus === 'payment_failed';
      const monthlyRevenue = vanRevenue + premiumRevenue;
      if (atRisk && monthlyRevenue > 0) {
        atRiskMrrByCurrency[currency] = (atRiskMrrByCurrency[currency] || 0) + monthlyRevenue;
      }

      if (monthlyRevenue > 0) {
        institutions.push({
          schoolId: sid,
          schoolName: s.schoolName || 'Unnamed',
          currency,
          tier,
          monthlyRevenue,
          vanBilling: vanRevenue,
          premium: premiumRevenue,
          atRisk,
        });
      }
    });

    const mrrByCurrency: Record<string, number> = {};
    new Set([...Object.keys(vanBillingMrrByCurrency), ...Object.keys(premiumMrrByCurrency)]).forEach((cur) => {
      mrrByCurrency[cur] = (vanBillingMrrByCurrency[cur] || 0) + (premiumMrrByCurrency[cur] || 0);
    });
    const arrByCurrency: Record<string, number> = {};
    Object.entries(mrrByCurrency).forEach(([cur, amt]) => {
      arrByCurrency[cur] = amt * 12;
    });

    institutions.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
    const topInstitutions = institutions.slice(0, 10);

    const date = this.todayKarachi();
    await this.databaseService.repositories.revenueSnapshotModel.updateOne(
      { date },
      {
        $set: {
          mrrByCurrency,
          vanBillingMrrByCurrency,
          premiumMrrByCurrency,
          atRiskMrrByCurrency,
          totalSchools: schools.length,
          premiumActiveCount,
        },
      },
      { upsert: true },
    );

    const trendDocs = await this.databaseService.repositories.revenueSnapshotModel
      .find({}, { date: 1, mrrByCurrency: 1, _id: 0 })
      .sort({ date: 1 })
      .limit(90)
      .lean();

    return {
      totals: { mrrByCurrency, arrByCurrency },
      byTier,
      premiumActiveCount,
      vanBillingMrrByCurrency,
      premiumMrrByCurrency,
      atRiskMrrByCurrency,
      topInstitutions,
      trend: trendDocs.map((d: any) => ({ date: d.date, mrrByCurrency: d.mrrByCurrency })),
    };
  }
}
