import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import type { Express } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TradeContractsService } from './trade-contracts.service';
import { SaveTradeContractDto } from './dto/save-trade-contract.dto';
import { UpdateTradeOrderDto } from './dto/update-trade-order.dto';
import { SaveInvoiceDto } from './dto/save-invoice.dto';
import { CreateTradeOrderDto } from './dto/create-trade-order.dto';
import { UpdateTradeOrderInboundDto } from './dto/update-trade-order-inbound.dto';
import { UpdateTradeContractDto } from './dto/update-trade-contract.dto';
import { UpdateContainerDto } from './dto/update-container.dto';
import { BatchUpdateContainerReturnStatusDto } from './dto/batch-update-container-return-status.dto';
import { AdjustContainerInventoryDto } from './dto/adjust-container-inventory.dto';
import { BatchEtaUpdateDto } from './dto/batch-eta-update.dto';

const TEMP_DIR = './uploads/contracts/temp';
const INVOICE_TEMP_DIR = './uploads/invoices/temp';

/** 재무 입고예정/확정 재고: `productName` 단일·반복·`''`(빈 선택=결과 없음)·미전달(필터 없음) */
function parseFinanceInventoryProductNamesQuery(productNameParam: unknown): string[] | undefined {
  if (Array.isArray(productNameParam)) {
    return (productNameParam as string[])
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0 && v !== '__all__');
  }
  if (productNameParam === '') {
    return [];
  }
  if (typeof productNameParam === 'string' && productNameParam.trim() && productNameParam !== '__all__') {
    return [productNameParam.trim()];
  }
  return undefined;
}

@Controller('trade/contracts')
@UseGuards(JwtAuthGuard)
export class TradeContractsController {
  constructor(private readonly tradeContractsService: TradeContractsService) {}

  @Post('analyze')
  async analyzeContract(
    @Body() body: { googleDriveFileId?: string },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: any,
  ) {
    if (!body.googleDriveFileId && !file) {
      throw new BadRequestException('파일 또는 구글 드라이브 파일 ID가 필요합니다.');
    }

    const userId = req.user?.id;
    const result = await this.tradeContractsService.analyzeContract(
      file,
      body.googleDriveFileId,
      userId,
    );
    return result;
  }

  @Post('save')
  async saveContract(@Body() body: SaveTradeContractDto, @Req() req: any) {
    const userId = req.user?.id;
    return this.tradeContractsService.saveContract(body, userId);
  }

  @Get()
  async listContracts(@Req() req: any) {
    const contractStatus = req.query?.contractStatus;
    const contractStatuses = Array.isArray(contractStatus) ? contractStatus : (contractStatus ? [contractStatus] : undefined);
    const productNameParam = req.query?.productName;
    const productNames = Array.isArray(productNameParam)
      ? (productNameParam as string[]).map((v) => String(v).trim()).filter((v) => v.length > 0 && v !== '__all__')
      : productNameParam === ''
        ? []
        : typeof productNameParam === 'string' && productNameParam.trim() && productNameParam !== '__all__'
          ? [productNameParam.trim()]
          : undefined;
    const contractNo = req.query?.contractNo as string | undefined;
    const createdById = req.query?.createdById ? parseInt(req.query.createdById as string, 10) : undefined;
    const exportersParam = req.query?.exporters;
    const exporters = Array.isArray(exportersParam)
      ? (exportersParam as string[]).map((v) => String(v).trim()).filter((v) => v.length > 0)
      : typeof exportersParam === 'string'
        ? exportersParam.split(',').map((v) => v.trim()).filter((v) => v.length > 0)
        : undefined;
    return this.tradeContractsService.listTradeContracts(contractStatuses, productNames, contractNo, createdById, exporters);
  }

