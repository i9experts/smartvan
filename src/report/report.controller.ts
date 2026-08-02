/* eslint-disable prettier/prettier */

import { Controller, Post, Body, Req, Get, Query, Param, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';
import { ReportService } from './report.service';
import { DatabaseService } from 'src/database/databaseservice';


@Controller('report')
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly databaseService: DatabaseService,
  ) {}

  // school_staff callers don't have an admin account of their own —
  // resolve their school's actual admin so existing admin-scoped service
  // logic (getReportsForAdmin, etc.) works completely unchanged for them
  // too, exactly like the same pattern used in VanController.
  private async resolveCallerForReports(user: any): Promise<{ id: string; role: string }> {
    if (user.role === 'admin' || user.role === 'superadmin') {
      return { id: user.userId, role: user.role };
    }
    if (user.role === 'school_staff') {
      const school = await this.databaseService.repositories.SchoolModel.findById(user.schoolId);
      if (!school) throw new UnauthorizedException('School not found for this staff account');
      return { id: school.admin.toString(), role: 'admin' };
    }
    throw new UnauthorizedException('Invalid user type');
  }

  @UseGuards(AuthGuard('jwt')) // Token guard
  @Post("addReport")
  async createReport(@Body() body: any, @Req() req: any) {
    const parentId = req.user.userId; // token se parent ID
    return this.reportService.createReport(body, parentId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post("addReportByAdmin")
  async createReportByAdmin(@Body() body: any, @Req() req: any) {
    const adminId = req.user.userId;
    return this.reportService.createReportByAdmin(body, adminId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get("getMyTicketsByAdmin")
  async getMyTicketsByAdmin(@Req() req: any) {
    const adminId = req.user.userId;
    return this.reportService.getMyTicketsByAdmin(adminId);
  }

  @UseGuards(AuthGuard('jwt'))
@Get("getParentReports")
async getParentReports(
  @Req() req: any,
  @Query('page') page: number = 1,
  @Query('limit') limit: number = 10,
  @Query('status') status?: string, // optional filter
) {
  const parentId = req.user.userId; // token se parent ID

  return this.reportService.getParentReports(
    parentId,
    Number(page),
    Number(limit),
    status,
  );
}

@UseGuards(AuthGuard('jwt'))
  @Get('getReportByIdByParent/:id')
  async getReportById(@Param('id') id: string, @Req() req: any) {
    const parentId = req.user.userId; // token se parentId

    return this.reportService.getReportByIdByParent(id, parentId);
  }

@UseGuards(AuthGuard('jwt'))
@Get("getDriverReports")
async getDriverReports(
  @Req() req: any,
  @Query('page') page: number = 1,
  @Query('limit') limit: number = 10,
  @Query('status') status?: string, // optional filter
) {
  const driverId = req.user.userId; // token se driver ID

  return this.reportService.getDriverReports(
    driverId,
    Number(page),
    Number(limit),
    status,
  );
}

@UseGuards(AuthGuard('jwt'))
@Get("getReportByIdByDriver/:id")
async getReportByIdByDriver
  (@Param('id') id: string, @Req() req: any)
 {
  const driverId = req.user.userId;

  return this.reportService.getReportByIdByDriver(
    id,
    driverId,
  );
}

    @UseGuards(AuthGuard('jwt')) // Token guard
  @Post("addReportByDriver")
  async createReportByDriver(@Body() body: any, @Req() req: any) {
    const driverId = req.user.userId; // token se parent ID
    return this.reportService.createDriverReport(body, driverId);
  }

   @UseGuards(AuthGuard('jwt')) // Token guard
  @Get("getComplainsByAdmin")
  async getComplainsByAdmin( 
    @Req() req: any,
    @Query() query: any,
    @Query('page') page: string,
  @Query('limit') limit: string,
) {
    const caller = await this.resolveCallerForReports(req.user);
     const pageNumber = page ? parseInt(page) : 1;
    const limitNumber = limit ? parseInt(limit) : 10;
    return this.reportService.getReportsForAdmin( caller.id, caller.role, query);
  }

  
  @UseGuards(AuthGuard('jwt'))
  @Post('changeComplaintStatus')
async changeComplaintStatus(
  @Req() req: any,
  
  @Body() body: { reportId: string; status: string, adminRemarks?: string },
) {
  const adminId = req.user.userId;
  const { reportId, status, adminRemarks } = body;

  


  return this.reportService.changeComplaintStatus(adminId, reportId, status, adminRemarks);
  
}

@UseGuards(AuthGuard('jwt'))
@Get('getComplaintById/:reportId')
async getComplaintById(
  @Req() req: any,
  @Param('reportId') reportId: string,
) {
  const adminId = req.user.userId; // JWT se adminId

  return this.reportService.getComplaintById(adminId, reportId);
}


@Get('issue-types')
  getIssueTypes() {
    return {
      data: [
        'Van Arrived Late',
        'Child not picked/dropped',
        'Route Issue',
        'Driver Behavior',
        'Tracking Not Working',
        'Other',
      ],
    };
  }

  @Get('issue-types-Driver')
  getIssueTypesforDriver() {
    return {
      data: [
        'Vehicle Issue',
        'Running Late',
        'Passenger No-Show',
        'Emergency',
        'Tracking Not Working',
        'Other',
      ],
    };
  }
    @Post('addfaq')
  async addFaq(@Body() body: any) {
    return this.reportService.addFaq(body);
  }

  @Get("getFaq")
  async getFaq() {
    return this.reportService.getFaq();
  }
}