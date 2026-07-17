/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { DatabaseService } from 'src/database/databaseservice';

@Injectable()
export class FirebaseAdminService {
  private readonly messaging: admin.messaging.Messaging;

  constructor(private readonly databaseservice: DatabaseService) {
    // Firebase initialize
    if (!admin.apps.length) {
      const serviceAccount = FirebaseAdminService.loadServiceAccount();
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      });
    }
    this.messaging = admin.messaging();
  }

  /**
   * Loads the Firebase service account credentials.
   *
   * Preferred (Railway / any PaaS): FIREBASE_SERVICE_ACCOUNT_BASE64 env var
   * containing the base64-encoded service account JSON. This avoids needing
   * a checked-in/uploaded cert file, since src/certs/ is gitignored and won't
   * exist in a git-based deploy.
   *
   * Fallback (VPS / local dev): reads the JSON file directly from
   * src/certs/firebase-admin.sdk.json if the env var isn't set, so existing
   * VPS deployments keep working without changes until migrated.
   */
  private static loadServiceAccount(): Record<string, unknown> {
    const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (base64) {
      const json = Buffer.from(base64, 'base64').toString('utf-8');
      return JSON.parse(json);
    }

    // Lazy require so this path is only touched when the env var is absent,
    // and so a missing file doesn't break the TypeScript build on platforms
    // (like Railway) where src/certs/ isn't present at all.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { serviceAccount } = require('../certs/firebase-admin.sdk');
      return serviceAccount;
    } catch (err) {
      throw new Error(
        'Firebase service account not found. Set FIREBASE_SERVICE_ACCOUNT_BASE64 ' +
          '(base64-encoded service account JSON) as an environment variable.',
      );
    }
  }


async sendToDevice(
  deviceToken: string,
  payload: {
    notification?: { title: string; body: string };
    data?: { [key: string]: string };
  }
) {
  const message: admin.messaging.Message = {
    token: deviceToken,
    notification: payload.notification,
    data: payload.data,
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default' } } },
  };

  try {
    const result = await this.messaging.send(message);
    return { success: true, result };
  } catch (error) {
    console.error('Firebase Error:', error);
    return { success: false, error };
  }
}


async getAlerts(parentId: string) {
  const notifications = await this.databaseservice.repositories.notificationModel.find({
    parentId: parentId, 
  }).sort({ createdAt: -1 });

  return {
    message: 'Notifications fetched successfully',
    data: notifications,
  };
}
}