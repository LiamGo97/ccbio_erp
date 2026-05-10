import { Controller, Get, Query, Param, Post, Body, Put, Patch, Delete, UseGuards, NotFoundException, BadRequestException, Request, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReceivablesService, GetReceivablesResponse, CompareWithExcelResult } from './receivables.service';
import { GetReceivablesDto } from './dto/get-receivables.dto';
import { GetCollectionsDto } from './dto/get-collections.dto';
import { CollectReceivableDto } from './dto/collect-receivable.dto';
import { CollectByCustomerDto } from './dto/collect-by-customer.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { UpdateReceivableWarningConfigDto } from './dto/update-receivable-warning-config.dto';
import { CreateReceivableWarningConfigDto } from './dto/create-receivable-warning-config.dto';
import { BatchUpdateSmsExcludedDto } from './dto/batch-update-sms-excluded.dto';
import { UpdatePaymentTermsDto } from './dto/update-payment-terms.dto';
import { UpdateReceivableNotesDto } from './dto/update-receivable-notes.dto';
import { SendReceivableWarningSmsDto } from './dto/send-receivable-warning-sms.dto';
import { ReceivableWarningConfig } from './entities/receivable-warning-config.entity';
import { GetCollectionsResponse } from './receivables.service';

@Controller('receivables')
@UseGuards(JwtAuthGuard)
export class ReceivablesController {
  constructor(private readonly receivablesService: ReceivablesService) {}

  @Get()
  async findAll(@Query() query: GetReceivablesDto): Promise<GetReceivablesResponse> {
    return this.receivablesService.findAll(query);
  }

  // warning-configs 라우트를 :id 라우트보다 먼저 정의해야 함
  @Get('warning-configs')
  async getWarningConfigs(@Request() req): Promise<ReceivableWarningConfig[]> {
    const userId = req.user?.id;
    return this.receivablesService.findAllWarningConfigs(userId);
  }

  @Post('warning-configs')
  async createWarningConfig(
    @Request() req,
    @Body() dto: CreateReceivableWarningConfigDto,
  ): Promise<ReceivableWarningConfig> {
    // userId가 제공되지 않으면 현재 로그인한 사용자 ID 사용
    if (dto.userId === undefined) {
      dto.userId = req.user?.id ?? null;
    }
    return this.receivablesService.createWarningConfig(dto);
  }

  @Put('warning-configs/:id')
  async updateWarningConfig(
    @Param('id') id: string,
    @Body() dto: UpdateReceivableWarningConfigDto,
  ): Promise<ReceivableWarningConfig> {
    return this.receivablesService.updateWarningConfig(Number(id), dto);
  }

  @Delete('warning-configs/:id')
  async deleteWarningConfig(@Param('id') id: string): Promise<{ message: string }> {
    await this.receivablesService.deleteWarningConfig(Number(id));
    return { message: '채권 경고 설정이 삭제되었습니다.' };
  }

  @Post('update-warning-statuses')
  async updateWarningStatuses() {
    return this.receivablesService.updateWarningStatuses();
  }

  @Get('summary/monthly')
  async getMonthlyReceivablesSummary(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    const yearNum = year ? parseInt(year, 10) : now.getFullYear();
    const monthNum = month ? parseInt(month, 10) : now.getMonth() + 1;
    if (Number.isNaN(yearNum) || Number.isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      throw new BadRequestException('year, month 파라미터가 올바르지 않습니다.');
    }
    return this.receivablesService.getMonthlyReceivablesSummary(yearNum, monthNum);
  }

