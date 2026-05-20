import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In, IsNull, Not } from 'typeorm';
import { Sales } from './entities/sales.entity';
import { SalesDelivery } from '../sales-delivery/entities/sales-delivery.entity';
import { SalesItem } from './entities/sales-item.entity';
import { Customer } from '../customers/entities/customer.entity';
import { CustomerPrepayment } from './entities/customer-prepayment.entity';
import { CreateSalesDto } from './dto/create-sales.dto';
import { UpdateSalesDto } from './dto/update-sales.dto';

/** 판매 upsert 시 고객 주소 필드 (Create/Update 공통) */
type SalesCustomerUpsertDto = CreateSalesDto | UpdateSalesDto;
import { GetSalesDto } from './dto/get-sales.dto';
import { UpdateSalesItemDto } from './dto/update-sales-item.dto';
import { RegionsService } from '../regions/regions.service';
import { CitiesService } from '../cities/cities.service';
import { TradeContainer } from '../trade-contracts/entities/trade-container.entity';
import { TradeOrder } from '../trade-contracts/entities/trade-order.entity';
import { resolveContainerTypeSalesItemCargoQuantities } from '../trade-contracts/sales-item-cargo.helper';
import { CodesService } from '../codes/codes.service';
import { SalesDeliveryService } from '../sales-delivery/sales-delivery.service';
import { AccountsReceivable } from '../receivables/entities/accounts-receivable.entity';
import { FeatureAuditLogService } from '../feature-audit-log/feature-audit-log.service';
import { TradeContractsService } from '../trade-contracts/trade-contracts.service';
import { CustomersService } from '../customers/customers.service';
import { applySalesListFiltersToQueryBuilder } from './sales-list-filters.helper';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    @InjectRepository(Sales)
    private readonly salesRepository: Repository<Sales>,
    @InjectRepository(SalesItem)
    private readonly salesItemRepository: Repository<SalesItem>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(TradeContainer)
    private readonly tradeContainerRepository: Repository<TradeContainer>,
    @InjectRepository(TradeOrder)
    private readonly tradeOrderRepository: Repository<TradeOrder>,
    @InjectRepository(CustomerPrepayment)
    private readonly customerPrepaymentRepository: Repository<CustomerPrepayment>,
    @InjectRepository(AccountsReceivable)
    private readonly accountsReceivableRepository: Repository<AccountsReceivable>,
    private readonly regionsService: RegionsService,
    private readonly citiesService: CitiesService,
    private readonly codesService: CodesService,
    private readonly dataSource: DataSource,
    private readonly salesDeliveryService: SalesDeliveryService,
    @InjectRepository(SalesDelivery)
    private readonly salesDeliveryRepository: Repository<SalesDelivery>,
    private readonly featureAuditLogService: FeatureAuditLogService,
    private readonly tradeContractsService: TradeContractsService,
    private readonly customersService: CustomersService,
  ) {}

  /**
   * 판매 엔티티를 이력 저장용 JSON으로 변환 (실제 데이터 확인용 전체 스냅샷)
   */
  private salesToJson(sales: Sales | null): Record<string, unknown> | null {
    if (!sales) return null;
    return {
      id: sales.id,
      customerId: sales.customerId,
      reservationDate: sales.reservationDate,
      salesDate: sales.salesDate,
      requestVehicle: sales.requestVehicle,
      transportFee: sales.transportFee != null ? Number(sales.transportFee) : null,
      unloadingPostalCode: sales.unloadingPostalCode,
      unloadingAddress: sales.unloadingAddress,
      unloadingAddressDetail: sales.unloadingAddressDetail,
      unloadingAddressRoad: sales.unloadingAddressRoad,
      unloadingAddressJibun: sales.unloadingAddressJibun,
      unloadingLegalBCode: sales.unloadingLegalBCode,
      unloadingRegion: sales.unloadingRegion,
      unloadingCity: sales.unloadingCity,
      registeredBy: sales.registeredBy,
      invoiceStatus: sales.invoiceStatus,
      status: sales.status,
      cancelledAt: sales.cancelledAt,
      cancellationReason: sales.cancellationReason,
      advancePaymentRatio: sales.advancePaymentRatio != null ? Number(sales.advancePaymentRatio) : null,
      advancePaymentAmount: sales.advancePaymentAmount != null ? Number(sales.advancePaymentAmount) : null,
      notes: sales.notes ?? null,
      createdAt: sales.createdAt,
      updatedAt: sales.updatedAt,
      items: (sales.items ?? []).map((item) => ({
        id: item.id,
        salesId: item.salesId,
        containerId: item.containerId,
        containerType: item.containerType,
        cargoBales: item.cargoBales != null ? Number(item.cargoBales) : null,
        cargoWeight: item.cargoWeight != null ? Number(item.cargoWeight) : null,
        stoCost: item.stoCost != null ? Number(item.stoCost) : null,
        dtCost: item.dtCost != null ? Number(item.dtCost) : null,
        advancePaymentRatio: item.advancePaymentRatio != null ? Number(item.advancePaymentRatio) : null,
        salesUnitPrice: item.salesUnitPrice != null ? Number(item.salesUnitPrice) : null,
        salesUnitPriceStage: item.salesUnitPriceStage,
        status: item.status,
        reservationDate: item.reservationDate,
        reservationNotes: item.reservationNotes,
        reservationCoId: item.reservationCoId,
        infoChangedReason: item.infoChangedReason,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }

  private normalizePhone(phone?: string | null): string | null {
    if (!phone) {
      return null;
    }
    const digits = phone.replace(/[^0-9]/g, '');
    return digits.length > 0 ? digits : null;
  }

  private sanitize(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /** 법정동코드: 숫자만 최대 10자 (빈 값이면 null) */
  private normalizeCustomerLegalBCode(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const raw = String(value).replace(/\D/g, '');
    if (!raw.length) {
      return null;
    }
    return raw.slice(0, 10);
  }

  private normalizeRegionName(input?: string | null): string | null {
    if (!input) {
      return null;
    }
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }
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

  /**
   * 마진 계산 (판매단가 - 원가 - 운송비 - STO비용 - DT비용)
   */
  private calculateMargin(
    salesUnitPrice: number | null,
    purchaseCost: number | null,
    transportFeePerKg: number = 0,
    stoCost: number = 0,
    dtCost: number = 0,
    workFee: number = 0,
  ): number | null {
    if (!salesUnitPrice || purchaseCost === null || purchaseCost === undefined) {
      return null;
    }
    return salesUnitPrice - purchaseCost - transportFeePerKg - stoCost - dtCost - workFee;
  }

  /**
   * 컨테이너별 운송비 계산 (kg당)
   */
  private calculateTransportFeePerKg(
    totalTransportFee: number | null,
    containerWeight: number | null,
    totalWeight: number | null,
  ): number {
    if (!totalTransportFee || !containerWeight || !totalWeight || totalWeight === 0 || containerWeight === 0) {
      return 0;
    }
    const weightRatio = containerWeight / totalWeight;
    const allocatedTransportFee = totalTransportFee * weightRatio;
    return allocatedTransportFee / (containerWeight * 1000);
  }

  /**
   * 날짜를 YYYY-MM-DD 형식의 문자열로 변환하는 헬퍼 함수
   */
  private formatDate(date: any): string | null {
    if (!date) return null;

    try {
      if (date instanceof Date) {
        return date.toISOString().split('T')[0];
      }
      if (typeof date === 'string') {
        // 이미 YYYY-MM-DD 형식이거나 ISO 형식인 경우
        if (date.includes('T')) {
          return date.split('T')[0];
        }
        // YYYY-MM-DD 형식인 경우 그대로 반환
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return date;
        }
        // 다른 형식인 경우 Date로 변환 시도
        const parsed = new Date(date);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0];
        }
      }
      // 숫자 타임스탬프인 경우
      if (typeof date === 'number') {
        const parsed = new Date(date);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().split('T')[0];
        }
      }
      // 그 외의 경우 Date 생성자로 시도
      const parsed = new Date(date);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    } catch (error) {
      this.logger.warn(`[formatDate] 날짜 변환 실패: ${date}, 에러: ${error}`);
    }

    return null;
  }

  private async findCustomerByPhone(phone: string): Promise<Customer | null> {
    const normalized = this.normalizePhone(phone);
    if (!normalized) {
      return null;
    }

    return this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.regionEntity', 'region')
      .leftJoinAndSelect('customer.cityEntity', 'city')
      .where("regexp_replace(customer.cu_phone, '[^0-9]', '', 'g') = :normalized", { normalized })
      .getOne();
  }

  /**
   * 고객 정보를 upsert합니다.
   * customerId가 있으면 해당 고객을 찾아서 업데이트하고,
   * customerId가 없으면 전화번호로 찾거나 새로 생성합니다.
   */
  private async upsertCustomer(
    dto: SalesCustomerUpsertDto,
    manager?: any,
    options?: { skipCustomerAddressUpdates?: boolean },
  ): Promise<Customer | null> {
    const customerRepo = manager?.getRepository(Customer) || this.customerRepository;
    const skipCustomerAddr = options?.skipCustomerAddressUpdates === true;

    // customerId가 있으면 우선적으로 해당 고객을 찾아서 업데이트
    let customer: Customer | null = null;
    let customerIdProvided = false;

    if (dto.customerId) {
      customerIdProvided = true;
      customer = await customerRepo.findOne({
        where: { id: dto.customerId },
        relations: ['regionEntity', 'cityEntity'],
      });

      if (!customer) {
        this.logger.warn(`고객 ID ${dto.customerId}를 찾을 수 없습니다.`);
        // customerId가 제공되었지만 찾지 못했으면 에러 (새로 생성하지 않음)
        return null;
      }
      // customerId로 찾은 고객은 전화번호가 없어도 선택 가능 (나중에 dto.phone으로 업데이트 가능)
    }

    // customerId가 제공되지 않았을 때만 전화번호로 찾기
    // customerId가 있으면 이미 고객을 찾았으므로 전화번호로 다시 찾지 않음
    if (!customerIdProvided && !customer && dto.phone) {
      const normalized = this.normalizePhone(dto.phone);
      if (normalized) {
        customer = await customerRepo
          .createQueryBuilder('customer')
          .leftJoinAndSelect('customer.regionEntity', 'region')
          .leftJoinAndSelect('customer.cityEntity', 'city')
          .where("regexp_replace(customer.cu_phone, '[^0-9]', '', 'g') = :normalized", { normalized })
          .getOne();
      }
    }

    // 여전히 없으면 새로 생성
    // 전화번호는 선택사항이므로 없어도 고객 생성 가능
    if (!customer) {
      // 최소한 고객 ID나 업체명 중 하나는 있어야 함
      if (!dto.customerId && !dto.companyName && !dto.phone) {
        // 고객 정보가 전혀 없으면 생성 불가
        return null;
      }
      customer = customerRepo.create();
    }

    // 고객 정보 업데이트
    // dto.phone이 있으면 업데이트 (빈 문자열이 아닌 경우)
    const hasPhoneInDto = dto.phone !== undefined && dto.phone !== null && dto.phone.trim() !== '';
    if (hasPhoneInDto) {
      const trimmedPhone = dto.phone.trim();
      const sanitized = this.sanitize(trimmedPhone);
      const normalized = this.normalizePhone(trimmedPhone);
      // sanitize나 normalizePhone이 null을 반환해도 원본 전화번호를 사용
      customer.phone = sanitized ?? normalized ?? trimmedPhone;
    }
    // 전화번호는 선택사항이므로 없어도 저장 가능

    if (dto.companyName !== undefined) {
      customer.companyName = this.sanitize(dto.companyName);
    }

    if (dto.ceo !== undefined) {
      customer.ceo = this.sanitize(dto.ceo);
    }

    // 지역·시군구 (저장 배송지 선택 시 스킵 — 하차지 지역은 판매/배송지행만, 고객 카드는 건드리지 않음)
    if (!skipCustomerAddr) {
      if (dto.region !== undefined) {
        const rawRegion = this.sanitize(dto.region);
        const normalizedRegion = this.normalizeRegionName(rawRegion);
        const candidates = Array.from(new Set([normalizedRegion, rawRegion].filter((v): v is string => !!v)));
        let region = null;
        for (const candidate of candidates) {
          region = await this.regionsService.findByName(candidate);
          if (region) break;
        }
        if (region) {
          customer.regionId = region.id;
          customer.regionEntity = region;
        } else {
          customer.regionId = null;
          customer.regionEntity = null;
        }
      }

      if (dto.customerCity !== undefined) {
        const cityName = this.sanitize(dto.customerCity);
        if (cityName) {
          let city = null;
          if (customer.regionId) {
            const cities = await this.citiesService.findByRegionId(customer.regionId);
            city = cities.find((c) => c.name === cityName) || null;
          }
          if (!city) {
            city = await this.citiesService.findByName(cityName);
          }
          if (city) {
            customer.cityId = city.id;
            customer.cityEntity = city;
          } else {
            customer.cityId = null;
            customer.cityEntity = null;
          }
        } else {
          customer.cityId = null;
          customer.cityEntity = null;
        }
      }
    }

    // 우편·도로명·지번·상세 등 대표 주소 (저장 배송지 선택 시에는 하차지만 해당 배송지 행에 반영)
    if (!skipCustomerAddr) {
      if (dto.customerPostalCode !== undefined) {
        customer.postalCode = this.sanitize(dto.customerPostalCode);
      }

      if (dto.customerAddressRoad !== undefined) {
        customer.addressRoad = this.sanitize(dto.customerAddressRoad);
      }
      if (dto.customerAddressJibun !== undefined) {
        customer.addressJibun = this.sanitize(dto.customerAddressJibun);
      }
      if (dto.customerLegalBCode !== undefined) {
        customer.legalBCode = this.normalizeCustomerLegalBCode(dto.customerLegalBCode);
      }
      if (dto.customerAddressDefaultType !== undefined) {
        customer.addressDefaultType = this.sanitize(dto.customerAddressDefaultType);
      }

      if (dto.customerAddress !== undefined) {
        customer.address = this.sanitize(dto.customerAddress);
      } else if (dto.customerAddressRoad !== undefined || dto.customerAddressJibun !== undefined) {
        const jibun = (customer.addressJibun ?? '').trim();
        const road = (customer.addressRoad ?? '').trim();
        const derived = jibun || road;
        customer.address = derived.length > 0 ? derived : null;
      }

      if (dto.addressDetail !== undefined) {
        customer.addressDetail = this.sanitize(dto.addressDetail);
      }
    }

    return await customerRepo.save(customer);
  }

  /**
   * SalesItem 상태에서 판매 상태(RESERVED, SOLD, COMPLETED) 도출 (취소 제외)
   */
  private deriveSalesStatusFromItems(items: SalesItem[]): 'RESERVED' | 'SOLD' | 'COMPLETED' | null {
    const nonCancelled = (items ?? []).filter((i) => i.status && i.status !== 'SALES_ITEM_CANCELLED');
    if (nonCancelled.length === 0) return null;
    const priority: Record<string, number> = {
      SALES_ITEM_RESERVED: 1,
      SALES_ITEM_SOLD: 2,
      SALES_ITEM_COMPLETED: 4,
    };
    const highest = nonCancelled.reduce((best, item) => {
      const p = priority[item.status ?? ''] ?? 0;
      return p > (priority[best ?? ''] ?? 0) ? (item.status ?? null) : best;
    }, null as string | null);
    if (!highest) return null;
    if (highest === 'SALES_ITEM_RESERVED') return 'RESERVED';
    if (highest === 'SALES_ITEM_SOLD') return 'SOLD';
    if (highest === 'SALES_ITEM_COMPLETED') return 'COMPLETED';
    return null;
  }

  /**
   * 지정된 컨테이너들의 재고 상태를 재계산합니다.
   * 거래명세서 수정 등으로 SalesItem.cargoWeight가 변경된 후 호출합니다.
   */
  async recalculateContainerInventory(containerIds: string[], manager?: any): Promise<void> {
    const unique = [...new Set(containerIds.filter(Boolean))];
    await Promise.all(unique.map((id) => this.updateContainerInventoryStatus(id, manager)));
  }

  /**
   * 컨테이너의 재고 상태를 계산하고 업데이트합니다.
   */
  private async updateContainerInventoryStatus(containerId: string, manager?: any): Promise<void> {
    const containerRepo = manager ? manager.getRepository(TradeContainer) : this.tradeContainerRepository;
    const salesItemRepo = manager ? manager.getRepository(SalesItem) : this.salesItemRepository;

    // 컨테이너 조회
    const container = await containerRepo.findOne({
      where: { id: containerId },
    });

    if (!container) {
      return;
    }

    // 컨테이너의 모든 판매 항목 조회 (취소 제외)
    const salesItems = await salesItemRepo.find({
      where: { containerId },
    });

    // 판매 수량 계산
    let soldBales = 0;
    let soldWeight = 0;
    let hasReservedOnly = true; // 판매예약만 있는지 확인
    let hasCompleted = false; // 판매완료가 하나라도 있는지
    let hasInProgress = false; // SALES_ITEM_SOLD(판매) 등 미하차 항목이 있는지

    salesItems.forEach((item) => {
      // 취소된 판매는 제외
      if (item.status === 'SALES_ITEM_CANCELLED') {
        return;
      }

      // 재고 입고/소모는 판매 수량 계산에 포함 (음수/양수로 처리)
      // 재고 입고는 음수로 저장되어 판매 수량에서 차감됨 (가용 수량 증가)
      // 재고 소모는 양수로 저장되어 판매 수량에 추가됨 (가용 수량 감소)

      // 판매예약이 아닌 항목이 있으면 hasReservedOnly = false
      // 재고 입고/소모는 판매예약이 아니므로 hasReservedOnly = false
      if (item.status !== 'SALES_ITEM_RESERVED') {
        hasReservedOnly = false;
      }

      // 판매완료가 있으면 hasCompleted = true
      // 재고 소모는 판매완료 상태이므로 hasCompleted = true
      if (item.status === 'SALES_ITEM_COMPLETED' || item.status === 'INVENTORY_CONSUMPTION') {
        hasCompleted = true;
      }

      // SALES_ITEM_SOLD(판매) = 하차 전 → 아직 판매 완료 아님
      if (item.status === 'SALES_ITEM_SOLD' || item.status === 'SALES_ITEM_RESERVED') {
        hasInProgress = true;
      }

      if (item.containerType === 'CONTAINER') {
        const q = resolveContainerTypeSalesItemCargoQuantities(container, item);
        soldBales += q.bales;
        soldWeight += q.weight;
      } else {
        // CARGO 타입: cargoBales/cargoWeight 사용
        const cargoBales = item.cargoBales ? Number(item.cargoBales) : 0;
        const cargoWeight = item.cargoWeight ? Number(item.cargoWeight) : 0;
        soldBales += cargoBales;
        soldWeight += cargoWeight;
      }
    });

    // 가용 수량 계산 (영업 베일 기준)
    // 재고 입고/소모로 인해 가용 수량이 마이너스가 되거나 전체 수량보다 커질 수 있음
    const originalBales = (container.salesBales != null && container.salesBales !== '' ? Number(container.salesBales) : (container.tradeBales ? Number(container.tradeBales) : 0));
    const originalWeight = container.weight ? Number(container.weight) : 0;
    const availableBales = originalBales - soldBales; // Math.max 제거: 마이너스 허용
    const availableWeight = originalWeight - soldWeight; // Math.max 제거: 마이너스 허용

    // 부동소수점 오차 허용 (0.001 톤 = 1kg) - 0 이하 판단 시 사용
    const EPSILON = 0.001;
    const isBalesZeroOrNegative = availableBales <= EPSILON;
    const isWeightZeroOrNegative = availableWeight <= EPSILON;

    // 재고 상태 결정
    let inventoryStatus: 'AVAILABLE' | 'RESERVED' | 'PARTIALLY_RESERVED' | 'PARTIALLY_SOLD' | 'PARTIALLY_SOLD_COMPLETED' | 'SELLING' | 'SOLD_OUT' | null = null;

    // 모두 판매됨 판단: 가용 0 이하 = 다 나감 (음수·과다 판매 포함, epsilon으로 부동소수점 처리)
    const hasOriginalBales = originalBales > 0;
    const hasOriginalWeight = originalWeight > 0;
    const isSoldOut =
      (hasOriginalBales && isBalesZeroOrNegative && (!hasOriginalWeight || isWeightZeroOrNegative)) ||
      (hasOriginalWeight && isWeightZeroOrNegative && (!hasOriginalBales || isBalesZeroOrNegative)) ||
      (hasOriginalBales && hasOriginalWeight && isBalesZeroOrNegative && isWeightZeroOrNegative);

    if (soldBales > 0 || soldWeight > 0) {
      // 판매가 있음
      if (hasReservedOnly && salesItems.length > 0) {
        // 판매예약만 있음
        if (isSoldOut) {
          // 전체가 예약됨 → 예약됨
          inventoryStatus = 'RESERVED';
        } else {
          // 일부만 예약됨 → 부분 예약
          inventoryStatus = 'PARTIALLY_RESERVED';
        }
      } else if (isSoldOut) {
        // 판매(확정)가 있고 모두 판매됨
        // SALES_ITEM_SOLD(판매)가 남아 있으면 하차 전 → 판매중. 모두 COMPLETED/재고소모여야 판매 완료
        if (hasCompleted && !hasInProgress) {
          inventoryStatus = 'SOLD_OUT';
        } else {
          inventoryStatus = 'SELLING';
        }
      } else {
        // 부분 판매 (판매 확정이 있는 경우)
        if (hasCompleted) {
          // 부분 판매 완료 (하차완료 후)
          inventoryStatus = 'PARTIALLY_SOLD_COMPLETED';
        } else {
          // 부분 판매중 (하차완료 전)
          inventoryStatus = 'PARTIALLY_SOLD';
        }
      }
    } else {
      // 판매 없음
      inventoryStatus = 'AVAILABLE';
    }

    // 재고 상태 업데이트
    await containerRepo.update(containerId, { inventoryStatus });

    const containerNo = container.containerNo ?? '';
    const isTestContainer = containerNo === 'MRSU8496526';

    if (isTestContainer) {
      this.logger.debug(
        `[재고-TEST MRSU8496526] 컨테이너번호: ${containerNo}, 판매항목수: ${salesItems.length}, ` +
          `각항목(cargoBales/cargoWeight): ${salesItems.map((i) => `[${i.cargoBales ?? 'null'}/${i.cargoWeight ?? 'null'}]`).join(', ')}, ` +
          `판매수량: 베일=${soldBales} 중량=${soldWeight}, 가용수량: 베일=${availableBales} 중량=${availableWeight}, 상태: ${inventoryStatus}`,
      );
    }

    this.logger.debug(
      `[재고 상태 업데이트] 컨테이너 ID: ${containerId}, 판매수량: ${soldBales}/${soldWeight}, 가용수량: ${availableBales}/${availableWeight}, 상태: ${inventoryStatus}`,
    );
  }

  /**
   * 판매 항목의 기본 상태를 결정합니다.
   * 입고 상태에 따라 판매 항목 상태를 설정합니다.
   */
  private async determineSalesItemStatus(containerId: string): Promise<string | null> {
    const container = await this.tradeContainerRepository.findOne({
      where: { id: containerId },
      relations: ['order'],
    });

    if (!container || !container.order) {
      return null;
    }

    // TradeOrder의 to_inbound_status를 확인
    const inboundStatus = container.order.inboundStatus;

    // 입고 상태에 따라 판매 항목 상태 결정
    if (inboundStatus === 'INBOUND_SCHEDULED') {
      return 'SALES_ITEM_RESERVED'; // 예정 → 판매예약
    } else if (inboundStatus === 'INBOUND_CONFIRMED') {
      return 'SALES_ITEM_SOLD'; // 확정 → 판매
    }

    return null;
  }

  async create(dto: CreateSalesDto, userId?: number): Promise<Sales> {
    // 판매 항목 없이 저장 허용 (잘못된 배정 수정 시 활용)
    const items = dto.items ?? [];

    // 트랜잭션으로 처리 (STO/DT/workFee 변경 시 확정원가 재계산 대상 컨테이너 ID 수집)
    const containerIdsForCostRecalc: string[] = [];
    const result = await this.dataSource.transaction(async (manager) => {
      // 1. 고객 정보 upsert (저장 배송지 선택 시 대표 주소 필드는 건드리지 않음 → 해당 배송지 행만 하차지로 갱신)
      const deliveryAddrIdCreate = dto.unloadingDeliveryAddressId?.trim();
      const customer = await this.upsertCustomer(dto, manager, {
        skipCustomerAddressUpdates: Boolean(deliveryAddrIdCreate),
      });
      if (!customer) {
        throw new BadRequestException('고객 정보가 필요합니다. (고객 ID 또는 업체명)');
      }

      if (deliveryAddrIdCreate) {
        this.logger.debug(
          `[판매 등록-배송지행] customerId=${customer.id} deliveryAddressId=${deliveryAddrIdCreate} ` +
            `→ 선택 배송지 행에 하차지 반영 (DTO 요약은 [배송지행-시작], 저장 결과는 [배송지행-완료])`,
        );
        await this.customersService.applySalesUnloadingToDeliveryAddress(
          customer.id,
          deliveryAddrIdCreate,
          dto,
          manager,
        );
      }
      this.logger.debug(
        `[판매 등록-고객] customerId=${customer.id}, unloadingDeliveryAddressId=${deliveryAddrIdCreate ?? '(없음)'}, ` +
          `고객카드(대표주소·지역·시군구)=${deliveryAddrIdCreate ? '스킵(선택배송지행만)' : 'upsert반영'}`,
      );

      // 2. 판매 정보 생성
      const reservationDateStr = dto.reservationDate?.trim();
      const salesDateStr = dto.salesDate?.trim();
      
      // 선입금 정보 저장 (판매 전체 기준)
      const advancePaymentRatio = dto.advancePaymentRatio != null ? dto.advancePaymentRatio.toString() : null;
      const advancePaymentAmount = dto.advancePaymentAmount != null ? dto.advancePaymentAmount.toString() : null;
      
      const sales = this.salesRepository.create({
        customerId: customer.id,
        reservationDate: reservationDateStr && reservationDateStr.length > 0 ? new Date(reservationDateStr) : null,
        salesDate: salesDateStr && salesDateStr.length > 0 ? new Date(salesDateStr) : null,
        requestVehicle: dto.requestVehicle?.trim() || null,
        transportFee: dto.transportFee != null ? dto.transportFee : null,
        unloadingPostalCode: dto.unloadingPostalCode?.trim() || null,
        unloadingAddress: dto.unloadingAddress?.trim() || null,
        unloadingAddressDetail: dto.unloadingAddressDetail?.trim() || null,
        unloadingRegion: dto.unloadingRegion?.trim() || null,
        unloadingCity: dto.unloadingCity?.trim() || null,
        unloadingAddressRoad: dto.unloadingAddressRoad?.trim() || null,
        unloadingAddressJibun: dto.unloadingAddressJibun?.trim() || null,
        unloadingLegalBCode:
          dto.unloadingLegalBCode?.replace(/\D/g, '').slice(0, 10) || null,
        registeredBy: userId || null,
        advancePaymentRatio: advancePaymentRatio,
        advancePaymentAmount: advancePaymentAmount,
        notes: dto.notes !== undefined ? this.sanitize(dto.notes) : null,
      });

      const savedSales = await manager.save(Sales, sales);

      // 3. 판매 항목 생성
      const salesItems = await Promise.all(
        items.map(async (itemDto) => {
          // 컨테이너 존재 확인 (order relation 포함)
          const container = await manager.findOne(TradeContainer, {
            where: { id: itemDto.containerId },
            relations: ['order'],
          });

          if (!container) {
            throw new NotFoundException(`컨테이너 ID ${itemDto.containerId}를 찾을 수 없습니다.`);
          }

          // 판매 항목 상태 결정
          // 예약 등록(RESERVED) = 전부 예약. 판매 등록(SALE) = 입고 예정→예약, 입고 확정→판매. 미지정 시 입고상태 기준
          let status = itemDto.status;
          if (dto.registerAs === 'RESERVED') {
            status = 'SALES_ITEM_RESERVED'; // 예약 등록: 전부 판매 예약
          } else if (dto.registerAs === 'SALE' || !dto.registerAs) {
            // 판매 등록 또는 미지정: 입고 예정→판매 예약, 입고 확정→판매
            if (!status && container.order?.inboundStatus) {
              if (container.order.inboundStatus === 'INBOUND_SCHEDULED') {
                status = 'SALES_ITEM_RESERVED';
              } else if (container.order.inboundStatus === 'INBOUND_CONFIRMED') {
                status = 'SALES_ITEM_SOLD';
              }
            }
          }
          if (!status) {
            status = 'SALES_ITEM_RESERVED';
          }

          // 디버깅: 상태 결정 로그
          this.logger.debug(`[판매 등록] 컨테이너 ID: ${itemDto.containerId}, 입고상태: ${container.order?.inboundStatus}, 결정된 판매상태: ${status}`);

          // STO, DT, 작업비를 컨테이너에도 저장 (입고 확정 상태일 때만)
          if (container.order?.inboundStatus === 'INBOUND_CONFIRMED') {
            const updateData: any = {};
            if (itemDto.stoCost !== undefined && itemDto.stoCost !== null) {
              updateData.stoCost = itemDto.stoCost.toString();
            }
            if (itemDto.dtCost !== undefined && itemDto.dtCost !== null) {
              updateData.dtCost = itemDto.dtCost.toString();
            }
            if (itemDto.workFee !== undefined && itemDto.workFee !== null) {
              updateData.workFee = itemDto.workFee.toString();
            }
            if (itemDto.onsiteWorkFee !== undefined && itemDto.onsiteWorkFee !== null) {
              updateData.onsiteWorkFee = itemDto.onsiteWorkFee.toString();
            }
            if (Object.keys(updateData).length > 0) {
              await manager.update(TradeContainer, { id: itemDto.containerId }, updateData);
              containerIdsForCostRecalc.push(itemDto.containerId);
            }
          }

          // 예약 정보 저장 (입고 예정인 경우)
          const isReservation = status === 'SALES_ITEM_RESERVED' || container.order?.inboundStatus === 'INBOUND_SCHEDULED';
          const reservationDate = isReservation && reservationDateStr && reservationDateStr.length > 0 
            ? new Date(reservationDateStr) 
            : null;
          const reservationCoId = isReservation ? itemDto.containerId : null;

          const salesItem = this.salesItemRepository.create({
            salesId: savedSales.id,
            containerId: itemDto.containerId,
            containerType: itemDto.containerType || 'CONTAINER',
            cargoBales: itemDto.cargoBales?.toString() || null,
            cargoWeight: itemDto.cargoWeight?.toString() || null,
            stoCost: itemDto.stoCost?.toString() || null,
            dtCost: itemDto.dtCost?.toString() || null,
            advancePaymentRatio: itemDto.advancePaymentRatio?.toString() || null,
            // margin은 더 이상 저장하지 않음 - 계산 필드로 사용
            salesUnitPrice: itemDto.salesUnitPrice?.toString() || null,
            salesUnitPriceStage: itemDto.salesUnitPriceStage || null,
            status: status, // 판매예약(SALES_ITEM_RESERVED) 또는 판매(SALES_ITEM_SOLD) 상태 저장
            // 예약 정보
            reservationDate: reservationDate,
            reservationCoId: reservationCoId,
          });
          this.logger.debug(
            `[판매 등록] 구분(salesUnitPriceStage) 저장 - containerId: ${itemDto.containerId}, salesUnitPriceStage: ${itemDto.salesUnitPriceStage ?? 'null'}`,
          );
          return await manager.save(SalesItem, salesItem);
        }),
      );

      // 4. 재고 상태 업데이트 (각 컨테이너별로)
      const uniqueContainerIds = Array.from(new Set(items.map((item) => item.containerId)));
      await Promise.all(
        uniqueContainerIds.map((containerId) => this.updateContainerInventoryStatus(containerId, manager)),
      );

      savedSales.items = salesItems;

      // sa_status 설정 (판매 생성 시)
      const derivedStatus = this.deriveSalesStatusFromItems(salesItems);
      if (derivedStatus) {
        savedSales.status = derivedStatus;
        await manager.save(Sales, savedSales);
      }

      // 5. 선입금 데이터 저장 (입고 예정/확정 모두 처리)
      // 선입금 금액 계산 (직접 입력 금액이 있으면 사용, 없으면 비율로 계산)
      let prepaymentAmount: number | null = null;
      
      if (advancePaymentAmount) {
        prepaymentAmount = parseFloat(advancePaymentAmount);
      } else if (advancePaymentRatio) {
        // 전체 판매가 계산 (입고 예정/확정 모두 포함)
        let totalSalesPrice = 0;
        for (const item of salesItems) {
          const container = await manager.findOne(TradeContainer, {
            where: { id: item.containerId },
          });
          if (container) {
            const weight = parseFloat(container.weight || '0');
            const salesUnitPrice = parseFloat(item.salesUnitPrice || '0');
            const salesPrice = salesUnitPrice > 0 && weight > 0 ? salesUnitPrice * weight * 1000 : 0;
            totalSalesPrice += salesPrice;
          }
        }
        const ratio = parseFloat(advancePaymentRatio);
        prepaymentAmount = totalSalesPrice * (ratio / 100);
      }

      // 선입금 금액이 있으면 저장
      if (prepaymentAmount && prepaymentAmount > 0) {
        const prepayment = manager.create(CustomerPrepayment, {
          customerId: customer.id,
          salesId: savedSales.id,
          salesItemId: null, // 판매 전체 기준이므로 NULL
          prepaymentAmount: prepaymentAmount.toString(),
          status: 'REQUESTED', // DEPRECATED: 하위 호환성 유지
          paymentStatus: 'REQUESTED',
          deductionStatus: 'NOT_DEDUCTED',
          requestedDate: reservationDateStr && reservationDateStr.length > 0 
            ? new Date(reservationDateStr) 
            : (salesDateStr && salesDateStr.length > 0 
              ? new Date(salesDateStr) 
              : new Date()),
        });

        await manager.save(CustomerPrepayment, prepayment);
        this.logger.debug(`[판매 등록] 선입금 생성 완료 - 판매 ID: ${savedSales.id}, 금액: ${prepaymentAmount}`);
      }

      // 6. 배송 자동 생성 (판매 항목 중 SALES_ITEM_SOLD (판매) 상태가 있으면)
      // 트랜잭션 내부에서 실행하되, 실패해도 판매 생성은 성공으로 처리
      this.logger.debug(`[판매 생성] 배송 자동 생성 시도 - 판매 ID: ${savedSales.id}, 판매 항목 수: ${salesItems.length}`);
      const salesItemStatuses = salesItems.map(item => ({ id: item.id, status: item.status }));
      this.logger.debug(`[판매 생성] 판매 항목 상태: ${JSON.stringify(salesItemStatuses)}`);
      
      // 배송 생성 전에 customer 관계 로드
      if (!savedSales.customer) {
        const salesWithCustomer = await manager.findOne(Sales, {
          where: { id: savedSales.id },
          relations: ['customer', 'customer.regionEntity', 'customer.cityEntity'],
        });
        if (salesWithCustomer) {
          savedSales.customer = salesWithCustomer.customer;
        }
      }
      
      try {
        const delivery = await this.salesDeliveryService.createFromSales(savedSales, salesItems, userId, manager);
        if (delivery) {
          this.logger.debug(`[판매 생성] 배송 자동 생성 성공 - 배송 ID: ${delivery.id}`);
        } else {
          this.logger.debug(`[판매 생성] 배송 자동 생성 건너뜀 (조건 불만족)`);
        }
      } catch (error) {
        this.logger.error(`[판매 생성] 배송 자동 생성 실패: ${error.message}`, error.stack);
        // 배송 생성 실패해도 판매 생성은 성공으로 처리
      }

      return savedSales;
    });
    const createdWithItems = await this.salesRepository.findOne({
      where: { id: result.id },
      relations: ['items'],
    });
    const newDataJson = this.salesToJson(createdWithItems);
    await this.featureAuditLogService.create({
      domain: 'SALES',
      feature: 'SALES_MANAGEMENT',
      action: 'CREATED',
      userId: userId ?? null,
      summary: `판매 등록 #${result.id} (항목 ${items.length}건)`,
      entityType: 'sales',
      entityId: parseInt(String(result.id), 10) || undefined,
      payload: { salesId: result.id, itemsCount: items.length },
      newData: newDataJson as Record<string, unknown>,
    }).catch((err) => this.logger.warn('[기능이력] 판매 등록 로그 저장 실패', err));

    // STO/DT/workFee 변경된 컨테이너의 확정원가 재계산 (트랜잭션 커밋 후)
    const uniqueContainerIds = [...new Set(containerIdsForCostRecalc)];
    for (const containerId of uniqueContainerIds) {
      try {
        await this.tradeContractsService.recalculateContainerCost(containerId);
        this.logger.debug(`[판매 등록] 확정원가 재계산 완료 - containerId: ${containerId}`);
      } catch (err) {
        this.logger.warn(`[판매 등록] 확정원가 재계산 실패 (containerId=${containerId}):`, err);
      }
    }

    return result;
  }

  async findAll(dto: GetSalesDto) {
    this.logger.debug(
      `[findAll] 요청 파라미터: startDate=${dto.startDate}, endDate=${dto.endDate}, dateType=${dto.dateType ?? 'createdAt'}, page=${dto.page ?? 1}, limit=${dto.limit ?? 20}`,
    );

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const sortBy = dto.sortBy ?? 'createdAt';
    const sortOrder = dto.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const queryBuilder = this.salesRepository
      .createQueryBuilder('sales')
      .leftJoinAndSelect('sales.customer', 'customer')
      .leftJoinAndSelect('sales.registeredByUser', 'registeredByUser')
      .leftJoinAndSelect('sales.items', 'items')
      .leftJoinAndSelect('items.container', 'container')
      .leftJoinAndSelect('container.order', 'order', 'order.to_deleted_at IS NULL')
      .leftJoinAndSelect('order.contract', 'contract', 'contract.tc_deleted_at IS NULL')
      .leftJoinAndSelect('order.inbounds', 'inbounds');

    const dateType = dto.dateType ?? 'createdAt';
    if (dto.startDate && dto.endDate && dateType === 'invoiceIssuedAt') {
      const invoiceStartDate = new Date(dto.startDate);
      invoiceStartDate.setHours(0, 0, 0, 0);
      const invoiceEndDate = new Date(dto.endDate);
      invoiceEndDate.setHours(23, 59, 59, 999);
      this.logger.debug(
        `[findAll] 거래명세서 발행일 기준 필터: 기간 ${dto.startDate} ~ ${dto.endDate}, ` +
          `iv_issued_at >= ${invoiceStartDate.toISOString()} AND <= ${invoiceEndDate.toISOString()}`,
      );
    }

    applySalesListFiltersToQueryBuilder(queryBuilder, dto);

    // 전체 개수
    const total = await queryBuilder.getCount();

    // 정렬 (예약일/판매일: 표시날짜 기준 = 판매예약은 예약일, 나머지는 판매일)
    const sortColumnMap: Record<string, string> = {
      createdAt: 'sales.createdAt',
      reservationDate: 'sales.reservationDate',
      salesDate: 'sales.salesDate',
      customerName: 'customer.companyName',
      status: 'sales.status',
    };

    let sales: Sales[];

    if (sortBy === 'reservationDate') {
      // TypeORM orderBy는 COALESCE/CASE 파싱 오류 → 정렬용 ID만 raw로 조회 후 엔티티 로드
      const idsQb = queryBuilder.clone();
      const fetchSize = (skip + limit) * 50; // join으로 행 중복되므로 넉넉히
      idsQb
        .select('sales.id')
        .orderBy('sales.id', 'ASC')
        .skip(0)
        .take(fetchSize);
      const [idsSql, idsParamsArray] = idsQb.getQueryAndParameters();
      const displayDateOrder =
        'CASE WHEN "sales"."sa_status" = \'RESERVED\' THEN "sales"."sa_reservation_date" ELSE "sales"."sa_sales_date" END';
      const orderedSql = idsSql.replace(
        /ORDER BY[\s\S]*$/,
        `ORDER BY ${displayDateOrder} ${sortOrder} LIMIT ${fetchSize} OFFSET 0`,
      );
      // 치환으로 제거된 LIMIT/OFFSET 자리($n, $n+1) 제외한 배열 전달 (pg는 배열만 허용)
      const paramsForQuery = idsParamsArray.slice(0, -2);
      const rawRows = await this.dataSource.query(orderedSql, paramsForQuery);
      const seen = new Set<string>();
      const orderedIds: string[] = [];
      for (const row of rawRows) {
        const id = String(row?.sales_sa_id ?? row?.sales_id ?? row?.id ?? '');
        if (id && !seen.has(id)) {
          seen.add(id);
          orderedIds.push(id);
        }
      }
      const pageIds = orderedIds.slice(skip, skip + limit);
      if (pageIds.length === 0) {
        sales = [];
      } else {
        const mainQb = queryBuilder.clone();
        mainQb.andWhere('sales.id IN (:...pageIds)', { pageIds });
        sales = await mainQb.getMany();
        sales.sort((a, b) => pageIds.indexOf(a.id) - pageIds.indexOf(b.id));
      }
    } else {
      const sortColumn = sortColumnMap[sortBy] ?? sortColumnMap.createdAt;
      queryBuilder.orderBy(sortColumn, sortOrder).skip(skip).take(limit);
      sales = await queryBuilder.getMany();
    }

    this.logger.debug(
      `[findAll] 조회 결과: total=${total}, 반환건수=${sales.length}, dateType=${dto.dateType ?? 'createdAt'}`,
    );
    if (sales.length > 0) {
      const sample = sales.slice(0, 3).map((s) => ({
        id: s.id,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
      }));
      this.logger.debug(`[판매관리-TIMESTAMP] createdAt 샘플(비교용): ${JSON.stringify(sample)}`);
    }
    if (dateType === 'invoiceIssuedAt' && sales.length > 0) {
      const salesIds = sales.map((s) => s.id).slice(0, 10);
      this.logger.debug(
        `[findAll] 거래명세서 발행일 기준 조회된 판매 ID (최대 10건): ${salesIds.join(', ')}${sales.length > 10 ? ' ...' : ''}`,
      );
    } else if (dateType === 'invoiceIssuedAt' && total === 0) {
      this.logger.debug(
        `[findAll] 거래명세서 발행일 기준 해당 기간에 발행된 거래명세서가 있는 판매가 없습니다.`,
      );
    }

    // 판매별 배송(운송) 1건 조회 → 운송 상태 컬럼용
    const salesIdsForDelivery = sales.map((s) => s.id);
    const deliveryBySalesId = new Map<
      string,
      { id: string; status: string; orderNumber: string | null }
    >();
    if (salesIdsForDelivery.length > 0) {
      const deliveries = await this.salesDeliveryRepository.find({
        where: { salesId: In(salesIdsForDelivery), deletedAt: IsNull() },
        select: ['id', 'salesId', 'status', 'orderNumber'],
      });
      deliveries.forEach((d) =>
        deliveryBySalesId.set(d.salesId, {
          id: d.id,
          status: d.status ?? 'PENDING_DISPATCH',
          orderNumber: d.orderNumber ?? null,
        }),
      );
    }

    // 코드 마스터 조회
    const [packingCodes, tradeGradeCodes, salesGradeCodes, salesItemStatusCodes, warehouseCodes, exporterCodes] = await Promise.all([
      this.codesService.findByGroup('PACKING_TYPE'),
      this.codesService.findByGroup('TRADE_GRADE'),
      this.codesService.findByGroup('SALES_GRADE'),
      this.codesService.findByGroup('SALES_ITEM_STATUS'),
      this.codesService.findByGroup('WAREHOUSE'),
      this.codesService.findByGroup('EXPORTER'),
    ]);

    const packingMap = new Map(packingCodes.map((c) => [c.value, c.name]));
    const tradeGradeMap = new Map(tradeGradeCodes.map((c) => [c.value, c.name]));
    const salesGradeMap = new Map(salesGradeCodes.map((c) => [c.value, c.name]));
    const salesItemStatusMap = new Map(salesItemStatusCodes.map((c) => [c.value, c.name]));
    const warehouseMap = new Map(warehouseCodes.map((c) => [c.value, c.name]));
    const exporterMap = new Map(exporterCodes.map((c) => [c.value, c.name]));

    // 데이터 매핑
    const data = sales.map((sale) => {
      // 취소된 항목 제외 (단, 전체 판매 취소된 건은 취소 항목도 표시하여 조회 가능하게)
      const itemsForProductInfo =
        sale.cancelledAt != null
          ? (sale.items ?? [])
          : (sale.items ?? []).filter((i) => i.status !== 'SALES_ITEM_CANCELLED');

      // 전체 중량 계산 (운송비 분배를 위해, 취소 제외 항목만)
      // cargoWeight 우선 (거래명세서 수정 시 동기화된 주량 반영)
      const totalWeight = itemsForProductInfo.reduce((sum, item) => {
        const weight =
          item.cargoWeight != null && item.cargoWeight !== ''
            ? Number(item.cargoWeight)
            : item.container?.weight
              ? Number(item.container.weight)
              : 0;
        return sum + weight;
      }, 0);

      const totalTransportFee = sale.transportFee != null ? Number(sale.transportFee) : null;

      // 판매 항목별 제품 정보 수집 (취소 제외)
      const productInfo = itemsForProductInfo.map((item) => {
        const container = item.container;
        const order = container?.order;
        const contract = order?.contract;

        // 판매 항목의 상태 결정 (항목별로 다를 수 있음)
        // item.status가 없으면 order.inboundStatus를 기반으로 상태 결정
        let itemStatus = item.status;
        if (!itemStatus && order?.inboundStatus) {
          if (order.inboundStatus === 'INBOUND_SCHEDULED') {
            itemStatus = 'SALES_ITEM_RESERVED'; // 예정 → 판매예약
          } else if (order.inboundStatus === 'INBOUND_CONFIRMED') {
            itemStatus = 'SALES_ITEM_SOLD'; // 확정 → 판매
          }
        }

        // 컨테이너 타입
        const containerType = item.containerType || 'CONTAINER';

        // 베일과 중량: cargoWeight/cargoBales 우선 (거래명세서 수정 시 동기화된 주량 반영)
        const bales =
          item.cargoBales != null && item.cargoBales !== ''
            ? Number(item.cargoBales)
            : container
              ? (container.salesBales != null && container.salesBales !== '' ? Number(container.salesBales) : (container.tradeBales ? Number(container.tradeBales) : null))
              : null;
        const weight =
          item.cargoWeight != null && item.cargoWeight !== ''
            ? Number(item.cargoWeight)
            : container?.weight
              ? Number(container.weight)
              : null;

        // 환율 및 창고 정보 (입고 상태에 따라 status가 맞는 inbound 사용 - 배열 순서 의존 X)
        const inboundStatus = order?.inboundStatus;
        let exchangeRate: number | null = null;
        let inboundWarehouse: string | null = null;
        if (order?.inbounds && order.inbounds.length > 0) {
          const confirmedInbound = order.inbounds.find((i) => i.status === 'CONFIRMED');
          const pendingInbound = order.inbounds.find((i) => i.status === 'PENDING');
          const targetInbound = inboundStatus === 'INBOUND_CONFIRMED' ? confirmedInbound : pendingInbound;
          const inbound = targetInbound ?? confirmedInbound ?? pendingInbound ?? order.inbounds[order.inbounds.length - 1];
          if (inbound) {
            if (inboundStatus === 'INBOUND_CONFIRMED') {
              exchangeRate = inbound.appliedExchangeRate ? Number(inbound.appliedExchangeRate) : null;
            } else if (inboundStatus === 'INBOUND_SCHEDULED') {
              exchangeRate = inbound.comparisonExchangeRate ? Number(inbound.comparisonExchangeRate) : null;
            }
            inboundWarehouse = inbound.warehouse ?? null;
          }
        }

       
        // margin 계산 (판매단가 - 원가 - 운송비)
        // 확정: confirmedPurchaseCost 사용. 예정: 원화(comparisonPurchaseCost) 우선, 없으면 pendingPurchaseCost
        const salesUnitPriceNum = item.salesUnitPrice ? Number(item.salesUnitPrice) : null;
        const pendingInboundForMargin = order?.inbounds?.find((i) => i.status === 'PENDING');
        const purchaseCost =
          inboundStatus === 'INBOUND_CONFIRMED'
            ? (container?.confirmedPurchaseCost ? Number(container.confirmedPurchaseCost) : null)
            : (pendingInboundForMargin?.comparisonPurchaseCost != null
                ? Number(pendingInboundForMargin.comparisonPurchaseCost)
                : container?.pendingPurchaseCost
                  ? Number(container.pendingPurchaseCost)
                  : null);
        const transportFeePerKg = this.calculateTransportFeePerKg(totalTransportFee, weight, totalWeight);
        const calculatedMargin = this.calculateMargin(salesUnitPriceNum, purchaseCost, transportFeePerKg, 0, 0, 0);

         return {
          itemId: item.id, // 판매 항목 ID 추가 (tb_sales_item.si_id)
          containerId: container?.id ?? null, // 컨테이너 ID 추가
          containerNo: container?.containerNo ?? null,
          sequence: container?.sequence ?? null, // 컨테이너 순번 추가
          productName: container?.product ?? contract?.productName ?? null,
          packingType: container?.packingType ?? contract?.packingType ?? null,
          packingName: packingMap.get(container?.packingType ?? contract?.packingType ?? '') ?? null,
          exporter: contract?.exporter ?? null,
          exporterName: contract?.exporter ? exporterMap.get(contract.exporter) ?? null : null,
          tradeGrade: container?.tradeGrade ?? null,
          tradeGradeName: tradeGradeMap.get(container?.tradeGrade ?? '') ?? null,
          salesGrade: container?.salesGrade ?? null,
          salesGradeName: salesGradeMap.get(container?.salesGrade ?? '') ?? null,
          containerType,
          bales,
          weight,
           salesUnitPrice: salesUnitPriceNum,
          salesUnitPriceStage: item.salesUnitPriceStage || null,
          margin: calculatedMargin, // 계산된 margin 사용
          exchangeRate,
          etaDate: this.formatDate(order?.etaDate),
          status: itemStatus,
          statusName: salesItemStatusMap.get(itemStatus ?? '') ?? null,
          inboundStatus: inboundStatus ?? null, // 입고 상태 추가
          inboundWarehouse: inboundWarehouse, // 입고 창고 코드 추가
          inboundWarehouseName: inboundWarehouse ? warehouseMap.get(inboundWarehouse) ?? null : null, // 입고 창고 이름 추가
          bk: order?.bk ?? null, // BK 번호 추가
          bl: order?.bl ?? null, // BL 번호 추가
          contractNo: contract?.contractNo ?? null, // 계약번호 추가
        };
      });

      // 판매 상태: sa_status 우선 사용, 없으면 items 기반 파생 (기존 데이터 호환)
      const saStatusToItemStatus: Record<string, string> = {
        RESERVED: 'SALES_ITEM_RESERVED',
        SOLD: 'SALES_ITEM_SOLD',
        COMPLETED: 'SALES_ITEM_COMPLETED',
      };
      let mainStatus: string | null = null;
      if (sale.status && saStatusToItemStatus[sale.status]) {
        mainStatus = saStatusToItemStatus[sale.status];
      } else {
        const statuses = productInfo.map((p) => p.status).filter((s): s is string => !!s);
        const uniqueStatuses = Array.from(new Set(statuses));
        const statusPriority: Record<string, number> = {
          SALES_ITEM_RESERVED: 1,
          SALES_ITEM_SOLD: 2,
          SALES_ITEM_CANCELLED: 3,
          SALES_ITEM_COMPLETED: 4,
        };
        mainStatus =
          uniqueStatuses.length > 0
            ? uniqueStatuses.sort((a, b) => (statusPriority[b] ?? 0) - (statusPriority[a] ?? 0))[0]
            : null;
      }

      const deliveryInfo = deliveryBySalesId.get(sale.id);
      return {
        id: sale.id,
        customerId: sale.customerId,
        customerName: sale.customer?.companyName ?? null,
        customerPhone: sale.customer?.phone ?? null,
        customerCeo: sale.customer?.ceo ?? null,
        reservationDate: this.formatDate(sale.reservationDate),
        salesDate: this.formatDate(sale.salesDate),
        requestVehicle: sale.requestVehicle ?? null,
        transportFee: sale.transportFee != null ? Number(sale.transportFee) : null,
        notes: sale.notes?.trim() || null,
        registeredBy: sale.registeredBy,
        registeredByName: sale.registeredByUser?.name ?? null,
        createdAt: sale.createdAt.toISOString(),
        updatedAt: sale.updatedAt.toISOString(),
        status: mainStatus,
        statusName: salesItemStatusMap.get(mainStatus ?? '') ?? null,
        productInfo,
        deliveryId: deliveryInfo?.id ?? null,
        deliveryStatus: deliveryInfo?.status ?? null,
        deliveryOrderNumber: deliveryInfo?.orderNumber ?? null,
        cancelledAt: sale.cancelledAt ? sale.cancelledAt.toISOString() : null,
        customer: sale.customer
          ? {
              id: sale.customer.id.toString(),
              companyName: sale.customer.companyName ?? null,
              phone: sale.customer.phone ?? null,
              ceo: sale.customer.ceo ?? null,
              address: sale.customer.address ?? null,
            }
          : null,
      };
    });

        return {
          data,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        };
      }

  /**
   * 주문(orderId)에 연결된 판매 목록 조회 (입고 확정 수정 시 어떤 판매를 확인해야 하는지 안내용)
   */
  async getSalesLinkedToOrder(orderId: string): Promise<{ id: string; customerName: string | null; createdAt: string }[]> {
    const containers = await this.tradeContainerRepository.find({
      where: { order: { id: orderId } },
      select: ['id'],
    });
    if (containers.length === 0) {
      return [];
    }
    const containerIds = containers.map((c) => c.id);
    const items = await this.salesItemRepository.find({
      where: { containerId: In(containerIds) },
      relations: ['sales', 'sales.customer'],
      select: ['id', 'salesId', 'sales'],
    });
    const salesIds = [...new Set(items.map((i) => i.salesId))];
    if (salesIds.length === 0) {
      return [];
    }
    const sales = await this.salesRepository.find({
      where: { id: In(salesIds) },
      relations: ['customer'],
    });
    return sales.map((s) => ({
      id: s.id,
      customerName: s.customer?.companyName ?? null,
      createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : '',
    }));
  }

  async findOne(id: string): Promise<any> {
    const sale = await this.salesRepository.findOne({
      where: { id },
      relations: ['customer', 'customer.regionEntity', 'customer.cityEntity', 'registeredByUser', 'items', 'items.container', 'items.container.order', 'items.container.order.contract', 'items.container.order.inbounds'],
    });

    if (!sale) {
      return null;
    }

    // 코드 마스터 조회
        const [packingCodes, tradeGradeCodes, salesGradeCodes, salesItemStatusCodes, productCodes, warehouseCodes, exporterCodes] = await Promise.all([
          this.codesService.findByGroup('PACKING_TYPE'),
          this.codesService.findByGroup('TRADE_GRADE'),
          this.codesService.findByGroup('SALES_GRADE'),
          this.codesService.findByGroup('SALES_ITEM_STATUS'),
          this.codesService.findByGroup('PRODUCT'),
          this.codesService.findByGroup('WAREHOUSE'),
          this.codesService.findByGroup('EXPORTER'),
        ]);

        const packingMap = new Map(packingCodes.map((c) => [c.value, c.name]));
        const tradeGradeMap = new Map(tradeGradeCodes.map((c) => [c.value, c.name]));
        const salesGradeMap = new Map(salesGradeCodes.map((c) => [c.value, c.name]));
        const salesItemStatusMap = new Map(salesItemStatusCodes.map((c) => [c.value, c.name]));
        const productMap = new Map(productCodes.map((c) => [c.value, c.name]));
        const warehouseMap = new Map(warehouseCodes.map((c) => [c.value, c.name]));
        const exporterMap = new Map(exporterCodes.map((c) => [c.value, c.name]));

        // 판매 항목 (취소된 항목은 상품 목록에 절대 노출 안 함. 하차에서 삭제한 항목 = SALES_ITEM_CANCELLED)
        const allItems = [...(sale.items ?? [])].sort((a, b) => Number(a.id) - Number(b.id));
        const itemsForProductInfo =
          sale.cancelledAt != null
            ? allItems
            : allItems.filter((i) => i.status != null && i.status !== 'SALES_ITEM_CANCELLED');

        // 전체 중량 계산 (운송비 분배를 위해, 취소 제외 항목만)
        // cargoWeight 우선 (거래명세서 수정 시 동기화된 주량 반영)
        const totalWeight = itemsForProductInfo.reduce((sum, item) => {
          const weight =
            item.cargoWeight != null && item.cargoWeight !== ''
              ? Number(item.cargoWeight)
              : item.container?.weight
                ? Number(item.container.weight)
                : 0;
          return sum + weight;
        }, 0);

        const totalTransportFee = sale.transportFee != null ? Number(sale.transportFee) : null;

        // 컨테이너별 판매 합계(취소 제외) → 재고 상세와 동일한 가용 수량 계산
        const containerIds = [...new Set(itemsForProductInfo.map((i) => i.containerId).filter(Boolean))] as string[];
        const soldByContainerMap = new Map<string, { soldWeight: number; soldBales: number }>();
        if (containerIds.length > 0) {
          const raw = await this.salesItemRepository
            .createQueryBuilder('si')
            .select('si.containerId', 'containerId')
            .addSelect('COALESCE(SUM(CAST(si.cargoWeight AS numeric)), 0)', 'soldWeight')
            .addSelect('COALESCE(SUM(CAST(si.cargoBales AS numeric)), 0)', 'soldBales')
            .where('si.containerId IN (:...ids)', { ids: containerIds })
            .andWhere('si.status != :cancelled', { cancelled: 'SALES_ITEM_CANCELLED' })
            .groupBy('si.containerId')
            .getRawMany<{ containerId: string; soldWeight: string; soldBales: string }>();
          raw.forEach((r) => {
            soldByContainerMap.set(r.containerId, {
              soldWeight: Number(r.soldWeight) || 0,
              soldBales: Number(r.soldBales) || 0,
            });
          });
        }

        const productInfo = itemsForProductInfo.map((item) => {
          const container = item.container;
          const order = container?.order;
          const contract = order?.contract;

          // item.status가 없으면 order.inboundStatus를 기반으로 상태 결정
          let itemStatus = item.status;
          if (!itemStatus && order?.inboundStatus) {
            if (order.inboundStatus === 'INBOUND_SCHEDULED') {
              itemStatus = 'SALES_ITEM_RESERVED'; // 예정 → 판매예약
            } else if (order.inboundStatus === 'INBOUND_CONFIRMED') {
              itemStatus = 'SALES_ITEM_SOLD'; // 확정 → 판매
            }
          }
          const containerType = item.containerType || 'CONTAINER';

          // 판매한 베일수: item.cargoBales(하차확정) 우선. CARGO 타입이면 컨테이너 전체로 fallback 하지 않음(이 건 수량만 표시)
          const cargoBales = item.cargoBales ? Number(item.cargoBales) : null;
          const cargoWeight = item.cargoWeight ? Number(item.cargoWeight) : null;
          const soldBales =
            item.cargoBales != null && item.cargoBales !== ''
              ? Number(item.cargoBales)
              : containerType === 'CARGO'
                ? null
                : container
                  ? (container.salesBales != null && container.salesBales !== '' ? Number(container.salesBales) : (container.tradeBales ? Number(container.tradeBales) : null))
                  : null;
          const bales = soldBales; // 하위 호환
          const weight =
            item.cargoWeight != null && item.cargoWeight !== ''
              ? Number(item.cargoWeight)
              : container?.weight
                ? Number(container.weight)
                : null;

          // 재고 상세와 일치: 컨테이너 전체/가용 (상단 표시용)
          const containerTotalWeight = container?.weight ? Number(container.weight) : null;
          const containerTotalBales =
            container?.salesBales != null && container.salesBales !== ''
              ? Number(container.salesBales)
              : container?.tradeBales != null && container.tradeBales !== ''
                ? Number(container.tradeBales)
                : null;
          const soldAgg = item.containerId ? soldByContainerMap.get(item.containerId) : undefined;
          const soldWeightAgg = soldAgg?.soldWeight ?? 0;
          const soldBalesAgg = soldAgg?.soldBales ?? 0;
          const availableWeight =
            containerTotalWeight != null ? containerTotalWeight - soldWeightAgg : null;
          const availableBales =
            containerTotalBales != null ? Math.round(containerTotalBales - soldBalesAgg) : null;

          const inboundStatus = order?.inboundStatus;
          // 디버깅: inboundStatus 확인
          if (!inboundStatus) {
            this.logger.warn(`[findOne] 컨테이너 ${container?.containerNo}의 order.inboundStatus가 null입니다. order: ${order?.id}, container: ${container?.id}`);
          }
          let exchangeRate: number | null = null;
          let inboundWarehouse: string | null = null;
          if (order?.inbounds && order.inbounds.length > 0) {
            const confirmedInbound = order.inbounds.find((i) => i.status === 'CONFIRMED');
            const pendingInbound = order.inbounds.find((i) => i.status === 'PENDING');
            const targetInbound = inboundStatus === 'INBOUND_CONFIRMED' ? confirmedInbound : pendingInbound;
            const inbound = targetInbound ?? confirmedInbound ?? pendingInbound ?? order.inbounds[order.inbounds.length - 1];
            if (inbound) {
              if (inboundStatus === 'INBOUND_CONFIRMED') {
                exchangeRate = inbound.appliedExchangeRate ? Number(inbound.appliedExchangeRate) : null;
              } else if (inboundStatus === 'INBOUND_SCHEDULED') {
                exchangeRate = inbound.comparisonExchangeRate ? Number(inbound.comparisonExchangeRate) : null;
              }
              inboundWarehouse = inbound.warehouse ?? null;
            }
          }

         
          // margin 계산 (판매단가 - 원가 - 운송비)
          // 확정: confirmedPurchaseCost 사용. 예정: 원화(comparisonPurchaseCost) 우선, 없으면 pendingPurchaseCost
          const salesUnitPriceNum = item.salesUnitPrice ? Number(item.salesUnitPrice) : null;
          const pendingInbound = order?.inbounds?.find((i) => i.status === 'PENDING');
          const purchaseCost =
            inboundStatus === 'INBOUND_CONFIRMED'
              ? (container?.confirmedPurchaseCost ? Number(container.confirmedPurchaseCost) : null)
              : (pendingInbound?.comparisonPurchaseCost != null
                  ? Number(pendingInbound.comparisonPurchaseCost)
                  : container?.pendingPurchaseCost
                    ? Number(container.pendingPurchaseCost)
                    : null);
          const transportFeePerKg = this.calculateTransportFeePerKg(totalTransportFee, weight, totalWeight);
          const calculatedMargin = this.calculateMargin(salesUnitPriceNum, purchaseCost, transportFeePerKg, 0, 0, 0);

           return {
            itemId: item.id, // 판매 항목 ID 추가
            containerId: container?.id ?? null, // 컨테이너 ID 추가
            containerNo: container?.containerNo ?? null,
            sequence: container?.sequence ?? null, // 컨테이너 순번 추가
            contractNo: contract?.contractNo ?? null, // 계약번호 추가
            bl: order?.bl ?? null, // BL 번호 추가
            productName: container?.product ?? contract?.productName ?? null,
            productNameLabel: productMap.get(container?.product ?? contract?.productName ?? '') ?? container?.product ?? contract?.productName ?? null,
            packingType: container?.packingType ?? contract?.packingType ?? null,
            packingName: packingMap.get(container?.packingType ?? contract?.packingType ?? '') ?? null,
            exporter: contract?.exporter ?? null,
            exporterName: contract?.exporter ? exporterMap.get(contract.exporter) ?? null : null,
            tradeGrade: container?.tradeGrade ?? null,
            tradeGradeName: tradeGradeMap.get(container?.tradeGrade ?? '') ?? null,
            salesGrade: container?.salesGrade ?? null,
            salesGradeName: salesGradeMap.get(container?.salesGrade ?? '') ?? null,
            containerType,
            bales,
            soldBales, // 판매한 베일수 (cargoBales 우선, 없으면 컨테이너 영업/무역 베일)
            salesBales: container?.salesBales != null && container.salesBales !== '' ? Number(container.salesBales) : null,
            tradeBales: container?.tradeBales != null && container.tradeBales !== '' ? Number(container.tradeBales) : null,
            weight,
            cargoBales, // 카고 베일 추가
            cargoWeight, // 카고 중량 추가
            // 재고 상세와 일치하는 컨테이너 전체/가용 (판매 수정 상단 표시용)
            containerTotalWeight,
            containerTotalBales,
            availableWeight,
            availableBales,
            salesUnitPrice: salesUnitPriceNum,
            salesUnitPriceStage: item.salesUnitPriceStage || null,
            margin: calculatedMargin, // 계산된 margin 사용
            stoCost: container?.stoCost ? Number(container.stoCost) : null,
            dtCost: container?.dtCost ? Number(container.dtCost) : null,
            workFee: container?.workFee ? Number(container.workFee) : null,
            onsiteWorkFee: container?.onsiteWorkFee ? Number(container.onsiteWorkFee) : null,
            advancePaymentRatio: item.advancePaymentRatio ? Number(item.advancePaymentRatio) : null,
            exchangeRate,
            status: itemStatus,
            statusName: salesItemStatusMap.get(itemStatus ?? '') ?? null,
            etaDate: this.formatDate(order?.etaDate),
            pendingPurchaseCost: container?.pendingPurchaseCost ? Number(container.pendingPurchaseCost) : null, // 예정원가 추가
            confirmedPurchaseCost: container?.confirmedPurchaseCost ? Number(container.confirmedPurchaseCost) : null, // 확정원가 추가
            inboundStatus: inboundStatus ?? null, // 입고 상태 추가
            inboundWarehouse: inboundWarehouse, // 입고 창고 코드 추가
            inboundWarehouseName: inboundWarehouse ? warehouseMap.get(inboundWarehouse) ?? null : null, // 입고 창고 이름 추가
          };
        });

        // 판매 상태: sa_status 우선 사용, 없으면 items 기반 파생 (기존 데이터 호환)
        const saStatusToItemStatus: Record<string, string> = {
          RESERVED: 'SALES_ITEM_RESERVED',
          SOLD: 'SALES_ITEM_SOLD',
          COMPLETED: 'SALES_ITEM_COMPLETED',
        };
        let overallStatus: string | null = null;
        if (sale.status && saStatusToItemStatus[sale.status]) {
          overallStatus = saStatusToItemStatus[sale.status];
        } else {
          const statuses = productInfo.map((p) => p.status).filter((s): s is string => !!s);
          const uniqueStatuses = Array.from(new Set(statuses));
          const statusPriority: Record<string, number> = {
            SALES_ITEM_RESERVED: 1,
            SALES_ITEM_SOLD: 2,
            SALES_ITEM_CANCELLED: 3,
            SALES_ITEM_COMPLETED: 4,
          };
          overallStatus = uniqueStatuses.sort((a, b) => (statusPriority[b] ?? 0) - (statusPriority[a] ?? 0))[0] || null;
        }

        // 선입금 정보 조회
        const prepayment = await this.customerPrepaymentRepository.findOne({
          where: { salesId: sale.id },
        });

        // 운송관리 배송 정보 (운송 보기 버튼용)
        const deliveryInfo = await this.salesDeliveryService.findOneBySalesId(sale.id);

        return {
          id: sale.id,
          customerId: sale.customerId ?? null,
          customerName: sale.customer?.companyName ?? null,
          customerPhone: sale.customer?.phone ?? null,
          customerCeo: sale.customer?.ceo ?? null,
          customerRegion: sale.customer?.regionEntity?.name ?? null,
          customerCity: sale.customer?.cityEntity?.name ?? null,
          customerPostalCode: sale.customer?.postalCode ?? null,
          customerAddress: sale.customer?.address ?? null,
          customerAddressRoad: sale.customer?.addressRoad ?? null,
          customerAddressJibun: sale.customer?.addressJibun ?? null,
          customerLegalBCode: sale.customer?.legalBCode ?? null,
          customerAddressDefaultType: sale.customer?.addressDefaultType ?? null,
          customerAddressDetail: sale.customer?.addressDetail ?? null,
          reservationDate: this.formatDate(sale.reservationDate),
          salesDate: this.formatDate(sale.salesDate),
          requestVehicle: sale.requestVehicle ?? null,
          transportFee: sale.transportFee != null ? Number(sale.transportFee) : null,
          notes: sale.notes?.trim() || null,
          unloadingPostalCode: sale.unloadingPostalCode ?? null,
          unloadingAddress: sale.unloadingAddress ?? null,
          unloadingAddressRoad: sale.unloadingAddressRoad ?? null,
          unloadingAddressJibun: sale.unloadingAddressJibun ?? null,
          unloadingLegalBCode: sale.unloadingLegalBCode ?? null,
          unloadingAddressDetail: sale.unloadingAddressDetail ?? null,
          unloadingRegion: sale.unloadingRegion ?? null,
          unloadingCity: sale.unloadingCity ?? null,
          registeredBy: sale.registeredBy ?? null,
          registeredByName: sale.registeredByUser?.name ?? null,
          createdAt: sale.createdAt.toISOString(),
          updatedAt: sale.updatedAt.toISOString(),
          status: overallStatus,
          statusName: salesItemStatusMap.get(overallStatus ?? '') ?? null,
          salesStatus: sale.status ?? null, // sa_status (RESERVED/SOLD/COMPLETED) - 판매 확정 버튼 표시용
          productInfo: productInfo,
          // 선입금 정보
          advancePaymentRatio: sale.advancePaymentRatio ? Number(sale.advancePaymentRatio) : null,
          advancePaymentAmount: sale.advancePaymentAmount ? Number(sale.advancePaymentAmount) : null,
          prepayment: prepayment ? {
            id: prepayment.id,
            prepaymentAmount: prepayment.prepaymentAmount ? Number(prepayment.prepaymentAmount) : null,
            actualAmount: prepayment.actualAmount ? Number(prepayment.actualAmount) : null,
            differenceAmount: prepayment.differenceAmount ? Number(prepayment.differenceAmount) : null,
            status: prepayment.status, // DEPRECATED: 하위 호환성 유지
            paymentStatus: prepayment.paymentStatus,
            deductionStatus: prepayment.deductionStatus,
            requestedDate: this.formatDate(prepayment.requestedDate),
            confirmedDate: this.formatDate(prepayment.confirmedDate),
            deductedDate: this.formatDate(prepayment.deductedDate),
            paymentMethod: prepayment.paymentMethod,
            notes: prepayment.notes,
          } : null,
          // 운송관리 배송 정보 (운송 보기 버튼용)
          deliveryId: deliveryInfo?.id ?? null,
          deliveryStatus: deliveryInfo?.status ?? null,
          deliveryOrderNumber: deliveryInfo?.orderNumber ?? null,
        };
      }

      async update(id: string, dto: UpdateSalesDto, userId?: number): Promise<Sales> {
        // 판매 항목 없이 저장 허용 (잘못된 배정 수정 시 활용)
        const items = dto.items ?? [];

        // [판매 취소 디버깅] 요청 수신 시 로그
        const isCancellationRequest = items.some((i) => i.status === 'SALES_ITEM_CANCELLED');
        this.logger.debug(
          `[판매 수정-진입] salesId: ${id}, items 수: ${items.length}, isCancellation: ${dto.isCancellation}, ` +
            `cancellationReason: ${dto.cancellationReason ? '있음' : '없음'}, ` +
            `items(status): ${items.map((i) => `id=${i.id} status=${i.status ?? 'null'}`).join(' | ') || '(없음)'}`,
        );

        // 이력용: 변경 전 스냅샷 (실제 데이터 확인용)
        const oldSales = await this.salesRepository.findOne({
          where: { id },
          relations: ['items'],
        });
        const oldDataJson = oldSales ? this.salesToJson(oldSales) : null;

        // 트랜잭션으로 처리 (STO/DT/workFee 변경 시 확정원가 재계산 대상 컨테이너 ID 수집)
        const containerIdsForCostRecalc: string[] = [];
        const result = await this.dataSource.transaction(async (manager) => {
          // 1. 기존 판매 정보 조회
          const existingSales = await manager.findOne(Sales, {
            where: { id },
            relations: ['items'],
          });

          if (!existingSales) {
            throw new NotFoundException(`판매 정보를 찾을 수 없습니다. (ID: ${id})`);
          }

          const existingItemCountBeforeUpdate = existingSales.items?.length ?? 0;

          // 판매 → 판매 예약 변경 시: 배차대기인 경우에만 허용, 이후 해당 배송 삭제
          const hasExistingSold = (existingSales.items ?? []).some((i) => i.status === 'SALES_ITEM_SOLD');
          const nonCancelledInDto = items.filter((i) => i.status !== 'SALES_ITEM_CANCELLED');
          const allDtoToReserved = nonCancelledInDto.length > 0 && nonCancelledInDto.every((i) => i.status === 'SALES_ITEM_RESERVED');
          const isToReservation = !isCancellationRequest && hasExistingSold && allDtoToReserved;
          let deliveryForReservationCheck: { id: string; status?: string } | null = null;
          if (isToReservation) {
            const delivery = await this.salesDeliveryService.findOneBySalesId(id, manager);
            if (delivery) {
              deliveryForReservationCheck = { id: delivery.id, status: delivery.status };
              if (delivery.status !== 'PENDING_DISPATCH') {
                throw new BadRequestException('배차대기 상태인 경우에만 판매 예약으로 변경할 수 있습니다.');
              }
            }
          }

          if (isCancellationRequest) {
            this.logger.debug(
              `[판매 취소-기존] salesId: ${id}, 기존 items 수: ${existingSales.items?.length ?? 0}, ` +
                `기존 items(id,status): ${(existingSales.items ?? []).map((i) => `id=${i.id} status=${i.status ?? 'null'}`).join(' | ')}`,
            );
          }

          // 2. 고객 정보 upsert (고객 정보가 제공된 경우에만)
          let customer = null;
          if (dto.customerId || dto.phone || dto.companyName) {
            const deliveryAddrIdU = dto.unloadingDeliveryAddressId?.trim();
            customer = await this.upsertCustomer(dto, manager, {
              skipCustomerAddressUpdates: Boolean(deliveryAddrIdU),
            });
            if (!customer) {
              throw new BadRequestException('고객 정보가 필요합니다. (고객 ID 또는 업체명)');
            }
            existingSales.customerId = customer.id;
            if (deliveryAddrIdU) {
              this.logger.debug(
                `[판매 수정-배송지행] salesId=${id} customerId=${customer.id} deliveryAddressId=${deliveryAddrIdU} ` +
                  `→ 선택 배송지 행 갱신 ([배송지행-시작]/[배송지행-완료] 참고)`,
              );
              await this.customersService.applySalesUnloadingToDeliveryAddress(
                customer.id,
                deliveryAddrIdU,
                dto,
                manager,
              );
            }
            this.logger.debug(
              `[판매 수정-고객] salesId=${id}, customerId=${customer.id}, unloadingDeliveryAddressId=${deliveryAddrIdU ?? '(없음)'}, ` +
                `고객카드(대표주소·지역·시군구)=${deliveryAddrIdU ? '스킵(선택배송지행만)' : 'upsert반영'}`,
            );
          } else {
            // 고객 정보가 없으면 기존 고객 ID 유지
            customer = existingSales.customerId 
              ? await manager.findOne(Customer, { where: { id: existingSales.customerId } })
              : null;
            if (customer) {
              const deliveryAddrIdOnly = dto.unloadingDeliveryAddressId?.trim();
              if (deliveryAddrIdOnly) {
                this.logger.debug(
                  `[판매 수정-배송지행] salesId=${id} customerId=${customer.id} deliveryAddressId=${deliveryAddrIdOnly} ` +
                    `(고객 dto 생략 분기) → [배송지행-시작]/[완료]`,
                );
                await this.customersService.applySalesUnloadingToDeliveryAddress(
                  customer.id,
                  deliveryAddrIdOnly,
                  dto,
                  manager,
                );
              }
              this.logger.debug(
                `[판매 수정-고객] salesId=${id}, customerId=${customer.id}, dto에 customerId/phone/companyName 없음 → 고객 upsert 생략, ` +
                  `배송지행=${deliveryAddrIdOnly ?? '없음'}`,
              );
            }
          }

          // 3. 판매 정보 업데이트
          if (dto.reservationDate !== undefined) {
            const reservationDateStr = dto.reservationDate?.trim();
            this.logger.debug(`[update] 예정일 업데이트: ${dto.reservationDate} -> ${reservationDateStr}`);
            existingSales.reservationDate = reservationDateStr && reservationDateStr.length > 0 
              ? new Date(reservationDateStr) 
              : null;
            this.logger.debug(`[update] 예정일 저장값: ${existingSales.reservationDate}`);
          }
          if (dto.salesDate !== undefined) {
            const salesDateStr = dto.salesDate?.trim();
            this.logger.debug(`[update] 판매일 업데이트: ${dto.salesDate} -> ${salesDateStr}`);
            existingSales.salesDate = salesDateStr && salesDateStr.length > 0 
              ? new Date(salesDateStr) 
              : null;
            this.logger.debug(`[update] 판매일 저장값: ${existingSales.salesDate}`);
          }
          if (dto.requestVehicle !== undefined) {
            existingSales.requestVehicle = dto.requestVehicle?.trim() || null;
          }
          if (dto.transportFee !== undefined) {
            existingSales.transportFee = dto.transportFee != null ? dto.transportFee : null;
          }
          if (dto.notes !== undefined) {
            existingSales.notes = this.sanitize(dto.notes);
          }
          // 선입금 정보 업데이트
          if (dto.advancePaymentRatio !== undefined) {
            existingSales.advancePaymentRatio = dto.advancePaymentRatio != null ? dto.advancePaymentRatio.toString() : null;
          }
          if (dto.advancePaymentAmount !== undefined) {
            existingSales.advancePaymentAmount = dto.advancePaymentAmount != null ? dto.advancePaymentAmount.toString() : null;
          }
          if (dto.unloadingPostalCode !== undefined) {
            existingSales.unloadingPostalCode = dto.unloadingPostalCode?.trim() || null;
          }
          if (dto.unloadingAddress !== undefined) {
            existingSales.unloadingAddress = dto.unloadingAddress?.trim() || null;
          }
          if (dto.unloadingAddressDetail !== undefined) {
            existingSales.unloadingAddressDetail = dto.unloadingAddressDetail?.trim() || null;
          }
          if (dto.unloadingRegion !== undefined) {
            existingSales.unloadingRegion = dto.unloadingRegion?.trim() || null;
          }
          if (dto.unloadingCity !== undefined) {
            existingSales.unloadingCity = dto.unloadingCity?.trim() || null;
          }
          if (dto.unloadingAddressRoad !== undefined) {
            existingSales.unloadingAddressRoad = dto.unloadingAddressRoad?.trim() || null;
          }
          if (dto.unloadingAddressJibun !== undefined) {
            existingSales.unloadingAddressJibun = dto.unloadingAddressJibun?.trim() || null;
          }
          if (dto.unloadingLegalBCode !== undefined) {
            existingSales.unloadingLegalBCode =
              dto.unloadingLegalBCode?.replace(/\D/g, '').slice(0, 10) || null;
          }

          const savedSales = await manager.save(Sales, existingSales);

          // 4. 기존 판매 항목 ID 목록
          const existingItemIds = new Set(
            items
              .map((item) => item.id)
              .filter((id): id is string => !!id),
          );

          // 5. 삭제할 항목 제거
          const itemsToDelete = existingSales.items.filter((item) => !existingItemIds.has(item.id));
          if (isCancellationRequest && (itemsToDelete.length > 0 || existingItemIds.size !== (existingSales.items?.length ?? 0))) {
            this.logger.debug(
              `[판매 취소-삭제] salesId: ${id}, existingItemIds: [${Array.from(existingItemIds).join(', ')}], ` +
                `삭제 대상: ${itemsToDelete.length}개 ${itemsToDelete.map((i) => `id=${i.id}`).join(', ')}`,
            );
          }
          if (itemsToDelete.length > 0) {
            await manager.remove(SalesItem, itemsToDelete);
          }

          // 6. 판매 항목 업데이트/생성
          const salesItems = await Promise.all(
            items.map(async (itemDto) => {
              // 컨테이너 존재 확인
              const container = await manager.findOne(TradeContainer, {
                where: { id: itemDto.containerId },
              });

              if (!container) {
                throw new NotFoundException(`컨테이너 ID ${itemDto.containerId}를 찾을 수 없습니다.`);
              }

              // 기존 항목이 있으면 업데이트, 없으면 생성
              let salesItem: SalesItem;
              if (itemDto.id) {
                salesItem = await manager.findOne(SalesItem, {
                  where: { id: itemDto.id, salesId: id },
                });

                if (!salesItem) {
                  throw new NotFoundException(`판매 항목을 찾을 수 없습니다. (ID: ${itemDto.id})`);
                }

                salesItem.containerId = itemDto.containerId;
                salesItem.containerType = itemDto.containerType || 'CONTAINER';
                salesItem.cargoBales = itemDto.cargoBales?.toString() || null;
                salesItem.cargoWeight = itemDto.cargoWeight?.toString() || null;
                salesItem.stoCost = itemDto.stoCost?.toString() || null;
                salesItem.dtCost = itemDto.dtCost?.toString() || null;
                
                // STO, DT, 작업비를 컨테이너에도 저장 (입고 확정 상태일 때만)
                const existingContainer = await manager.findOne(TradeContainer, {
                  where: { id: itemDto.containerId },
                  relations: ['order'],
                });
                if (existingContainer?.order?.inboundStatus === 'INBOUND_CONFIRMED') {
                  const updateData: any = {};
                  if (itemDto.stoCost !== undefined && itemDto.stoCost !== null) {
                    updateData.stoCost = itemDto.stoCost.toString();
                  }
                  if (itemDto.dtCost !== undefined && itemDto.dtCost !== null) {
                    updateData.dtCost = itemDto.dtCost.toString();
                  }
                  if (itemDto.workFee !== undefined && itemDto.workFee !== null) {
                    updateData.workFee = itemDto.workFee.toString();
                  }
                  if (itemDto.onsiteWorkFee !== undefined && itemDto.onsiteWorkFee !== null) {
                    updateData.onsiteWorkFee = itemDto.onsiteWorkFee.toString();
                  }
                  if (Object.keys(updateData).length > 0) {
                    await manager.update(TradeContainer, { id: itemDto.containerId }, updateData);
                    containerIdsForCostRecalc.push(itemDto.containerId);
                  }
                }
                
                salesItem.advancePaymentRatio = itemDto.advancePaymentRatio?.toString() || null;
                // margin은 더 이상 저장하지 않음 - 계산 필드로 사용
                salesItem.salesUnitPrice = itemDto.salesUnitPrice?.toString() || null;
                salesItem.salesUnitPriceStage = itemDto.salesUnitPriceStage ?? null;
                this.logger.debug(
                  `[판매 수정] 구분(salesUnitPriceStage) 저장 - itemId: ${itemDto.id}, containerId: ${itemDto.containerId}, salesUnitPriceStage: ${itemDto.salesUnitPriceStage ?? 'null'}`,
                );
                // status: 요청값 우선. 없으면 입고확정이면 SOLD로 맞추되,
                // 이미 판매완료·재고소모 전용은 덮어쓰지 않음 (하차완료 후 수정 시 운송/명세 상태 불일치 방지)
                if (itemDto.status !== undefined && itemDto.status !== null) {
                  salesItem.status = itemDto.status;
                } else if (existingContainer?.order?.inboundStatus === 'INBOUND_CONFIRMED' && salesItem.status !== 'SALES_ITEM_CANCELLED') {
                  const keepTerminalStatus =
                    salesItem.status === 'SALES_ITEM_COMPLETED' || salesItem.status === 'INVENTORY_CONSUMPTION';
                  if (!keepTerminalStatus) {
                    salesItem.status = 'SALES_ITEM_SOLD';
                  }
                }
                // 그 외: 기존 상태 유지
              } else {
                // 새 항목 생성
                // 컨테이너 조회 (order relation 포함)
                const container = await manager.findOne(TradeContainer, {
                  where: { id: itemDto.containerId },
                  relations: ['order'],
                });

                if (!container) {
                  throw new NotFoundException(`컨테이너 ID ${itemDto.containerId}를 찾을 수 없습니다.`);
                }

                // 판매 항목 상태 결정
                // itemDto.status가 있으면 사용, 없으면 order의 inboundStatus를 기반으로 결정
                let status = itemDto.status;
                if (!status && container.order?.inboundStatus) {
                  if (container.order.inboundStatus === 'INBOUND_SCHEDULED') {
                    status = 'SALES_ITEM_RESERVED'; // 예정 → 판매예약
                  } else if (container.order.inboundStatus === 'INBOUND_CONFIRMED') {
                    status = 'SALES_ITEM_SOLD'; // 확정 → 판매
                  }
                }
                // status가 여전히 null이면 기본값으로 SALES_ITEM_RESERVED 설정 (안전장치)
                if (!status) {
                  status = 'SALES_ITEM_RESERVED';
                }

                // STO, DT, 작업비를 컨테이너에도 저장 (입고 확정 상태일 때만)
                if (container.order?.inboundStatus === 'INBOUND_CONFIRMED') {
                  const updateData: any = {};
                  if (itemDto.stoCost !== undefined && itemDto.stoCost !== null) {
                    updateData.stoCost = itemDto.stoCost.toString();
                  }
                  if (itemDto.dtCost !== undefined && itemDto.dtCost !== null) {
                    updateData.dtCost = itemDto.dtCost.toString();
                  }
                  if (itemDto.workFee !== undefined && itemDto.workFee !== null) {
                    updateData.workFee = itemDto.workFee.toString();
                  }
                  if (itemDto.onsiteWorkFee !== undefined && itemDto.onsiteWorkFee !== null) {
                    updateData.onsiteWorkFee = itemDto.onsiteWorkFee.toString();
                  }
                  if (Object.keys(updateData).length > 0) {
                    await manager.update(TradeContainer, { id: itemDto.containerId }, updateData);
                    containerIdsForCostRecalc.push(itemDto.containerId);
                  }
                }

                salesItem = this.salesItemRepository.create({
                  salesId: savedSales.id,
                  containerId: itemDto.containerId,
                  containerType: itemDto.containerType || 'CONTAINER',
                  cargoBales: itemDto.cargoBales?.toString() || null,
                  cargoWeight: itemDto.cargoWeight?.toString() || null,
                  stoCost: itemDto.stoCost?.toString() || null,
                  dtCost: itemDto.dtCost?.toString() || null,
                  advancePaymentRatio: itemDto.advancePaymentRatio?.toString() || null,
                  // margin은 더 이상 저장하지 않음 - 계산 필드로 사용
                  salesUnitPrice: itemDto.salesUnitPrice?.toString() || null,
                  salesUnitPriceStage: itemDto.salesUnitPriceStage ?? null,
                  status: status,
                });
                this.logger.debug(
                  `[판매 수정-신규항목] 구분(salesUnitPriceStage) 저장 - containerId: ${itemDto.containerId}, salesUnitPriceStage: ${itemDto.salesUnitPriceStage ?? 'null'}`,
                );
              }

              return await manager.save(SalesItem, salesItem);
            }),
          );

          // 5. 재고 상태 업데이트 (변경된 컨테이너들)
          const allContainerIds = new Set<string>();
          // 기존 항목의 컨테이너 ID
          existingSales.items?.forEach((item) => {
            if (item.containerId) allContainerIds.add(item.containerId);
          });
          // 새 항목의 컨테이너 ID
          items.forEach((item) => {
            if (item.containerId) allContainerIds.add(item.containerId);
          });

          this.logger.debug(
            `[판매 수정-재고] salesId: ${id}, 재고 업데이트 대상 컨테이너 수: ${allContainerIds.size}, ` +
              `수정된 items(cargoBales/cargoWeight): ${items.map((i) => `containerId=${i.containerId?.slice(0, 8)}.. bales=${i.cargoBales ?? 'null'} weight=${i.cargoWeight ?? 'null'}`).join(' | ')}`,
          );

          if (isCancellationRequest) {
            this.logger.debug(
              `[판매 취소-항목저장후] salesId: ${id}, salesItems 수: ${salesItems.length}, ` +
                `저장된 items(id,status): ${salesItems.map((i) => `id=${i.id} status=${i.status ?? 'null'}`).join(' | ')}, ` +
                `재고 업데이트 대상 컨테이너: [${Array.from(allContainerIds).join(', ')}]`,
            );
          }

          await Promise.all(
            Array.from(allContainerIds).map((containerId) => this.updateContainerInventoryStatus(containerId, manager)),
          );

          savedSales.items = salesItems;

          // sa_status 업데이트 (전체 취소가 아닌 경우 - 전체 취소 시에는 hasAllItemsCancelled 블록에서 처리)
          // deriveSalesStatusFromItems는 취소 항목 제외하고 계산하므로 부분 취소도 반영
          const hasAllItemsCancelledForStatus =
            salesItems.length > 0 && salesItems.every((item) => item.status === 'SALES_ITEM_CANCELLED');
          if (!hasAllItemsCancelledForStatus) {
            const derivedStatus = this.deriveSalesStatusFromItems(salesItems);
            if (derivedStatus) {
              savedSales.status = derivedStatus;
              await manager.save(Sales, savedSales);
            }
          }

          // 6. 선입금 데이터 저장/업데이트 (입고 예정/확정 모두 처리)
          // 선입금 금액 계산 (직접 입력 금액이 있으면 사용, 없으면 비율로 계산)
          let prepaymentAmount: number | null = null;
          
          const advancePaymentRatio = savedSales.advancePaymentRatio 
            ? parseFloat(savedSales.advancePaymentRatio) 
            : null;
          const advancePaymentAmount = savedSales.advancePaymentAmount 
            ? parseFloat(savedSales.advancePaymentAmount) 
            : null;
          
          this.logger.debug(`[판매 수정] 선입금 계산 시작 - 판매 ID: ${savedSales.id}, 비율: ${advancePaymentRatio}, 금액: ${advancePaymentAmount}`);
          
          if (advancePaymentAmount) {
            prepaymentAmount = advancePaymentAmount;
            this.logger.debug(`[판매 수정] 선입금 금액 직접 입력 사용 - 금액: ${prepaymentAmount}`);
          } else if (advancePaymentRatio) {
            // 전체 판매가 계산 (입고 예정/확정 모두 포함)
            let totalSalesPrice = 0;
            for (const item of salesItems) {
              const container = await manager.findOne(TradeContainer, {
                where: { id: item.containerId },
              });
              if (container) {
                const weight = parseFloat(container.weight || '0');
                const salesUnitPrice = parseFloat(item.salesUnitPrice || '0');
                const salesPrice = salesUnitPrice > 0 && weight > 0 
                  ? salesUnitPrice * weight * 1000 
                  : 0;
                totalSalesPrice += salesPrice;
              }
            }
            prepaymentAmount = totalSalesPrice * (advancePaymentRatio / 100);
            this.logger.debug(`[판매 수정] 선입금 금액 비율로 계산 - 전체 판매가: ${totalSalesPrice}, 비율: ${advancePaymentRatio}%, 계산된 금액: ${prepaymentAmount}`);
          }

          // 선입금 금액이 있으면 저장/업데이트
          if (prepaymentAmount && prepaymentAmount > 0) {
            // 기존 선입금 레코드 조회
            const existingPrepayment = await manager.findOne(CustomerPrepayment, {
              where: { salesId: savedSales.id },
            });

            if (existingPrepayment) {
              // 기존 레코드가 있으면 업데이트
              // 단, 이미 CONFIRMED 또는 DEDUCTED 상태면 업데이트하지 않음
              if (existingPrepayment.paymentStatus === 'REQUESTED' || existingPrepayment.paymentStatus === 'AVAILABLE') {
                existingPrepayment.prepaymentAmount = prepaymentAmount.toString();
                // requestedDate는 기존 값 유지
                await manager.save(CustomerPrepayment, existingPrepayment);
                this.logger.debug(`[판매 수정] 선입금 업데이트 완료 - 판매 ID: ${savedSales.id}, 금액: ${prepaymentAmount}`);
              } else {
                this.logger.debug(`[판매 수정] 선입금 상태가 ${existingPrepayment.paymentStatus}이어서 업데이트하지 않음 - 판매 ID: ${savedSales.id}`);
              }
            } else {
              // 기존 레코드가 없으면 생성
              const prepayment = manager.create(CustomerPrepayment, {
                customerId: customer?.id || existingSales.customerId,
                salesId: savedSales.id,
                salesItemId: null,
                prepaymentAmount: prepaymentAmount.toString(),
                status: 'REQUESTED', // DEPRECATED: 하위 호환성 유지
                paymentStatus: 'REQUESTED',
                deductionStatus: 'NOT_DEDUCTED',
                requestedDate: savedSales.reservationDate || savedSales.salesDate || new Date(),
              });

              await manager.save(CustomerPrepayment, prepayment);
              this.logger.debug(`[판매 수정] 선입금 생성 완료 - 판매 ID: ${savedSales.id}, 금액: ${prepaymentAmount}`);
            }
          } else {
            // 선입금 정보가 제거된 경우 (REQUESTED 상태만 삭제)
            const existingPrepayment = await manager.findOne(CustomerPrepayment, {
              where: { salesId: savedSales.id },
            });
            
            if (existingPrepayment && (advancePaymentRatio === null && advancePaymentAmount === null)) {
              if (existingPrepayment.paymentStatus === 'REQUESTED') {
                await manager.remove(CustomerPrepayment, existingPrepayment);
                this.logger.debug(`[판매 수정] 선입금 정보 제거로 인한 선입금 레코드 삭제 - 판매 ID: ${savedSales.id}`);
              }
            }
          }

          // 7. 판매 취소 시 선입금 처리
          // 취소된 항목이 있는지 확인
          const hasCancelledItems = salesItems.some((item) => item.status === 'SALES_ITEM_CANCELLED');
          // 전체 취소 여부 (모든 항목이 취소된 경우에만 sa_cancelled_at 설정 → 목록에서 제외)
          const hasAllItemsCancelled =
            salesItems.length > 0 && salesItems.every((item) => item.status === 'SALES_ITEM_CANCELLED');
          // items: []로 전송되어 모든 항목이 삭제된 경우
          // 단, "잘못된 배정 수정"으로 항목 0개인 판매도 허용하므로, 취소 의도가 있을 때만 전체 취소 처리
          // hasCancellationIntent: isCancellation | cancellationReason | prepaymentCancellationMethod | items에 CANCELLED 포함
          const allItemsRemoved = salesItems.length === 0 && existingItemCountBeforeUpdate > 0;
          const hasCancellationIntent =
            dto.isCancellation === true ||
            (dto.cancellationReason?.trim?.()?.length ?? 0) > 0 ||
            dto.prepaymentCancellationMethod != null ||
            isCancellationRequest;
          // isCancellation + 항목 0개: 이전 취소에서 항목만 삭제되고 sa_cancelled_at 미설정된 경우에도 처리
          const isFullCancellation =
            hasAllItemsCancelled ||
            (allItemsRemoved && hasCancellationIntent) ||
            (dto.isCancellation === true && salesItems.length === 0);
          // 예약일이 있거나 선입금이 있는 경우 처리
          const hasReservation = existingSales.reservationDate != null;

          if (isCancellationRequest || allItemsRemoved || (dto.isCancellation && salesItems.length === 0)) {
            this.logger.debug(
              `[판매 취소-선입금분기] salesId: ${id}, hasCancelledItems: ${hasCancelledItems}, hasAllItemsCancelled: ${hasAllItemsCancelled}, allItemsRemoved: ${allItemsRemoved}, isCancellation+0items: ${dto.isCancellation && salesItems.length === 0}, hasReservation: ${hasReservation}, ` +
                `salesItems 상태 분포: ${salesItems.map((i) => i.status ?? 'null').join(', ') || '(없음)'}`,
            );
          }

          if (isFullCancellation) {
            this.logger.debug(
              `[판매 취소] 전체 취소 처리 - salesId: ${id}, allItemsRemoved: ${allItemsRemoved}, hasAllItemsCancelled: ${hasAllItemsCancelled}`,
            );
            // 전체 취소: sa_status(취소 전 상태), sa_cancelled_at, sa_cancellation_reason 저장 → 목록에서 제외
            const statusBeforeCancel = this.deriveSalesStatusFromItems(existingSales.items ?? []);
            savedSales.status = statusBeforeCancel ?? savedSales.status ?? null;
            savedSales.cancelledAt = new Date();
            savedSales.cancellationReason = dto.cancellationReason ?? null;
            await manager.save(Sales, savedSales);
            this.logger.debug(
              `[판매 취소] Sales 저장 (전체 취소) - salesId: ${id}, sa_status: ${statusBeforeCancel ?? 'null'}, sa_cancelled_at: ${savedSales.cancelledAt?.toISOString()}, sa_cancellation_reason: ${dto.cancellationReason ? '있음' : '없음'}`,
            );
          }

          if (hasCancelledItems || (allItemsRemoved && hasCancellationIntent)) {
            // 선입금 조회 (부분 취소 또는 전체 취소 시)
            const prepayment = await manager.findOne(CustomerPrepayment, {
              where: { salesId: id },
            });

            this.logger.debug(`[판매 취소] 선입금 처리 시작 - 판매 ID: ${id}, 예약일: ${hasReservation}, 선입금 존재: ${!!prepayment}, 선입금 상태: ${prepayment?.paymentStatus}`);

            if (prepayment) {
              if (prepayment.paymentStatus === 'REQUESTED') {
                // REQUESTED 상태: 자동으로 CANCELLED로 변경
                prepayment.paymentStatus = 'CANCELLED';
                prepayment.status = 'CANCELLED'; // DEPRECATED: 하위 호환성 유지
                prepayment.notes = dto.cancellationReason 
                  ? `예약 취소: ${dto.cancellationReason}` 
                  : '예약 취소';
                await manager.save(CustomerPrepayment, prepayment);
                this.logger.debug(`[판매 취소] 선입금 취소 완료 - 판매 ID: ${savedSales.id}, 선입금 ID: ${prepayment.id}`);
              } else if (prepayment.paymentStatus === 'CONFIRMED') {
                // CONFIRMED 상태: 사용자 선택이 없으면 기본값으로 다음 거래에 사용
                const cancellationMethod = dto.prepaymentCancellationMethod || 'KEEP_FOR_NEXT';
                this.logger.debug(`[판매 취소] CONFIRMED 상태 선입금 처리 - 판매 ID: ${savedSales.id}, 선입금 ID: ${prepayment.id}, 처리 방법: ${cancellationMethod}`);
                
                if (cancellationMethod === 'REFUND') {
                  // 환불 처리: CONFIRMED → REFUNDED
                  prepayment.paymentStatus = 'REFUNDED';
                  prepayment.status = 'REFUNDED'; // DEPRECATED: 하위 호환성 유지
                  const existingNotes = prepayment.notes ? `${prepayment.notes}\n` : '';
                  prepayment.notes = existingNotes + (dto.cancellationReason 
                    ? `예약 취소 (환불): ${dto.cancellationReason}` 
                    : '예약 취소 (환불)');
                  await manager.save(CustomerPrepayment, prepayment);
                  this.logger.debug(`[판매 취소] 선입금 환불 처리 완료 - 판매 ID: ${savedSales.id}, 선입금 ID: ${prepayment.id}, 상태: ${prepayment.paymentStatus}`);
                } else {
                  // 다음 거래에 사용 (기본값): CONFIRMED → AVAILABLE
                  prepayment.paymentStatus = 'AVAILABLE';
                  prepayment.status = 'AVAILABLE'; // DEPRECATED: 하위 호환성 유지
                  prepayment.salesItemId = null; // 판매 항목 연결 해제 (이미 NULL일 수 있음)
                  const existingNotes = prepayment.notes ? `${prepayment.notes}\n` : '';
                  prepayment.notes = existingNotes + (dto.cancellationReason 
                    ? `예약 취소 잔액 (다음 거래 사용): ${dto.cancellationReason}` 
                    : '예약 취소 잔액 (다음 거래 사용)');
                  await manager.save(CustomerPrepayment, prepayment);
                  this.logger.debug(`[판매 취소] 선입금 다음 거래 사용으로 변경 - 판매 ID: ${savedSales.id}, 선입금 ID: ${prepayment.id}, 상태: ${prepayment.paymentStatus}, si_id: ${prepayment.salesItemId}`);
                }
              } else if (prepayment.paymentStatus === 'AVAILABLE') {
                // AVAILABLE 상태: 이미 사용 가능한 상태이므로 추가 처리 불필요
                // 단, 환불 처리 요청이 있으면 REFUNDED로 변경
                if (dto.prepaymentCancellationMethod === 'REFUND') {
                  prepayment.paymentStatus = 'REFUNDED';
                  prepayment.status = 'REFUNDED'; // DEPRECATED: 하위 호환성 유지
                  const existingNotes = prepayment.notes ? `${prepayment.notes}\n` : '';
                  prepayment.notes = existingNotes + (dto.cancellationReason 
                    ? `환불 처리: ${dto.cancellationReason}` 
                    : '환불 처리');
                  await manager.save(CustomerPrepayment, prepayment);
                  this.logger.debug(`[판매 취소] 사용 가능 선입금 환불 처리 - 판매 ID: ${savedSales.id}, 선입금 ID: ${prepayment.id}, 상태: ${prepayment.paymentStatus}`);
                } else {
                  this.logger.debug(`[판매 취소] 사용 가능 선입금 유지 - 판매 ID: ${savedSales.id}, 선입금 ID: ${prepayment.id}, 상태: ${prepayment.paymentStatus}`);
                }
              } else if (prepayment.deductionStatus === 'DEDUCTED') {
                // DEDUCTED 상태: 취소 불가
                throw new BadRequestException('이미 차감된 선입금이 있어 취소할 수 없습니다. 판매 취소 프로세스를 진행해주세요.');
              } else if (prepayment.paymentStatus === 'REFUNDED' || prepayment.paymentStatus === 'CANCELLED') {
                // 이미 환불되거나 취소된 상태
                this.logger.debug(`[판매 취소] 이미 처리된 선입금 - 판매 ID: ${savedSales.id}, 선입금 ID: ${prepayment.id}, 상태: ${prepayment.paymentStatus}`);
              }
            }
          }


          // 8. 배송 자동 생성 (판매 항목 중 SALES_ITEM_SOLD (판매) 상태가 있으면)
          try {
            await this.salesDeliveryService.createFromSales(savedSales, salesItems, userId, manager);
            if (isCancellationRequest) {
              this.logger.debug(`[판매 취소-배송] salesId: ${id}, createFromSales 완료 (전체 취소 시 배송 생성 안 함)`);
            }
          } catch (error) {
            this.logger.error(`[판매 수정] 배송 자동 생성 실패: ${error.message}`, error.stack);
            // 배송 생성 실패해도 판매 수정은 성공으로 처리 (트랜잭션 외부에서 처리)
          }

          // 판매 → 판매 예약 변경 시: 해당 배송 소프트 삭제 (운송관리 목록에서 제외)
          if (isToReservation && deliveryForReservationCheck) {
            await this.salesDeliveryService.softDeleteBySalesId(id, userId, manager);
          }

          if (isCancellationRequest) {
            this.logger.debug(`[판매 취소-완료] salesId: ${id}, 트랜잭션 커밋 직전`);
          }

          return savedSales;
        });
        const newSales = await this.salesRepository.findOne({
          where: { id },
          relations: ['items'],
        });
        const newDataJson = this.salesToJson(newSales);
        await this.featureAuditLogService.create({
          domain: 'SALES',
          feature: 'SALES_MANAGEMENT',
          action: 'UPDATED',
          userId: userId ?? null,
          summary: isCancellationRequest ? `판매 #${id} 취소` : `판매 #${id} 수정`,
          entityType: 'sales',
          entityId: parseInt(id, 10) || undefined,
          payload: { salesId: id, isCancellation: isCancellationRequest, cancellationReason: dto.cancellationReason ?? undefined },
          oldData: (oldDataJson ?? undefined) as Record<string, unknown> | undefined,
          newData: (newDataJson ?? undefined) as Record<string, unknown> | undefined,
        }).catch((err) => this.logger.warn('[기능이력] 판매 수정 로그 저장 실패', err));

        // STO/DT/workFee 변경된 컨테이너의 확정원가 재계산 (트랜잭션 커밋 후)
        const uniqueContainerIds = [...new Set(containerIdsForCostRecalc)];
        for (const containerId of uniqueContainerIds) {
          try {
            await this.tradeContractsService.recalculateContainerCost(containerId);
            this.logger.debug(`[판매 수정] 확정원가 재계산 완료 - containerId: ${containerId}`);
          } catch (err) {
            this.logger.warn(`[판매 수정] 확정원가 재계산 실패 (containerId=${containerId}):`, err);
          }
        }

        return result;
      }

  /**
   * 판매 확정 처리
   * 판매예약을 판매로 전환하고 선입금 차감, 채권 생성 등을 처리합니다.
   */
  async confirmSales(id: string, dto: UpdateSalesDto, userId?: number): Promise<Sales> {
    // 판매 항목 없이 저장 허용 (잘못된 배정 수정 시 활용)
    const items = dto.items ?? [];

    if (!dto.salesDate) {
      throw new BadRequestException('판매일이 필요합니다.');
    }

    // 트랜잭션으로 처리
    return await this.dataSource.transaction(async (manager) => {
      // 1. 기존 판매 정보 조회
      const existingSales = await manager.findOne(Sales, {
        where: { id },
        relations: ['items', 'customer'],
      });

      if (!existingSales) {
        throw new NotFoundException(`판매 정보를 찾을 수 없습니다. (ID: ${id})`);
      }

      // 2. 판매예약/판매 상태 확인 (항목이 있을 때만)
      // SALES_ITEM_RESERVED: 일반 예약, SALES_ITEM_SOLD: 입고 확정된 컨테이너로 추가된 경우
      let containers: TradeContainer[] = [];
      const itemsToProcess = items.length > 0 ? items : existingSales.items.map((i) => ({ id: i.id, containerId: i.containerId }));
      if (itemsToProcess.length > 0 && existingSales.items.length > 0) {
        const allowedStatuses = ['SALES_ITEM_RESERVED', 'SALES_ITEM_SOLD'];
        const allEligible = existingSales.items.every((item) => item.status && allowedStatuses.includes(item.status));
        if (!allEligible) {
          throw new BadRequestException('모든 판매 항목이 판매예약 또는 판매 상태여야 합니다.');
        }

        // 3. 연결된 컨테이너의 입고 상태 확인
        const containerIds = existingSales.items.map((item) => item.containerId).filter(Boolean);
        containers = await manager.find(TradeContainer, {
          where: { id: In(containerIds) },
          relations: ['order'],
        });

        const allConfirmed = containers.every((container) => container.order?.inboundStatus === 'INBOUND_CONFIRMED');
        if (!allConfirmed) {
          throw new BadRequestException('모든 재고가 입고 확정 상태여야 합니다.');
        }
      }

      // 4. 고객 정보 upsert (고객 정보가 제공된 경우에만)
      let customer = null;
      if (dto.customerId || dto.phone || dto.companyName) {
        const deliveryAddrIdC = dto.unloadingDeliveryAddressId?.trim();
        customer = await this.upsertCustomer(dto, manager, {
          skipCustomerAddressUpdates: Boolean(deliveryAddrIdC),
        });
        if (!customer) {
          throw new BadRequestException('고객 정보가 필요합니다. (전화번호 또는 고객 ID)');
        }
        existingSales.customerId = customer.id;
        if (deliveryAddrIdC) {
          this.logger.debug(
            `[판매 확정-배송지행] salesId=${id} customerId=${customer.id} deliveryAddressId=${deliveryAddrIdC} ` +
              `→ [배송지행-시작]/[완료]`,
          );
          await this.customersService.applySalesUnloadingToDeliveryAddress(
            customer.id,
            deliveryAddrIdC,
            dto,
            manager,
          );
        }
        this.logger.debug(
          `[판매 확정-고객] salesId=${id}, customerId=${customer.id}, unloadingDeliveryAddressId=${deliveryAddrIdC ?? '(없음)'}, ` +
            `고객카드(대표주소·지역·시군구)=${deliveryAddrIdC ? '스킵' : 'upsert반영'}`,
        );
      } else {
        customer = existingSales.customerId 
          ? await manager.findOne(Customer, { where: { id: existingSales.customerId } })
          : null;
        if (!customer) {
          throw new BadRequestException('고객 정보가 필요합니다.');
        }
        const deliveryAddrIdCf = dto.unloadingDeliveryAddressId?.trim();
        if (deliveryAddrIdCf) {
          this.logger.debug(
            `[판매 확정-배송지행] salesId=${id} customerId=${customer.id} deliveryAddressId=${deliveryAddrIdCf} ` +
              `(고객 dto 생략) → [배송지행-시작]/[완료]`,
          );
          await this.customersService.applySalesUnloadingToDeliveryAddress(
            customer.id,
            deliveryAddrIdCf,
            dto,
            manager,
          );
        }
        this.logger.debug(
          `[판매 확정-고객] salesId=${id}, customerId=${customer.id}, 고객 upsert 생략, 배송지행=${deliveryAddrIdCf ?? '없음'}`,
        );
      }

      // 5. 판매 정보 업데이트
      const salesDateStr = dto.salesDate?.trim();
      if (salesDateStr && salesDateStr.length > 0) {
        existingSales.salesDate = new Date(salesDateStr);
      }
      if (dto.requestVehicle !== undefined) {
        existingSales.requestVehicle = dto.requestVehicle?.trim() || null;
      }
      if (dto.transportFee !== undefined) {
        existingSales.transportFee = dto.transportFee != null ? dto.transportFee : null;
      }
      if (dto.notes !== undefined) {
        existingSales.notes = this.sanitize(dto.notes);
      }
      if (dto.unloadingPostalCode !== undefined) {
        existingSales.unloadingPostalCode = dto.unloadingPostalCode?.trim() || null;
      }
      if (dto.unloadingAddress !== undefined) {
        existingSales.unloadingAddress = dto.unloadingAddress?.trim() || null;
      }
      if (dto.unloadingAddressDetail !== undefined) {
        existingSales.unloadingAddressDetail = dto.unloadingAddressDetail?.trim() || null;
      }
      if (dto.unloadingRegion !== undefined) {
        existingSales.unloadingRegion = dto.unloadingRegion?.trim() || null;
      }
      if (dto.unloadingCity !== undefined) {
        existingSales.unloadingCity = dto.unloadingCity?.trim() || null;
      }
      if (dto.unloadingAddressRoad !== undefined) {
        existingSales.unloadingAddressRoad = dto.unloadingAddressRoad?.trim() || null;
      }
      if (dto.unloadingAddressJibun !== undefined) {
        existingSales.unloadingAddressJibun = dto.unloadingAddressJibun?.trim() || null;
      }
      if (dto.unloadingLegalBCode !== undefined) {
        existingSales.unloadingLegalBCode =
          dto.unloadingLegalBCode?.replace(/\D/g, '').slice(0, 10) || null;
      }

      // items가 비어 있으면 기존 항목 전체를 확정 대상으로 사용 (삭제 없음)
      const effectiveItems =
        items.length > 0
          ? items
          : existingSales.items.map((i) => ({
              id: i.id,
              containerId: i.containerId,
              containerType: (i as any).containerType || 'CONTAINER',
              cargoBales: i.cargoBales != null ? Number(i.cargoBales) : null,
              cargoWeight: i.cargoWeight != null ? Number(i.cargoWeight) : null,
              stoCost: i.stoCost != null ? Number(i.stoCost) : null,
              dtCost: i.dtCost != null ? Number(i.dtCost) : null,
              salesUnitPrice: i.salesUnitPrice != null ? Number(i.salesUnitPrice) : null,
            }));

      // 판매 확정 시 sa_status를 SOLD로 업데이트
      existingSales.status = 'SOLD';

      const savedSales = await manager.save(Sales, existingSales);

      // 6. 판매 항목 업데이트 및 상태 변경
      this.logger.debug(`[confirmSales] 판매 ID: ${id}, 기존 항목 수: ${existingSales.items.length}, 요청 항목 수: ${effectiveItems.length}`);
      effectiveItems.forEach((itemDto, index) => {
        this.logger.debug(`[confirmSales] 요청 항목 ${index + 1}: id=${itemDto.id ?? '없음'}, containerId=${itemDto.containerId ?? '없음'}`);
      });
      existingSales.items.forEach((item, index) => {
        this.logger.debug(`[confirmSales] 기존 항목 ${index + 1}: id=${item.id}, containerId=${item.containerId}`);
      });

      // items에 포함된 항목 ID 목록 (기존 항목 업데이트용)
      const requestedItemIds = new Set(
        effectiveItems
          .map((item) => item.id)
          .filter((id): id is string => !!id),
      );

      // items에 포함되지 않은 기존 항목 삭제 (effectiveItems가 비어 있으면 삭제 없음)
      const itemsToDelete = existingSales.items.filter((item) => !requestedItemIds.has(item.id));
      if (itemsToDelete.length > 0) {
        const deletedContainerIds = itemsToDelete.map((item) => item.containerId).filter(Boolean);
        await manager.remove(SalesItem, itemsToDelete);
        this.logger.debug(`[confirmSales] 삭제된 항목 수: ${itemsToDelete.length}, 삭제된 컨테이너 ID: ${deletedContainerIds.join(', ')}`);
        
        // 삭제된 항목의 컨테이너 재고 상태 업데이트
        for (const containerId of deletedContainerIds) {
          await this.updateContainerInventoryStatus(containerId, manager);
        }
      }

      const salesItems = await Promise.all(
        effectiveItems.map(async (itemDto) => {
          // 컨테이너 확인
          const container = await manager.findOne(TradeContainer, {
            where: { id: itemDto.containerId },
          });

          if (!container) {
            throw new NotFoundException(`컨테이너 ID ${itemDto.containerId}를 찾을 수 없습니다.`);
          }

          // itemDto.id가 있으면 기존 항목 찾기, 없으면 신규 항목 생성
          let salesItem: SalesItem;
          
          if (itemDto.id) {
            // 기존 항목 업데이트
            salesItem = await manager.findOne(SalesItem, {
              where: { id: itemDto.id, salesId: id },
            });

            if (!salesItem) {
              throw new NotFoundException(`판매 항목을 찾을 수 없습니다. (ID: ${itemDto.id})`);
            }

            // 판매 항목 정보 업데이트
            if (itemDto.cargoBales !== undefined) {
              salesItem.cargoBales = itemDto.cargoBales != null ? itemDto.cargoBales.toString() : null;
            }
            if (itemDto.cargoWeight !== undefined) {
              salesItem.cargoWeight = itemDto.cargoWeight != null ? itemDto.cargoWeight.toString() : null;
            }
            if (itemDto.stoCost !== undefined) {
              salesItem.stoCost = itemDto.stoCost != null ? itemDto.stoCost.toString() : null;
            }
            if (itemDto.dtCost !== undefined) {
              salesItem.dtCost = itemDto.dtCost != null ? itemDto.dtCost.toString() : null;
            }
            // margin은 더 이상 저장하지 않음 - 계산 필드로 사용
            if (itemDto.salesUnitPrice !== undefined) {
              salesItem.salesUnitPrice = itemDto.salesUnitPrice != null ? itemDto.salesUnitPrice.toString() : null;
            }
            if (itemDto.salesUnitPriceStage !== undefined) {
              salesItem.salesUnitPriceStage = itemDto.salesUnitPriceStage ?? null;
              this.logger.debug(
                `[판매 확정] 구분(salesUnitPriceStage) 저장 - itemId: ${itemDto.id}, containerId: ${itemDto.containerId}, salesUnitPriceStage: ${itemDto.salesUnitPriceStage ?? 'null'}`,
              );
            }
            // 판매 항목 상태를 판매로 변경
            salesItem.status = 'SALES_ITEM_SOLD';
          } else {
            // 신규 항목 생성
            salesItem = manager.create(SalesItem, {
              salesId: savedSales.id,
              containerId: itemDto.containerId,
              containerType: itemDto.containerType || 'CONTAINER',
              cargoBales: itemDto.cargoBales?.toString() || null,
              cargoWeight: itemDto.cargoWeight?.toString() || null,
              stoCost: itemDto.stoCost?.toString() || null,
              dtCost: itemDto.dtCost?.toString() || null,
              advancePaymentRatio: itemDto.advancePaymentRatio?.toString() || null,
              // margin은 더 이상 저장하지 않음 - 계산 필드로 사용
              salesUnitPrice: itemDto.salesUnitPrice?.toString() || null,
              salesUnitPriceStage: itemDto.salesUnitPriceStage ?? null,
              status: 'SALES_ITEM_SOLD', // 판매 확정이므로 바로 판매 상태
            });
            this.logger.debug(
              `[판매 확정-신규항목] 구분(salesUnitPriceStage) 저장 - containerId: ${itemDto.containerId}, salesUnitPriceStage: ${itemDto.salesUnitPriceStage ?? 'null'}`,
            );
          }

          return await manager.save(SalesItem, salesItem);
        }),
      );

      // 7. 재고 상태 업데이트 (선입금 차감은 거래명세서 발행 시 처리)
      for (const container of containers) {
        await this.updateContainerInventoryStatus(container.id, manager);
      }

      // 9. 배송 자동 생성 (판매 항목이 SALES_ITEM_SOLD 상태이므로)
      try {
        await this.salesDeliveryService.createFromSales(savedSales, salesItems, userId, manager);
      } catch (error) {
        this.logger.error(`[판매 확정] 배송 자동 생성 실패: ${error.message}`, error.stack);
        // 배송 생성 실패해도 판매 확정은 성공으로 처리
      }

      this.logger.debug(`[판매 확정] 판매 확정 완료 - salesId: ${savedSales.id}`);
      return savedSales;
    });
  }

  /**
   * 판매 항목 수정 (재고 조정으로 생성된 항목만 수정 가능)
   */
  async updateSalesItem(salesItemId: string, dto: UpdateSalesItemDto, userId?: number): Promise<any> {
    const oldSalesItem = await this.salesItemRepository.findOne({
      where: { id: salesItemId },
      relations: ['sales', 'sales.items'],
    });
    const oldDataJson = oldSalesItem?.sales ? this.salesToJson(oldSalesItem.sales) : null;

    const result = await this.dataSource.transaction(async (manager) => {
      const salesItem = await manager.findOne(SalesItem, {
        where: { id: salesItemId },
        relations: ['sales', 'sales.customer', 'container'],
      });

      if (!salesItem) {
        throw new NotFoundException('판매 항목을 찾을 수 없습니다.');
      }

      // 재고 조정으로 생성된 항목인지 확인 (고객이 없는 경우만 수정 가능)
      if (salesItem.sales?.customerId != null) {
        throw new BadRequestException('판매관리에서 생성된 항목은 수정할 수 없습니다. 재고 조정으로 생성된 항목만 수정 가능합니다.');
      }

      // 판매 항목 수정
      if (dto.cargoBales !== undefined) {
        salesItem.cargoBales = dto.cargoBales !== null ? dto.cargoBales.toString() : null;
      }
      if (dto.cargoWeight !== undefined) {
        salesItem.cargoWeight = dto.cargoWeight !== null ? dto.cargoWeight.toString() : null;
      }
      if (dto.notes !== undefined) {
        salesItem.reservationNotes = dto.notes !== null ? dto.notes : null;
      }

      await manager.save(SalesItem, salesItem);

      // 재고 상태 재계산
      await this.updateContainerInventoryStatus(salesItem.containerId, manager);

      return {
        success: true,
        message: '판매 항목이 수정되었습니다.',
        salesItem: {
          id: salesItem.id,
          cargoBales: salesItem.cargoBales ? Number(salesItem.cargoBales) : null,
          cargoWeight: salesItem.cargoWeight ? Number(salesItem.cargoWeight) : null,
        },
      };
    });
    const salesIdForNew = oldSalesItem?.salesId ?? (await this.salesItemRepository.findOne({ where: { id: salesItemId }, select: ['salesId'] }))?.salesId;
    const newSales = salesIdForNew
      ? await this.salesRepository.findOne({ where: { id: salesIdForNew }, relations: ['items'] })
      : null;
    const newDataJson = this.salesToJson(newSales);
    await this.featureAuditLogService.create({
      domain: 'SALES',
      feature: 'SALES_MANAGEMENT',
      action: 'UPDATED',
      userId: userId ?? null,
      summary: `판매 항목 #${salesItemId} 수정`,
      entityType: 'sales_item',
      entityId: parseInt(salesItemId, 10) || undefined,
      payload: { salesItemId },
      oldData: (oldDataJson ?? undefined) as Record<string, unknown> | undefined,
      newData: (newDataJson ?? undefined) as Record<string, unknown> | undefined,
    }).catch((err) => this.logger.warn('[기능이력] 판매 항목 수정 로그 저장 실패', err));
    return result;
  }

  /**
   * 판매 항목 삭제 (재고 조정으로 생성된 항목만 삭제 가능)
   */
  async deleteSalesItem(salesItemId: string, userId?: number): Promise<any> {
    const oldSalesItem = await this.salesItemRepository.findOne({
      where: { id: salesItemId },
      relations: ['sales', 'sales.items'],
    });
    const oldDataJson = oldSalesItem?.sales ? this.salesToJson(oldSalesItem.sales) : null;
    const salesIdToReload = oldSalesItem?.salesId ?? null;

    const result = await this.dataSource.transaction(async (manager) => {
      const salesItem = await manager.findOne(SalesItem, {
        where: { id: salesItemId },
        relations: ['sales', 'sales.customer', 'sales.items', 'container'],
      });

      if (!salesItem) {
        throw new NotFoundException('판매 항목을 찾을 수 없습니다.');
      }

      // 재고 조정으로 생성된 항목인지 확인 (고객이 없는 경우만 삭제 가능)
      if (salesItem.sales?.customerId != null) {
        throw new BadRequestException('판매관리에서 생성된 항목은 삭제할 수 없습니다. 재고 조정으로 생성된 항목만 삭제 가능합니다.');
      }

      const containerId = salesItem.containerId;

      // 판매 항목 삭제 (상태를 CANCELLED로 변경)
      salesItem.status = 'SALES_ITEM_CANCELLED';
      await manager.save(SalesItem, salesItem);

      // 판매에 다른 항목이 없으면 판매도 삭제
      const remainingItems = await manager.find(SalesItem, {
        where: { salesId: salesItem.salesId, status: Not('SALES_ITEM_CANCELLED') },
      });

      if (remainingItems.length === 0) {
        // 판매 삭제는 CASCADE로 자동 처리되지만, 명시적으로 삭제
        await manager.remove(salesItem.sales);
      }

      // 재고 상태 재계산
      await this.updateContainerInventoryStatus(containerId, manager);

      return {
        success: true,
        message: '판매 항목이 삭제되었습니다.',
      };
    });
    const newSales =
      salesIdToReload != null
        ? await this.salesRepository.findOne({ where: { id: salesIdToReload }, relations: ['items'] })
        : null;
    const newDataJson = this.salesToJson(newSales);
    await this.featureAuditLogService.create({
      domain: 'SALES',
      feature: 'SALES_MANAGEMENT',
      action: 'DELETED',
      userId: userId ?? null,
      summary: `판매 항목 #${salesItemId} 삭제`,
      entityType: 'sales_item',
      entityId: parseInt(salesItemId, 10) || undefined,
      payload: { salesItemId },
      oldData: (oldDataJson ?? undefined) as Record<string, unknown> | undefined,
      newData: (newDataJson ?? undefined) as Record<string, unknown> | undefined,
    }).catch((err) => this.logger.warn('[기능이력] 판매 항목 삭제 로그 저장 실패', err));
    return result;
  }
}
