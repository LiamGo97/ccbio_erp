import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { WarehouseIgobiService } from './warehouse-igobi.service';
import { CreateWarehouseIgobiDto } from './dto/create-warehouse-igobi.dto';
import { UpdateWarehouseIgobiDto } from './dto/update-warehouse-igobi.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WarehouseService } from '../warehouse/warehouse.service';

@Controller('warehouse-igobi')
@UseGuards(JwtAuthGuard)
export class WarehouseIgobiController {
  constructor(
    private readonly warehouseIgobiService: WarehouseIgobiService,
    private readonly warehouseService: WarehouseService,
  ) {}

  @Get()
  async findAll(
    @Query('warehouseCode') warehouseCode?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('baseDate') baseDate?: string,
  ) {
    let warehouseIdNum: number | undefined;
    
    if (warehouseCode) {
      const warehouses = await this.warehouseService.findAll({ search: warehouseCode.trim() });
      if (warehouses.length > 0) {
        warehouseIdNum = warehouses[0].id;
      }
    } else if (warehouseId) {
      warehouseIdNum = parseInt(warehouseId, 10);
    }

    return this.warehouseIgobiService.findAll({
      warehouseId: warehouseIdNum,
      baseDate,
    });
  }

  @Get('calculate')
  async calculate(
    @Query('warehouseCode') warehouseCode?: string,
    @Query('targetDate') targetDate?: string,
  ) {
    if (!warehouseCode || !targetDate) {
      throw new BadRequestException('warehouseCode, targetDate 값을 모두 제공해야 합니다.');
    }

    const igobi = await this.warehouseIgobiService.findApplicableIgobi(warehouseCode, targetDate);
    return { igobi };
  }

  @Post()
  async create(@Body() dto: CreateWarehouseIgobiDto) {
    return this.warehouseIgobiService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateWarehouseIgobiDto) {
    return this.warehouseIgobiService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.warehouseIgobiService.remove(id);
  }
}

