import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DataChatService, DataChatResponse } from './data-chat.service';
import { DataChatQueryDto } from './dto/data-chat-query.dto';

@Controller('data-chat')
@UseGuards(JwtAuthGuard)
export class DataChatController {
  constructor(private readonly service: DataChatService) {}

  @Post('query')
  async query(@Body() dto: DataChatQueryDto): Promise<DataChatResponse> {
    return this.service.chat(dto);
  }
}
