import { Controller, Get, Put, Body, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InboundDefaultsService } from './inbound-defaults.service';
import { UpdateInboundDefaultsDto } from './dto/update-inbound-defaults.dto';

@Controller('inbound-defaults')
@UseGuards(JwtAuthGuard)
export class InboundDefaultsController {
  constructor(private readonly service: InboundDefaultsService) {}

  @Get()
  async getDefaults() {
    return this.service.getDefaults();
  }

  @Put()
  async updateDefaults(
    @Body() dto: UpdateInboundDefaultsDto,
    @Req() req: { user?: { id?: number } },
  ) {
    const userId = req.user?.id;
    return this.service.updateDefaults(dto, userId);
  }

  @Get('history')
  async getHistory(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 50;
    return this.service.getHistory(Number.isFinite(parsed) ? parsed : 50);
  }
}
