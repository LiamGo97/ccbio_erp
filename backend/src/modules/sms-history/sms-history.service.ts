import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsHistory } from './entities/sms-history.entity';

export interface CreateSmsHistoryDto {
  // 템플릿 정보
  templateId?: number | null;
  templateType: string;
  templateContent?: string | null;

  // 발송 대상 정보
  recipientPhone: string;
  recipientName?: string | null;
  senderPhone: string;
  senderUserId?: number | null;

  // 메시지 정보
  message: string;
  messageType: string; // SMS, LMS, MMS
  imageUrl?: string | null;
  imagePath?: string | null; // GCS 경로
  imageUrl2?: string | null;
  imagePath2?: string | null;

  // 연관 정보
  invoiceId?: number | null;
  relatedId?: number | null;
  relatedType?: string | null;

  // 발송 결과 (알리고 API 응답)
  aligoMid?: string | null;
  aligoMdid?: string | null;
  status?: string | null;
  aligoStatus?: string | null;
  resultCode?: string | null;
  resultMessage?: string | null;
  smsCount?: number | null;
  failCount?: number;

  // 발송 시간
  sentAt?: Date | null;
  doneAt?: Date | null;
  reservedAt?: Date | null;

  // 재발송 정보
  isResent?: boolean;
  originalHistoryId?: number | null;

  // 메타 정보
  createdById?: number | null;
  notes?: string | null;
}

@Injectable()
export class SmsHistoryService {
  constructor(
    @InjectRepository(SmsHistory)
    private smsHistoryRepository: Repository<SmsHistory>,
  ) {}

  async create(dto: CreateSmsHistoryDto): Promise<SmsHistory> {
    const history = this.smsHistoryRepository.create({
      ...dto,
      failCount: dto.failCount ?? 0,
      isResent: dto.isResent ?? false,
    });

    return this.smsHistoryRepository.save(history);
  }

  async findByInvoiceId(invoiceId: number): Promise<SmsHistory[]> {
    return this.smsHistoryRepository.find({
      where: { invoiceId },
      relations: ['template', 'senderUser', 'createdBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<SmsHistory | null> {
    return this.smsHistoryRepository.findOne({
      where: { id },
      relations: ['template', 'senderUser', 'createdBy', 'originalHistory'],
    });
  }

  async findAll(params?: {
    invoiceId?: number;
    templateType?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: SmsHistory[]; total: number; page: number; limit: number; totalPages: number }> {
    const { page = 1, limit = 50, invoiceId, templateType, status } = params || {};

    const queryBuilder = this.smsHistoryRepository.createQueryBuilder('history');

    if (invoiceId) {
      queryBuilder.andWhere('history.invoiceId = :invoiceId', { invoiceId });
    }

    if (templateType) {
      queryBuilder.andWhere('history.templateType = :templateType', { templateType });
    }

    if (status) {
      queryBuilder.andWhere('history.status = :status', { status });
    }

    const total = await queryBuilder.getCount();

    queryBuilder
      .leftJoinAndSelect('history.template', 'template')
      .leftJoinAndSelect('history.senderUser', 'senderUser')
      .leftJoinAndSelect('history.createdBy', 'createdBy')
      .orderBy('history.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const data = await queryBuilder.getMany();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async update(id: number, updateData: Partial<CreateSmsHistoryDto>): Promise<SmsHistory> {
    const history = await this.findOne(id);
    if (!history) {
      throw new Error('SMS 이력을 찾을 수 없습니다.');
    }

    Object.assign(history, updateData);
    return this.smsHistoryRepository.save(history);
  }
}
