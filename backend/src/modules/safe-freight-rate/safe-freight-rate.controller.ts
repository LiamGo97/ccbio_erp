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
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import type { Express } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SafeFreightRateService } from './safe-freight-rate.service';
import { SafeFreightRate } from './entities/safe-freight-rate.entity';

const TEMP_DIR = './uploads/safe-freight-rates/temp';

@Controller('safe-freight-rates')
@UseGuards(JwtAuthGuard)
export class SafeFreightRateController {
  constructor(private readonly service: SafeFreightRateService) {}

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('region') region?: string,
    @Query('city') city?: string,
    @Query('townName') townName?: string,
    @Query('portCodeId') portCodeId?: string,
    @Query('distanceKm') distanceKm?: string,
    @Query('effectiveDate') effectiveDate?: string,
  ) {
    return this.service.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      sortBy: sortBy || 'createdAt',
      sortOrder: sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : 'desc',
      regionName: region?.trim() || undefined,
      cityName: city?.trim() || undefined,
      townName: townName?.trim() || undefined,
      portCodeId: portCodeId ? parseInt(portCodeId, 10) : undefined,
      distanceKm: distanceKm ? parseInt(distanceKm, 10) : undefined,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
    });
  }

  @Get('regions')
  async getRegionNames() {
    return this.service.getRegionNames();
  }

  @Get('cities')
  async getCityNames(@Query('region') region?: string) {
    return this.service.getCityNames(region?.trim() || '');
  }

  @Get('towns')
  async getTownNames(
    @Query('region') region?: string,
    @Query('city') city?: string,
  ) {
    return this.service.getTownNames(region?.trim() || '', city?.trim() || '');
  }

  @Get('distances')
  async getDistanceKmList() {
    return this.service.getDistanceKmList();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  async create(@Body() data: Partial<SafeFreightRate>) {
    return this.service.create(data as any);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<SafeFreightRate>,
  ) {
    return this.service.update(id, data);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
    return { success: true };
  }

  @Post('upload-excel-sheets')
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
          const ext = extname(file.originalname);
          cb(null, `safe-freight-excel-${timestamp}${ext}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const ok = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          file.mimetype === 'application/vnd.ms-excel' ||
          file.originalname.toLowerCase().endsWith('.xlsx') ||
          file.originalname.toLowerCase().endsWith('.xls');
        cb(ok ? null : new BadRequestException('Excel 파일(.xlsx, .xls)만 업로드 가능합니다.'), ok);
      },
    }),
  )
  async uploadExcelSheets(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Excel 파일이 필요합니다.');
    }
    const sheetNames = this.service.getExcelSheetNames(file.path);
    try {
      await unlink(file.path);
    } catch {
      // ignore
    }
    return { sheetNames };
  }

  @Post('upload-excel')
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
          const ext = extname(file.originalname);
          cb(null, `safe-freight-excel-${timestamp}${ext}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const ok = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          file.mimetype === 'application/vnd.ms-excel' ||
          file.originalname.toLowerCase().endsWith('.xlsx') ||
          file.originalname.toLowerCase().endsWith('.xls');
        cb(ok ? null : new BadRequestException('Excel 파일(.xlsx, .xls)만 업로드 가능합니다.'), ok);
      },
    }),
  )
  async uploadExcel(
    @UploadedFile() file: Express.Multer.File,
    @Body('sheetName') sheetName?: string,
    @Body('effectiveFrom') effectiveFrom?: string,
    @Body('effectiveTo') effectiveTo?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Excel 파일이 필요합니다.');
    }
    if (!sheetName?.trim()) {
      throw new BadRequestException('처리할 시트(항구)를 선택해주세요.');
    }
    const result = await this.service.importFromExcel(
      file.path,
      sheetName.trim(),
      effectiveFrom ? new Date(effectiveFrom) : new Date(),
      effectiveTo ? new Date(effectiveTo) : null,
    );
    return {
      success: true,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
      message: `해당 항구(${sheetName}) 요금표 ${result.imported}건을 import했습니다.`,
    };
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
          const ext = extname(file.originalname);
          cb(null, `safe-freight-rate-${timestamp}${ext}`);
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
      fileFilter: (req, file, cb) => {
        // PDF 파일만 허용
        if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
          cb(null, true);
        } else {
          cb(new BadRequestException('PDF 파일만 업로드 가능합니다.'), false);
        }
      },
    }),
  )
  async uploadPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body('effectiveFrom') effectiveFrom?: string,
    @Body('effectiveTo') effectiveTo?: string,
  ) {
    if (!file) {
      throw new BadRequestException('PDF 파일이 필요합니다.');
    }

    const result = await this.service.importFromPdf(
      file.path,
      effectiveFrom ? new Date(effectiveFrom) : new Date(),
      effectiveTo ? new Date(effectiveTo) : null,
    );

    return {
      success: true,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
      message: `총 ${result.imported}개의 안전운임 요금표를 import했습니다.`,
    };
  }
}

