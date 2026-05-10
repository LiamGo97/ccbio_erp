import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsSender } from './entities/sms-sender.entity';
import { CreateSmsSenderDto } from './dto/create-sms-sender.dto';
import { UpdateSmsSenderDto } from './dto/update-sms-sender.dto';
import { GetSmsSendersDto } from './dto/get-sms-senders.dto';

@Injectable()
export class SmsSenderService {
  private readonly logger = new Logger(SmsSenderService.name);

  constructor(
    @InjectRepository(SmsSender)
    private smsSenderRepository: Repository<SmsSender>,
  ) {}

  async findAll(query: GetSmsSendersDto = {}) {
    const qb = this.smsSenderRepository.createQueryBuilder('smsSender');

    if (query.status !== undefined) {
      qb.andWhere('smsSender.status = :status', { status: query.status });
    }

    if (query.search) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere(
        '(smsSender.name LIKE :search OR smsSender.phone LIKE :search)',
        { search },
      );
    }

    qb.orderBy('smsSender.name', 'ASC');

    return qb.getMany();
  }

  async findOne(id: number) {
    const smsSender = await this.smsSenderRepository.findOne({
      where: { id },
    });
    if (!smsSender) {
      throw new NotFoundException('SMS 발신자를 찾을 수 없습니다.');
    }
    return smsSender;
  }

  async create(dto: CreateSmsSenderDto) {
    // 전화번호 중복 확인
    const existing = await this.smsSenderRepository.findOne({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictException('이미 등록된 전화번호입니다.');
    }

    const smsSender = this.smsSenderRepository.create({
      phone: dto.phone.trim(),
      name: dto.name.trim(),
      status: dto.status !== undefined ? dto.status : true,
      notes: dto.notes?.trim() || null,
    });

    return this.smsSenderRepository.save(smsSender);
  }

  async update(id: number, dto: UpdateSmsSenderDto) {
    const smsSender = await this.findOne(id);

    // 전화번호 변경 시 중복 확인
    if (dto.phone && dto.phone !== smsSender.phone) {
      const existing = await this.smsSenderRepository.findOne({
        where: { phone: dto.phone },
      });
      if (existing) {
        throw new ConflictException('이미 등록된 전화번호입니다.');
      }
      smsSender.phone = dto.phone.trim();
    }

    if (dto.name !== undefined) {
      smsSender.name = dto.name.trim();
    }

    if (dto.status !== undefined) {
      smsSender.status = dto.status;
    }

    if (dto.notes !== undefined) {
      smsSender.notes = dto.notes?.trim() || null;
    }

    return this.smsSenderRepository.save(smsSender);
  }

  async remove(id: number) {
    const smsSender = await this.findOne(id);
    await this.smsSenderRepository.remove(smsSender);
    return { success: true };
  }
}
