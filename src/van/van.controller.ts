/* eslint-disable prettier/prettier */
import { Body, Controller, Post, Req,Get, Patch, Query, BadRequestException, Param,  } from '@nestjs/common';
import { VanService } from './van.service';
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';
import { CreateVanDto } from './dto/create-van.dto';
import { CreateVanByAdminDto } from './dto/createVanByAdmin.dto';
import { EditVanByAdminDto } from './dto/editVanByAdmin.dto';
import { EditDriverDto } from './dto/editDriver.dto';




@Controller('van')
export class VanController {
  constructor(private readonly vanService: VanService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('addVan')
  async addVan(
    @Body() createVanDto: CreateVanDto,
    @Req() req: any
  ) {
    const { userId, userType } = req.user; 
    return this.vanService.addVan(createVanDto, userId, userType);
  }

  @UseGuards(AuthGuard('jwt'))
@Get('getVans')
async getVans(@Req() req: any) {
  const { userId, userType } = req.user;
  return this.vanService.getVans(userId, userType);
}

@UseGuards(AuthGuard('jwt'))
@Get('getKidsByDriver')
async GetKidsByDriver(
  @Req() req: any,
  @Query('tripId') tripId: string,
  @Query('driverId') driverId: string,
  @Query('page') page: string,
  @Query('limit') limit: string,
) {
  const role = (req?.user?.role || '').toLowerCase();

  let userId: string;

  
  if (['admin', 'superadmin'].includes(role)) {
    if (!driverId) {
      throw new BadRequestException('driverId is required for admin');
    }
    userId = driverId; 
  } 
 
  else {
    userId = req.user.userId; 
  }

  const pageNumber = page ? parseInt(page) : 1;
  const limitNumber = limit ? parseInt(limit) : 10;

  return this.vanService.getDriverKids(
    userId,
    tripId,
    pageNumber,
    limitNumber,
  );
}


@UseGuards(AuthGuard('jwt'))
@Post('addVanByAdmin')
async addVanByAdmin(
  @Body() CreateVanByAdminDto : CreateVanByAdminDto , 
  @Req() req: any,
) {
  const AdminId = req.user.userId;
  return this.vanService.addVanByAdmin(CreateVanByAdminDto , AdminId);
}

@UseGuards(AuthGuard('jwt'))
@Post('editVanByAdmin')
async editVanByAdmin(

@Body() EditVanByAdminDto: EditVanByAdminDto,
  @Req() req: any,
) {
  const AdminId = req.user.userId;
console.log(AdminId)
  return this.vanService.editVanByAdmin(EditVanByAdminDto, AdminId);
}
  @UseGuards(AuthGuard('jwt'))
  @Get('GetVansByAdmin')
  async GetVansByAdmin(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('vanOwn') vanOwn?: string, // string aayega, hum convert karenge
  ) {
    const adminId = req.user?.userId;

    if (!adminId) {
      throw new BadRequestException('Admin not found in token');
    }

    // 🔹 Pagination
    const pageNumber = page ? parseInt(page) : 1;
    const limitNumber = limit ? parseInt(limit) : 10;

    // 🔹 vanOwn boolean conversion (optional)
    const vanOwnBool =
      vanOwn !== undefined ? vanOwn === 'true' : undefined;

    // 🔹 Service call
    return this.vanService.getVansByAdmin(
      adminId,
      pageNumber,
      limitNumber,
      search,
      vanOwnBool, // ✅ boolean pass ho raha
    );
  }

  @UseGuards(AuthGuard('jwt')) // JWT Auth Guard use
  @Get('GetAllDriversByAdmin')
  async getAllDrivers(
    @Req() req: any, // JWT decoded user info
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'inActive', // optional status filter
  ) {
    // JWT token se AdminId nikal lo
    const adminId = req.user.userId; // assuming AuthGuard ne req.user me user data daala

    if (!adminId) {
      throw new BadRequestException('Admin not found in token');
    }

    // page aur limit ko number me convert karo
    const pageNumber = page ? parseInt(page) : 1;
    const limitNumber = limit ? parseInt(limit) : 10;

    // service call
    return this.vanService.getAllDriversByAdmin(
      adminId,
      pageNumber,
      limitNumber,
      search,
      status,
    );
  }

    @Get("getVanById/:id")
  async getVan(@Param("id") id: string) {
    console.log(id)
    return this.vanService.getVanById(id);
  }


      @Get("getDriverById/:id")
  async getDriverById(@Param("id") id: string) {
    console.log(id)
    return this.vanService.getDriverById(id);
  }

   @UseGuards(AuthGuard('jwt'))
@Post('changeVanStatus')
async changeVanStatus(
  @Req() req: any,
  @Body() body: { vanIds: string[]; status: string },
) {
  const adminId = req.user.userId;
  const { vanIds, status } = body;

  return this.vanService.updateVanStatusByAdmin(
    vanIds,
    adminId,
    status,
  );
}


@UseGuards(AuthGuard('jwt'))
@Post('addDriverByAdmin')
async addDriverByAdmin(@Req() req: any, @Body() body: any) {
  return this.vanService.addDriverByAdmin(req.user.userId, body);
}

@UseGuards(AuthGuard('jwt'))
@Post('removeDriverFromVan')
async removeDriverFromVan(
  @Req() req: any,
  @Body() body: { vanId: string },
) {
  const adminId = req.user.userId;
  const vanId = body.vanId;  

  return this.vanService.removeDriverFromVan(vanId, adminId);
}


@UseGuards(AuthGuard('jwt'))
@Post('update-profile')
async updateProfile(
  @Req() req: any,
  @Body() editDto: EditDriverDto,   
) {
  const userId = req.user.userId;       
  const userType = req.user.userType;   

  return this.vanService.updateProfile(userId, userType, editDto);
}

@UseGuards(AuthGuard('jwt'))
@Post('update-van')
async updateVan(
  @Req() req: any,
  @Body() body: any,
) {
  const driverId = req.user.userId;
  const { vanId, ...createVanDto } = body; // 👈 ab flat body handle ho jaayega

  return this.vanService.updateVan(driverId, vanId, createVanDto);
}

@UseGuards(AuthGuard('jwt')) // ye guard token verify karega
  @Post('uploadDocuments')
  async updateVanDocuments(@Body() body: any, @Req() req: any) {
   
    const driverId = req.user?.id; 

    return this.vanService.uploadDocument(body, driverId);
  }

@UseGuards(AuthGuard('jwt'))
@Get('getDriverDocuments')
async getDriverDocuments(@Req() req: any) {
  const driverId = req.user.userId;
  return this.vanService.getDriverDocuments(driverId);
}

@UseGuards(AuthGuard('jwt'))
@Get('getVehicleType')
async getVehicleType(@Req() req: any) {
  const driverId = req.user.userId;

  if (!driverId) {
    throw new BadRequestException('Invalid driver token');
  }

  // ✅ Static vehicle types
  const vehicleTypes = ['Mehran', 'Cultus', 'Corolla' , 'Alto', "wagonR"];

  return {
    message: 'Vehicle types fetched successfully',
    data: vehicleTypes,
  };
}


@UseGuards(AuthGuard('jwt'))
@Post('deleteVanByDriver')
async deleteVanByDriver(@Req() req: any) {
  const driverId = req.user.userId;
  return this.vanService.deleteVan(driverId);
}

@UseGuards(AuthGuard('jwt'))
@Post('deleteVanByAdmin')
async deleteVanByAdmin(@Req() req: any, @Body('vanId') vanId: string) {
  const adminId = req.user.userId;

  return this.vanService.deleteVanByAdmin(adminId, vanId);
}

@Get('getVansBySchoolId/:schoolId')
async getVansBySchoolId(@Param('schoolId') schoolId: string) {
  return this.vanService.getVansBySchool(schoolId);
}
@UseGuards(AuthGuard('jwt'))
@Post('changeDriverStatus')
async changeDriverStatus(
  @Req() req: any,
  @Body() body: { driverIds: string[]; status: string },
) {
  const adminId = req.user.userId;
  const { driverIds, status } = body;

  return this.vanService.updateDriverStatusByAdmin(
    driverIds,
    adminId,
    status,
  );
}



  // 🔒 JWT-protected endpoint
  @UseGuards(AuthGuard('jwt'))
  @Post('assignSchool')
  async assignSchoolToDriver(
    @Req() req: any,
    @Body('schoolId') schoolId: string,
  ) {
    // req.user me JWT se authenticated user info aayega (admin)
    const driverId = req.user.userId;

    // Service call
    return this.vanService.assignSchoolToDriver(driverId, schoolId,);
  }


@UseGuards(AuthGuard('jwt'))
@Post('removeDriversFromScool')
async removeDriversFromScool(
  @Req() req: any,
  @Body() body: { driverIds: string[]; status: string },
) {
  const adminId = req.user.userId;
  const { driverIds } = body;

  return this.vanService.removeDriversFromSchool(
    driverIds,
    adminId,
  );
}

}


