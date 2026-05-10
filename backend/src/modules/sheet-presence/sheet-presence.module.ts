import { Module } from '@nestjs/common';
import { SheetPresenceController } from './sheet-presence.controller';
import { SheetPresenceService } from './sheet-presence.service';

@Module({
  controllers: [SheetPresenceController],
  providers: [SheetPresenceService],
  exports: [SheetPresenceService],
})
export class SheetPresenceModule {}