  @Get('orders')
  async listOrders(@Req() req: any) {
    const userId = req.query?.userId ? parseInt(req.query.userId, 10) : undefined;
    const contractStatus = req.query?.contractStatus;
    // contractStatus가 배열인 경우 처리 (예: ?contractStatus=CONTRACT&contractStatus=PARTIALLY_COMPLETED)
    const contractStatuses = Array.isArray(contractStatus) ? contractStatus : (contractStatus ? [contractStatus] : undefined);
    const bookingOnly = req.query?.bookingOnly === 'true' || req.query?.bookingOnly === true;
    const productNameParam = req.query?.productName;
    const productNames = Array.isArray(productNameParam)
      ? (productNameParam as string[]).map((v) => String(v).trim()).filter((v) => v.length > 0 && v !== '__all__')
      : productNameParam === ''
        ? []
        : typeof productNameParam === 'string' && productNameParam.trim() && productNameParam !== '__all__'
          ? [productNameParam.trim()]
          : undefined;
    // tradeStatus 우선, 없으면 status 사용 (하위 호환성)
    // tradeStatus가 배열인 경우 처리 (예: ?tradeStatus=BOOKING&tradeStatus=DOCUMENTS)
    const tradeStatus = req.query?.tradeStatus;
    let tradeStatuses = Array.isArray(tradeStatus) ? tradeStatus : (tradeStatus ? [tradeStatus] : undefined);
    
    // '__EMPTY__'가 포함되어 있으면 빈 배열로 변환 (전체 해제)
    if (tradeStatuses && tradeStatuses.includes('__EMPTY__')) {
      tradeStatuses = [];
    }
    
    const status = tradeStatuses?.[0]; // 하위 호환성을 위해 첫 번째 값 사용
    const salesStatus = req.query?.salesStatus as string | undefined;
    const financeStatus = req.query?.financeStatus as string | undefined;
    const certificateRequestFilter = req.query?.certificateRequestFilter as string | undefined;
    const contractNo = req.query?.contractNo as string | undefined;
    const search = req.query?.search as string | undefined; // B/K, B/L, 계약번호 검색 (inventory/confirmed와 동일)
    const dateType = req.query?.dateType as 'etd' | 'eta' | 'quarantine' | 'customs' | undefined;
    const dateFrom = req.query?.dateFrom as string | undefined;
    const dateTo = req.query?.dateTo as string | undefined;
    const includeOrdersWithAllContainersExcluded = req.query?.includeOrdersWithAllContainersExcluded === 'true' || req.query?.includeOrdersWithAllContainersExcluded === true;
    const includeExcluded = req.query?.includeExcluded === 'true' || req.query?.includeExcluded === true; // 물류관리: 제외된 주문 포함
    const exportersParam = req.query?.exporters;
    const exporters = Array.isArray(exportersParam)
      ? (exportersParam as string[]).map((v) => String(v).trim()).filter((v) => v.length > 0)
      : typeof exportersParam === 'string'
        ? exportersParam.split(',').map((v) => v.trim()).filter((v) => v.length > 0)
        : undefined;
    return this.tradeContractsService.listTradeOrders(userId, contractStatuses, bookingOnly, productNames, status, salesStatus, financeStatus, certificateRequestFilter, contractNo, tradeStatuses, dateType, dateFrom, dateTo, search, includeOrdersWithAllContainersExcluded, includeExcluded, exporters);
  }

  /** 판매예약 시트 BL — `productCode` 필수, `salesGrade` 선택 시 해당 등급에 맞는 BL만(입고·ETA·가용 포함). */
  @Get('orders/sheet-bl-options')
  async listSheetBlOptions(@Req() req: any) {
    const productCode = String(req.query?.productCode ?? '').trim();
    if (!productCode) {
      return [];
    }
    const salesGrade =
      req.query?.salesGrade != null ? String(req.query.salesGrade).trim() : '';
    return this.tradeContractsService.listSheetBlDropdownOptions(
      productCode,
      salesGrade || undefined,
    );
  }