  @Get('customers/with-receivables')
  async getCustomersWithReceivables(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('warningStatus') warningStatus?: string | string[],
    @Query('excludeZeroBalance') excludeZeroBalance?: string,
    @Query('supplierIds') supplierIds?: string | string[],
    @Query('customerType') customerType?: string,
    @Query('dueDateLte') dueDateLte?: string,
    @Query('balanceCategories') balanceCategories?: string | string[],
    @Query('minReceivableBalance') minReceivableBalance?: string,
  ) {
    const balanceCategoriesRaw = balanceCategories
      ? (Array.isArray(balanceCategories) ? balanceCategories : [balanceCategories]).filter(
          (v) => v != null && String(v).length > 0,
        )
      : undefined;
    const balanceCategoriesForService =
      balanceCategoriesRaw && balanceCategoriesRaw.includes('__EMPTY__')
        ? []
        : balanceCategoriesRaw;

    const minReceivableBalanceParsed = minReceivableBalance?.trim()
      ? parseFloat(minReceivableBalance.trim())
      : undefined;
    const minReceivableBalanceForService =
      minReceivableBalanceParsed != null &&
      !Number.isNaN(minReceivableBalanceParsed) &&
      minReceivableBalanceParsed > 0
        ? minReceivableBalanceParsed
        : undefined;

    // warningStatus를 배열로 변환 (단일 값이면 배열로, 이미 배열이면 그대로)
    // 'null' 또는 '__null__' 문자열을 null로 변환
    // '__EMPTY__'는 빈 배열을 나타내는 특별한 값
    const warningStatusArray = warningStatus
      ? (Array.isArray(warningStatus) ? warningStatus : [warningStatus]).map((v) => {
          if (v === 'null' || v === '__null__' || v === '') {
            return null;
          }
          return v;
        })
      : undefined;

    const excludeZero = excludeZeroBalance === 'true' || excludeZeroBalance === '1';

    const supplierIdsNum: number[] | undefined = supplierIds
      ? (Array.isArray(supplierIds) ? supplierIds : [supplierIds])
          .map((v) => parseInt(String(v), 10))
          .filter((n) => !Number.isNaN(n))
      : undefined;

    // '__EMPTY__'가 포함되어 있으면 빈 배열로 변환 (전체 해제)
    if (warningStatusArray && warningStatusArray.includes('__EMPTY__')) {
      return this.receivablesService.findCustomersWithReceivables(
        search,
        page ? parseInt(page, 10) : 1,
        limit ? parseInt(limit, 10) : 20,
        sortBy,
        sortOrder as 'asc' | 'desc' | undefined,
        [], // 빈 배열 전달
        excludeZero,
        supplierIdsNum,
        customerType,
        dueDateLte,
        balanceCategoriesForService,
        minReceivableBalanceForService,
      );
    }

    return this.receivablesService.findCustomersWithReceivables(
      search,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      sortBy,
      sortOrder as 'asc' | 'desc' | undefined,
      warningStatusArray,
      excludeZero,
      supplierIdsNum,
      customerType,
      dueDateLte,
      balanceCategoriesForService,
      minReceivableBalanceForService,
    );
  }

