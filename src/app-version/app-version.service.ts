/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Types } from 'mongoose';
import { DatabaseService } from '../database/databaseservice';
import { UpdateAppVersionDto } from './dto/app-version.dto';
import { compareSemver } from './semver.util';

// Migration "2026-11-03-seed-app-versions": idempotent ($setOnInsert), so it never
// overwrites values an admin has changed. Runs on startup; this project has no
// migration runner (MongoDB/Mongoose).
const SEED_ROWS = [
  {
    app: 'parent', platform: 'android',
    // TODO: set to the version currently LIVE on Google Play (pubspec.yaml currently says 1.0.8).
    latestVersion: '1.0.8', minVersion: '0.0.0',
    storeUrl: 'https://play.google.com/store/apps/details?id=com.smartvan',
    updateMessage: null,
  },
  {
    app: 'parent', platform: 'ios',
    latestVersion: '1.0.8', minVersion: '0.0.0',
    storeUrl: 'https://apps.apple.com/app/id6817291757',
    updateMessage: null,
  },
  {
    app: 'driver', platform: 'android',
    // TODO: set to the version currently LIVE on Google Play (driver pubspec.yaml currently says 1.0.1).
    latestVersion: '1.0.1', minVersion: '0.0.0',
    storeUrl: 'https://play.google.com/store/apps/details?id=com.smartvan.driver',
    updateMessage: null,
  },
  // TODO: driver / ios row not seeded — no App Store ID known. Add it once the driver iOS app is live.
];

@Injectable()
export class AppVersionService implements OnModuleInit {
  private readonly logger = new Logger(AppVersionService.name);
  constructor(private readonly db: DatabaseService) {}

  private get model() {
    return this.db.repositories.appVersionModel;
  }

  async onModuleInit() {
    try {
      await this.model.init(); // make sure the unique (app, platform) index exists
      for (const row of SEED_ROWS) {
        await this.model.updateOne(
          { app: row.app, platform: row.platform },
          { $setOnInsert: row },
          { upsert: true },
        );
      }
    } catch (e: any) {
      this.logger.error(`app_versions seed failed: ${e?.message}`);
    }
  }

  async getPublic(app: string, platform: string) {
    const row = await this.model.findOne({ app, platform }).lean();
    if (!row) throw new NotFoundException('No version info for this app/platform');
    return {
      latestVersion: row.latestVersion,
      minVersion: row.minVersion,
      storeUrl: row.storeUrl,
      message: row.updateMessage ?? null,
    };
  }

  findAll() {
    return this.model.find().sort({ app: 1, platform: 1 }).lean();
  }

  async update(id: string, dto: UpdateAppVersionDto) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid id');
    const row = await this.model.findById(id);
    if (!row) throw new NotFoundException('App version not found');

    const latest = dto.latestVersion ?? row.latestVersion;
    const min = dto.minVersion ?? row.minVersion;
    if (compareSemver(min, latest) > 0) {
      throw new BadRequestException('minVersion must be less than or equal to latestVersion');
    }

    if (dto.latestVersion !== undefined) row.latestVersion = dto.latestVersion;
    if (dto.minVersion !== undefined) row.minVersion = dto.minVersion;
    if (dto.storeUrl !== undefined) row.storeUrl = dto.storeUrl;
    if (dto.updateMessage !== undefined) row.updateMessage = dto.updateMessage;
    return row.save();
  }
}
