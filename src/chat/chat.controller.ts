/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  list(@Req() req: any) {
    return this.chatService.list(req.user);
  }

  @Get('unread')
  unread(@Req() req: any) {
    return this.chatService.unreadTotal(req.user);
  }

  /** Body { kidId } — opens the parent ↔ driver thread for that student. */
  @Post('start')
  start(@Req() req: any, @Body() body: { kidId: string }) {
    return this.chatService.start(req.user, body?.kidId);
  }

  @Get(':conversationId/messages')
  messages(
    @Req() req: any,
    @Param('conversationId') id: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.messages(req.user, id, before, limit);
  }

  @Post(':conversationId/messages')
  send(
    @Req() req: any,
    @Param('conversationId') id: string,
    @Body() body: { text: string; templateKey?: string },
  ) {
    return this.chatService.send(req.user, id, body);
  }

  @Post(':conversationId/read')
  read(@Req() req: any, @Param('conversationId') id: string) {
    return this.chatService.markRead(req.user, id);
  }
}
