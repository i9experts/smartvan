/* eslint-disable prettier/prettier */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorator/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();

    // Superadmin always passes — full access regardless of permissions array
    if (user?.role === 'superadmin') {
      return true;
    }

    const userPermissions: string[] = user?.permissions || [];
    const hasAll = requiredPermissions.every((p) => userPermissions.includes(p));
    if (!user || !hasAll) {
      throw new ForbiddenException('Access Denied: Insufficient permissions');
    }
    return true;
  }
}
