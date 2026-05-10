import { Controller, Get, Post, Body, Query, UseGuards, Logger, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AligoService } from './aligo.service';
import { SendSmsDto } from './dto/send-sms.dto';
import { GetSmsListDto } from './dto/get-sms-list.dto';
import { GetSmsDetailDto } from './dto/get-sms-detail.dto';

@Controller('aligo')
@UseGuards(JwtAuthGuard)
export class AligoController {
  private readonly logger = new Logger(AligoController.name);
  
  constructor(private readonly aligoService: AligoService) {}

  /**
   * 잔액 조회
   */
  @Get('balance')
  async getBalance() {
    return this.aligoService.getBalance();
  }

  /**
   * SMS 발송
   */
  @Post('sms/send')
  async sendSms(@Body() dto: SendSmsDto, @Request() req: any) {
    this.logger.log(
      `[SMS 발송 요청 수신] 수신자 수: ${dto.recipients?.length || 0}, 메시지 길이: ${dto.message?.length || 0}, 이미지1: ${!!dto.imageUrl}, 이미지2: ${!!dto.imageUrl2}`,
    );
    try {
      // Request에서 사용자 ID 추출하여 이력 저장에 사용
      const userId = req.user?.id;
      if (userId && !dto.createdById) {
        dto.createdById = userId;
      }
      
      const result = await this.aligoService.sendSms(dto);
      this.logger.log(`[SMS 발송 요청 완료] 성공: ${result.success}, 타입: ${result.type}, 결과 수: ${result.results?.length || 0}`);
      return result;
    } catch (error) {
      this.logger.error(`[SMS 발송 요청 실패] ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * 전송 결과 목록 조회
   */
  @Get('sms/list')
  async getSmsList(@Query() dto: GetSmsListDto) {
    return this.aligoService.getSmsList(dto);
  }

  /**
   * 전송 결과 상세 조회
   */
  @Get('sms/detail')
  async getSmsDetail(@Query() dto: GetSmsDetailDto) {
    return this.aligoService.getSmsDetail(dto);
  }
}

