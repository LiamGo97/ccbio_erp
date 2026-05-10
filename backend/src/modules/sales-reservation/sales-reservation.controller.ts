import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SalesReservationService } from './sales-reservation.service';
import { CreateSalesReservationDto } from './dto/create-sales-reservation.dto';
import { UpdateSalesReservationDto } from './dto/update-sales-reservation.dto';
import { GetSalesReservationsDto } from './dto/get-sales-reservations.dto';

@Controller('sales-reservations')
@UseGuards(JwtAuthGuard)
export class SalesReservationController {
  constructor(private readonly service: SalesReservationService) {}

  @Get('bl-lookup')
  lookupByBl(
    @Query('bl') bl: string,
    @Query('excludeReservationId') excludeReservationId?: string,
  ) {
    return this.service.lookupByBl(bl ?? '', excludeReservationId);
  }

  @Get()
  findAll(@Query() query: GetSalesReservationsDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSalesReservationDto, @Request() req: { user?: { id?: number } }) {
    return this.service.create(dto, req.user?.id ?? null);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSalesReservationDto,
    @Request() req: { user?: { id?: number } },
  ) {
    return this.service.update(id, dto, req.user?.id ?? null);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
