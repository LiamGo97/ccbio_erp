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
import { QuotationSheetService } from './quotation-sheet.service';
import { UpsertQuotationSheetRowDto } from './dto/upsert-quotation-sheet-row.dto';

@Controller('quotation-sheet')
@UseGuards(JwtAuthGuard)
export class QuotationSheetController {
  constructor(private readonly service: QuotationSheetService) {}

  @Get('rows')
  listRows(@Query('sheetId') sheetId?: string) {
    const id = (sheetId ?? '').trim() || 'sales-quotation-sheet';
    return this.service.findAll(id);
  }

  @Put('rows/:rowIndex')
  upsertRow(
    @Param('rowIndex', ParseIntPipe) rowIndex: number,
    @Body() dto: UpsertQuotationSheetRowDto,
    @Query('sheetId') sheetId: string | undefined,
    @Request() req: { user?: { id?: number } },
  ) {
    const sid = (sheetId ?? '').trim() || 'sales-quotation-sheet';
    const uid = req.user?.id ?? null;
    return this.service.upsertRow(sid, rowIndex, dto, uid);
  }
}