  @Get('customers/balance-by-cutoff')
  async getCustomersWithBalanceByCutoff(
    @Query('cutoffDate') cutoffDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('search') search?: string,
    @Query('customerType') customerType?: string,
    @Query('supplierIds') supplierIds?: string | string[],
    @Query('excludeZeroBalance') excludeZeroBalance?: string,
  ) {
    if (!cutoffDate || !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate.trim())) {
      return { data: [], total: 0, page: 1, limit: 20, lastPage: 1 };
    }
    const excludeZero = excludeZeroBalance !== 'false' && excludeZeroBalance !== '0';
    const supplierIdsNum: number[] | undefined = supplierIds
      ? (Array.isArray(supplierIds) ? supplierIds : [supplierIds])
          .map((v) => parseInt(String(v), 10))
          .filter((n) => !Number.isNaN(n))
      : undefined;
    return this.receivablesService.findCustomersWithBalanceByCutoff(
      cutoffDate.trim(),
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      sortBy,
      sortOrder as 'asc' | 'desc' | undefined,
      search?.trim() || undefined,
      customerType,
      supplierIdsNum,
      excludeZero,
    );
  }

  @Post('compare-with-excel')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = './uploads/receivables-compare/temp';
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const timestamp = Date.now();
          const ext = extname(file.originalname) || '.xlsx';
          cb(null, `icount-compare-${timestamp}${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowed = ['.xlsx', '.xls'];
        const ext = extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Excel 파일(.xlsx, .xls)만 업로드 가능합니다.'), false);
        }
      },
    }),
  )
  async compareWithExcel(
    @UploadedFile() file: Express.Multer.File,
    @Query('supplierIds') supplierIds?: string | string[],
  ): Promise<CompareWithExcelResult> {
    if (!file) {
      throw new BadRequestException('이카운트 엑셀 파일을 선택해주세요.');
    }
    const supplierIdsNum: number[] | undefined = supplierIds
      ? (Array.isArray(supplierIds) ? supplierIds : [supplierIds])
          .map((v) => parseInt(String(v), 10))
          .filter((n) => !Number.isNaN(n) && n > 0)
      : undefined;
    return this.receivablesService.compareWithExcel(file.path, supplierIdsNum);
  }

  @Get('customers/:customerId/ledger')
  async getCustomerLedger(
    @Param('customerId') customerId: string,
    @Query() query: { startDate?: string; endDate?: string },
  ) {
    return this.receivablesService.getCustomerLedger(customerId, query);
  }

  @Get('customers/:customerId/prepayment-requests')
  async findPrepaymentRequests(@Param('customerId') customerId: string) {
    return this.receivablesService.findPrepaymentRequests(customerId);
  }

  @Patch('customers/:customerId/sms-excluded')
  async updateSmsExcluded(
    @Param('customerId') customerId: string,
    @Body() dto: { smsExcluded: boolean },
  ) {
    return this.receivablesService.updateSmsExcluded(customerId, dto.smsExcluded);
  }

  @Post('send-warning-sms')
  async sendReceivableWarningSms(@Body() dto: SendReceivableWarningSmsDto, @Request() req: any) {
    const userId = req.user?.id;
    return this.receivablesService.sendReceivableWarningSms(dto, userId);
  }

  @Get('sms-batch-history')
  async getSmsBatchHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.receivablesService.findSmsBatchHistory(
      Number.isNaN(pageNum) ? 1 : pageNum,
      Number.isNaN(limitNum) ? 20 : Math.min(100, limitNum),
    );
  }

  @Patch('customers/sms-excluded/batch')
  async batchUpdateSmsExcluded(
    @Body() dto: BatchUpdateSmsExcludedDto,
  ) {
    return this.receivablesService.batchUpdateSmsExcluded(
      dto.customerIds,
      dto.smsExcluded,
    );
  }

  @Get('collections')
  async findAllCollections(@Query() query: GetCollectionsDto): Promise<GetCollectionsResponse> {
    return this.receivablesService.findAllCollections(query);
  }

  @Post('customers/:customerId/collect')
  async collectByCustomer(@Param('customerId') customerId: string, @Body() dto: CollectByCustomerDto) {
    return this.receivablesService.collectByCustomer(customerId, dto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const receivable = await this.receivablesService.findOne(id);
    if (!receivable) {
      throw new NotFoundException('채권을 찾을 수 없습니다.');
    }
    return receivable;
  }

  @Get(':id/collections')
  async findCollections(@Param('id') id: string) {
    return this.receivablesService.findCollections(id);
  }

  @Post(':id/collect')
  async collect(@Param('id') id: string, @Body() dto: CollectReceivableDto) {
    return this.receivablesService.collect(id, dto);
  }

  @Put(':id/collections/:collectionId')
  async updateCollection(
    @Param('id') id: string,
    @Param('collectionId') collectionId: string,
    @Body() dto: UpdateCollectionDto,
  ) {
    return this.receivablesService.updateCollection(id, collectionId, dto);
  }

  @Delete(':id/collections/:collectionId')
  async deleteCollection(@Param('id') id: string, @Param('collectionId') collectionId: string) {
    return this.receivablesService.deleteCollection(id, collectionId);
  }

  @Patch(':id/payment-terms')
  async updatePaymentTerms(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentTermsDto,
  ) {
    return this.receivablesService.updatePaymentTerms(
      id,
      dto.paymentTermsType,
      dto.paymentTermsValue,
    );
  }

  @Patch(':id/notes')
  async updateReceivableNotes(
    @Param('id') id: string,
    @Body() dto: UpdateReceivableNotesDto,
  ) {
    return this.receivablesService.updateReceivableNotes(id, dto.notes ?? null);
  }
}
