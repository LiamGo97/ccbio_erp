import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeatureAuditLogService, GetFeatureAuditLogsResponse } from './feature-audit-log.service';
import { CreateFeatureAuditLogDto } from './dto/create-feature-audit-log.dto';
import { GetFeatureAuditLogsDto } from './dto/get-feature-audit-logs.dto';
import { FeatureAuditLog } from './entities/feature-audit-log.entity';

@Controller('feature-audit-log')
@UseGuards(JwtAuthGuard)
export class FeatureAuditLogController {
  constructor(private readonly featureAuditLogService: FeatureAuditLogService) {}

  /** 로그 기록 (다른 모듈에서 호출하거나 수동 등록 시. userId 미제공 시 로그인 사용자로 설정) */
  @Post()
  async create(
    @Request() req: { user?: { id: number } },
    @Body() dto: CreateFeatureAuditLogDto,
  ): Promise<FeatureAuditLog> {
    const userId = dto.userId ?? req.user?.id ?? null;
    return this.featureAuditLogService.create({ ...dto, userId });
  }

  /** 목록 조회 (도메인·기능·액션·기간·담당자·요약 검색, 페이징) */
  @Get()
  async findAll(@Query() query: GetFeatureAuditLogsDto): Promise<GetFeatureAuditLogsResponse> {
    return this.featureAuditLogService.findAll(query);
  }

  /** 상세 조회 (단일 건, payload·작업자 포함) */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<FeatureAuditLog> {
    return this.featureAuditLogService.findOne(id);
  }
}
