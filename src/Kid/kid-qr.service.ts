/* eslint-disable prettier/prettier */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DatabaseService } from 'src/database/databaseservice';
import { buildQrPayload, generateQrToken } from './kid-qr.util';

/**
 * QR cards for students. The token is stored on the kid (select:false, so
 * it never leaks through normal kid APIs) and printed by the school as
 * "smartvan:kid:<token>". Drivers scan it via POST /trips/scanStudent.
 */
@Injectable()
export class KidQrService {
  constructor(private readonly databaseService: DatabaseService) {}

  /** School the caller may manage, or null for superadmin (all schools). */
  private async resolveSchoolScope(user: any): Promise<string | null> {
    if (user?.role === 'superadmin') return null;
    if (user?.role === 'admin') {
      const school = await this.databaseService.repositories.SchoolModel.findOne({
        admin: new Types.ObjectId(user.userId),
      }).lean();
      if (school) return school._id.toString();
    }
    if (user?.role === 'school_staff' && user.schoolId) return user.schoolId.toString();
    throw new ForbiddenException('Only school admins can manage student QR cards');
  }

  private async loadKid(kidId: string, user: any) {
    if (!Types.ObjectId.isValid(kidId)) throw new NotFoundException('Student not found');
    const kid: any = await this.databaseService.repositories.KidModel.findById(kidId).select('+qrToken');
    if (!kid) throw new NotFoundException('Student not found');
    const scope = await this.resolveSchoolScope(user);
    if (scope && kid.schoolId?.toString() !== scope) {
      throw new ForbiddenException('Student belongs to a different school');
    }
    return kid;
  }

  private async assignNewToken(kid: any): Promise<string> {
    // Collisions are astronomically unlikely; retry anyway on duplicate key.
    for (let attempt = 0; attempt < 3; attempt++) {
      kid.qrToken = generateQrToken();
      try {
        await kid.save();
        return kid.qrToken;
      } catch (e: any) {
        if (e?.code !== 11000) throw e;
      }
    }
    throw new Error('Could not generate a unique QR token');
  }

  async getQr(kidId: string, user: any) {
    const kid = await this.loadKid(kidId, user);
    const token = kid.qrToken || (await this.assignNewToken(kid));
    return {
      success: true,
      data: { kidId: kid._id.toString(), fullname: kid.fullname, qrToken: token, qrPayload: buildQrPayload(token) },
    };
  }

  /** Invalidates the old card (lost/stolen) and issues a new token. */
  async regenerateQr(kidId: string, user: any) {
    const kid = await this.loadKid(kidId, user);
    const token = await this.assignNewToken(kid);
    return {
      success: true,
      message: 'New QR issued. The old card no longer works.',
      data: { kidId: kid._id.toString(), fullname: kid.fullname, qrToken: token, qrPayload: buildQrPayload(token) },
    };
  }

  /**
   * Everything the admin panel needs to print cards for a school (optionally
   * one van). Kids without a token get one now.
   */
  async getCards(user: any, opts: { vanId?: string; schoolId?: string }) {
    const scope = await this.resolveSchoolScope(user);
    const schoolId = scope ?? opts.schoolId;
    if (!schoolId) throw new ForbiddenException('schoolId is required for superadmin');

    const filter: any = { schoolId };
    if (opts.vanId) filter.VanId = opts.vanId;
    const kids: any[] = await this.databaseService.repositories.KidModel.find(filter)
      .select('+qrToken fullname grade image VanId status')
      .sort({ fullname: 1 });

    const cards = [];
    for (const kid of kids) {
      const token = kid.qrToken || (await this.assignNewToken(kid));
      cards.push({
        kidId: kid._id.toString(),
        fullname: kid.fullname,
        grade: kid.grade,
        image: kid.image,
        vanId: kid.VanId,
        status: kid.status,
        qrPayload: buildQrPayload(token),
      });
    }
    return { success: true, data: cards, total: cards.length };
  }
}
