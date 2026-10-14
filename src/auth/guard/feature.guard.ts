/* eslint-disable prettier/prettier */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { FEATURE_KEY } from '../decorator/require-feature.decorator';
import { DatabaseService } from 'src/database/databaseservice';
import { hasFeature, FEATURE_KEYS } from 'src/school/feature-keys';

/**
 * Gates a route behind a school's Basic/Premium feature set. Always does a
 * live DB lookup (never trusts a JWT claim for this) so a tier change made
 * by a superadmin takes effect immediately, without the school admin
 * needing to log out and back in.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly databaseService: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredFeature) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new UnauthorizedException('Not authenticated');

    // Superadmin manages feature tiers — never gated by one.
    if (user.role === 'superadmin') return true;

    const school = await this.resolveSchool(user);
    if (!school) throw new ForbiddenException('School not found for this account');

    if (!hasFeature(school, requiredFeature)) {
      const def = FEATURE_KEYS.find((f) => f.key === requiredFeature);
      throw new ForbiddenException({
        code: 'FEATURE_LOCKED',
        feature: requiredFeature,
        featureLabel: def?.label || requiredFeature,
        message: `"${def?.label || requiredFeature}" is a Premium feature. Ask your SmartVan admin to upgrade to unlock it.`,
      });
    }
    return true;
  }

  private async resolveSchool(user: any) {
    const { SchoolModel, VanModel } = this.databaseService.repositories;

    if (user.role === 'admin') {
      return SchoolModel.findOne({ admin: new Types.ObjectId(user.userId) }).lean();
    }
    if (user.role === 'school_staff') {
      return SchoolModel.findById(user.schoolId).lean();
    }
    if (user.role === 'driver') {
      const van: any = await VanModel.findOne({ driverId: new Types.ObjectId(user.userId) }).lean();
      if (!van?.schoolId) return null;
      return SchoolModel.findById(van.schoolId).lean();
    }
    throw new ForbiddenException('Insufficient role for this action');
  }
}
