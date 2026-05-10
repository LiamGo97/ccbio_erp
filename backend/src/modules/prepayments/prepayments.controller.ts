import {
  Controller,
  Get,
  Query,
  Param,
  Put,
  Post,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrepaymentsService, GetPrepaymentsResponse } from './prepayments.service';
import { GetPrepaymentsDto } from './dto/get-prepayments.dto';
import { ConfirmPrepaymentDto } from './dto/confirm-prepayment.dto';
import { UpdatePrepaymentDto } from './dto/update-prepayment.dto';

@Controller('prepayments')
@UseGuards(JwtAuthGuard)
export class PrepaymentsController {
  constructor(private readonly prepaymentsService: PrepaymentsService) {}

  @Get()
  async findAll(@Query() query: GetPrepaymentsDto): Promise<GetPrepaymentsResponse> {
    return this.prepaymentsService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const prepayment = await this.prepaymentsService.findOne(id);
    if (!prepayment) {
      throw new NotFoundException('선입금을 찾을 수 없습니다.');
    }
    return prepayment;
  }

  @Put(':id/confirm')
  async confirm(@Param('id') id: string, @Body() dto: ConfirmPrepaymentDto) {
    return this.prepaymentsService.confirm(id, dto);
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    return this.prepaymentsService.cancel(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePrepaymentDto) {
    return this.prepaymentsService.update(id, dto);
  }
}
