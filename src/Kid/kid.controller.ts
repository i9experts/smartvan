/* eslint-disable prettier/prettier */
import { Body, Controller, Post, Get,  Req, Query } from '@nestjs/common';
import { KidService } from './kid.service'
import { AuthGuard } from '@nestjs/passport';
import { UseGuards } from '@nestjs/common';
import { CreateKidDto } from './dto/CreateKid.dto';

@Controller('kid')
export class KidController {
  constructor(private readonly KidService: KidService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('addKid')
  async addVan(
    @Body() CreateKidDto: CreateKidDto,
    @Req() req: any
  ) {
    const { userId, userType } = req.user; // 👈 user info from JWT
    return this.KidService.addKid(CreateKidDto, userId, userType);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('getKids')
async getKids(@Req() req: any) {
  const { userId, userType } = req.user; // 👈 token se extract hua
  return this.KidService.getKids(userId, userType);
}



@UseGuards(AuthGuard('jwt'))
@Post('changeKidStatus')
async verifyStudents(
  @Req() req: any,
  @Body() body: { kidIds: string[]; status: string },
) {
  const adminId = req.user.userId;
  const { kidIds, status } = body;
  console.log('Admin ID:', adminId);

  return this.KidService.verifyStudentsByAdmin(
    kidIds,
    adminId,
    status,
  );
}



@UseGuards(AuthGuard('jwt'))
@Post('removeVanFromKid')
async removeVanFromKid(
  @Req() req: any,
  @Body() body: { kidIds: string[]},
) {
 
  const { kidIds } = body;

  return this.KidService.removeVanFromKids(
    kidIds,
  );
}

@UseGuards(AuthGuard('jwt'))
@Post('assignVanToStudents')
async assignVanToStudents(
  @Req() req: any,
  @Body() body: { kidIds: string[], vanId: string },
) {
 
  const { kidIds, vanId } = body;
  const adminId = req.user.userId;

  return this.KidService.assignVanToStudents(
    kidIds,
    vanId,
    adminId
  );
}




@UseGuards(AuthGuard('jwt'))
@Post('update-kid')
async updateKid(
  @Req() req: any,
  @Body() body: any,
) {
  const parentId = req.user.userId;
  const { kidId, ...CreateKidDto } = body; // 👈 ab flat body handle ho jaayega

  return this.KidService.updateKid(parentId, kidId, CreateKidDto);
}

@UseGuards(AuthGuard('jwt'))
  @Get('getActiveTripDetails')
async getActiveTripDetails( @Req() req: any,
   ) {
  const parentId  = req.user.userId; // 👈 token se extract hua
  console.log(parentId)
  return this.KidService.getParentActiveTrips(parentId);
}

 @UseGuards(AuthGuard('jwt'))
  @Get('getTripHistory')
async getTripHistory( @Req() req: any,
    @Query('date') date?: string,  
    @Query('page') page?: string,
    @Query('limit') limit?: string,
   
   ) {
  const parentId  = req.user.userId; // 👈 token se extract hua
  console.log(parentId)
   const pageNumber = page ? parseInt(page) : 1;
    const limitNumber = limit ? parseInt(limit) : 10;

  return this.KidService.getTripHistoryByParent(parentId, date , pageNumber, limitNumber);
}


@UseGuards(AuthGuard('jwt'))
@Get('getTripHistoryByDriver')
@UseGuards(AuthGuard('jwt'))
@Get('getTripHistoryByDriver')
async getTripHistoryByDriver(
  @Req() req: any,
  @Query('page') page?: string,
  @Query('limit') limit?: string,
  @Query('isRecent') isRecent?: string,
) {

  const driverId = req.user.userId;


  const pageNumber = page ? parseInt(page, 10) : 1;
  const limitNumber = limit ? parseInt(limit, 10) : 10;

 
  const recent = isRecent === 'true' || isRecent === '1';

 
  return this.KidService.getTripHistoryByDriver(
    driverId,
    pageNumber,
    limitNumber,
    recent,
  );
}



  @UseGuards(AuthGuard('jwt'))
  @Get('getParentDriversWithSchool')
async getParentDriversWithSchool(@Req() req: any) {
  const  parentId  = req.user.userId; // 👈 token se extract hua
  return this.KidService.getParentDriversWithSchool(parentId);
}
@UseGuards(AuthGuard('jwt'))
@Post('deleteKidByParent')
async deleteKid(
  @Req() req: any,
  @Body('kidId') kidId: string, // body se kidId le rahe
) {
  const parentId = req.user.userId; // token se parentId
  return this.KidService.deleteKidByIdAndParent(parentId, kidId);
}
@UseGuards(AuthGuard('jwt'))
@Post('assignVanByParent')
async assignVan(
  @Req() req: any,
  @Body('kidId') kidId: string,
  @Body('vanId') vanId: string,
) {
  const parentId = req.user.userId; // token se parentId

  return this.KidService.assignVanByParent(parentId, {
    kidId,
    vanId,
  });
}



}

