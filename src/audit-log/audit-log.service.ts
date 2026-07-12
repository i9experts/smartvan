/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from 'src/database/databaseservice';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private databaseService: DatabaseService) {}

  // Fire-and-forget by design — logging should never block or fail the calling action
  async record(action: string, actorId: string, actorEmail: string, actorRole: string, metadata?: Record<string, any>) {
    try {
      await this.databaseService.repositories.auditLogModel.create({
        action,
        actorId,
        actorEmail,
        actorRole,
        metadata: metadata || {},
      });
    } catch (err) {
      this.logger.error(`Failed to record audit log for action "${action}"`, err);
    }
  }

  async getRecent(limit = 100) {
    const logs = await this.databaseService.repositories.auditLogModel.find({}).sort({ createdAt: -1 }).limit(limit);
    return { message: 'Audit logs fetched successfully', data: logs };
  }
}