  @Get('orders/export/excel')
  async exportOrdersToExcel(@Req() req: any, @Res() res: Response) {
    const userId = req.query?.userId ? parseInt(req.query.userId, 10) : undefined;
    const contractStatus = req.query?.contractStatus;
    const contractStatuses = Array.isArray(contractStatus) ? contractStatus : (contractStatus ? [contractStatus] : undefined);
    const bookingOnly = req.query?.bookingOnly === 'true' || req.query?.bookingOnly === true;
    const productNameParamExport = req.query?.productName;
    const productNamesExport = Array.isArray(productNameParamExport)
      ? (productNameParamExport as string[]).map((v) => String(v).trim()).filter((v) => v.length > 0 && v !== '__all__')
      : productNameParamExport === ''
        ? []
        : typeof productNameParamExport === 'string' && productNameParamExport.trim() && productNameParamExport !== '__all__'
          ? [productNameParamExport.trim()]
          : undefined;
    const tradeStatus = req.query?.tradeStatus;
    let tradeStatuses = Array.isArray(tradeStatus) ? tradeStatus : (tradeStatus ? [tradeStatus] : undefined);
    if (tradeStatuses && tradeStatuses.includes('__EMPTY__')) tradeStatuses = [];
    const status = tradeStatuses?.[0];
    const salesStatus = req.query?.salesStatus as string | undefined;
    const financeStatus = req.query?.financeStatus as string | undefined;
    const certificateRequestFilter = req.query?.certificateRequestFilter as string | undefined;
    const contractNo = req.query?.contractNo as string | undefined;
    const search = req.query?.search as string | undefined;
    const dateType = req.query?.dateType as 'etd' | 'eta' | 'quarantine' | 'customs' | undefined;
    const dateFrom = req.query?.dateFrom as string | undefined;
    const dateTo = req.query?.dateTo as string | undefined;
    const includeOrdersWithAllContainersExcluded = req.query?.includeOrdersWithAllContainersExcluded === 'true' || req.query?.includeOrdersWithAllContainersExcluded === true;
    const includeExcluded = req.query?.includeExcluded === 'true' || req.query?.includeExcluded === true;
    const exportersParam = req.query?.exporters;
    const exporters = Array.isArray(exportersParam)
      ? (exportersParam as string[]).map((v) => String(v).trim()).filter((v) => v.length > 0)
      : typeof exportersParam === 'string'
        ? exportersParam.split(',').map((v) => v.trim()).filter((v) => v.length > 0)
        : undefined;

    const buffer = await this.tradeContractsService.exportLogisticsOrdersToExcel(
      userId,
      contractStatuses,
      bookingOnly,
      productNamesExport,
      status,
      salesStatus,
      financeStatus,
      certificateRequestFilter,
      contractNo,
      tradeStatuses,
      dateType,
      dateFrom,
      dateTo,
      search,
      includeOrdersWithAllContainersExcluded,
      includeExcluded,
      exporters,
    );

    const filename = `물류관리_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  @Get('logistics-status-overview')
  async getLogisticsStatusOverview(@Req() req: any) {
    const productName = req.query?.productName as string | undefined;
    return this.tradeContractsService.getLogisticsStatusOverview(productName);
  }

  @Get('containers')
  async listContainers(@Req() req: any) {
    const inboundStatus = req.query?.inboundStatus as string | undefined; // PENDING | CONFIRMED | INBOUND_PENDING | INBOUND_SCHEDULED | INBOUND_CONFIRMED
    const excludeSoldOut = req.query?.excludeSoldOut === 'true' || req.query?.excludeSoldOut === true;
    const warehousesParam = req.query?.warehouses as string | undefined;
    const warehouses = warehousesParam
      ? warehousesParam
          .split(',')
          .map((v) => parseInt(v.trim(), 10))
          .filter((v) => !Number.isNaN(v))
      : undefined;
    const availableOnly = req.query?.availableOnly === 'true' || req.query?.availableOnly === true;
    const blsParam = req.query?.bls as string | undefined;
    const bls = blsParam
      ? blsParam
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : undefined;
    const requestedContainersParam = req.query?.requestedContainers as string | undefined;
    const requestedContainers = requestedContainersParam
      ? requestedContainersParam
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : undefined;
    const search = req.query?.search as string | undefined;
    const productNameParam = req.query?.productName;
    const productNames =
      Array.isArray(productNameParam)
        ? (productNameParam as string[]).map((v) => String(v).trim()).filter((v) => v.length > 0 && v !== '__all__')
        : productNameParam === ''
          ? []
          : typeof productNameParam === 'string' && productNameParam.trim() && productNameParam !== '__all__'
            ? [productNameParam.trim()]
            : undefined;
    const includeExcluded = req.query?.includeExcluded === 'true' || req.query?.includeExcluded === true;
    const returnStatusParam = req.query?.returnStatus as string | undefined;
    const returnStatus = returnStatusParam
      ? returnStatusParam.split(',').map((v) => v.trim()).filter((v) => v.length > 0)
      : undefined;
    const forDashboardDisplay = req.query?.forDashboardDisplay === 'true' || req.query?.forDashboardDisplay === true;
    const forDashboardScheduled =
      req.query?.forDashboardScheduled === 'true' || req.query?.forDashboardScheduled === true;
    const excludeSalesReservationId = (req.query?.excludeSalesReservationId as string | undefined)?.trim();
    const includeSheetReservationsRaw = req.query?.includeSheetReservations;
    const includeSheetReservations =
      includeSheetReservationsRaw === 'false' || includeSheetReservationsRaw === false ? false : true;

    const inboundStatusTyped = inboundStatus as
      | 'PENDING'
      | 'CONFIRMED'
      | 'INBOUND_PENDING'
      | 'INBOUND_SCHEDULED'
      | 'INBOUND_CONFIRMED'
      | undefined;

    // 주간재고현황·외부 API와 동일한 결과 보장: 동일 파라미터면 단일 코드 경로 사용
    const isDashboardConfirmed =
      inboundStatusTyped === 'CONFIRMED' &&
      !excludeSoldOut &&
      !warehouses?.length &&
      !availableOnly &&
      !bls?.length &&
      !requestedContainers?.length &&
      !search?.trim() &&
      productNames === undefined &&
      !includeExcluded &&
      !returnStatus?.length &&
      forDashboardDisplay;
    if (isDashboardConfirmed) {
      return this.tradeContractsService.getConfirmedInventoryForDashboard();
    }

    const isDashboardInboundScheduled =
      inboundStatusTyped === 'INBOUND_SCHEDULED' &&
      !excludeSoldOut &&
      !warehouses?.length &&
      !availableOnly &&
      !bls?.length &&
      !requestedContainers?.length &&
      !search?.trim() &&
      productNames === undefined &&
      !includeExcluded &&
      !returnStatus?.length &&
      forDashboardScheduled &&
      !forDashboardDisplay &&
      !excludeSalesReservationId;
    if (isDashboardInboundScheduled) {
      return this.tradeContractsService.getInboundScheduledInventoryForDashboard();
    }

    return this.tradeContractsService.listContainers(
      inboundStatusTyped,
      excludeSoldOut,
      warehouses,
      availableOnly,
      bls,
      requestedContainers,
      search,
      productNames,
      includeExcluded,
      returnStatus,
      forDashboardDisplay,
      excludeSalesReservationId || undefined,
      includeSheetReservations,
    );
  }

  @Get('finance/inventory-pending/export/excel')
  async exportFinanceInventoryPendingToExcel(@Req() req: any, @Res() res: Response) {
    const search = req.query?.search as string | undefined;
    const productNames = parseFinanceInventoryProductNamesQuery(req.query?.productName);
    const includeExcluded = req.query?.includeExcluded === 'true' || req.query?.includeExcluded === true;
    const dateFrom = req.query?.dateFrom as string | undefined;
    const dateTo = req.query?.dateTo as string | undefined;
    const sortBy = (req.query?.sortBy as string) ?? 'inboundCustomsScheduledDate';
    const sortOrder = ((req.query?.sortOrder as string) ?? 'asc') as 'asc' | 'desc';
    const buffer = await this.tradeContractsService.exportFinanceInventoryPendingToExcel(
      search,
      productNames,
      includeExcluded,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
    );
    const filename = `입고예정재고_재무_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  @Get('finance/inventory-pending')
  async listFinanceInventoryPending(@Req() req: any) {
    const search = req.query?.search as string | undefined;
    const productNames = parseFinanceInventoryProductNamesQuery(req.query?.productName);
    const includeExcluded = req.query?.includeExcluded === 'true' || req.query?.includeExcluded === true;
    const dateFrom = req.query?.dateFrom as string | undefined;
    const dateTo = req.query?.dateTo as string | undefined;
    return this.tradeContractsService.listFinanceInventoryPendingByBl(search, productNames, includeExcluded, dateFrom, dateTo);
  }

  @Get('sales/inventory-pending')
  async listSalesInventoryPending(@Req() req: any) {
    const search = req.query?.search as string | undefined;
    const productNames = parseFinanceInventoryProductNamesQuery(req.query?.productName);
    const includeExcluded = req.query?.includeExcluded === 'true' || req.query?.includeExcluded === true;
    const inventoryStatus = req.query?.inventoryStatus as string | undefined;
    const invStatuses = inventoryStatus?.split(',').map((s) => s.trim()).filter(Boolean);
    return this.tradeContractsService.listSalesInventoryPendingByBlPacking(
      search,
      productNames,
      includeExcluded,
      invStatuses?.length ? invStatuses : undefined,
    );
  }

  @Get('sales/inventory-confirmed/sales-linked')
  async listSalesInventoryConfirmedSalesLinked(@Req() req: any) {
    const containerIdsParam = req.query?.containerIds as string | undefined;
    const containerIds = containerIdsParam
      ? containerIdsParam
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
      : [];
    const orderId = (req.query?.orderId as string | undefined)?.trim() || undefined;
    const packingType = req.query?.packingType as string | undefined;
    return this.tradeContractsService.listSalesLinkedToContainers(containerIds, orderId, packingType);
  }

  @Get('sales/inventory-confirmed')
  async listSalesInventoryConfirmed(@Req() req: any) {
    const search = req.query?.search as string | undefined;
    const productNames = parseFinanceInventoryProductNamesQuery(req.query?.productName);
    const includeExcluded = req.query?.includeExcluded === 'true' || req.query?.includeExcluded === true;
    const inventoryStatus = req.query?.inventoryStatus as string | undefined;
    const returnStatus = req.query?.returnStatus as string | undefined;
    const invStatuses = inventoryStatus?.split(',').map((s) => s.trim()).filter(Boolean);
    const retStatuses = returnStatus?.split(',').map((s) => s.trim()).filter(Boolean);
    return this.tradeContractsService.listSalesInventoryConfirmedByBlPacking(
      search,
      productNames,
      includeExcluded,
      invStatuses?.length ? invStatuses : undefined,
      retStatuses?.length ? retStatuses : undefined,
    );
  }

  @Get('finance/inventory-confirmed')
  async listFinanceInventoryConfirmed(@Req() req: any) {
    const search = req.query?.search as string | undefined;
    const productNames = parseFinanceInventoryProductNamesQuery(req.query?.productName);
    const warehouseNames = req.query?.warehouseNames as string | undefined;
    const inventoryStatus = req.query?.inventoryStatus as string | undefined;
    const returnStatus = req.query?.returnStatus as string | undefined;
    const dateFrom = req.query?.dateFrom as string | undefined;
    const dateTo = req.query?.dateTo as string | undefined;
    const whNames = warehouseNames?.split(',').map((s) => s.trim()).filter(Boolean);
    const invStatuses = inventoryStatus?.split(',').map((s) => s.trim()).filter(Boolean);
    const retStatuses = returnStatus?.split(',').map((s) => s.trim()).filter(Boolean);
    return this.tradeContractsService.listFinanceInventoryConfirmedByBl(
      search,
      productNames,
      undefined, // warehouses - inbound stores code value, use warehouseNames instead
      whNames?.length ? whNames : undefined,
      invStatuses?.length ? invStatuses : undefined,
      retStatuses?.length ? retStatuses : undefined,
      dateFrom,
      dateTo,
    );
  }

  @Patch('containers/batch/return-status')
  async batchUpdateContainerReturnStatus(@Body() body: BatchUpdateContainerReturnStatusDto, @Req() req: any) {
    const userId = req.user?.id;
    return this.tradeContractsService.batchUpdateContainerReturnStatus(
      body.containerIds,
      body.returnStatus,
      userId,
    );
  }

  @Patch('containers/:containerId')
  async updateContainer(
    @Param('containerId') containerId: string,
    @Body() body: UpdateContainerDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id;
    return this.tradeContractsService.updateContainer(containerId, body, userId);
  }

  @Post('containers/:containerId/recalculate-cost')
  async recalculateContainerCost(@Param('containerId') containerId: string) {
    return this.tradeContractsService.recalculateContainerCost(containerId);
  }

  @Get('containers/:containerId')
  async getContainer(@Param('containerId') containerId: string) {
    return this.tradeContractsService.getContainer(containerId);
  }

  @Post('containers/:containerId/adjust-inventory')
  async adjustContainerInventory(
    @Param('containerId') containerId: string,
    @Body() body: AdjustContainerInventoryDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id;
    return this.tradeContractsService.adjustContainerInventory(containerId, body, userId);
  }

  // orders 관련 라우트를 먼저 정의 (더 구체적인 라우트가 먼저 매칭되도록)
  @Get('orders/managers')
  async listManagers() {
    return this.tradeContractsService.listManagers();
  }

  /** 물류관리: BK/BL 중복·교차 입력 점검 (발주 전체 스캔) */
  @Get('orders/duplicate-bk-bl-report')
  async duplicateBkBlReport() {
    return this.tradeContractsService.getDuplicateBkBlReport();
  }

  @Get('orders/:id')
  async getOrder(@Param('id') id: string) {
    console.log(`[Controller] getOrder 호출 - id: ${id}`);
    console.log(`[Controller] 주문 조회 요청 - id: ${id}`);
    return this.tradeContractsService.getTradeOrder(id);
  }

  @Get('eta-update-history')
  async getEtaUpdateHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.tradeContractsService.findEtaUpdateBatchHistory(
      Number.isNaN(pageNum) ? 1 : pageNum,
      Number.isNaN(limitNum) ? 20 : Math.min(100, limitNum),
      sortBy,
      sortOrder as 'asc' | 'desc' | undefined,
    );
  }

