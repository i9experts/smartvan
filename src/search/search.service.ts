/* eslint-disable prettier/prettier */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DatabaseService } from 'src/database/databaseservice';

@Injectable()
export class SearchService {
  constructor(private databaseService: DatabaseService) {}

  async universalSearch(query: string, actorId: string, role: string) {
    if (!query || query.trim().length < 2) {
      return { message: 'Query too short', data: {} };
    }
    const regex = { $regex: query.trim(), $options: 'i' };
    const isSuperAdmin = role === 'superadmin';

    let schoolId: string | null = null;
    if (!isSuperAdmin) {
      const school = await this.databaseService.repositories.SchoolModel.findOne({ admin: new Types.ObjectId(actorId) });
      if (!school) throw new UnauthorizedException('School not found');
      schoolId = school._id.toString();
    }

    const scopeFilter = (extra: Record<string, any> = {}) => isSuperAdmin ? extra : { ...extra, schoolId };

    const [students, parents, drivers, vans, tickets, schools, employees] = await Promise.all([
      this.databaseService.repositories.KidModel.find(scopeFilter({ fullname: regex })).limit(5).select('fullname schoolId'),
      this.databaseService.repositories.parentModel.find(scopeFilter({ $or: [{ fullname: regex }, { email: regex }] })).limit(5).select('fullname email schoolId'),
      this.databaseService.repositories.driverModel.find(scopeFilter({ $or: [{ fullname: regex }, { email: regex }, { phoneNo: regex }] })).limit(5).select('fullname email phoneNo schoolId'),
      this.databaseService.repositories.VanModel.find(scopeFilter({ carNumber: regex })).limit(5).select('carNumber vehicleType schoolId'),
      this.databaseService.repositories.reportModel.find(scopeFilter({ $or: [{ issueType: regex }, { description: regex }] })).limit(5).select('issueType description status schoolId'),
      isSuperAdmin ? this.databaseService.repositories.SchoolModel.find({ schoolName: regex }).limit(5).select('schoolName status') : Promise.resolve([]),
      isSuperAdmin ? this.databaseService.repositories.employeeModel.find({ $or: [{ name: regex }, { email: regex }] }).limit(5).select('name email status') : Promise.resolve([]),
    ]);

    return {
      message: 'Search results fetched successfully',
      data: {
        students: students.map((s: any) => ({ id: s._id, label: s.fullname })),
        parents: parents.map((p: any) => ({ id: p._id, label: p.fullname, sub: p.email })),
        drivers: drivers.map((d: any) => ({ id: d._id, label: d.fullname, sub: d.email || d.phoneNo })),
        vans: vans.map((v: any) => ({ id: v._id, label: v.carNumber, sub: v.vehicleType })),
        tickets: tickets.map((t: any) => ({ id: t._id, label: t.issueType || 'Complaint', sub: t.description })),
        schools: schools.map((s: any) => ({ id: s._id, label: s.schoolName, sub: s.status })),
        employees: employees.map((e: any) => ({ id: e._id, label: e.name, sub: e.email })),
      },
    };
  }
}
