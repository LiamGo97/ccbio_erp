import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SalesReservationSheetService } from './sales-reservation-sheet.service';
import { UpsertSheetRowDto } from './dto/upsert-sheet-row.dto';

@Controller('sales-reservation-sheet')
@UseGuards(JwtAuthGuard)
export class SalesReservationSheetController {
  constructor(private readonly service: SalesReservationSheetService) {}

  @Get('rows')
  listRows(@Query('sheetId') sheetId?: string) {
    const id = (sheetId ?? '').trim() || 'product-reservations-sheet';
    return this.service.findAll(id);
  }

  @Put('rows/:rowIndex')
  upsertRow(
    @Param('rowIndex', ParseIntPipe) rowIndex: number,
    @Body() dto: UpsertSheetRowDto,
    @Query('sheetId') sheetId: string | undefined,
    @Request() req: { user?: { id?: number } },
  ) {
    const sid = (sheetId ?? '').trim() || 'product-reservations-sheet';
    const uid = req.user?.id ?? null;
    return this.service.upsertRow(sid, rowIndex, dto, uid);
  }
}
