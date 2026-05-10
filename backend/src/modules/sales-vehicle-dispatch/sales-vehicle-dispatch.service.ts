import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehicleDispatch } from '../vehicle-dispatch/entities/vehicle-dispatch.entity';
import { VehicleDispatchLoadingItem } from '../vehicle-dispatch/entities/vehicle-dispatch-loading-item.entity';
import { Sales } from '../sales/entities/sales.entity';
import { CreateSalesVehicleDispatchDto } from './dto/create-sales-vehicle-dispatch.dto';
import { UpdateSalesVehicleDispatchDto } from './dto/update-sales-vehicle-dispatch.dto';
import { VehicleDispatchService } from '../vehicle-dispatch/vehicle-dispatch.service';

@Injectable()
export class SalesVehicleDispatchService {
  private readonly logger = new Logger(SalesVehicleDispatchService.name);

  constructor(
    @InjectRepository(VehicleDispatch)
    private vehicleDispatchRepository: Repository<VehicleDispatch>,
    @InjectRepository(VehicleDispatchLoadingItem)
    private loadingItemRepository: Repository<VehicleDispatchLoadingItem>,
    @InjectRepository(Sales)
    private salesRepository: Repository<Sales>,
    private vehicleDispatchService: VehicleDispatchService,
  ) {}

  /**
   * 판매 연동 배차 목록 조회 (판매 정보 포함)
   */
  async findAll(salesId?: string, includeDeleted: boolean = false) {
    const qb = this.vehicleDispatchRepository.createQueryBuilder('dispatch')
      .leftJoinAndSelect('dispatch.sales', 'sales')
      .leftJoinAndSelect('sales.customer', 'customer')
      .leftJoinAndSelect('dispatch.loadingWarehouse', 'loadingWarehouse')
      .leftJoinAndSelect('dispatch.unloadingRegion', 'unloadingRegion')
      .leftJoinAndSelect('dispatch.unloadingCity', 'unloadingCity')
      .leftJoinAndSelect('dispatch.dispatchCompany', 'dispatchCompany')
      .leftJoinAndSelect('dispatch.unloadingCompany', 'unloadingCompany')
      .leftJoinAndSelect('dispatch.createdByUser', 'createdByUser')
      .leftJoinAndSelect('dispatch.loadingItems', 'loadingItems')
      .leftJoinAndSelect('loadingItems.loadingWarehouse', 'itemWarehouse')
      .where('dispatch.vd_sales_id IS NOT NULL'); // 판매 연동 배차만

    // 삭제되지 않은 항목만 조회 (기본값)
    if (!includeDeleted) {
      qb.andWhere('dispatch.deletedAt IS NULL');
    }

    // 특정 판매 ID로 필터링
    if (salesId) {
      qb.andWhere('dispatch.vd_sales_id = :salesId', { salesId });
    }

    qb.orderBy('dispatch.createdAt', 'DESC');

    // orderNumber 명시적으로 선택
    qb.addSelect('dispatch.vd_order_number', 'dispatch_vd_order_number');
    qb.addSelect('dispatch.vd_id', 'dispatch_vd_id');

    // getRawAndEntities를 사용하여 orderNumber를 포함한 raw 데이터와 엔티티 모두 가져오기
    const { entities, raw } = await qb.getRawAndEntities();
    
    // 중복 제거 및 orderNumber 매핑 (loadingItems join으로 인한 중복 처리)
    const dispatchMap = new Map<number, VehicleDispatch>();
    const orderNumberMap = new Map<number, string | null>();
    
    // raw 데이터에서 orderNumber 추출 (dispatch ID 기준)
    raw.forEach(rawData => {
      const dispatchId = rawData.dispatch_vd_id;
      if (dispatchId !== undefined && dispatchId !== null) {
        const orderNumber = rawData.dispatch_vd_order_number;
        if (!orderNumberMap.has(dispatchId) && orderNumber !== undefined) {
          orderNumberMap.set(dispatchId, orderNumber);
        }
      }
    });
    
    // 엔티티에서 중복 제거 및 orderNumber 매핑
    entities.forEach(entity => {
      if (!dispatchMap.has(entity.id)) {
        // orderNumber 매핑
        const orderNumber = orderNumberMap.get(entity.id);
        if (orderNumber !== undefined) {
          entity.orderNumber = orderNumber;
        }
        dispatchMap.set(entity.id, entity);
      }
    });
    
    const dispatches = Array.from(dispatchMap.values());
    
    // loadingItems를 order 순서로 정렬
    dispatches.forEach(dispatch => {
      if (dispatch.loadingItems) {
        dispatch.loadingItems.sort((a, b) => (a.order || 0) - (b.order || 0));
      }
    });

    return dispatches;
  }

