/* eslint-disable prettier/prettier */
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('universal')
  async universalSearch(@Req() req: any, @Query('q') q: string) {
    return this.searchService.universalSearch(q, req.user.userId, req.user.role);
  }
}