  // 계약 조회는 orders 라우트 다음에 정의 (고정 경로보다 뒤에 두어 eta-update-history가 :id에 잡히지 않도록)
  @Get(':id')
  async getContract(@Param('id') id: string) {
    console.log(`[Controller] getContract 호출 - id: ${id}`);
    console.log(`[Controller] 계약 조회 요청 - id: ${id}`);
    return this.tradeContractsService.getTradeContract(id);
  }

  @Put(':id')
  async updateContract(
    @Param('id') id: string,
    @Body() body: UpdateTradeContractDto,
    @Req() req: any,
  ) {
    return this.tradeContractsService.updateTradeContract(id, body, req.user?.id);
  }

  @Post('orders')
  async createOrder(@Body() body: CreateTradeOrderDto, @Req() req: any) {
    const userId = req.user?.id;
    return this.tradeContractsService.createTradeOrder(body, userId);
  }

  @Post('orders/:id/tracking')
  async trackOrder(@Param('id') id: string) {
    return this.tradeContractsService.trackTradeOrder(id);
  }

  @Post('tracking')
  async trackByBkBl(@Body() body: { bk?: string | null; bl?: string | null }) {
    return this.tradeContractsService.trackByBkBl(body.bk, body.bl);
  }

  @Post('orders/eta-update')
  async batchEtaUpdate(@Body() body: BatchEtaUpdateDto, @Req() req: any) {
    const userId = req.user?.id;
    return this.tradeContractsService.batchEtaUpdate(body.orderIds, userId, 'MANUAL', body.filterParams);
  }

