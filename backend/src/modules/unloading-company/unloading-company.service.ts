import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnloadingCompany } from './entities/unloading-company.entity';
import { CreateUnloadingCompanyDto } from './dto/create-unloading-company.dto';
import { UpdateUnloadingCompanyDto } from './dto/update-unloading-company.dto';
import { GetUnloadingCompaniesDto } from './dto/get-unloading-companies.dto';

@Injectable()
export class UnloadingCompanyService {
  private readonly logger = new Logger(UnloadingCompanyService.name);

  constructor(
    @InjectRepository(UnloadingCompany)
    private unloadingCompanyRepository: Repository<UnloadingCompany>,
  ) {}

  async findAll(query: GetUnloadingCompaniesDto = {}) {
    const qb = this.unloadingCompanyRepository.createQueryBuilder('unloadingCompany');

    if (query.search) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere(
        '(unloadingCompany.representativeName LIKE :search OR unloadingCompany.contact LIKE :search)',
        { search },
      );
    }

    qb.orderBy('unloadingCompany.representativeName', 'ASC');

    return qb.getMany();
  }

  async findOne(id: number) {
    const unloadingCompany = await this.unloadingCompanyRepository.findOne({ where: { id } });
    if (!unloadingCompany) {
      throw new NotFoundException('하차 업체를 찾을 수 없습니다.');
    }
    return unloadingCompany;
  }

  async create(dto: CreateUnloadingCompanyDto) {
    const unloadingCompany = this.unloadingCompanyRepository.create({
      representativeName: dto.representativeName.trim(),
      contact: dto.contact.trim(),
      notes: dto.notes?.trim() || null,
    });

    return this.unloadingCompanyRepository.save(unloadingCompany);
  }

  async update(id: number, dto: UpdateUnloadingCompanyDto) {
    const unloadingCompany = await this.findOne(id);

    if (dto.representativeName !== undefined) {
      unloadingCompany.representativeName = dto.representativeName.trim();
    }

    if (dto.contact !== undefined) {
      unloadingCompany.contact = dto.contact.trim();
    }

    if (dto.notes !== undefined) {
      unloadingCompany.notes = dto.notes?.trim() || null;
    }

    return this.unloadingCompanyRepository.save(unloadingCompany);
  }

  async remove(id: number) {
    const unloadingCompany = await this.findOne(id);
    await this.unloadingCompanyRepository.remove(unloadingCompany);
    return { success: true };
  }
}

