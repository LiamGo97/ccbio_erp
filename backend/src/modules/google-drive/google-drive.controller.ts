import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { GoogleDriveService } from './google-drive.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CustomersService } from '../customers/customers.service';

@Controller('google-drive')
@UseGuards(JwtAuthGuard)
export class GoogleDriveController {
  constructor(
    private readonly googleDriveService: GoogleDriveService,
    private readonly customersService: CustomersService,
  ) {}

  @Get('files')
  async listFiles(
    @Req() req,
    @Query('query') query?: string,
    @Query('pageSize') pageSize?: number,
    @Query('pageToken') pageToken?: string,
    @Query('folderId') folderId?: string,
    @Query('driveId') driveId?: string,
  ) {
    const userId = req.user.id;
    return this.googleDriveService.listFiles(
      userId,
      query,
      pageSize || 10,
      pageToken,
      folderId,
      driveId,
    );
  }

  @Get('folders')
  async listFolders(@Req() req, @Query('driveId') driveId?: string) {
    const userId = req.user.id;
    return this.googleDriveService.listFolders(userId, driveId);
  }

  @Get('shared-drives')
  async listSharedDrives(@Req() req) {
    const userId = req.user.id;
    return this.googleDriveService.listSharedDrives(userId);
  }

  @Get('files/:fileId')
  async getFileMetadata(@Req() req, @Param('fileId') fileId: string) {
    const userId = req.user.id;
    return this.googleDriveService.getFileMetadata(userId, fileId);
  }

  @Get('files/:fileId/download')
  async downloadFile(@Req() req, @Param('fileId') fileId: string, @Res() res: Response) {
    const userId = req.user.id;
    const { metadata, stream } = await this.googleDriveService.downloadFile(userId, fileId);

    res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.name}"`);

    stream.pipe(res);
  }

  @Post('files/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('folderId') folderId?: string,
    @Body('driveId') driveId?: string,
  ) {
    const userId = req.user.id;
    return this.googleDriveService.uploadFile(
      userId,
      file.originalname,
      file.mimetype,
      file.buffer,
      folderId,
      driveId,
    );
  }

  @Post('files/upload/vehicle-dispatch')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFileForVehicleDispatch(
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('warehouseId', ParseIntPipe) warehouseId: number,
  ) {
    const userId = req.user.id;
    return this.googleDriveService.uploadFileForVehicleDispatch(
      userId,
      file.originalname,
      file.mimetype,
      file.buffer,
      warehouseId,
    );
  }

  @Delete('files/:fileId')
  async deleteFile(@Req() req, @Param('fileId') fileId: string) {
    const userId = req.user.id;
    return this.googleDriveService.deleteFile(userId, fileId);
  }

  @Post('sheets/customers')
  async writeCustomersToSheet(
    @Req() req,
    @Body('spreadsheetId') spreadsheetId: string,
    @Body('sheetGid') sheetGid?: string,
  ) {
    const userId = req.user.id;

    if (!spreadsheetId) {
      throw new Error('시트 ID가 필요합니다.');
    }

    // 모든 고객 데이터 가져오기 (페이지네이션 없이)
    const { data: customers } = await this.customersService.findWithPagination({
      page: 1,
      limit: 10000, // 충분히 큰 수
    });

    const formatDefaultAddressLine = (customer: {
      addressRoad?: string | null;
      addressJibun?: string | null;
      addressDefaultType?: string | null;
      address?: string | null;
    }): string => {
      const road = customer.addressRoad?.trim() || '';
      const jibun = customer.addressJibun?.trim() || '';
      const def = (customer.addressDefaultType?.trim() || '').toUpperCase();
      if (def === 'JIBUN' || def === 'J' || def === 'LOT') return jibun || road || customer.address?.trim() || '';
      return road || jibun || customer.address?.trim() || '';
    };

    // 고객 데이터를 시트 형식으로 변환
    const sheetData = customers.map((customer) => ({
      companyName: customer.companyName || '',
      ceo: customer.ceo || '',
      phone: customer.phone || '',
      addressLine: formatDefaultAddressLine(customer),
      addressDetail: customer.addressDetail || '',
      postalCode: customer.postalCode || '',
      chamchamStatus: customer.chamchamStatus || '',
    }));

    return this.googleDriveService.writeCustomersToSheet(userId, spreadsheetId, sheetData, sheetGid);
  }
}

