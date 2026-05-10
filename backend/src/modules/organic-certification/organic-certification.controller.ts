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
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { Express } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganicCertificationService } from './organic-certification.service';
import { CreateOrganicCertificationDto } from './dto/create-organic-certification.dto';
import { UpdateOrganicCertificationDto } from './dto/update-organic-certification.dto';
import { GetOrganicCertificationsDto } from './dto/get-organic-certifications.dto';

const TEMP_DIR = './uploads/organic-certification/temp';

@Controller('organic-certifications')
@UseGuards(JwtAuthGuard)
export class OrganicCertificationController {
  constructor(private readonly service: OrganicCertificationService) {}

  @Get()
  async findAll(@Query() dto: GetOrganicCertificationsDto) {
    return this.service.findAll(dto);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateOrganicCertificationDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrganicCertificationDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.service.remove(id);
    return { success: true };
  }

  @Get('stats/summary')
  async getStats() {
    return this.service.getStats();
  }

  @Get('export/excel')
  async exportToExcel(@Query() dto: GetOrganicCertificationsDto, @Res() res: Response) {
    const buffer = await this.service.exportToExcel(dto);

    const filename = `유기축산_인증_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
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
          cb(null, `organic-certification-${timestamp}${ext}`);
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
      fileFilter: (req, file, cb) => {
        // Excel 파일만 허용
        const allowedMimes = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'application/vnd.ms-excel', // .xls
        ];
        const allowedExtensions = ['.xlsx', '.xls'];
        const ext = extname(file.originalname).toLowerCase();

        if (
          allowedMimes.includes(file.mimetype) ||
          allowedExtensions.includes(ext)
        ) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Excel 파일만 업로드 가능합니다. (.xlsx, .xls)'), false);
        }
      },
    }),
  )
  async uploadExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Excel 파일이 필요합니다.');
    }

    const result = await this.service.importFromExcel(file.path);

    return {
      success: true,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors,
      message: `총 ${result.imported}개의 유기축산 인증 정보를 import했습니다.`,
    };
  }
}

