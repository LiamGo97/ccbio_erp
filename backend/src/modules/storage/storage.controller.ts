import { Controller, Delete, Get, Post, Query, UploadedFile, UseInterceptors, UseGuards, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StorageService } from './storage.service';
import {
  compressImageForMms,
  MMS_IMAGE_TARGET_SIZE_KB,
} from '../../common/utils/mms-image-normalize';

@Controller('storage')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get('public-url')
  getPublicUrl(@Query('path') path: string) {
    if (!path || typeof path !== 'string' || path.trim() === '') {
      throw new BadRequestException('path 쿼리 파라미터가 필요합니다.');
    }
    const url = this.storageService.getPublicUrl(path.trim());
    return { url };
  }


  @Post('upload/image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('이미지 파일이 필요합니다.');
    }

    // 이미지 파일 타입 검증
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('이미지 파일만 업로드 가능합니다. (PNG, JPEG, GIF, WebP)');
    }

    let buffer: Buffer;
    try {
      buffer = await compressImageForMms(file.buffer, MMS_IMAGE_TARGET_SIZE_KB);
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : '이미지 처리에 실패했습니다. 다른 파일을 선택해 주세요.',
      );
    }

    const maxBytes = MMS_IMAGE_TARGET_SIZE_KB * 1024;
    if (buffer.length > maxBytes) {
      throw new BadRequestException(
        '이미지를 MMS 전송 한도(약 70KB) 이하로 줄이지 못했습니다. 더 단순한 이미지를 선택해 주세요.',
      );
    }

    const baseName = file.originalname.replace(/\.[^/.]+$/, '') || 'image';
    const sanitizedBase = baseName.replace(/[^a-zA-Z0-9.-]/g, '_') || 'image';
    const processed: Express.Multer.File = {
      ...file,
      buffer,
      mimetype: 'image/jpeg',
      size: buffer.length,
      originalname: `${sanitizedBase}.jpg`,
    };

    const result = await this.storageService.uploadFile(processed, 'trade-statements', true);
    return {
      success: true,
      url: result.url,
      path: result.path,
    };
  }

  @Post('upload/weighing-certificate')
  @UseInterceptors(FileInterceptor('file'))
  async uploadWeighingCertificate(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('이미지 파일이 필요합니다.');
    }

    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException('이미지 파일만 업로드 가능합니다. (PNG, JPEG, GIF, WebP)');
    }

    const result = await this.storageService.uploadFile(file, 'weighing-certificates', true);
    return {
      success: true,
      url: result.url,
      path: result.path,
    };
  }

  /** GCS에서 파일 삭제 (weighing-certificates, trade-statements 폴더 내 파일만 허용) */
  @Delete('file')
  async deleteFile(@Query('path') path: string) {
    if (!path || typeof path !== 'string' || path.trim() === '') {
      throw new BadRequestException('path 쿼리 파라미터가 필요합니다.');
    }
    const trimmed = path.trim();
    // path traversal 및 허용 폴더 검증
    if (trimmed.includes('..') || trimmed.startsWith('/')) {
      throw new BadRequestException('잘못된 경로입니다.');
    }
    const allowedPrefixes = ['weighing-certificates/', 'trade-statements/'];
    if (!allowedPrefixes.some((p) => trimmed.startsWith(p))) {
      throw new BadRequestException('허용되지 않은 경로입니다.');
    }
    await this.storageService.deleteFile(trimmed);
    return { success: true };
  }
}













