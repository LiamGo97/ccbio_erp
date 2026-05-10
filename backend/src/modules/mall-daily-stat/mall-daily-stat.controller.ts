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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MallDailyStatService } from './mall-daily-stat.service';
import { CreateMallDailyStatDto } from './dto/create-mall-daily-stat.dto';
import { UpdateMallDailyStatDto } from './dto/update-mall-daily-stat.dto';
import { GetMallDailyStatsDto } from './dto/get-mall-daily-stats.dto';

@Controller('mall-daily-stats')
@UseGuards(JwtAuthGuard)
export class MallDailyStatController {
  constructor(private readonly service: MallDailyStatService) {}

  @Get('dashboard')
  getDashboard(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.getDashboard(startDate, endDate);
  }

  @Get()
  findAll(@Query() dto: GetMallDailyStatsDto) {
    return this.service.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateMallDailyStatDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMallDailyStatDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
    return { success: true };
  }
}
