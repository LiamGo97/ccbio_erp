import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import { SmsTemplatesService } from './sms-templates.service';
import { CreateSmsTemplateDto } from './dto/create-sms-template.dto';
import { UpdateSmsTemplateDto } from './dto/update-sms-template.dto';
import { GetSmsTemplatesDto } from './dto/get-sms-templates.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('sms-templates')
@UseGuards(JwtAuthGuard)
export class SmsTemplatesController {
  constructor(private readonly smsTemplatesService: SmsTemplatesService) {}

  @Post()
  create(@Body() createSmsTemplateDto: CreateSmsTemplateDto, @Request() req: any) {
    const userId = req.user?.id;
    return this.smsTemplatesService.create(createSmsTemplateDto, userId);
  }

  @Get()
  findAll(@Query() query: GetSmsTemplatesDto) {
    return this.smsTemplatesService.findAll(query);
  }

  @Get('type/:type')
  findByType(
    @Param('type') type: string,
    @Query('supplierId') supplierId?: string,
  ) {
    const supplierIdNum = supplierId ? parseInt(supplierId, 10) : undefined;
    return this.smsTemplatesService.findByType(type, supplierIdNum);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.smsTemplatesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSmsTemplateDto: UpdateSmsTemplateDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id;
    console.log('[SMS 템플릿 수정] Controller 수신:', {
      id,
      updateSmsTemplateDto,
      userId,
    });
    const result = this.smsTemplatesService.update(id, updateSmsTemplateDto, userId);
    result.then((updated) => {
      console.log('[SMS 템플릿 수정] Controller 응답:', updated);
    }).catch((error) => {
      console.error('[SMS 템플릿 수정] Controller 오류:', error);
    });
    return result;
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.smsTemplatesService.remove(id);
  }
}
