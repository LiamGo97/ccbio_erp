import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ExchangeRateService, ExchangeRateResponse } from './exchange-rate.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('cost/exchange-rate')
@UseGuards(JwtAuthGuard)
export class ExchangeRateController {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  @Get()
  async getExchangeRate(
    @Query('date') date?: string,
    @Query('currency') currency?: string,
  ) {
    if (!date) {
      throw new BadRequestException('날짜(date) 파라미터가 필요합니다. (형식: YYYY-MM-DD)');
    }

    const currencyCode = currency || 'USD';
    const rate = await this.exchangeRateService.getExchangeRate(date, currencyCode);

    return {
      date,
      currency: currencyCode,
      rate,
    };
  }

  @Get('all')
  async getAllExchangeRates(@Query('date') date?: string): Promise<ExchangeRateResponse | null> {
    if (!date) {
      throw new BadRequestException('날짜(date) 파라미터가 필요합니다. (형식: YYYY-MM-DD)');
    }

    const result = await this.exchangeRateService.getAllExchangeRates(date);
    return result;
  }
}

