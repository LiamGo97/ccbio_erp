import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { SmsTemplate } from './entities/sms-template.entity';
import { CreateSmsTemplateDto } from './dto/create-sms-template.dto';
import { UpdateSmsTemplateDto } from './dto/update-sms-template.dto';
import { GetSmsTemplatesDto } from './dto/get-sms-templates.dto';

@Injectable()
export class SmsTemplatesService {
  constructor(
    @InjectRepository(SmsTemplate)
    private smsTemplateRepository: Repository<SmsTemplate>,
  ) {}

  async create(createSmsTemplateDto: CreateSmsTemplateDto, userId?: number): Promise<SmsTemplate> {
    const template = this.smsTemplateRepository.create({
      ...createSmsTemplateDto,
      createdById: userId,
    });

    return this.smsTemplateRepository.save(template);
  }

  async findAll(dto: GetSmsTemplatesDto): Promise<{
    data: SmsTemplate[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 50, type, supplierId } = dto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.smsTemplateRepository.createQueryBuilder('template');

    // 필터 적용
    if (type) {
      queryBuilder.andWhere('template.type = :type', { type });
    }

    // 공급자 필터 적용
    if (supplierId !== undefined) {
      if (supplierId === null) {
        // null이면 기본 템플릿만 (supplierId가 NULL인 것)
        queryBuilder.andWhere('template.supplierId IS NULL');
      } else {
        // 특정 공급자 템플릿
        queryBuilder.andWhere('template.supplierId = :supplierId', { supplierId });
      }
    }

    // 정렬: createdAt 내림차순
    queryBuilder.orderBy('template.createdAt', 'DESC');

    // 전체 개수 조회
    const total = await queryBuilder.getCount();

    // 페이지네이션 적용
    queryBuilder.skip(skip).take(limit);

    // 관계 포함하여 조회
    queryBuilder.leftJoinAndSelect('template.createdBy', 'createdBy');
    queryBuilder.leftJoinAndSelect('template.updatedBy', 'updatedBy');
    queryBuilder.leftJoinAndSelect('template.supplier', 'supplier');

    const data = await queryBuilder.getMany();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number): Promise<SmsTemplate> {
    const template = await this.smsTemplateRepository.findOne({
      where: { id },
      relations: ['createdBy', 'updatedBy', 'supplier'],
    });

    if (!template) {
      throw new NotFoundException('템플릿을 찾을 수 없습니다.');
    }

    return template;
  }

  async findByType(type: string, supplierId?: number | null): Promise<SmsTemplate[]> {
    const queryBuilder = this.smsTemplateRepository.createQueryBuilder('template')
      .where('template.type = :type', { type });

    // 공급자 필터 적용
    if (supplierId !== undefined) {
      if (supplierId === null) {
        // null이면 기본 템플릿만 (supplierId가 NULL인 것)
        queryBuilder.andWhere('template.supplierId IS NULL');
      } else {
        // 특정 공급자 템플릿
        queryBuilder.andWhere('template.supplierId = :supplierId', { supplierId });
      }
    }

    queryBuilder.orderBy('template.createdAt', 'DESC');
    queryBuilder.leftJoinAndSelect('template.supplier', 'supplier');

    return queryBuilder.getMany();
  }

  async update(id: number, updateSmsTemplateDto: UpdateSmsTemplateDto, userId?: number): Promise<SmsTemplate> {
    console.log('[SMS 템플릿 수정] Service 수신:', {
      id,
      updateSmsTemplateDto,
      userId,
    });
    
    const template = await this.findOne(id);
    console.log('[SMS 템플릿 수정] 기존 템플릿:', {
      id: template.id,
      type: template.type,
      name: template.name,
      supplierId: template.supplierId,
    });

    // 토큰은 수정하지 않음 (읽기 전용, 쿼리로 입력된 값 유지)
    const { availableTokens, supplierId, ...updateData } = updateSmsTemplateDto;
    
    console.log('[SMS 템플릿 수정] 업데이트 데이터:', {
      ...updateData,
      supplierId,
    });

    // TypeORM의 save()가 변경을 제대로 감지하지 못할 수 있으므로
    // repository.update()를 사용하여 명시적으로 업데이트
    const updateFields: any = {
      ...updateData,
      updatedById: userId,
    };
    
    // supplierId는 명시적으로 설정
    if (supplierId !== undefined) {
      updateFields.supplierId = supplierId;
      console.log('[SMS 템플릿 수정] supplierId 명시적 설정:', supplierId);
    }
    
    console.log('[SMS 템플릿 수정] 업데이트 필드:', updateFields);

    // repository.update()로 명시적 업데이트
    await this.smsTemplateRepository.update(id, updateFields);
    console.log('[SMS 템플릿 수정] update() 완료');
    
    // 업데이트 후 supplier 관계를 포함하여 다시 조회
    const updated = await this.smsTemplateRepository.findOne({
      where: { id },
      relations: ['createdBy', 'updatedBy', 'supplier'],
    });
    
    if (!updated) {
      throw new NotFoundException('템플릿을 찾을 수 없습니다.');
    }
    
    console.log('[SMS 템플릿 수정] 최종 조회된 템플릿:', {
      id: updated.id,
      type: updated.type,
      name: updated.name,
      supplierId: updated.supplierId,
      supplier: updated.supplier ? {
        id: updated.supplier.id,
        companyName: updated.supplier.companyName,
      } : null,
    });
    
    return updated;
  }

  async remove(id: number): Promise<void> {
    const template = await this.findOne(id);
    await this.smsTemplateRepository.remove(template);
  }
}
