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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { GetCustomersDto } from './dto/get-customers.dto';
import { CreateStatementNameDto } from './dto/create-statement-name.dto';
import { UpdateStatementNameDto } from './dto/update-statement-name.dto';
import { CreateCustomerDeliveryAddressDto } from './dto/create-customer-delivery-address.dto';
import { UpdateCustomerDeliveryAddressDto } from './dto/update-customer-delivery-address.dto';
import { CreateCustomerContactDto } from './dto/create-customer-contact.dto';
import { UpdateCustomerContactDto } from './dto/update-customer-contact.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Body() createCustomerDto: CreateCustomerDto) {
    return this.customersService.create(createCustomerDto);
  }

  @Get()
  findAll(@Query() query: GetCustomersDto) {
    return this.customersService.findWithPagination(query);
  }

  @Get('stats')
  getStats() {
    return this.customersService.getStats();
  }

  /**
   * 이벤트 문자 회신 등 엑셀(전화번호·급여·축종/운영·두수·비고·이름·농장명·주소) 미리보기.
   * DB 반영 없음.
   */
  @Post('import/event-sms/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (['.xlsx', '.xls'].includes(ext)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Excel 파일(.xlsx, .xls)만 업로드 가능합니다.'), false);
        }
      },
    }),
  )
  previewEventSmsImport(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('엑셀 파일을 선택해주세요.');
    }
    return this.customersService.previewEventSmsCustomerImport(file.buffer);
  }

  /**
   * 고객 엑셀 구조·데이터 1차 점검 (DB 미반영).
   * 헤더 행 자동 탐지, 열 매핑, 샘플 행, 전화번호 누락 행 요약.
   */
  @Post('import/excel/inspect')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (['.xlsx', '.xls'].includes(ext)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Excel 파일(.xlsx, .xls)만 업로드 가능합니다.'), false);
        }
      },
    }),
  )
  inspectCustomerExcelImport(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('엑셀 파일을 선택해주세요.');
    }
    return this.customersService.inspectCustomerExcelImport(file.buffer);
  }

  /** 미리보기와 동일 규칙으로 실제 반영 (같은 파일을 다시 업로드) */
  @Post('import/event-sms/apply')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (['.xlsx', '.xls'].includes(ext)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Excel 파일(.xlsx, .xls)만 업로드 가능합니다.'), false);
        }
      },
    }),
  )
  applyEventSmsImport(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('엑셀 파일을 선택해주세요.');
    }
    return this.customersService.applyEventSmsCustomerImport(file.buffer);
  }

  /** 고객별 활성 배송지 목록 (판매 등록 등에서 선택용) */
  @Get(':id/delivery-addresses')
  listDeliveryAddresses(@Param('id') id: string) {
    return this.customersService.listDeliveryAddresses(id);
  }

  @Get('export/excel')
  async exportToExcel(@Query() dto: GetCustomersDto, @Res() res: Response) {
    const buffer = await this.customersService.exportToExcel(dto);

    const filename = `고객_관리_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCustomerDto: UpdateCustomerDto) {
    return this.customersService.update(id, updateCustomerDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }

  @Post(':id/statement-names')
  addStatementName(@Param('id') id: string, @Body() dto: CreateStatementNameDto) {
    return this.customersService.addStatementName(id, dto);
  }

  @Patch(':id/statement-names/:snId')
  updateStatementName(
    @Param('id') id: string,
    @Param('snId') snId: string,
    @Body() dto: UpdateStatementNameDto,
  ) {
    return this.customersService.updateStatementName(id, snId, dto);
  }

  @Delete(':id/statement-names/:snId')
  removeStatementName(@Param('id') id: string, @Param('snId') snId: string) {
    return this.customersService.removeStatementName(id, snId);
  }

  @Post(':id/delivery-addresses')
  addDeliveryAddress(@Param('id') id: string, @Body() dto: CreateCustomerDeliveryAddressDto) {
    return this.customersService.addDeliveryAddress(id, dto);
  }

  @Patch(':id/delivery-addresses/:cdaId')
  updateDeliveryAddress(
    @Param('id') id: string,
    @Param('cdaId') cdaId: string,
    @Body() dto: UpdateCustomerDeliveryAddressDto,
  ) {
    return this.customersService.updateDeliveryAddress(id, cdaId, dto);
  }

  @Delete(':id/delivery-addresses/:cdaId')
  removeDeliveryAddress(@Param('id') id: string, @Param('cdaId') cdaId: string) {
    return this.customersService.removeDeliveryAddress(id, cdaId);
  }

  @Post(':id/contacts')
  addContact(@Param('id') id: string, @Body() dto: CreateCustomerContactDto) {
    return this.customersService.addContact(id, dto);
  }

  @Patch(':id/contacts/:cctId')
  updateContact(
    @Param('id') id: string,
    @Param('cctId') cctId: string,
    @Body() dto: UpdateCustomerContactDto,
  ) {
    return this.customersService.updateContact(id, cctId, dto);
  }

  @Delete(':id/contacts/:cctId')
  removeContact(@Param('id') id: string, @Param('cctId') cctId: string) {
    return this.customersService.removeContact(id, cctId);
  }
}


