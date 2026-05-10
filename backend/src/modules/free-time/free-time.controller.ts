import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { FreeTimeService } from './free-time.service';
import { CreateFreeTimeDto } from './dto/create-free-time.dto';
import { UpdateFreeTimeDto } from './dto/update-free-time.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('trade/free-time')
@UseGuards(JwtAuthGuard)
export class FreeTimeController {
  constructor(private readonly freeTimeService: FreeTimeService) {}

  @Get()
  async findAll(
    @Query('exporterCode') exporterCode?: string,
    @Query('shippingLineCode') shippingLineCode?: string,
    @Query('type') type?: string,
    @Query('baseDate') baseDate?: string,
  ) {
    return this.freeTimeService.findAll({
      exporterCode,
      shippingLineCode,
      type,
      baseDate,
    });
  }

  @Get('calculate')
  async calculate(
    @Query('exporterCode') exporterCode?: string,
    @Query('shippingLineCode') shippingLineCode?: string,
    @Query('eta') eta?: string,
  ) {
    if (!exporterCode || !shippingLineCode || !eta) {
      throw new BadRequestException('exporterCode, shippingLineCode, eta 값을 모두 제공해야 합니다.');
    }

    return this.freeTimeService.calculateFreeTimeDates({
      exporterCode,
      shippingLineCode,
      eta,
    });
  }

  @Post()
  async create(@Body() dto: CreateFreeTimeDto) {
    return this.freeTimeService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateFreeTimeDto) {
    return this.freeTimeService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.freeTimeService.remove(id);
  }
}



