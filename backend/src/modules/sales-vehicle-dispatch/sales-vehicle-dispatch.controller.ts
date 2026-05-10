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
import { SalesVehicleDispatchService } from './sales-vehicle-dispatch.service';
import { CreateSalesVehicleDispatchDto } from './dto/create-sales-vehicle-dispatch.dto';
import { UpdateSalesVehicleDispatchDto } from './dto/update-sales-vehicle-dispatch.dto';

@Controller('sales/vehicle-dispatch')
@UseGuards(JwtAuthGuard)
export class SalesVehicleDispatchController {
  private readonly logger = new Logger(SalesVehicleDispatchController.name);

  constructor(private readonly service: SalesVehicleDispatchService) {}

  @Get()
  async findAll(
    @Request() req,
    @Query('salesId') salesId?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    const includeDeletedBool = includeDeleted === 'true';
    return this.service.findAll(salesId, includeDeletedBool);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    const includeDeletedBool = includeDeleted === 'true';
    return this.service.findOne(id, includeDeletedBool);
  }

  @Post()
  async create(@Body() dto: CreateSalesVehicleDispatchDto, @Request() req) {
    const userId = req.user?.id;
    this.logger.log(`[CREATE] 판매 연동 배차 생성 요청 - salesId: ${dto.salesId}, userId: ${userId}`);
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
    @Body() dto: UpdateSalesVehicleDispatchDto,
    @Request() req,
  ) {
    const userId = req.user?.id;
    this.logger.log(`[UPDATE] 판매 연동 배차 수정 요청 - ID: ${id}, userId: ${userId}`);
    try {
      const result = await this.service.update(id, dto, userId);
      this.logger.log(`[UPDATE] 수정 완료 - ID: ${id}`);
      return result;
    } catch (error) {
      this.logger.error(`[UPDATE] 수정 실패: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const userId = req.user?.id;
    this.logger.log(`[DELETE] 판매 연동 배차 삭제 요청 - ID: ${id}, userId: ${userId}`);
    return this.service.remove(id, userId);
  }
}








