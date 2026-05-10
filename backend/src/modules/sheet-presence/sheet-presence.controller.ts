import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SheetPresenceService } from './sheet-presence.service';

/** 프론트 PRODUCT_RESERVATIONS_SHEET_ID 와 동일해야 함 */
const DEFAULT_SHEET_ID = 'product-reservations-sheet';

/** 전역 ValidationPipe(whitelist) — 필드마다 데코레이터 필요 */
class CellBodyDto {
  @IsString()
  sheetId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  row!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99)
  col!: number;
}

@Controller('sheet-presence')
@UseGuards(JwtAuthGuard)
export class SheetPresenceController {
  constructor(private readonly sheetPresence: SheetPresenceService) {}

  @Get('locks')
  getLocks(@Query('sheetId') sheetId: string) {
    const id = (sheetId ?? '').trim() || DEFAULT_SHEET_ID;
    return { locks: this.sheetPresence.getLocks(id) };
  }

  @Post('lock')
  acquire(
    @Body() body: CellBodyDto,
    @Request() req: { user?: { id?: number; name?: string | null } },
  ) {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId)) {
      return { ok: false };
    }
    const sheetId = (body.sheetId ?? '').trim() || DEFAULT_SHEET_ID;
    const name =
      (req.user?.name && String(req.user.name).trim()) ||
      `사용자 #${userId}`;
    this.sheetPresence.acquire(sheetId, body.row, body.col, userId, name);
    return { ok: true };
  }

  @Post('heartbeat')
  heartbeat(
    @Body() body: CellBodyDto,
    @Request() req: { user?: { id?: number; name?: string | null } },
  ) {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId)) {
      return { ok: false };
    }
    const sheetId = (body.sheetId ?? '').trim() || DEFAULT_SHEET_ID;
    const name =
      (req.user?.name && String(req.user.name).trim()) ||
      `사용자 #${userId}`;
    this.sheetPresence.heartbeat(sheetId, body.row, body.col, userId, name);
    return { ok: true };
  }

  @Delete('lock')
  release(
    @Query('sheetId') sheetId: string,
    @Query('row') row: string,
    @Query('col') col: string,
    @Request() req: { user?: { id?: number } },
  ) {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId)) {
      return { ok: false };
    }
    const sid = (sheetId ?? '').trim() || DEFAULT_SHEET_ID;
    const r = parseInt(row, 10);
    const c = parseInt(col, 10);
    if (Number.isNaN(r) || Number.isNaN(c)) {
      return { ok: false };
    }
    this.sheetPresence.release(sid, r, c, userId);
    return { ok: true };
  }
}
