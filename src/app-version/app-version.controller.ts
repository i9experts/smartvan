/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Header, Param, Patch, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorator/roles.decorator';
import { RolesGuard } from '../auth/guard/roles.guard';
import { AppVersionService } from './app-version.service';
import { GetAppVersionQueryDto, UpdateAppVersionDto } from './dto/app-version.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });

/** Public: called by the mobile apps before login (no auth guard). */
@ApiTags('App Version')
@Controller('app-version')
export class AppVersionController {
  constructor(private readonly service: AppVersionService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  @UsePipes(pipe)
  @ApiOperation({ summary: 'Latest/min app version for update popups (public)' })
  get(@Query() q: GetAppVersionQueryDto) {
    return this.service.getPublic(q.app, q.platform);
  }
}

/** Admin: superadmin only (versions are global across schools). */
@ApiTags('App Version')
@ApiBearerAuth('accessToken')
@Controller('admin/app-versions')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('superadmin')
export class AdminAppVersionController {
  constructor(private readonly service: AppVersionService) {}

  @Get()
  @ApiOperation({ summary: 'List all app version rows' })
  list() {
    return this.service.findAll();
  }

  @Patch(':id')
  @UsePipes(pipe)
  @ApiOperation({ summary: 'Update latest/min version, store URL, message' })
  update(@Param('id') id: string, @Body() dto: UpdateAppVersionDto) {
    return this.service.update(id, dto);
  }
}