  /**
   * 판매 연동 배차 상세 조회 (판매 정보 포함)
   */
  async findOne(id: number, includeDeleted: boolean = false) {
    const qb = this.vehicleDispatchRepository.createQueryBuilder('dispatch')
      .leftJoinAndSelect('dispatch.sales', 'sales')
      .leftJoinAndSelect('sales.customer', 'customer')
      .leftJoinAndSelect('sales.items', 'salesItems')
      .leftJoinAndSelect('dispatch.unloadingRegion', 'unloadingRegion')
      .leftJoinAndSelect('dispatch.unloadingCity', 'unloadingCity')
      .leftJoinAndSelect('dispatch.loadingWarehouse', 'loadingWarehouse')
      .leftJoinAndSelect('dispatch.dispatchCompany', 'dispatchCompany')
      .leftJoinAndSelect('dispatch.unloadingCompany', 'unloadingCompany')
      .leftJoinAndSelect('dispatch.createdByUser', 'createdByUser')
      .leftJoinAndSelect('dispatch.loadingItems', 'loadingItems')
      .leftJoinAndSelect('loadingItems.loadingWarehouse', 'loadingItemsLoadingWarehouse')
      .leftJoinAndSelect('dispatch.deletedByUser', 'deletedByUser')
      .where('dispatch.id = :id', { id })
      .andWhere('dispatch.vd_sales_id IS NOT NULL'); // 판매 연동 배차만

    if (!includeDeleted) {
      qb.andWhere('dispatch.deletedAt IS NULL');
    }

    // orderNumber 명시적으로 선택
    qb.addSelect('dispatch.vd_order_number', 'dispatch_vd_order_number');

    // getRawAndEntities를 사용하여 orderNumber를 포함한 raw 데이터와 엔티티 모두 가져오기
    const { entities, raw } = await qb.getRawAndEntities();
    
    if (entities.length === 0) {
      throw new NotFoundException('판매 연동 배차 정보를 찾을 수 없습니다.');
    }

    const dispatch = entities[0];
    const rawData = raw[0];
    
    // raw 데이터에서 orderNumber를 엔티티에 매핑
    if (rawData && rawData.dispatch_vd_order_number !== undefined) {
      dispatch.orderNumber = rawData.dispatch_vd_order_number;
    }

    // loadingItems를 order 순서로 정렬
    if (dispatch.loadingItems) {
      dispatch.loadingItems.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    
    return dispatch;
  }

  /**
   * 판매 연동 배차 생성
   */
  async create(dto: CreateSalesVehicleDispatchDto, userId?: number) {
    this.logger.log(`[SERVICE] 판매 연동 배차 생성 시작 - salesId: ${dto.salesId}, userId: ${userId}`);
    
    // 판매 존재 확인
    const sales = await this.salesRepository.findOne({
      where: { id: dto.salesId },
      relations: ['customer'],
    });

    if (!sales) {
      throw new NotFoundException(`판매 정보를 찾을 수 없습니다. (ID: ${dto.salesId})`);
    }

    // 판매 정보에서 기본 정보 자동 채움
    const customer = sales.customer;
    const defaultCompanyName = customer?.companyName || null;
    const defaultRepresentativeName = customer?.ceo || null;
    const defaultPhone = customer?.phone || null;
    const defaultAddress = customer?.address || null;
    const defaultAddressDetail = customer?.addressDetail || null;
    const defaultPostalCode = customer?.postalCode || null;
    const defaultRegionId = customer?.regionId || null;
    const defaultCityId = customer?.cityId || null;

    // DTO를 기존 CreateVehicleDispatchDto 형식으로 변환
    const createDto = {
      ...dto,
      companyName: dto.companyName || defaultCompanyName,
      representativeName: dto.representativeName || defaultRepresentativeName,
      phone: dto.phone || defaultPhone,
      customerAddress: dto.customerAddress || defaultAddress,
      customerAddressDetail: dto.customerAddressDetail || defaultAddressDetail,
      customerPostalCode: dto.customerPostalCode || defaultPostalCode,
      // customerRegion, customerCity는 VehicleDispatchService에서 처리
    };

    // 기존 VehicleDispatchService의 create 메서드 사용
    // 하지만 salesId는 별도로 설정해야 함
    const dispatch = await this.vehicleDispatchService.create(createDto as any, userId);
    
    // salesId 설정
    dispatch.salesId = dto.salesId;
    const saved = await this.vehicleDispatchRepository.save(dispatch);

    this.logger.log(`[SERVICE] 판매 연동 배차 생성 완료 - ID: ${saved.id}, salesId: ${saved.salesId}`);
    
    return saved;
  }

  /**
   * 판매 연동 배차 수정
   */
  async update(id: number, dto: UpdateSalesVehicleDispatchDto, userId?: number) {
    this.logger.log(`[UPDATE] 판매 연동 배차 수정 시작 - ID: ${id}`);
    
    const dispatch = await this.findOne(id);
    
    // salesId 변경 시 판매 존재 확인
    if (dto.salesId && dto.salesId !== dispatch.salesId) {
      const sales = await this.salesRepository.findOne({
        where: { id: dto.salesId },
      });

      if (!sales) {
        throw new NotFoundException(`판매 정보를 찾을 수 없습니다. (ID: ${dto.salesId})`);
      }
    }

    // 기존 VehicleDispatchService의 update 메서드 사용
    const updateDto = { ...dto };
    delete (updateDto as any).salesId; // salesId는 별도 처리
    
    const updated = await this.vehicleDispatchService.update(id, updateDto as any, userId);
    
    // salesId 업데이트
    if (dto.salesId !== undefined) {
      updated.salesId = dto.salesId;
      await this.vehicleDispatchRepository.save(updated);
    }

    this.logger.log(`[UPDATE] 판매 연동 배차 수정 완료 - ID: ${id}`);
    
    return updated;
  }

  /**
   * 판매 연동 배차 삭제
   */
  async remove(id: number, userId?: number) {
    const dispatch = await this.findOne(id);
    
    // 기존 VehicleDispatchService의 remove 메서드 사용
    return await this.vehicleDispatchService.remove(id, userId);
  }
}








