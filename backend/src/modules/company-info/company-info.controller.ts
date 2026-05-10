import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyInfoService } from './company-info.service';
import { UpdateCompanyInfoDto } from './dto/update-company-info.dto';

@Controller('company-info')
@UseGuards(JwtAuthGuard)
export class CompanyInfoController {
  constructor(private readonly service: CompanyInfoService) {}

  @Get()
  async findOne() {
    return this.service.findOne();
  }

  @Put()
  async upsert(@Body() dto: UpdateCompanyInfoDto) {
    return this.service.upsert(dto);
  }
}

