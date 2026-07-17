/* eslint-disable prettier/prettier */
import { Controller, Get, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuditLogService } from './audit-log.service';

@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('recent')
  async getRecent(@Req() req: any) {
    if (req.user.role !== 'superadmin') {
      throw new UnauthorizedException('Only superadmins can access this API');
    }
    return this.auditLogService.getRecent();
  }
}
