import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, IsNull } from 'typeorm';
import { VehicleDispatch } from './entities/vehicle-dispatch.entity';
import { VehicleDispatchLoadingItem } from './entities/vehicle-dispatch-loading-item.entity';
import { EntityChangeHistory, ChangeType } from './entities/vehicle-dispatch-history.entity';
import { CreateVehicleDispatchDto } from './dto/create-vehicle-dispatch.dto';
import { UpdateVehicleDispatchDto } from './dto/update-vehicle-dispatch.dto';
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
    @InjectRepository(EntityChangeHistory)
    private changeHistoryRepository: Repository<EntityChangeHistory>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private regionsService: RegionsService,
    private citiesService: CitiesService,
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
   * 엔티티 변경 이력 저장 (범용 메서드)
   */
  private async saveChangeHistory(
    entityType: string,
    entityId: number,
    changeType: ChangeType,
    oldData: any,
    newData: any,
    changedBy?: number,
    description?: string,
  ): Promise<void> {
    try {
      // 변경된 필드 추출
      const changedFields: Record<string, { old: any; new: any }> = {};
      
      if (oldData && newData) {
        const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
        
        for (const key of allKeys) {
          const oldValue = oldData[key];
          const newValue = newData[key];
          
          // 값이 실제로 변경되었는지 확인
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changedFields[key] = { old: oldValue, new: newValue };
          }
        }
      }

      // 상태 변경인지 확인
      const isStatusChange = changedFields.hasOwnProperty('status');
      const finalChangeType: ChangeType = isStatusChange ? 'STATUS_CHANGE' : changeType;

      const history = this.changeHistoryRepository.create({
        entityType,
        entityId,
        changeType: finalChangeType,
        changedFields: Object.keys(changedFields).length > 0 ? changedFields : null,
        oldData: oldData || null,
        newData: newData || null,
        changedBy: changedBy || null,
        description: description || null,
      });

      await this.changeHistoryRepository.save(history);
      this.logger.log(`[HISTORY] 변경 이력 저장 완료 - ${entityType} #${entityId}, 타입: ${finalChangeType}`);
    } catch (error) {
      // 이력 저장 실패해도 메인 로직은 계속 진행
      this.logger.error(`[HISTORY] 변경 이력 저장 실패: ${error.message}`, error.stack);
    }
  }

  /**
   * VehicleDispatch 엔티티를 JSON으로 변환 (이력 저장용)
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
      .leftJoinAndSelect('loadingItems.loadingWarehouse', 'itemWarehouse')
      .distinct(true); // 중복 제거

    // 삭제되지 않은 항목만 조회 (기본값)
    if (!includeDeleted) {
      qb.andWhere('dispatch.deletedAt IS NULL');
    }

    // 배차 업체 ID로 필터링 (배차 업체 사용자인 경우)
    if (dispatchCompanyId !== undefined) {
      qb.andWhere('dispatch.dc_id = :dispatchCompanyId', { dispatchCompanyId });
    }

    // 창고 ID로 필터링 (창고 업체 사용자인 경우) - loadingItems 기준으로 필터링
    if (loadingWarehouseId !== undefined) {
      qb.andWhere('loadingItems.vdli_loading_warehouse_id = :loadingWarehouseId', { loadingWarehouseId });
    }

    qb.orderBy('dispatch.createdAt', 'DESC');

    // 엔티티로 직접 조회 (orderNumber는 엔티티에 포함되어 있음)
    // distinct를 사용하여 중복 제거
    const dispatches = await qb.getMany();
    
    // 디버깅: orderNumber 확인
    if (dispatches.length > 0) {
      this.logger.debug(`[findAll] 조회된 dispatch 수: ${dispatches.length}`);
      dispatches.slice(0, 3).forEach(d => {
        this.logger.debug(`[findAll] dispatch ID: ${d.id}, orderNumber: ${d.orderNumber || '(null)'}`);
      });
    }
    
    // 중복 제거 (ID 기준으로 Map을 사용하여 안전하게 처리)
    const uniqueDispatchesMap = new Map<number, VehicleDispatch>();
    dispatches.forEach(dispatch => {
      if (!uniqueDispatchesMap.has(dispatch.id)) {
        uniqueDispatchesMap.set(dispatch.id, dispatch);
      } else {
        // 중복된 경우, orderNumber가 없는 경우에만 업데이트
        const existing = uniqueDispatchesMap.get(dispatch.id)!;
        if (!existing.orderNumber && dispatch.orderNumber) {
          existing.orderNumber = dispatch.orderNumber;
        }
      }
    });
    const uniqueDispatches = Array.from(uniqueDispatchesMap.values());
    
    // loadingItems를 order 순서로 정렬
    uniqueDispatches.forEach(dispatch => {
      if (dispatch.loadingItems) {
        dispatch.loadingItems.sort((a, b) => (a.order || 0) - (b.order || 0));
      }
    });
    
    // 창고 필터링이 있는 경우, 해당 창고의 loadingItems만 포함
    if (loadingWarehouseId !== undefined) {
      return uniqueDispatches.map(dispatch => ({
        ...dispatch,
        loadingItems: dispatch.loadingItems?.filter(item => item.loadingWarehouseId === loadingWarehouseId) || []
      }));
    }

    return uniqueDispatches;
  }

  async findOne(id: number, includeDeleted: boolean = false) {
    const where: any = { id };
    if (!includeDeleted) {
      where.deletedAt = IsNull();
    }
    
    const dispatch = await this.vehicleDispatchRepository.findOne({
      where,
      relations: ['unloadingRegion', 'unloadingCity', 'loadingWarehouse', 'dispatchCompany', 'unloadingCompany', 'createdByUser', 'loadingItems', 'loadingItems.loadingWarehouse', 'deletedByUser'],
    });
    if (!dispatch) {
      throw new NotFoundException('배차 정보를 찾을 수 없습니다.');
    }
    // loadingItems를 order 순서로 정렬
    if (dispatch.loadingItems) {
      dispatch.loadingItems.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    return dispatch;
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
        status: 'DRAFT' as const,
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

      // 변경 이력 저장 (CREATE)
      const newDataJson = this.entityToJson(saved);
      await this.saveChangeHistory(
        'VEHICLE_DISPATCH',
        saved.id,
        'CREATE',
        null,
        newDataJson,
        userId,
        '배차 정보 생성'
      );
      
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
    if (dto.workBL !== undefined) {
      updateData.workBL = dto.workBL?.trim() || null;
    }
    if (dto.workContainer !== undefined) {
      updateData.workContainer = dto.workContainer?.trim() || null;
    }
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
    
    // loadingItems 업데이트
    if (dto.loadingItems !== undefined) {
      // 기존 loadingItems 삭제
      await this.loadingItemRepository.delete({ vehicleDispatchId: id });
      
      // 새로운 loadingItems 생성
      if (dto.loadingItems.length > 0) {
        const loadingItems = dto.loadingItems.map((item, index) => {
          return this.loadingItemRepository.create({
            vehicleDispatchId: id,
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
        this.logger.log(`[UPDATE] loadingItems 업데이트 완료 - ${loadingItems.length}개 항목`);
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

    // 변경 이력 저장 (UPDATE)
    const newDataJson = this.entityToJson(saved);
    const statusChanged = oldDataJson.status !== newDataJson.status;
    await this.saveChangeHistory(
      'VEHICLE_DISPATCH',
      saved.id,
      statusChanged ? 'STATUS_CHANGE' : 'UPDATE',
      oldDataJson,
      newDataJson,
      userId,
      statusChanged ? `상태 변경: ${oldDataJson.status} → ${newDataJson.status}` : '배차 정보 수정'
    );
    
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

    // 변경 이력 저장 (DELETE)
    await this.saveChangeHistory(
      'VEHICLE_DISPATCH',
      id,
      'DELETE',
      oldDataJson,
      newDataJson,
      userId,
      '배차 정보 삭제'
    );

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

    // 변경 이력 저장 (복구는 UPDATE로 기록)
    await this.saveChangeHistory(
      'VEHICLE_DISPATCH',
      id,
      'UPDATE',
      oldDataJson,
      newDataJson,
      userId,
      '배차 정보 복구'
    );

    this.logger.log(`[RESTORE] 배차 정보 복구 완료 - ID: ${id}, userId: ${userId}`);
    return restored;
  }

  /**
   * 상태 변경 이력 조회 (최근 N개)
   */
  async getStatusChangeHistory(limit: number = 10) {
    // STATUS_CHANGE 타입 또는 changed_fields에 status가 있는 UPDATE 이력 조회
    const histories = await this.changeHistoryRepository
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.changedByUser', 'changedByUser')
      .where('history.entityType = :entityType', { entityType: 'VEHICLE_DISPATCH' })
      .andWhere(
        '(history.changeType = :statusChange OR (history.changeType = :update AND history.changedFields ? :statusKey))',
        {
          statusChange: 'STATUS_CHANGE',
          update: 'UPDATE',
          statusKey: 'status',
        }
      )
      .orderBy('history.changedAt', 'DESC')
      .take(limit)
      .getMany();

    return histories;
  }

  /**
   * 전체 변경 이력 조회 (최근 N개) - CREATE, UPDATE, DELETE, STATUS_CHANGE 모두 포함
   */
  async getAllChangeHistory(limit: number = 10) {
    const histories = await this.changeHistoryRepository
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.changedByUser', 'changedByUser')
      .where('history.entityType = :entityType', { entityType: 'VEHICLE_DISPATCH' })
      .orderBy('history.changedAt', 'DESC')
      .take(limit)
      .getMany();

    return histories;
  }
}

