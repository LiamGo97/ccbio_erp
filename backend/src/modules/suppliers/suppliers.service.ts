import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { GetSuppliersDto } from './dto/get-suppliers.dto';

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    @InjectRepository(Supplier)
    private supplierRepository: Repository<Supplier>,
  ) {}

  async findAll(query: GetSuppliersDto = {}) {
    const qb = this.supplierRepository.createQueryBuilder('supplier');

    if (query.status !== undefined) {
      qb.andWhere('supplier.status = :status', { status: query.status });
    }

    if (query.search) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere(
        '(supplier.companyName LIKE :search OR supplier.representativeName LIKE :search OR supplier.businessRegistrationNumber LIKE :search)',
        { search },
      );
    }

    qb.orderBy('supplier.companyName', 'ASC');

    return qb.getMany();
  }

  async findOne(id: number) {
    const supplier = await this.supplierRepository.findOne({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('공급자를 찾을 수 없습니다.');
    }
    return supplier;
  }

  async create(dto: CreateSupplierDto) {
    const supplier = this.supplierRepository.create({
      businessRegistrationNumber: dto.businessRegistrationNumber.trim(),
      representativeName: dto.representativeName.trim(),
      companyName: dto.companyName.trim(),
      address: dto.address.trim(),
      tel: dto.tel.trim(),
      status: dto.status !== undefined ? dto.status : true,
    });

    return this.supplierRepository.save(supplier);
  }

  async update(id: number, dto: UpdateSupplierDto) {
    const supplier = await this.findOne(id);

    if (dto.businessRegistrationNumber !== undefined) {
      supplier.businessRegistrationNumber = dto.businessRegistrationNumber.trim();
    }

    if (dto.representativeName !== undefined) {
      supplier.representativeName = dto.representativeName.trim();
    }

    if (dto.companyName !== undefined) {
      supplier.companyName = dto.companyName.trim();
    }

    if (dto.address !== undefined) {
      supplier.address = dto.address.trim();
    }

    if (dto.tel !== undefined) {
      supplier.tel = dto.tel.trim();
    }

    if (dto.status !== undefined) {
      supplier.status = dto.status;
    }

    return this.supplierRepository.save(supplier);
  }

  async remove(id: number) {
    const supplier = await this.findOne(id);
    await this.supplierRepository.remove(supplier);
    return { success: true };
  }
}
