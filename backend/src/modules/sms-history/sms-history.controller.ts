import { Controller, Get, Query, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SmsHistoryService } from './sms-history.service';

@Controller('sms-history')
@UseGuards(JwtAuthGuard)
export class SmsHistoryController {
  constructor(private readonly smsHistoryService: SmsHistoryService) {}

  @Get()
  findAll(
    @Query('invoiceId') invoiceId?: string,
    @Query('templateType') templateType?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.smsHistoryService.findAll({
      invoiceId: invoiceId ? parseInt(invoiceId, 10) : undefined,
      templateType,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('invoice/:invoiceId')
  findByInvoiceId(@Param('invoiceId', ParseIntPipe) invoiceId: number) {
    return this.smsHistoryService.findByInvoiceId(invoiceId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.smsHistoryService.findOne(id);
  }
}
