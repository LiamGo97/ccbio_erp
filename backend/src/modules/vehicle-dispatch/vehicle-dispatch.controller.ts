import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VehicleDispatchService } from './vehicle-dispatch.service';
import { CreateVehicleDispatchDto } from './dto/create-vehicle-dispatch.dto';
import { UpdateVehicleDispatchDto } from './dto/update-vehicle-dispatch.dto';

@Controller('vehicle-dispatch')
@UseGuards(JwtAuthGuard)
export class VehicleDispatchController {
  private readonly logger = new Logger(VehicleDispatchController.name);

  constructor(private readonly service: VehicleDispatchService) {}

  @Get()
  async findAll(
    @Request() req,
    @Query('dispatchCompanyId') dispatchCompanyId?: string,
    @Query('loadingWarehouseId') loadingWarehouseId?: string,
  ) {
    // 배차 업체 사용자인 경우 해당 업체의 배차만 조회
    // 창고 업체 사용자인 경우 해당 창고의 배차만 조회
    const userId = req.user?.id;
    const companyId = dispatchCompanyId ? parseInt(dispatchCompanyId, 10) : undefined;
    const warehouseId = loadingWarehouseId ? parseInt(loadingWarehouseId, 10) : undefined;
    return this.service.findAll(userId, companyId, warehouseId);
  }

  @Get('history/status-changes')
  async getStatusChangeHistory(
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.service.getStatusChangeHistory(limitNum);
  }

  @Get('history/all')
  async getAllChangeHistory(
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.service.getAllChangeHistory(limitNum);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateVehicleDispatchDto, @Request() req) {
    const userId = req.user?.id;
    this.logger.log(`[CREATE] 요청 받음 - userId: ${userId}`);
    this.logger.log(`[CREATE] DTO 데이터: ${JSON.stringify(dto, null, 2)}`);
    try {
      const result = await this.service.create(dto, userId);
      this.logger.log(`[CREATE] 성공 - 생성된 ID: ${result.id}`);
      return result;
    } catch (error) {
      this.logger.error(`[CREATE] 실패: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVehicleDispatchDto,
    @Request() req,
  ) {
    const userId = req.user?.id;
    this.logger.log(`[UPDATE] 배차 수정 요청 받음 - ID: ${id}, userId: ${userId}`);
    this.logger.log(`[UPDATE] 요청 DTO 전체: ${JSON.stringify(dto, null, 2)}`);
    this.logger.log(`[UPDATE] loadingWarehouseId 값: ${dto.loadingWarehouseId} (타입: ${typeof dto.loadingWarehouseId}, undefined 여부: ${dto.loadingWarehouseId === undefined})`);
    this.logger.log(`[UPDATE] dispatchCompanyId 값: ${dto.dispatchCompanyId} (타입: ${typeof dto.dispatchCompanyId}, undefined 여부: ${dto.dispatchCompanyId === undefined})`);
    try {
      const result = await this.service.update(id, dto, userId);
      this.logger.log(`[UPDATE] 수정 완료 - 저장된 loadingWarehouseId: ${result.loadingWarehouseId}`);
      this.logger.log(`[UPDATE] 수정 완료 - 저장된 dispatchCompanyId: ${result.dispatchCompanyId}`);
      return result;
    } catch (error) {
      this.logger.error(`[UPDATE] 수정 실패: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const userId = req.user?.id;
    await this.service.remove(id, userId);
    return { success: true };
  }

  @Post(':id/restore')
  async restore(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const userId = req.user?.id;
    const restored = await this.service.restore(id, userId);
    return restored;
  }
}

