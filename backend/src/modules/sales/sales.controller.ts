import { Body, Controller, Get, Post, Put, Patch, Delete, Query, UseGuards, Request, Param, NotFoundException, BadRequestException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { InvoiceService } from './invoice.service';
import { SalesUnloadingAddressBackfillService } from './sales-unloading-address-backfill.service';
import { BackfillSalesUnloadingAddressDto } from './dto/backfill-sales-unloading-address.dto';
import { CreateSalesDto } from './dto/create-sales.dto';
import { UpdateSalesDto } from './dto/update-sales.dto';
import { GetSalesDto } from './dto/get-sales.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { GetPendingInvoicesDto } from './dto/get-pending-invoices.dto';
import { GetAvailableSalesItemsDto } from './dto/get-available-sales-items.dto';
import { UpdateSalesItemDto } from './dto/update-sales-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly invoiceService: InvoiceService,
    private readonly salesUnloadingAddressBackfillService: SalesUnloadingAddressBackfillService,
  ) {}

  @Get()
  async findAll(@Query() query: GetSalesDto) {
    return await this.salesService.findAll(query);
  }

  /**
   * 일회성: 현재 목록과 동일 필터로, 레거시 하차지 주소(sa_unloading_address)는 유지한 채
   * 도로명/지번/법정동코드 컬럼만 카카오 주소 API로 보강합니다.
   * POST /api/sales/dev/backfill-unloading-address-structured
   */
  @Post('dev/backfill-unloading-address-structured')
  async backfillUnloadingAddressStructured(@Body() body: BackfillSalesUnloadingAddressDto) {
    return await this.salesUnloadingAddressBackfillService.run(body);
  }

  // 거래명세서 관련 API - 구체적인 경로를 먼저 정의 (파라미터 경로보다 우선)
  @Get('invoices/pending')
  async getPendingInvoices(@Query() query: GetPendingInvoicesDto) {
    return await this.invoiceService.findPendingInvoices(query);
  }

  @Get('invoices/issued')
  async getIssuedInvoices(@Query() query: GetPendingInvoicesDto) {
    return await this.invoiceService.findIssuedInvoices(query);
  }

  @Get('invoices/available-items')
  async getAvailableSalesItems(@Query() query: GetAvailableSalesItemsDto) {
    return await this.invoiceService.findAvailableSalesItems(query);
  }

  @Get('invoices/:id')
  async getInvoice(@Param('id') id: string) {
    return await this.invoiceService.findOne(id);
  }

  @Post('invoices')
  async createInvoice(@Body() dto: CreateInvoiceDto, @Request() req: any) {
    console.log('[SalesController] createInvoice called', { customerId: dto.customerId, itemsCount: dto.items?.length });
    const userId = req.user?.id;
    try {
      const result = await this.invoiceService.createInvoice(dto, userId);
      console.log('[SalesController] createInvoice success', { invoiceId: result.id });
      return result;
    } catch (error) {
      console.error('[SalesController] createInvoice error', error);
      throw error;
    }
  }

  @Put('invoices/:id')
  async updateInvoice(@Param('id') id: string, @Body() dto: CreateInvoiceDto, @Request() req: any) {
    console.log('[SalesController] updateInvoice called', { invoiceId: id, customerId: dto.customerId, itemsCount: dto.items?.length });
    const userId = req.user?.id;
    try {
      const result = await this.invoiceService.updateInvoice(id, dto, userId);
      console.log('[SalesController] updateInvoice success', { invoiceId: result.id });
      return result;
    } catch (error) {
      console.error('[SalesController] updateInvoice error', error);
      throw error;
    }
  }

  @Patch('invoices/:id/ecount-processing-status')
  async updateEcountProcessingStatus(
    @Param('id') id: string,
    @Body() body: { status: 'PROCESSED' | 'NOT_PROCESSED' | 'NOT_APPLICABLE' },
    @Request() req: any,
  ) {
    const userId = req.user?.id;
    return await this.invoiceService.updateEcountProcessingStatus(id, body.status, userId);
  }

  @Patch('invoices/:id/sms-not-applicable')
  async updateInvoiceSmsNotApplicable(
    @Param('id') id: string,
    @Body() body: { smsNotApplicable: boolean },
  ) {
    return await this.invoiceService.updateSmsNotApplicable(id, body.smsNotApplicable);
  }

  /** 임시: 거래명세서 발행일만 수정 (채권 상세 등에서 사용) */
  @Patch('invoices/:id/issued-at')
  async updateInvoiceIssuedAt(@Param('id') id: string, @Body() body: { issuedAt: string }) {
    if (!body?.issuedAt || typeof body.issuedAt !== 'string') {
      throw new BadRequestException('issuedAt(YYYY-MM-DD)이 필요합니다.');
    }
    return await this.invoiceService.updateIssuedAt(id, body.issuedAt);
  }

  @Delete('invoices/:id')
  async deleteInvoice(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id;
    console.log('[SalesController] deleteInvoice called', { invoiceId: id, userId });
    try {
      await this.invoiceService.deleteInvoice(id, userId);
      console.log('[SalesController] deleteInvoice success', { invoiceId: id });
      return { success: true };
    } catch (error) {
      console.error('[SalesController] deleteInvoice error', error);
      throw error;
    }
  }

  // delivery 경로는 SalesDeliveryController에서 처리
  // @Get('delivery')는 SalesDeliveryController의 @Controller('sales/delivery')와 매칭됨
  // 하지만 라우팅 충돌을 방지하기 위해 여기서는 명시적으로 제외하지 않음
  // 대신 모듈 등록 순서로 해결

  @Post()
  async create(@Body() dto: CreateSalesDto, @Request() req: any) {
    const userId = req.user?.id;
    return await this.salesService.create(dto, userId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSalesDto, @Request() req: any) {
    const userId = req.user?.id;
    return await this.salesService.update(id, dto, userId);
  }

  @Post(':id/confirm')
  async confirmSales(@Param('id') id: string, @Body() dto: UpdateSalesDto, @Request() req: any) {
    const userId = req.user?.id;
    return await this.salesService.confirmSales(id, dto, userId);
  }

  @Get('linked-to-order/:orderId')
  async getSalesLinkedToOrder(@Param('orderId') orderId: string) {
    return await this.salesService.getSalesLinkedToOrder(orderId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const sale = await this.salesService.findOne(id);
    if (!sale) {
      throw new NotFoundException(`판매 정보를 찾을 수 없습니다. (ID: ${id})`);
    }
    return sale;
  }

  @Put('items/:id')
  async updateSalesItem(
    @Param('id') id: string,
    @Body() dto: UpdateSalesItemDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id;
    return await this.salesService.updateSalesItem(id, dto, userId);
  }

  @Delete('items/:id')
  async deleteSalesItem(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const userId = req.user?.id;
    return await this.salesService.deleteSalesItem(id, userId);
  }
}

