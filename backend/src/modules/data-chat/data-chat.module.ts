import { Module } from '@nestjs/common';
import { DataChatController } from './data-chat.controller';
import { DataChatService } from './data-chat.service';

@Module({
  controllers: [DataChatController],
  providers: [DataChatService],
  exports: [DataChatService],
})
export class DataChatModule {}
