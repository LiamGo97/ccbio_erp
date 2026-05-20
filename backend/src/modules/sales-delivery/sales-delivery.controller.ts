import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Logger,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SalesDeliveryService } from './sales-delivery.service';
import { CreateSalesDeliveryDto } from './dto/create-sales-delivery.dto';
import { UpdateSalesDeliveryDto } from './dto/update-sales-delivery.dto';

@Controller('deliveries')
@UseGuards(JwtAuthGuard)
export class SalesDeliveryController {
  private readonly logger = new Logger(SalesDeliveryController.name);

  constructor(private readonly service: SalesDeliveryService) {}

  @Get()
  async findAll(
    @Query('salesId') salesId?: string,
    @Query('status') status?: string | string[],
    @Query('search') search?: string,
    @Query('dispatchCompanyId') dispatchCompanyId?: string | string[],
    @Query('loadingWarehouseId') loadingWarehouseId?: string | string[],
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    const statuses = (() => {
      if (status === undefined || status === null || status === '') return undefined;
      const arr = Array.isArray(status) ? status : [status];
      if (arr.some((s) => String(s).toLowerCase() === '__none__')) return []; // 선택 안 함 = 결과 없음
      const filtered = arr.filter((s) => s && String(s).trim() !== '' && String(s).toLowerCase() !== 'all');
      return filtered.length > 0 ? filtered : undefined;
    })();
    const dispatchCompanyIds = (() => {
      const raw = dispatchCompanyId;
      if (raw === undefined || raw === null) return undefined;
      const arr = Array.isArray(raw) ? raw : [raw];
      if (arr.some((s) => String(s).toLowerCase() === '__none__')) return []; // 선택 안 함 = 결과 없음
      const parsed = arr.map((s) => parseInt(String(s), 10)).filter((n) => !isNaN(n) && n > 0);
      return parsed.length > 0 ? parsed : undefined;
    })();
    const loadingWarehouseIds = (() => {
      const raw = loadingWarehouseId;
      if (raw === undefined || raw === null) return undefined;
      const arr = Array.isArray(raw) ? raw : [raw];
      if (arr.some((s) => String(s).toLowerCase() === '__none__')) return []; // 선택 안 함 = 결과 없음
      const parsed = arr.map((s) => parseInt(String(s), 10)).filter((n) => !isNaN(n) && n > 0);
      return parsed.length > 0 ? parsed : undefined;
    })();
    return this.service.findAll(
      salesId,
      statuses,
      search,
      dispatchCompanyIds,
      loadingWarehouseIds,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      sortBy,
      sortOrder,
    );
  }

  @Get('mismatch')
  async getMismatch() {
    return this.service.getSalesTransportMismatch();
  }

  @Get('by-driver')
  async findAllGroupedByDriver(@Query('search') search?: string) {
    return this.service.findAllGroupedByDriver(search);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateSalesDeliveryDto, @Request() req) {
    const userId = req.user?.id;
    this.logger.log(`[CREATE] 배송 생성 요청 받음 - userId: ${userId}`);
    try {
      const result = await this.service.create(dto, userId);
      this.logger.log(`[CREATE] 성공 - 생성된 ID: ${result.id}, salesId: ${result.salesId}`);
      return result;
    } catch (error) {
      this.logger.error(`[CREATE] 실패: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSalesDeliveryDto,
    @Request() req,
  ) {
    const userId = req.user?.id;
    try {
      const result = await this.service.update(id, dto, userId);
      return result;
    } catch (error: any) {
      this.logger.error(
        `[배송 수정 500] deliveryId=${id}, message=${error?.message}, stack=${error?.stack?.slice(0, 500)}`,
      );
      if (error?.response) {
        this.logger.error(`[배송 수정 500] response: ${JSON.stringify(error.response?.data)}`);
      }
      throw error;
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req) {
    const userId = req.user?.id;
    this.logger.log(`[REMOVE] 배송 삭제 요청 받음 - ID: ${id}, userId: ${userId}`);
    try {
      const result = await this.service.remove(id, userId);
      this.logger.log(`[REMOVE] 삭제 완료 - ID: ${id}`);
      return result;
    } catch (error) {
      this.logger.error(`[REMOVE] 삭제 실패: ${error.message}`, error.stack);
      throw error;
    }
  }
}

