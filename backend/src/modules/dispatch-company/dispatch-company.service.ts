import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DispatchCompany } from './entities/dispatch-company.entity';
import { CreateDispatchCompanyDto } from './dto/create-dispatch-company.dto';
import { UpdateDispatchCompanyDto } from './dto/update-dispatch-company.dto';
import { GetDispatchCompaniesDto } from './dto/get-dispatch-companies.dto';

@Injectable()
export class DispatchCompanyService {
  private readonly logger = new Logger(DispatchCompanyService.name);

  constructor(
    @InjectRepository(DispatchCompany)
    private dispatchCompanyRepository: Repository<DispatchCompany>,
  ) {}

  async findAll(query: GetDispatchCompaniesDto = {}) {
    const qb = this.dispatchCompanyRepository.createQueryBuilder('dispatchCompany');

    if (query.status !== undefined) {
      qb.andWhere('dispatchCompany.status = :status', { status: query.status });
    }

    if (query.search) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere('dispatchCompany.name LIKE :search', { search });
    }

    qb.orderBy('dispatchCompany.name', 'ASC');

    return qb.getMany();
  }

  async findOne(id: number) {
    const dispatchCompany = await this.dispatchCompanyRepository.findOne({ where: { id } });
    if (!dispatchCompany) {
      throw new NotFoundException('배차 업체를 찾을 수 없습니다.');
    }
    return dispatchCompany;
  }

  async create(dto: CreateDispatchCompanyDto) {
    const dispatchCompany = this.dispatchCompanyRepository.create({
      name: dto.name.trim(),
      status: dto.status !== undefined ? dto.status : true,
    });

    return this.dispatchCompanyRepository.save(dispatchCompany);
  }

  async update(id: number, dto: UpdateDispatchCompanyDto) {
    const dispatchCompany = await this.findOne(id);

    if (dto.name !== undefined) {
      dispatchCompany.name = dto.name.trim();
    }

    if (dto.status !== undefined) {
      dispatchCompany.status = dto.status;
    }

    return this.dispatchCompanyRepository.save(dispatchCompany);
  }

  async remove(id: number) {
    const dispatchCompany = await this.findOne(id);
    await this.dispatchCompanyRepository.remove(dispatchCompany);
    return { success: true };
  }
}

