import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { GetWarehousesDto } from './dto/get-warehouses.dto';
import { WarehouseIgobiService } from '../warehouse-igobi/warehouse-igobi.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class WarehouseService {
  private readonly logger = new Logger(WarehouseService.name);

  constructor(
    @InjectRepository(Warehouse)
    private warehouseRepository: Repository<Warehouse>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Inject(forwardRef(() => WarehouseIgobiService))
    private readonly warehouseIgobiService: WarehouseIgobiService,
  ) {}

  /**
   * 사용자 ID로 창고 ID 조회
   * 창고가 할당되지 않은 경우 null 반환
   */
  async findWarehouseIdByUserId(userId: number): Promise<number | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    return user?.warehouseId || null;
  }

  async findAll(query: GetWarehousesDto = {}) {
    const qb = this.warehouseRepository.createQueryBuilder('warehouse');

    if (query.status !== undefined) {
      qb.andWhere('warehouse.status = :status', { status: query.status });
    }

    if (query.search) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere('warehouse.name LIKE :search', { search });
    }

    qb.orderBy('warehouse.name', 'ASC');

    const warehouses = await qb.getMany();
    
    // 각 창고의 가장 최근 이고비 조회
    if (warehouses.length > 0) {
      const warehouseIds = warehouses.map(w => w.id);
      const latestIgobiMap = await this.warehouseIgobiService.findLatestIgobiByWarehouseIds(warehouseIds);
      
      return warehouses.map((warehouse) => ({
        ...warehouse,
        latestIgobi: latestIgobiMap.get(warehouse.id) || null,
      }));
    }
    
    return warehouses;
  }

  async findOne(id: number) {
    const warehouse = await this.warehouseRepository.findOne({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException('창고를 찾을 수 없습니다.');
    }
    return warehouse;
  }

  async create(dto: CreateWarehouseDto) {
    const warehouse = this.warehouseRepository.create({
      name: dto.name.trim(),
      postalCode: dto.postalCode?.trim() || null,
      address: dto.address?.trim() || null,
      addressDetail: dto.addressDetail?.trim() || null,
      useInternalGyegeundae: dto.useInternalGyegeundae !== undefined ? dto.useInternalGyegeundae : false,
      gyegeundaePostalCode: dto.gyegeundaePostalCode?.trim() || null,
      gyegeundaeAddress: dto.gyegeundaeAddress?.trim() || null,
      gyegeundaeAddressDetail: dto.gyegeundaeAddressDetail?.trim() || null,
      phone: dto.phone?.trim() || null,
      managerName: dto.managerName?.trim() || null,
      managerPhone: dto.managerPhone?.trim() || null,
      notes: dto.notes?.trim() || null,
      status: dto.status !== undefined ? dto.status : true,
    });

    return this.warehouseRepository.save(warehouse);
  }

  async update(id: number, dto: UpdateWarehouseDto) {
    const warehouse = await this.findOne(id);

    if (dto.name !== undefined) {
      warehouse.name = dto.name.trim();
    }

    if (dto.postalCode !== undefined) {
      warehouse.postalCode = dto.postalCode?.trim() || null;
    }

    if (dto.address !== undefined) {
      warehouse.address = dto.address?.trim() || null;
    }

    if (dto.addressDetail !== undefined) {
      warehouse.addressDetail = dto.addressDetail?.trim() || null;
    }

    if (dto.useInternalGyegeundae !== undefined) {
      warehouse.useInternalGyegeundae = dto.useInternalGyegeundae;
    }

    if (dto.gyegeundaePostalCode !== undefined) {
      warehouse.gyegeundaePostalCode = dto.gyegeundaePostalCode?.trim() || null;
    }

    if (dto.gyegeundaeAddress !== undefined) {
      warehouse.gyegeundaeAddress = dto.gyegeundaeAddress?.trim() || null;
    }

    if (dto.gyegeundaeAddressDetail !== undefined) {
      warehouse.gyegeundaeAddressDetail = dto.gyegeundaeAddressDetail?.trim() || null;
    }

    if (dto.phone !== undefined) {
      warehouse.phone = dto.phone?.trim() || null;
    }

    if (dto.managerName !== undefined) {
      warehouse.managerName = dto.managerName?.trim() || null;
    }

    if (dto.managerPhone !== undefined) {
      warehouse.managerPhone = dto.managerPhone?.trim() || null;
    }

    if (dto.notes !== undefined) {
      warehouse.notes = dto.notes?.trim() || null;
    }

    if (dto.status !== undefined) {
      warehouse.status = dto.status;
    }

    return this.warehouseRepository.save(warehouse);
  }

  async remove(id: number) {
    const warehouse = await this.findOne(id);
    await this.warehouseRepository.remove(warehouse);
    return { success: true };
  }
}

