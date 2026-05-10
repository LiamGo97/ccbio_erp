import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetConsultationsDto } from './dto/get-consultations.dto';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import {
  ConsultationCustomerQuickSearchResult,
  ConsultationListResponse,
  ConsultationLookupResponse,
  ConsultationResponse,
} from './dto/consultation-response.dto';

@Controller('consultations')
@UseGuards(JwtAuthGuard)
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Get()
  findAll(@Query() query: GetConsultationsDto): Promise<ConsultationListResponse> {
    return this.consultationsService.findAll(query);
  }

  @Get('lookup')
  lookup(@Query('phone') phone: string): Promise<ConsultationLookupResponse> {
    return this.consultationsService.lookupByPhone(phone);
  }

  @Get('search/company')
  searchCompany(
    @Query('keyword') keyword: string,
  ): Promise<ConsultationCustomerQuickSearchResult[]> {
    return this.consultationsService.searchCustomersByKeyword(keyword);
  }

  @Get('search/phone')
  searchPhone(
    @Query('phone') phone: string,
  ): Promise<ConsultationCustomerQuickSearchResult[]> {
    return this.consultationsService.searchCustomersByPhone(phone);
  }

  @Get('stats/daily')
  getDailyStats(
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('managerId') managerId?: string,
  ) {
    const parsedManagerId = managerId ? parseInt(managerId, 10) : undefined;
    const parsedYear = year ? parseInt(year, 10) : undefined;
    const parsedMonth = month ? parseInt(month, 10) : undefined;
    return this.consultationsService.getDailyStats({
      year: parsedYear,
      month: parsedMonth,
      startDate,
      endDate,
      managerId: parsedManagerId,
    });
  }

  @Get('stats/species')
  getSpeciesDistribution(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('managerId') managerId?: string,
  ) {
    const parsedManagerId = managerId ? parseInt(managerId, 10) : undefined;
    return this.consultationsService.getSpeciesDistribution({
      startDate,
      endDate,
      managerId: parsedManagerId,
    });
  }

  @Get('stats/regions')
  getRegionDistribution(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('managerId') managerId?: string,
  ) {
    const parsedManagerId = managerId ? parseInt(managerId, 10) : undefined;
    return this.consultationsService.getRegionDistribution({
      startDate,
      endDate,
      managerId: parsedManagerId,
    });
  }

  @Get('stats/operation-subtype')
  getOperationSubtypeDistribution(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('managerId') managerId?: string,
    @Query('operationType') operationType?: 'BEEF' | 'DAIRY',
  ) {
    const parsedManagerId = managerId ? parseInt(managerId, 10) : undefined;
    if (!operationType || (operationType !== 'BEEF' && operationType !== 'DAIRY')) {
      throw new BadRequestException('operationType은 BEEF 또는 DAIRY여야 합니다.');
    }
    return this.consultationsService.getOperationSubtypeDistribution({
      startDate: startDate!,
      endDate: endDate!,
      managerId: parsedManagerId,
      operationType,
    });
  }

  @Get('stats/consultation-types')
  getConsultationTypeDistribution(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('managerId') managerId?: string,
  ) {
    const parsedManagerId = managerId ? parseInt(managerId, 10) : undefined;
    return this.consultationsService.getConsultationTypeDistribution({
      startDate: startDate!,
      endDate: endDate!,
      managerId: parsedManagerId,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<ConsultationResponse> {
    return this.consultationsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateConsultationDto): Promise<ConsultationResponse> {
    return this.consultationsService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateConsultationDto,
  ): Promise<ConsultationResponse> {
    return this.consultationsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.consultationsService.remove(id);
  }
}