  @Put('orders/:id')
  async updateOrder(@Param('id') id: string, @Body() body: UpdateTradeOrderDto, @Req() req: any) {
    return this.tradeContractsService.updateTradeOrder(id, body, req.user?.id);
  }

  @Get('orders/:id/inbound')
  async getInbound(@Param('id') id: string) {
    return this.tradeContractsService.getTradeOrderInbound(id);
  }

  @Put('orders/:id/inbound')
  async updateInbound(@Param('id') id: string, @Body() body: UpdateTradeOrderInboundDto, @Req() req: any) {
    const userId = req.user?.id;
    return this.tradeContractsService.updateTradeOrderInbound(id, body, userId);
  }

  @Put('orders/:id/invoice')
  async saveInvoice(@Param('id') id: string, @Body() body: SaveInvoiceDto) {
    return this.tradeContractsService.saveInvoice(id, body);
  }

  @Delete('orders/:id')
  async deleteOrder(
    @Param('id') id: string,
    @Req() req: any,
    @Headers('x-client-path') clientPath?: string,
  ) {
    return this.tradeContractsService.deleteTradeOrder(id, req.user?.id, clientPath);
  }

  @Post('extract-text')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          if (!existsSync(TEMP_DIR)) {
            mkdirSync(TEMP_DIR, { recursive: true });
          }
          cb(null, TEMP_DIR);
        },
        filename: (req, file, cb) => {
          const timestamp = Date.now();
          const ext = extname(file.originalname);
          cb(null, `${timestamp}${ext}`);
        },
      }),
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  async extractText(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('파일이 업로드되지 않았습니다.');
    }

    const result = await this.tradeContractsService.extractContractText(file);
    return result;
  }

  @Post('orders/:id/invoice/analyze')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          if (!existsSync(INVOICE_TEMP_DIR)) {
            mkdirSync(INVOICE_TEMP_DIR, { recursive: true });
          }
          cb(null, INVOICE_TEMP_DIR);
        },
        filename: (req, file, cb) => {
          const timestamp = Date.now();
          const ext = extname(file.originalname);
          cb(null, `invoice-${timestamp}${ext}`);
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB (OpenAI API 제한 고려)
      },
      fileFilter: (req, file, cb) => {
        // PDF 파일만 허용
        if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
          cb(null, true);
        } else {
          cb(new BadRequestException('PDF 파일만 업로드 가능합니다.'), false);
        }
      },
    }),
  )
  async analyzeInvoice(
    @Param('id') id: string,
    @Body() body: { googleDriveFileId?: string },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: any,
  ) {
    if (!body.googleDriveFileId && !file) {
      throw new BadRequestException('파일 또는 구글 드라이브 파일 ID가 필요합니다.');
    }

    // 파일 크기 확인 (구글 드라이브 파일의 경우 서비스에서 확인)
    if (file && file.size > 50 * 1024 * 1024) {
      throw new BadRequestException('파일 크기는 50MB를 초과할 수 없습니다.');
    }

    const userId = req.user?.id;
    return this.tradeContractsService.analyzeInvoice(id, file, body.googleDriveFileId, userId);
  }

  /**
   * 계약(발주) 및 소속 부킹 전체 삭제.
   * `DELETE orders/:id`(부킹만)와 ID 충돌 없이 구분하기 위해 경로를 분리합니다.
   */
  @Delete(':id')
  async deleteContract(
    @Param('id') id: string,
    @Req() req: any,
    @Headers('x-client-path') clientPath?: string,
  ) {
    return this.tradeContractsService.deleteTradeContract(id, req.user?.id, clientPath);
  }
}

