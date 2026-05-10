import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import type { Express } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LegalAdminMasterService } from './legal-admin-master.service';

const TEMP_DIR = './uploads/legal-admin-master/temp';

@Controller('legal-admin-master')
@UseGuards(JwtAuthGuard)
export class LegalAdminMasterController {
  constructor(private readonly service: LegalAdminMasterService) {}

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('sidoCode') sidoCode?: string,
    @Query('sigunguCode') sigunguCode?: string,
    @Query('q') q?: string,
  ) {
    return this.service.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      sortBy: sortBy || 'bCode',
      sortOrder: sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : 'asc',
      sidoCode: sidoCode?.trim(),
      sigunguCode: sigunguCode?.trim(),
      q: q?.trim(),
    });
  }

  @Get('sido-options')
  async sidoOptions() {
    return this.service.getSidoOptions();
  }

  @Get('sigungu-options')
  async sigunguOptions(@Query('sidoCode') sidoCode?: string) {
    if (!sidoCode?.trim()) {
      throw new BadRequestException('sidoCode가 필요합니다.');
    }
    return this.service.getSigunguOptions(sidoCode.trim());
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          if (!existsSync(TEMP_DIR)) {
            mkdirSync(TEMP_DIR, { recursive: true });
          }
          cb(null, TEMP_DIR);
        },
        filename: (req, file, cb) => {
          const timestamp = Date.now();
          const ext = extname(file.originalname).toLowerCase() || '.csv';
          cb(null, `legal-admin-${timestamp}${ext}`);
        },
      }),
      limits: { fileSize: 80 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const name = file.originalname.toLowerCase();
        const ok =
          name.endsWith('.csv') ||
          name.endsWith('.xlsx') ||
          name.endsWith('.xls') ||
          file.mimetype === 'text/csv' ||
          file.mimetype === 'application/csv' ||
          file.mimetype === 'application/vnd.ms-excel' ||
          file.mimetype ===
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        cb(
          ok ? null : new BadRequestException('CSV(.csv) 또는 Excel(.xlsx, .xls)만 업로드할 수 있습니다.'),
          ok,
        );
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('파일이 필요합니다.');
    }
    try {
      const result = await this.service.importFromFile(file.path, file.originalname);
      return {
        success: true,
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
        message: `법정동 마스터 ${result.imported}건을 반영했습니다. (건너뜀 ${result.skipped}행)`,
      };
    } finally {
      try {
        await unlink(file.path);
      } catch {
        // ignore
      }
    }
  }
}
