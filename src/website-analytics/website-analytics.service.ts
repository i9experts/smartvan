/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

export interface WebsiteAnalyticsOverview {
  configured: boolean;
  setupMessage?: string;
  error?: string;
  rangeDays?: number;
  summary?: {
    totalUsers: number;
    sessions: number;
    pageViews: number;
    avgSessionDurationSeconds: number;
    bounceRatePercent: number;
  };
  trend?: { date: string; users: number; sessions: number; pageViews: number }[];
  topPages?: { path: string; views: number }[];
  trafficSources?: { channel: string; sessions: number }[];
  deviceBreakdown?: { device: string; users: number }[];
  countryBreakdown?: { country: string; users: number }[];
  realtimeActiveUsers?: number;
}

@Injectable()
export class WebsiteAnalyticsService {
  private client: BetaAnalyticsDataClient | null = null;
  private propertyId: string | null = null;
  private initError: string | null = null;

  constructor() {
    this.propertyId = process.env.GA4_PROPERTY_ID || null;
    const credentials = this.loadCredentials();
    if (this.propertyId && credentials) {
      try {
        this.client = new BetaAnalyticsDataClient({ credentials });
      } catch (err: any) {
        // Don't crash app startup over a malformed credential — surface the
        // problem to the admin panel instead, the same way isConfigured()
        // surfaces "not set up yet".
        this.initError = `Could not initialize the Google Analytics client: ${err?.message || err}`;
      }
    }
  }

  /**
   * Preferred (Railway / any PaaS): GA4_SERVICE_ACCOUNT_BASE64 env var
   * containing the base64-encoded service account JSON — same pattern as
   * FIREBASE_SERVICE_ACCOUNT_BASE64 (see FirebaseAdminService), so there's
   * nothing new to learn about how credentials are managed on this project.
   */
  private loadCredentials(): { client_email: string; private_key: string } | null {
    const base64 = process.env.GA4_SERVICE_ACCOUNT_BASE64;
    if (!base64) return null;
    try {
      const json = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
      if (!json.client_email || !json.private_key) return null;
      return { client_email: json.client_email, private_key: json.private_key };
    } catch {
      return null;
    }
  }

  private isConfigured(): boolean {
    return !!this.client && !!this.propertyId;
  }

  private notConfiguredResponse(): WebsiteAnalyticsOverview {
    return {
      configured: false,
      setupMessage:
        this.initError ||
        'Google Analytics is not set up yet — set GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_BASE64 on the backend to enable this page.',
    };
  }

  async getOverview(days = 28): Promise<WebsiteAnalyticsOverview> {
    if (!this.isConfigured()) return this.notConfiguredResponse();

    const client = this.client!;
    const property = `properties/${this.propertyId}`;
    const dateRange = [{ startDate: `${days}daysAgo`, endDate: 'today' }];

    try {
      const [summaryReport, trendReport, topPagesReport, sourcesReport, deviceReport, countryReport, realtime] =
        await Promise.all([
          client.runReport({
            property,
            dateRanges: dateRange,
            metrics: [
              { name: 'totalUsers' },
              { name: 'sessions' },
              { name: 'screenPageViews' },
              { name: 'averageSessionDuration' },
              { name: 'bounceRate' },
            ],
          }),
          client.runReport({
            property,
            dateRanges: dateRange,
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'totalUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
            orderBys: [{ dimension: { dimensionName: 'date' } }],
          }),
          client.runReport({
            property,
            dateRanges: dateRange,
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }],
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
            limit: 10,
          }),
          client.runReport({
            property,
            dateRanges: dateRange,
            dimensions: [{ name: 'sessionDefaultChannelGroup' }],
            metrics: [{ name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          }),
          client.runReport({
            property,
            dateRanges: dateRange,
            dimensions: [{ name: 'deviceCategory' }],
            metrics: [{ name: 'totalUsers' }],
            orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
          }),
          client.runReport({
            property,
            dateRanges: dateRange,
            dimensions: [{ name: 'country' }],
            metrics: [{ name: 'totalUsers' }],
            orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
            limit: 10,
          }),
          client.runRealtimeReport({
            property,
            metrics: [{ name: 'activeUsers' }],
          }),
        ]);

      const summaryRow = summaryReport[0].rows?.[0];
      const summary = {
        totalUsers: Number(summaryRow?.metricValues?.[0]?.value || 0),
        sessions: Number(summaryRow?.metricValues?.[1]?.value || 0),
        pageViews: Number(summaryRow?.metricValues?.[2]?.value || 0),
        avgSessionDurationSeconds: Math.round(Number(summaryRow?.metricValues?.[3]?.value || 0)),
        bounceRatePercent: Math.round(Number(summaryRow?.metricValues?.[4]?.value || 0) * 10) / 10,
      };

      const trend = (trendReport[0].rows || []).map((row) => {
        const raw = row.dimensionValues?.[0]?.value || '';
        const date = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
        return {
          date,
          users: Number(row.metricValues?.[0]?.value || 0),
          sessions: Number(row.metricValues?.[1]?.value || 0),
          pageViews: Number(row.metricValues?.[2]?.value || 0),
        };
      });

      const topPages = (topPagesReport[0].rows || []).map((row) => ({
        path: row.dimensionValues?.[0]?.value || '',
        views: Number(row.metricValues?.[0]?.value || 0),
      }));

      const trafficSources = (sourcesReport[0].rows || []).map((row) => ({
        channel: row.dimensionValues?.[0]?.value || 'Unknown',
        sessions: Number(row.metricValues?.[0]?.value || 0),
      }));

      const deviceBreakdown = (deviceReport[0].rows || []).map((row) => ({
        device: row.dimensionValues?.[0]?.value || 'Unknown',
        users: Number(row.metricValues?.[0]?.value || 0),
      }));

      const countryBreakdown = (countryReport[0].rows || []).map((row) => ({
        country: row.dimensionValues?.[0]?.value || 'Unknown',
        users: Number(row.metricValues?.[0]?.value || 0),
      }));

      const realtimeActiveUsers = Number(realtime[0].rows?.[0]?.metricValues?.[0]?.value || 0);

      return {
        configured: true,
        rangeDays: days,
        summary,
        trend,
        topPages,
        trafficSources,
        deviceBreakdown,
        countryBreakdown,
        realtimeActiveUsers,
      };
    } catch (err: any) {
      // Credentials/property ID are set but the call itself failed — most
      // commonly the service account hasn't been granted Viewer access to
      // the property yet, or the property genuinely has no data. Surface
      // the real reason rather than a generic 500, so it's fixable without
      // digging through server logs.
      return { configured: true, error: err?.message || 'Failed to fetch Google Analytics data' };
    }
  }
}
