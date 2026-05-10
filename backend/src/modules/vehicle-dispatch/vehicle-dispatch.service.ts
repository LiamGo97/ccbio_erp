import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, IsNull } from 'typeorm';
import { VehicleDispatch } from './entities/vehicle-dispatch.entity';
import { VehicleDispatchLoadingItem } from './entities/vehicle-dispatch-loading-item.entity';
import { ChangeType } from './entities/vehicle-dispatch-history.entity';
import { CreateVehicleDispatchDto } from './dto/create-vehicle-dispatch.dto';
import { UpdateVehicleDispatchDto } from './dto/update-vehicle-dispatch.dto';
import { FeatureAuditLogService } from '../feature-audit-log/feature-audit-log.service';
import { FeatureAuditLog } from '../feature-audit-log/entities/feature-audit-log.entity';
import { RegionsService } from '../regions/regions.service';
import { CitiesService } from '../cities/cities.service';
import { Customer } from '../customers/entities/customer.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class VehicleDispatchService {
  private readonly logger = new Logger(VehicleDispatchService.name);

  constructor(
    @InjectRepository(VehicleDispatch)
    private vehicleDispatchRepository: Repository<VehicleDispatch>,
    @InjectRepository(VehicleDispatchLoadingItem)
    private loadingItemRepository: Repository<VehicleDispatchLoadingItem>,
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private regionsService: RegionsService,
    private citiesService: CitiesService,
    private featureAuditLogService: FeatureAuditLogService,
  ) {}

  private normalizePhone(phone: string): string {
    return phone.replace(/[^0-9]/g, '');
  }

  private sanitize(value?: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  /**
   * 운송번호 자동 생성
   * 형식: {담당자코드(2글자)}-{YYMM}-{순번(4자리)}
   * 예: AL-2512-0001
   */
  private async generateTransportNumber(userId?: number | null, createdAt?: Date): Promise<string> {
    // 1. 사용자 정보 조회 (이메일 아이디 앞 2글자 사용)
    let managerCode = 'XX'; // 기본값
    if (userId) {
      const user = await this.userRepository.findOne({ 
        where: { id: userId },
        select: ['id', 'email'],
      });
      
      if (user?.email) {
        // 이메일에서 @ 앞부분 추출 (예: alex@example.com -> alex)
        const emailParts = user.email.split('@');
        if (emailParts.length > 0 && emailParts[0]) {
          const emailId = emailParts[0].trim();
          if (emailId.length >= 2) {
            // 이메일 아이디 앞 2글자를 대문자로 변환
            managerCode = emailId.substring(0, 2).toUpperCase();
          } else if (emailId.length === 1) {
            // 이메일 아이디가 1글자인 경우
            managerCode = (emailId + 'X').toUpperCase();
          }
        }
      }
    }

    // 2. 년월 계산 (YYMM 형식)
    const targetDate = createdAt || new Date();
    const year = targetDate.getFullYear().toString().slice(-2);
    const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');
    const yearMonth = year + month;

    // 3. 같은 담당자 + 같은 년월의 마지막 운송번호 조회
    const pattern = `${managerCode}-${yearMonth}-%`;
    const lastDispatch = await this.vehicleDispatchRepository
      .createQueryBuilder('dispatch')
      .where('dispatch.createdBy = :userId', { userId: userId || 0 })
      .andWhere('dispatch.orderNumber LIKE :pattern', { pattern })
      .orderBy('dispatch.orderNumber', 'DESC')
      .limit(1)
      .getOne();

    // 4. 순번 계산
    let sequence = 1;
    if (lastDispatch?.orderNumber) {
      const lastNumber = lastDispatch.orderNumber;
      // 마지막 4자리(순번) 추출
      const parts = lastNumber.split('-');
      if (parts.length === 3) {
        const lastSequence = parseInt(parts[2], 10);
        if (!isNaN(lastSequence)) {
          sequence = lastSequence + 1;
        }
      }
    }

    // 5. 새 운송번호 생성 (순번을 4자리로 패딩)
    const sequenceStr = sequence.toString().padStart(4, '0');
    return `${managerCode}-${yearMonth}-${sequenceStr}`;
  }

  private normalizeRegionName(input?: string | null): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    const replacements: Record<string, string> = {
      서울특별시: '서울',
      부산광역시: '부산',
      대구광역시: '대구',
      인천광역시: '인천',
      광주광역시: '광주',
      대전광역시: '대전',
      울산광역시: '울산',
      세종특별자치시: '세종',
      경기도: '경기',
      강원도: '강원',
      강원특별자치도: '강원',
      충청북도: '충북',
      충청남도: '충남',
      전라북도: '전북',
      전라남도: '전남',
      경상북도: '경북',
      경상남도: '경남',
      제주특별자치도: '제주',
    };
    if (replacements[trimmed]) {
      return replacements[trimmed];
    }
    return trimmed.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, '');
  }

  private async findCustomerByPhone(phone: string): Promise<Customer | null> {
    if (!phone) return null;
    const normalized = this.normalizePhone(phone);
    if (!normalized) return null;
    return this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.regionEntity', 'region')
      .leftJoinAndSelect('customer.cityEntity', 'city')
      .where("regexp_replace(customer.cu_phone, '[^0-9]', '', 'g') = :normalized", { normalized })
      .getOne();
  }

  private async upsertCustomer(dto: CreateVehicleDispatchDto | UpdateVehicleDispatchDto): Promise<Customer | null> {
    if (!dto.phone) {
      return null;
    }

    let customer = await this.findCustomerByPhone(dto.phone);

    if (!customer) {
      customer = this.customerRepository.create();
    }

    // 전화번호 업데이트
    if (dto.phone !== undefined && dto.phone !== null) {
      customer.phone = this.sanitize(dto.phone) ?? this.normalizePhone(dto.phone);
    }

    // 업체명 업데이트
    if (dto.companyName !== undefined) {
      customer.companyName = this.sanitize(dto.companyName);
    }

    // 대표자명 업데이트
    if (dto.representativeName !== undefined) {
      customer.ceo = this.sanitize(dto.representativeName);
    }

    // 지역 업데이트 (시군구 업데이트 전에 먼저 처리)
    let updatedRegionId = customer.regionId; // 기존 regionId 유지
    if (dto.customerRegion !== undefined) {
      const rawRegion = this.sanitize(dto.customerRegion);
      const normalizedRegion = this.normalizeRegionName(rawRegion);
      const candidates = Array.from(new Set([normalizedRegion, rawRegion].filter((v): v is string => !!v)));
      let region = null;
      for (const candidate of candidates) {
        region = await this.regionsService.findByName(candidate);
        if (region) break;
      }
      if (region) {
        updatedRegionId = region.id;
        customer.regionId = region.id;
      } else {
        updatedRegionId = null;
        customer.regionId = null;
      }
    }

    // 시군구 업데이트 (업데이트된 regionId 사용)
    if (dto.customerCity !== undefined) {
      const cityName = this.sanitize(dto.customerCity);
      this.logger.log(`[SERVICE] 시군구 업데이트 시도 - cityName: ${cityName}, updatedRegionId: ${updatedRegionId}, 기존 regionId: ${customer.regionId}`);
      if (cityName) {
        let city = null;
        // 업데이트된 regionId 또는 기존 regionId 사용
        const regionIdToUse = updatedRegionId !== undefined ? updatedRegionId : customer.regionId;
        this.logger.log(`[SERVICE] 사용할 regionId: ${regionIdToUse}`);
        if (regionIdToUse) {
          const cities = await this.citiesService.findByRegionId(regionIdToUse);
          city = cities.find((c) => c.name === cityName) || null;
          this.logger.log(`[SERVICE] 지역 내 시군구 검색 결과: ${city ? `찾음 (ID: ${city.id})` : '없음'}`);
        }
        if (!city) {
          city = await this.citiesService.findByName(cityName);
          this.logger.log(`[SERVICE] 전체 시군구 검색 결과: ${city ? `찾음 (ID: ${city.id})` : '없음'}`);
        }
        if (city) {
          customer.cityId = city.id;
          this.logger.log(`[SERVICE] 시군구 업데이트 완료 - cityId: ${city.id}`);
        } else {
          customer.cityId = null;
          this.logger.log(`[SERVICE] 시군구를 찾을 수 없어 null로 설정`);
        }
      } else {
        customer.cityId = null;
        this.logger.log(`[SERVICE] 시군구 이름이 비어있어 null로 설정`);
      }
    }

    // 우편번호 업데이트
    if (dto.customerPostalCode !== undefined) {
      customer.postalCode = this.sanitize(dto.customerPostalCode);
    }

    // 주소 업데이트
    if (dto.customerAddress !== undefined) {
      customer.address = this.sanitize(dto.customerAddress);
    }

    // 상세주소 업데이트
    if (dto.customerAddressDetail !== undefined) {
      customer.addressDetail = this.sanitize(dto.customerAddressDetail);
    }

    return await this.customerRepository.save(customer);
  }

  /**
   * 변경된 필드 추출 (이력 저장용)
   */
  private computeChangedFields(oldData: any, newData: any): Record<string, { old: any; new: any }> | null {
    const changedFields: Record<string, { old: any; new: any }> = {};
    if (!oldData || !newData) return null;
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    for (const key of allKeys) {
      const oldValue = oldData[key];
      const newValue = newData[key];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changedFields[key] = { old: oldValue, new: newValue };
      }
    }
    return Object.keys(changedFields).length > 0 ? changedFields : null;
  }

  /**
   * VehicleDispatch 엔티티를 JSON으로 변환 (이력 저장용)
   * loadingItems도 포함하여 모든 운송관리 처리 데이터를 기록
   */
  private entityToJson(entity: VehicleDispatch): Record<string, any> {
    if (!entity) return {};
    
    return {
      id: entity.id,
      requestVehicle: entity.requestVehicle,
      requestWeight: entity.requestWeight,
      loadingWarehouseId: entity.loadingWarehouseId,
      loadingSchedule: entity.loadingSchedule,
      loadingScheduleTime: entity.loadingScheduleTime,
      unloadingPostalCode: entity.unloadingPostalCode,
      unloadingAddress: entity.unloadingAddress,
      unloadingAddressDetail: entity.unloadingAddressDetail,
      unloadingRegionId: entity.unloadingRegionId,
      unloadingCityId: entity.unloadingCityId,
      unloadingRegion: entity.unloadingRegion ? {
        id: entity.unloadingRegion.id,
        name: entity.unloadingRegion.name,
      } : null,
      unloadingCity: entity.unloadingCity ? {
        id: entity.unloadingCity.id,
        name: entity.unloadingCity.name,
        regionId: entity.unloadingCity.regionId,
      } : null,
      unloadingSchedule: entity.unloadingSchedule,
      unloadingScheduleDate: entity.unloadingScheduleDate,
      unloadingScheduleTime: entity.unloadingScheduleTime,
      freightPaymentType: entity.freightPaymentType,
      companyName: entity.companyName,
      representativeName: entity.representativeName,
      phone: entity.phone,
      requestBL: entity.requestBL,
      requestContainer: entity.requestContainer,
      orderNumber: entity.orderNumber,
      workBL: entity.workBL,
      workContainer: entity.workContainer,
      notes: entity.notes,
      status: entity.status,
      createdBy: entity.createdBy,
      dispatchCompanyId: entity.dispatchCompanyId,
      completedAt: entity.completedAt,
      vehicleNumber: entity.vehicleNumber,
      driverContact: entity.driverContact,
      driverName: entity.driverName,
      entryTime: entity.entryTime,
      transportFee: entity.transportFee,
      weighingFee: entity.weighingFee,
      loadingDateTime: entity.loadingDateTime,
      unloadingDateTime: entity.unloadingDateTime,
      statusReason: entity.statusReason,
      unloadingCompanyId: entity.unloadingCompanyId,
      directUnloadingContact: entity.directUnloadingContact,
      deletedAt: entity.deletedAt,
      deletedBy: entity.deletedBy,
      hasFailed: entity.hasFailed,
      hasRescheduled: entity.hasRescheduled,
      reprocessReason: entity.reprocessReason,
      // loadingItems 포함 (운송관리 처리 데이터 전체 기록)
      loadingItems: entity.loadingItems?.map((item) => ({
        id: item.id,
        loadingWarehouseId: item.loadingWarehouseId,
        requestBL: item.requestBL,
        requestContainer: item.requestContainer,
        workBL: item.workBL,
        workContainer: item.workContainer,
        workWeight: item.workWeight,
        status: item.status,
        order: item.order,
        notes: item.notes,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })) || [],
    };
  }

  async findAll(userId?: number, dispatchCompanyId?: number, loadingWarehouseId?: number, includeDeleted: boolean = false) {
    const qb = this.vehicleDispatchRepository.createQueryBuilder('dispatch')
      .leftJoinAndSelect('dispatch.loadingWarehouse', 'loadingWarehouse')
      .leftJoinAndSelect('dispatch.unloadingRegion', 'unloadingRegion')
      .leftJoinAndSelect('dispatch.unloadingCity', 'unloadingCity')
      .leftJoinAndSelect('dispatch.dispatchCompany', 'dispatchCompany')
      .leftJoinAndSelect('dispatch.unloadingCompany', 'unloadingCompany')
      .leftJoinAndSelect('dispatch.createdByUser', 'createdByUser')
      .leftJoinAndSelect('dispatch.loadingItems', 'loadingItems')
      .leftJoinAndSelect('loadingItems.loadingWarehouse', 'itemWarehouse');

    // 삭제되지 않은 항목만 조회 (기본값)
    if (!includeDeleted) {
      qb.andWhere('dispatch.deletedAt IS NULL');
    }

    // 배차 업체 ID로 필터링 (배차 업체 사용자인 경우)
    if (dispatchCompanyId !== undefined) {
      qb.andWhere('dispatch.dc_id = :dispatchCompanyId', { dispatchCompanyId });
    }

    // 창고 ID로 필터링 (창고 업체 사용자인 경우) - dispatch 레벨 또는 loadingItems 기준으로 필터링
    if (loadingWarehouseId !== undefined) {
      qb.andWhere(
        '(dispatch.vd_loading_warehouse_id = :loadingWarehouseId OR loadingItems.vdli_loading_warehouse_id = :loadingWarehouseId)',
        { loadingWarehouseId }
      );
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
    
    // 창고 필터링이 있는 경우, 해당 창고의 loadingItems만 포함
    if (loadingWarehouseId !== undefined) {
      return dispatches.map(dispatch => ({
        ...dispatch,
        loadingItems: dispatch.loadingItems?.filter(item => item.loadingWarehouseId === loadingWarehouseId) || []
      }));
    }

    return dispatches;
  }

  async findOne(id: number, includeDeleted: boolean = false) {
    const qb = this.vehicleDispatchRepository.createQueryBuilder('dispatch')
      .leftJoinAndSelect('dispatch.unloadingRegion', 'unloadingRegion')
      .leftJoinAndSelect('dispatch.unloadingCity', 'unloadingCity')
      .leftJoinAndSelect('dispatch.loadingWarehouse', 'loadingWarehouse')
      .leftJoinAndSelect('dispatch.dispatchCompany', 'dispatchCompany')
      .leftJoinAndSelect('dispatch.unloadingCompany', 'unloadingCompany')
      .leftJoinAndSelect('dispatch.createdByUser', 'createdByUser')
      .leftJoinAndSelect('dispatch.loadingItems', 'loadingItems')
      .leftJoinAndSelect('loadingItems.loadingWarehouse', 'loadingItemsLoadingWarehouse')
      .leftJoinAndSelect('dispatch.deletedByUser', 'deletedByUser')
      .where('dispatch.id = :id', { id });

    if (!includeDeleted) {
      qb.andWhere('dispatch.deletedAt IS NULL');
    }

    // orderNumber 명시적으로 선택
    qb.addSelect('dispatch.vd_order_number', 'dispatch_vd_order_number');

    // getRawAndEntities를 사용하여 orderNumber를 포함한 raw 데이터와 엔티티 모두 가져오기
    const { entities, raw } = await qb.getRawAndEntities();
    
    if (entities.length === 0) {
      throw new NotFoundException('배차 정보를 찾을 수 없습니다.');
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
    
    // 명시적으로 JSON 직렬화 가능하도록 plain object로 변환하여 반환
    const result = {
      ...dispatch,
      loadingWarehouse: dispatch.loadingWarehouse ? {
        id: dispatch.loadingWarehouse.id,
        name: dispatch.loadingWarehouse.name,
        postalCode: dispatch.loadingWarehouse.postalCode ?? null,
        address: dispatch.loadingWarehouse.address ?? null,
        addressDetail: dispatch.loadingWarehouse.addressDetail ?? null,
        useInternalGyegeundae: dispatch.loadingWarehouse.useInternalGyegeundae ?? false,
        gyegeundaePostalCode: dispatch.loadingWarehouse.gyegeundaePostalCode ?? null,
        gyegeundaeAddress: dispatch.loadingWarehouse.gyegeundaeAddress ?? null,
        gyegeundaeAddressDetail: dispatch.loadingWarehouse.gyegeundaeAddressDetail ?? null,
        managerName: dispatch.loadingWarehouse.managerName ?? null,
        managerPhone: dispatch.loadingWarehouse.managerPhone ?? null,
      } : null,
      loadingItems: dispatch.loadingItems?.map(item => ({
        id: item.id,
        vehicleDispatchId: item.vehicleDispatchId,
        loadingWarehouseId: item.loadingWarehouseId ?? null,
        loadingWarehouse: item.loadingWarehouse ? {
          id: item.loadingWarehouse.id,
          name: item.loadingWarehouse.name,
          postalCode: item.loadingWarehouse.postalCode ?? null,
          address: item.loadingWarehouse.address ?? null,
          addressDetail: item.loadingWarehouse.addressDetail ?? null,
          useInternalGyegeundae: item.loadingWarehouse.useInternalGyegeundae ?? false,
          gyegeundaePostalCode: item.loadingWarehouse.gyegeundaePostalCode ?? null,
          gyegeundaeAddress: item.loadingWarehouse.gyegeundaeAddress ?? null,
          gyegeundaeAddressDetail: item.loadingWarehouse.gyegeundaeAddressDetail ?? null,
          managerName: item.loadingWarehouse.managerName ?? null,
          managerPhone: item.loadingWarehouse.managerPhone ?? null,
        } : null,
        requestBL: item.requestBL ?? null,
        requestContainer: item.requestContainer ?? null,
        workBL: item.workBL ?? null,
        workContainer: item.workContainer ?? null,
        workWeight: item.workWeight ?? null,
        status: item.status ?? 'PENDING',
        order: item.order ?? 1,
        notes: item.notes ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })) || [],
    } as VehicleDispatch;
    
    return result;
  }

  async create(dto: CreateVehicleDispatchDto, userId?: number) {
    this.logger.log(`[SERVICE] create 호출 - userId: ${userId}`);
    this.logger.log(`[SERVICE] DTO: ${JSON.stringify(dto, null, 2)}`);
    
    try {
      // 하차지 지역 및 시군구 ID 변환
      let unloadingRegionId = null;
      let unloadingCityId = null;

      if (dto.unloadingRegion) {
        const region = await this.regionsService.findByName(dto.unloadingRegion.trim());
        if (region) {
          unloadingRegionId = region.id;
        }
      }

      if (dto.unloadingCity) {
        let city = null;
        if (unloadingRegionId) {
          const cities = await this.citiesService.findByRegionId(unloadingRegionId);
          city = cities.find((c) => c.name === dto.unloadingCity.trim()) || null;
        }
        if (!city) {
          city = await this.citiesService.findByName(dto.unloadingCity.trim());
        }
        if (city) {
          unloadingCityId = city.id;
        }
      }

      // 운송번호 자동 생성 (입력값이 없거나 빈 문자열인 경우)
      let transportNumber = dto.orderNumber?.trim() || null;
      if (!transportNumber) {
        transportNumber = await this.generateTransportNumber(userId || null, new Date());
        this.logger.log(`[SERVICE] 운송번호 자동 생성: ${transportNumber}`);
      }

      const dispatchData = {
        requestVehicle: dto.requestVehicle?.trim() || null,
        requestWeight: dto.requestWeight?.trim() || null,
        loadingWarehouseId: dto.loadingWarehouseId || null,
        loadingSchedule: dto.loadingSchedule ? new Date(dto.loadingSchedule) : null,
        loadingScheduleTime: dto.loadingScheduleTime?.trim() || null,
        unloadingPostalCode: dto.unloadingPostalCode?.trim() || null,
        unloadingAddress: dto.unloadingAddress?.trim() || null,
        unloadingAddressDetail: dto.unloadingAddressDetail?.trim() || null,
        unloadingRegionId,
        unloadingCityId,
        unloadingSchedule: dto.unloadingSchedule ? new Date(dto.unloadingSchedule) : null,
        unloadingScheduleDate: dto.unloadingScheduleDate ? new Date(dto.unloadingScheduleDate) : null,
        unloadingScheduleTime: dto.unloadingScheduleTime?.trim() || null,
        freightPaymentType: dto.freightPaymentType?.trim() || null,
        companyName: dto.companyName?.trim() || null,
        representativeName: dto.representativeName?.trim() || null,
        phone: dto.phone?.trim() || null,
        requestBL: dto.requestBL?.trim() || null,
        requestContainer: dto.requestContainer?.trim() || null,
        orderNumber: transportNumber,
        workBL: dto.workBL?.trim() || null,
        workContainer: dto.workContainer?.trim() || null,
        notes: dto.notes?.trim() || null,
        dispatchCompanyId: dto.dispatchCompanyId || null,
        unloadingCompanyId: dto.unloadingCompanyId || null,
        directUnloadingContact: dto.directUnloadingContact?.trim() || null,
        loadingDateTime: dto.loadingDateTime?.trim() || null,
        unloadingDateTime: dto.unloadingDateTime?.trim() || null,
        status: (dto.status as any) || 'DRAFT',
        createdBy: userId || null,
      };
      
      this.logger.log(`[SERVICE] 생성할 데이터: ${JSON.stringify(dispatchData, null, 2)}`);
      
      const dispatch = this.vehicleDispatchRepository.create(dispatchData);
      this.logger.log(`[SERVICE] Entity 생성 완료`);
      
      const saved = await this.vehicleDispatchRepository.save(dispatch);
      this.logger.log(`[SERVICE] DB 저장 완료 - ID: ${saved.id}`);

      // loadingItems 생성
      if (dto.loadingItems && dto.loadingItems.length > 0) {
        const loadingItems = dto.loadingItems.map((item, index) => {
          return this.loadingItemRepository.create({
            vehicleDispatchId: saved.id,
            loadingWarehouseId: item.loadingWarehouseId || null,
            requestBL: item.requestBL?.trim() || null,
            requestContainer: item.requestContainer?.trim() || null,
            workBL: item.workBL?.trim() || null,
            workContainer: item.workContainer?.trim() || null,
            workWeight: item.workWeight?.trim() || null,
            status: item.status || 'PENDING',
            order: item.order || index + 1,
            notes: item.notes?.trim() || null,
          });
        });
        await this.loadingItemRepository.save(loadingItems);
        this.logger.log(`[SERVICE] loadingItems 저장 완료 - ${loadingItems.length}개 항목`);
      }

      // 고객 정보 업데이트
      if (dto.phone) {
        try {
          await this.upsertCustomer(dto);
          this.logger.log(`[SERVICE] 고객 정보 업데이트 완료 - 전화번호: ${dto.phone}`);
        } catch (error) {
          this.logger.error(`[SERVICE] 고객 정보 업데이트 실패: ${error.message}`, error.stack);
          // 고객 정보 업데이트 실패해도 배차 저장은 성공으로 처리
        }
      }

      // 변경 이력 저장 (통합: tb_feature_audit_log만 사용)
      const newDataJson = this.entityToJson(saved);
      await this.featureAuditLogService.create({
        domain: 'SALES',
        feature: 'TRANSPORT',
        action: 'CREATED',
        userId: userId ?? null,
        summary: `배차 등록 #${saved.id} (운송번호 ${saved.orderNumber ?? '-'})`,
        entityType: 'vehicle_dispatch',
        entityId: saved.id,
        payload: { dispatchId: saved.id, orderNumber: saved.orderNumber, status: saved.status },
        newData: newDataJson,
        description: '배차 정보 생성',
      }).catch((err) => this.logger.warn('[기능이력] 배차 등록 로그 저장 실패', err));
      
      return saved;
    } catch (error) {
      this.logger.error(`[SERVICE] 저장 실패: ${error.message}`, error.stack);
      throw error;
    }
  }

  async update(id: number, dto: UpdateVehicleDispatchDto, userId?: number) {
    this.logger.log(`[UPDATE] 배차 수정 시작 - ID: ${id}`);
    this.logger.log(`[UPDATE] 수정 요청 데이터: ${JSON.stringify(dto, null, 2)}`);
    
    const dispatch = await this.findOne(id);
    this.logger.log(`[UPDATE] 기존 배차 데이터 - loadingWarehouseId: ${dispatch.loadingWarehouseId}, dispatchCompanyId: ${dispatch.dispatchCompanyId}`);
    
    // 변경 전 데이터 저장 (이력용)
    const oldDataJson = this.entityToJson(dispatch);
    
    // TypeORM의 변경 감지가 제대로 작동하지 않을 수 있으므로, 명시적으로 update 사용
    const updateData: any = {};
    if (dto.loadingWarehouseId !== undefined) {
      updateData.loadingWarehouseId = dto.loadingWarehouseId || null;
      this.logger.log(`[UPDATE] updateData에 loadingWarehouseId 추가: ${updateData.loadingWarehouseId}`);
    }
    if (dto.requestVehicle !== undefined) {
      updateData.requestVehicle = dto.requestVehicle?.trim() || null;
    }
    if (dto.requestWeight !== undefined) {
      updateData.requestWeight = dto.requestWeight?.trim() || null;
    }
    if (dto.loadingSchedule !== undefined) {
      updateData.loadingSchedule = dto.loadingSchedule ? new Date(dto.loadingSchedule) : null;
    }
    if (dto.loadingScheduleTime !== undefined) {
      updateData.loadingScheduleTime = dto.loadingScheduleTime?.trim() || null;
    }
    if (dto.unloadingPostalCode !== undefined) {
      updateData.unloadingPostalCode = dto.unloadingPostalCode?.trim() || null;
    }
    if (dto.unloadingAddress !== undefined) {
      updateData.unloadingAddress = dto.unloadingAddress?.trim() || null;
    }
    if (dto.unloadingAddressDetail !== undefined) {
      updateData.unloadingAddressDetail = dto.unloadingAddressDetail?.trim() || null;
    }
    if (dto.unloadingRegion !== undefined) {
      if (dto.unloadingRegion) {
        const region = await this.regionsService.findByName(dto.unloadingRegion.trim());
        updateData.unloadingRegionId = region ? region.id : null;
      } else {
        updateData.unloadingRegionId = null;
      }
    }
    if (dto.unloadingCity !== undefined) {
      if (dto.unloadingCity) {
        let city = null;
        // unloadingRegion이 먼저 처리되었으면 updateData에서 가져오고, 아니면 기존 dispatch에서 가져오거나 dto에서 찾기
        const regionId = updateData.unloadingRegionId || dispatch.unloadingRegionId || (dto.unloadingRegion ? (await this.regionsService.findByName(dto.unloadingRegion.trim()))?.id : null);
        if (regionId) {
          const cities = await this.citiesService.findByRegionId(regionId);
          city = cities.find((c) => c.name === dto.unloadingCity.trim()) || null;
        }
        if (!city) {
          city = await this.citiesService.findByName(dto.unloadingCity.trim());
        }
        updateData.unloadingCityId = city ? city.id : null;
      } else {
        updateData.unloadingCityId = null;
      }
    }
    if (dto.unloadingSchedule !== undefined) {
      updateData.unloadingSchedule = dto.unloadingSchedule ? new Date(dto.unloadingSchedule) : null;
    }
    if (dto.unloadingScheduleDate !== undefined) {
      updateData.unloadingScheduleDate = dto.unloadingScheduleDate ? new Date(dto.unloadingScheduleDate) : null;
    }
    if (dto.unloadingScheduleTime !== undefined) {
      updateData.unloadingScheduleTime = dto.unloadingScheduleTime?.trim() || null;
    }
    if (dto.freightPaymentType !== undefined) {
      updateData.freightPaymentType = dto.freightPaymentType?.trim() || null;
    }
    if (dto.companyName !== undefined) {
      updateData.companyName = dto.companyName?.trim() || null;
    }
    if (dto.representativeName !== undefined) {
      updateData.representativeName = dto.representativeName?.trim() || null;
    }
    if (dto.phone !== undefined) {
      updateData.phone = dto.phone?.trim() || null;
    }
    if (dto.requestBL !== undefined) {
      updateData.requestBL = dto.requestBL?.trim() || null;
    }
    if (dto.requestContainer !== undefined) {
      updateData.requestContainer = dto.requestContainer?.trim() || null;
    }
    if (dto.orderNumber !== undefined) {
      updateData.orderNumber = dto.orderNumber?.trim() || null;
    }
    // 상차 업체가 입력한 작업 정보는 관리자가 수정할 수 없음 (보호)
    // workBL, workContainer, workWeight는 undefined로 전달되면 업데이트하지 않음 (기존 값 유지)
    // 주의: 명시적으로 null을 전달하면 null로 업데이트되므로, undefined로 전달해야 함
    if (dto.notes !== undefined) {
      updateData.notes = dto.notes?.trim() || null;
    }
    if (dto.dispatchCompanyId !== undefined) {
      updateData.dispatchCompanyId = dto.dispatchCompanyId || null;
      this.logger.log(`[UPDATE] updateData에 dispatchCompanyId 추가: ${updateData.dispatchCompanyId} (원본 값: ${dto.dispatchCompanyId})`);
    }
    if (dto.unloadingCompanyId !== undefined) {
      updateData.unloadingCompanyId = dto.unloadingCompanyId || null;
    }
    if (dto.directUnloadingContact !== undefined) {
      updateData.directUnloadingContact = dto.directUnloadingContact?.trim() || null;
    }
    // 재처리 로직: FAILED/RESCHEDULED → DRAFT
    let isReprocessing = false;
    if (dto.status !== undefined) {
      updateData.status = dto.status;
      
      isReprocessing = 
        (dispatch.status === 'FAILED' || dispatch.status === 'RESCHEDULED') &&
        dto.status === 'DRAFT';
      
      if (isReprocessing) {
        // 플래그 설정
        if (dispatch.status === 'FAILED') {
          updateData.hasFailed = true;
        } else if (dispatch.status === 'RESCHEDULED') {
          updateData.hasRescheduled = true;
        }
        
        // 재처리 사유 누적 저장
        if (dto.reprocessReason) {
          const existingReason = dispatch.reprocessReason || '';
          updateData.reprocessReason = existingReason
            ? `${existingReason}\n${dto.reprocessReason.trim()}`
            : dto.reprocessReason.trim();
        }
      }
    }
    
    // reprocessReason이 별도로 전달된 경우 (status 변경 없이도 가능)
    if (dto.reprocessReason !== undefined && !isReprocessing) {
      updateData.reprocessReason = dto.reprocessReason.trim() || null;
    }
    // 배차 업체가 입력한 정보는 관리자가 수정할 수 없음 (보호)
    // vehicleNumber, driverContact, driverName, entryTime, transportFee, weighingFee, loadingDateTime, unloadingDateTime
    // 이 필드들은 undefined로 전달되면 업데이트하지 않음 (기존 값 유지)
    // 주의: 명시적으로 null을 전달하면 null로 업데이트되므로, undefined로 전달해야 함
    if (dto.vehicleNumber !== undefined) {
      updateData.vehicleNumber = dto.vehicleNumber?.trim() || null;
    }
    if (dto.driverContact !== undefined) {
      updateData.driverContact = dto.driverContact?.trim() || null;
    }
    if (dto.driverName !== undefined) {
      updateData.driverName = dto.driverName?.trim() || null;
    }
    if (dto.entryTime !== undefined) {
      updateData.entryTime = dto.entryTime?.trim() || null;
    }
    if (dto.transportFee !== undefined) {
      updateData.transportFee = dto.transportFee || null;
    }
    if (dto.weighingFee !== undefined) {
      updateData.weighingFee = dto.weighingFee || null;
    }
    if (dto.loadingDateTime !== undefined) {
      updateData.loadingDateTime = dto.loadingDateTime?.trim() || null;
    }
    if (dto.unloadingDateTime !== undefined) {
      updateData.unloadingDateTime = dto.unloadingDateTime?.trim() || null;
    }
    if (dto.statusReason !== undefined) {
      updateData.statusReason = dto.statusReason?.trim() || null;
    }
    
    this.logger.log(`[UPDATE] updateData: ${JSON.stringify(updateData, null, 2)}`);
    await this.vehicleDispatchRepository.update(id, updateData);
    
    // loadingItems 업데이트 (상차 업체 입력 정보 보호)
    if (dto.loadingItems !== undefined) {
      // 기존 loadingItems 조회 (작업 정보 보존용)
      const existingItems = await this.loadingItemRepository.find({
        where: { vehicleDispatchId: id },
      });
      
      // 기존 loadingItems 삭제
      await this.loadingItemRepository.delete({ vehicleDispatchId: id });
      
      // 새로운 loadingItems 생성 (기존 작업 정보 유지)
      if (dto.loadingItems.length > 0) {
        const loadingItems = dto.loadingItems.map((item, index) => {
          // 기존 항목 찾기 (loadingWarehouseId와 requestBL/requestContainer로 매칭)
          const existingItem = existingItems.find((existing) => {
            const warehouseMatch = existing.loadingWarehouseId === (item.loadingWarehouseId || null);
            const blMatch = !item.requestBL || existing.requestBL === item.requestBL?.trim();
            const containerMatch = !item.requestContainer || existing.requestContainer === item.requestContainer?.trim();
            return warehouseMatch && blMatch && containerMatch;
          });
          
          return this.loadingItemRepository.create({
            vehicleDispatchId: id,
            loadingWarehouseId: item.loadingWarehouseId || null,
            requestBL: item.requestBL?.trim() || null,
            requestContainer: item.requestContainer?.trim() || null,
            // 작업 정보: 관리자가 전송한 값이 있으면 사용, 없으면 기존 값 유지 (상차 업체 입력 정보 보호)
            workBL: item.workBL?.trim() || existingItem?.workBL || null,
            workContainer: item.workContainer?.trim() || existingItem?.workContainer || null,
            workWeight: item.workWeight?.trim() || existingItem?.workWeight || null,
            status: item.status || existingItem?.status || 'PENDING',
            order: item.order || index + 1,
            notes: item.notes?.trim() || existingItem?.notes || null,
          });
        });
        await this.loadingItemRepository.save(loadingItems);
        this.logger.log(`[UPDATE] loadingItems 업데이트 완료 - ${loadingItems.length}개 항목 (작업 정보 보존)`);
      }
    }
    
    const saved = await this.findOne(id);
    this.logger.log(`[UPDATE] 저장 완료 - 저장된 loadingWarehouseId: ${saved.loadingWarehouseId}, dispatchCompanyId: ${saved.dispatchCompanyId}`);

    // 고객 정보 업데이트
    if (dto.phone) {
      try {
        await this.upsertCustomer(dto);
        this.logger.log(`[SERVICE] 고객 정보 업데이트 완료 - 전화번호: ${dto.phone}`);
      } catch (error) {
        this.logger.error(`[SERVICE] 고객 정보 업데이트 실패: ${error.message}`, error.stack);
        // 고객 정보 업데이트 실패해도 배차 저장은 성공으로 처리
      }
    }

    // 변경 이력 저장 (통합: tb_feature_audit_log만 사용)
    const newDataJson = this.entityToJson(saved);
    const statusChanged = oldDataJson.status !== newDataJson.status;
    const changedFields = this.computeChangedFields(oldDataJson, newDataJson);
    const action = statusChanged ? 'STATUS_CHANGE' : 'UPDATED';
    const summaryText = statusChanged
      ? `배차 #${id} 상태 변경 ${oldDataJson.status} → ${newDataJson.status}`
      : `배차 #${id} 수정`;
    await this.featureAuditLogService.create({
      domain: 'SALES',
      feature: 'TRANSPORT',
      action,
      userId: userId ?? null,
      summary: summaryText,
      entityType: 'vehicle_dispatch',
      entityId: id,
      payload: { dispatchId: id, previousStatus: oldDataJson.status, newStatus: newDataJson.status },
      oldData: oldDataJson,
      newData: newDataJson,
      changedFields: changedFields ?? undefined,
      description: statusChanged ? `상태 변경: ${oldDataJson.status} → ${newDataJson.status}` : '배차 정보 수정',
    }).catch((err) => this.logger.warn('[기능이력] 배차 수정 로그 저장 실패', err));
    
    return saved;
  }

  async remove(id: number, userId?: number) {
    const dispatch = await this.findOne(id);
    if (!dispatch) {
      throw new NotFoundException(`배차 정보를 찾을 수 없습니다. (ID: ${id})`);
    }

    const oldDataJson = this.entityToJson(dispatch);

    // 논리적 삭제 (deletedAt, deletedBy 설정)
    await this.vehicleDispatchRepository.update(id, {
      deletedAt: new Date(),
      deletedBy: userId || null,
    });

    const newDataJson = {
      ...oldDataJson,
      deletedAt: new Date(),
      deletedBy: userId || null,
    };

    // 변경 이력 저장 (통합: tb_feature_audit_log만 사용)
    await this.featureAuditLogService.create({
      domain: 'SALES',
      feature: 'TRANSPORT',
      action: 'DELETED',
      userId: userId ?? null,
      summary: `배차 삭제 #${id}`,
      entityType: 'vehicle_dispatch',
      entityId: id,
      payload: { dispatchId: id },
      oldData: oldDataJson,
      newData: newDataJson,
      description: '배차 정보 삭제',
    }).catch((err) => this.logger.warn('[기능이력] 배차 삭제 로그 저장 실패', err));

    this.logger.log(`[DELETE] 배차 정보 논리적 삭제 완료 - ID: ${id}, userId: ${userId}`);
  }

  /**
   * 삭제된 배차 정보 복구
   */
  async restore(id: number, userId?: number) {
    const dispatch = await this.findOne(id, true); // 삭제된 항목도 포함하여 조회
    if (!dispatch) {
      throw new NotFoundException(`배차 정보를 찾을 수 없습니다. (ID: ${id})`);
    }

    if (!dispatch.deletedAt) {
      throw new NotFoundException(`배차 정보가 삭제되지 않았습니다. (ID: ${id})`);
    }

    const oldDataJson = this.entityToJson(dispatch);

    // 복구 (deletedAt, deletedBy 초기화)
    await this.vehicleDispatchRepository.update(id, {
      deletedAt: null,
      deletedBy: null,
    });

    const restored = await this.findOne(id);
    const newDataJson = this.entityToJson(restored);

    // 변경 이력 저장 (통합: tb_feature_audit_log만 사용)
    const changedFields = this.computeChangedFields(oldDataJson, newDataJson);
    await this.featureAuditLogService.create({
      domain: 'SALES',
      feature: 'TRANSPORT',
      action: 'UPDATED',
      userId: userId ?? null,
      summary: `배차 #${id} 복구`,
      entityType: 'vehicle_dispatch',
      entityId: id,
      payload: { dispatchId: id, action: 'restore' },
      oldData: oldDataJson,
      newData: newDataJson,
      changedFields: changedFields ?? undefined,
      description: '배차 정보 복구',
    }).catch((err) => this.logger.warn('[기능이력] 배차 복구 로그 저장 실패', err));

    this.logger.log(`[RESTORE] 배차 정보 복구 완료 - ID: ${id}, userId: ${userId}`);
    return restored;
  }

  /**
   * FeatureAuditLog → 기존 EntityChangeHistory 형태로 매핑 (API 호환)
   */
  private mapToLegacyHistoryShape(log: FeatureAuditLog) {
    return {
      id: log.id,
      entityType: 'VEHICLE_DISPATCH',
      entityId: log.entityId,
      changeType: log.action,
      changedFields: log.changedFields ?? null,
      oldData: log.oldData ?? null,
      newData: log.newData ?? null,
      changedBy: log.userId ?? null,
      changedAt: log.createdAt,
      description: log.description ?? null,
      changedByUser: log.user ?? null,
    };
  }

  /**
   * 상태 변경 이력 조회 (최근 N개) - 통합 테이블 tb_feature_audit_log 사용
   */
  async getStatusChangeHistory(limit: number = 10) {
    const { data } = await this.featureAuditLogService.findAll({
      feature: 'TRANSPORT',
      entityType: 'vehicle_dispatch',
      action: 'STATUS_CHANGE',
      limit,
      page: 1,
    });
    return data.map((log) => this.mapToLegacyHistoryShape(log));
  }

  /**
   * 전체 변경 이력 조회 (최근 N개) - 통합 테이블 tb_feature_audit_log 사용
   */
  async getAllChangeHistory(limit: number = 10) {
    const { data } = await this.featureAuditLogService.findAll({
      feature: 'TRANSPORT',
      entityType: 'vehicle_dispatch',
      limit,
      page: 1,
    });
    return data.map((log) => this.mapToLegacyHistoryShape(log));
  }
}

