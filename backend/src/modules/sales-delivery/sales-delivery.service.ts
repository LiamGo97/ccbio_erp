import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull, In, Not } from 'typeorm';
import { SalesDelivery } from './entities/sales-delivery.entity';
import { SalesDeliveryLoadingItem } from './entities/sales-delivery-loading-item.entity';
import { SalesDeliveryWorkLine } from './entities/sales-delivery-work-line.entity';
import { Sales } from '../sales/entities/sales.entity';
import { SalesItem } from '../sales/entities/sales-item.entity';
import { TradeContainer } from '../trade-contracts/entities/trade-container.entity';
import { effectiveSalesBalesFromContainer } from '../trade-contracts/sales-item-cargo.helper';
import { User } from '../users/entities/user.entity';
import { Warehouse } from '../warehouse/entities/warehouse.entity';
import { Region } from '../regions/entities/region.entity';
import { City } from '../cities/entities/city.entity';
import { Customer } from '../customers/entities/customer.entity';
import { CreateSalesDeliveryDto } from './dto/create-sales-delivery.dto';
import { UpdateSalesDeliveryDto } from './dto/update-sales-delivery.dto';
import { FeatureAuditLogService } from '../feature-audit-log/feature-audit-log.service';
import { CustomersService } from '../customers/customers.service';

@Injectable()
export class SalesDeliveryService {
  private readonly logger = new Logger(SalesDeliveryService.name);

  constructor(
    @InjectRepository(SalesDelivery)
    private salesDeliveryRepository: Repository<SalesDelivery>,
    @InjectRepository(SalesDeliveryLoadingItem)
    private loadingItemRepository: Repository<SalesDeliveryLoadingItem>,
    @InjectRepository(SalesDeliveryWorkLine)
    private workLineRepository: Repository<SalesDeliveryWorkLine>,
    @InjectRepository(Sales)
    private salesRepository: Repository<Sales>,
    @InjectRepository(SalesItem)
    private salesItemRepository: Repository<SalesItem>,
    @InjectRepository(TradeContainer)
    private tradeContainerRepository: Repository<TradeContainer>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Warehouse)
    private warehouseRepository: Repository<Warehouse>,
    @InjectRepository(Region)
    private regionRepository: Repository<Region>,
    @InjectRepository(City)
    private cityRepository: Repository<City>,
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    private dataSource: DataSource,
    private featureAuditLogService: FeatureAuditLogService,
    private customersService: CustomersService,
  ) {}

  /**
   * 배송 엔티티를 이력 저장용 JSON으로 변환 (중량·베일·컨테이너 등 전체 스냅샷)
   */
  private deliveryToJson(delivery: SalesDelivery): Record<string, unknown> {
    if (!delivery) return {};
    return {
      id: delivery.id,
      salesId: delivery.salesId,
      status: delivery.status,
      orderNumber: delivery.orderNumber,
      requestVehicle: delivery.requestVehicle,
      requestWeight: delivery.requestWeight,
      unloadingPostalCode: delivery.unloadingPostalCode,
      unloadingAddress: delivery.unloadingAddress,
      unloadingAddressDetail: delivery.unloadingAddressDetail,
      unloadingRegionId: delivery.unloadingRegionId,
      unloadingCityId: delivery.unloadingCityId,
      unloadingScheduleDate: delivery.unloadingScheduleDate,
      unloadingScheduleTime: delivery.unloadingScheduleTime,
      dispatchCompanyId: delivery.dispatchCompanyId,
      unloadingCompanyId: delivery.unloadingCompanyId,
      directUnloadingContact: delivery.directUnloadingContact,
      vehicleNumber: delivery.vehicleNumber,
      driverName: delivery.driverName,
      driverContact: delivery.driverContact,
      entryTime: delivery.entryTime,
      loadingDateTime: delivery.loadingDateTime,
      unloadingDateTime: delivery.unloadingDateTime,
      transportFee: delivery.transportFee != null ? Number(delivery.transportFee) : null,
      weighingFee: delivery.weighingFee != null ? Number(delivery.weighingFee) : null,
      freightPaymentType: delivery.freightPaymentType,
      transportFeePaymentStatus: delivery.transportFeePaymentStatus,
      notes: delivery.notes,
      statusReason: delivery.statusReason,
      reprocessReason: delivery.reprocessReason,
      createdBy: delivery.createdBy,
      deletedAt: delivery.deletedAt,
      deletedBy: delivery.deletedBy,
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt,
      loadingItems: (delivery.loadingItems ?? []).map((item) => ({
        id: item.id,
        salesDeliveryId: item.salesDeliveryId,
        salesItemId: item.salesItemId,
        loadingSchedule: item.loadingSchedule,
        loadingScheduleTime: item.loadingScheduleTime,
        requestBL: item.requestBL,
        requestContainer: item.requestContainer,
        requestContainerType: item.requestContainerType,
        requestBales: item.requestBales != null ? Number(item.requestBales) : null,
        requestWeight: item.requestWeight != null ? Number(item.requestWeight) : null,
        requestNotes: item.requestNotes,
        workBL: item.workBL,
        workContainer: item.workContainer,
        workContainerType: item.workContainerType,
        workWeight: item.workWeight != null ? Number(item.workWeight) : null,
        workBales: item.workBales != null ? Number(item.workBales) : null,
        actualBL: item.actualBL,
        actualContainer: item.actualContainer,
        actualContainerType: item.actualContainerType,
        actualBales: item.actualBales != null ? Number(item.actualBales) : null,
        actualWeight: item.actualWeight != null ? Number(item.actualWeight) : null,
        status: item.status,
        order: item.order,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }

  async findAll(
    salesId?: string,
    statuses?: string[],
    search?: string,
    dispatchCompanyIds?: number[],
    loadingWarehouseIds?: number[],
    page: number = 1,
    limit: number = 10,
    sortBy: string = 'createdAt',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
  ) {
    const qb = this.salesDeliveryRepository.createQueryBuilder('delivery')
      .leftJoinAndSelect('delivery.sales', 'sales')
      .leftJoinAndSelect('sales.customer', 'customer')
      .leftJoinAndSelect('delivery.unloadingRegion', 'unloadingRegion')
      .leftJoinAndSelect('delivery.unloadingCity', 'unloadingCity')
      .leftJoinAndSelect('delivery.dispatchCompany', 'dispatchCompany')
      .leftJoinAndSelect('delivery.unloadingCompany', 'unloadingCompany')
      .leftJoinAndSelect('delivery.createdByUser', 'createdByUser')
      .leftJoinAndSelect('delivery.loadingItems', 'loadingItems')
      .leftJoinAndSelect('loadingItems.salesItem', 'salesItem')
      .leftJoinAndSelect('salesItem.container', 'container')
      .leftJoinAndSelect('container.order', 'containerOrder', 'containerOrder.to_deleted_at IS NULL')
      .leftJoinAndSelect('containerOrder.inbounds', 'inbounds')
      .where('delivery.deletedAt IS NULL')
      // 판매 취소(전체 항목 SALES_ITEM_CANCELLED)인 경우 운송관리 목록에서 제외
      // 단, salesId로 특정 판매 조회 시에는 해당 배송을 표시 (복구·확인 목적)
      .andWhere(
        salesId
          ? 'delivery.salesId = :salesId'
          : `EXISTS (SELECT 1 FROM tb_sales_item si WHERE si.sa_id = delivery.sd_sales_id AND COALESCE(si.si_status, '') != 'SALES_ITEM_CANCELLED')`,
        salesId ? { salesId } : {},
      );
    
    // 상차지(창고) 필터링: loadingItem 중 하나라도 해당 창고에서 상차하는 배송 포함
    // - 상차지 1개, 여러 개(동일/혼합) 모두 처리: delivery 기준 EXISTS 서브쿼리
    // - 경로: loading_item -> sales_item -> container -> order -> inbound(CONFIRMED) -> warehouse
    // - 상태 제한 없음: 운송관리/창고 업체 모두 클라이언트가 보낸 statuses 그대로 사용 (창고 업체는 프론트에서 4개 상태로 필터)
    if (loadingWarehouseIds !== undefined) {
      if (loadingWarehouseIds.length === 0) {
        qb.andWhere('1 = 0'); // 선택 안 함 → 결과 없음
      } else {
        if (statuses !== undefined) {
          if (statuses.length === 0) {
            qb.andWhere('1 = 0');
          } else {
            const upper = statuses.map((s) => s.toUpperCase());
            qb.andWhere('delivery.status IN (:...statuses)', { statuses: upper });
          }
        }

        // wh_name과 ti_warehouse 매칭 시 TRIM 적용 (공백 오차 방지), 다중 창고 IN 조건
        qb.andWhere(
          'EXISTS (' +
          '  SELECT 1 FROM tb_sales_delivery_loading_item li ' +
          '  JOIN tb_sales_item si ON si.si_id = li.sdli_sales_item_id ' +
          '  JOIN tb_container c ON c.co_id = si.co_id ' +
          '  JOIN tb_trade_order o ON o.to_id = c.co_order_id AND o.to_deleted_at IS NULL ' +
          '  JOIN tb_trade_order_inbound i ON i.ti_order_id = o.to_id AND i.ti_status = \'CONFIRMED\' AND i.ti_warehouse IS NOT NULL ' +
          '  JOIN tb_warehouse w ON w.wh_id IN (:...loadingWarehouseIds) AND TRIM(w.wh_name) = TRIM(i.ti_warehouse) ' +
          '  WHERE li.sdli_sales_delivery_id = delivery.sd_id' +
          ')',
          { loadingWarehouseIds }
        );
      }
    } else if (statuses !== undefined) {
      if (statuses.length === 0) {
        // 선택 안 함 (__none__ 등으로 빈 배열 전달) → 결과 없음
        qb.andWhere('1 = 0');
      } else {
        // 일반 상태 필터링 (다중 선택)
        const upper = statuses.map((s) => s.toUpperCase());
        qb.andWhere('delivery.status IN (:...statuses)', { statuses: upper });
      }
    }
    
    if (dispatchCompanyIds !== undefined) {
      if (dispatchCompanyIds.length === 0) {
        qb.andWhere('1 = 0'); // 선택 안 함 → 결과 없음
      } else {
        qb.andWhere('delivery.dispatchCompanyId IN (:...dispatchCompanyIds)', { dispatchCompanyIds });
      }
    }
    if (search) {
      const searchLower = `%${search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(COALESCE(delivery.orderNumber, \'\')) LIKE :search OR ' +
        'LOWER(COALESCE(customer.companyName, \'\')) LIKE :search OR ' +
        'LOWER(COALESCE(customer.ceo, \'\')) LIKE :search OR ' +
        'LOWER(COALESCE(customer.phone, \'\')) LIKE :search OR ' +
        'LOWER(COALESCE(delivery.driverName, \'\')) LIKE :search OR ' +
        'LOWER(COALESCE(delivery.vehicleNumber, \'\')) LIKE :search OR ' +
        'LOWER(COALESCE(delivery.driverContact, \'\')) LIKE :search)',
        { search: searchLower }
      );
    }

    const allowedSortColumns = [
      'orderNumber', 'status', 'createdAt', 'requestVehicle', 'requestWeight',
      'unloadingScheduleDate', 'transportFee', 'weighingFee', 'loadingDateTime', 'unloadingDateTime',
    ];
    const safeSortBy = sortBy && allowedSortColumns.includes(sortBy) ? sortBy : 'createdAt';
    const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    // 상차일정 정렬: 화면 표시와 동일하게 loadingDateTime 우선, 없으면 첫 loadingItem의 loadingSchedule 사용
    // TypeORM orderBy가 복잡한 표현식을 파싱하지 못하므로, subquery join + addSelect로 회피
    if (safeSortBy === 'loadingDateTime') {
      qb.leftJoin(
        (subQb) =>
          subQb
            .select('li.sdli_sales_delivery_id', 'delivery_id')
            .addSelect('MIN(li.sdli_loading_schedule)', 'min_schedule')
            .from(SalesDeliveryLoadingItem, 'li')
            .groupBy('li.sdli_sales_delivery_id'),
        'minLoading',
        'minLoading.delivery_id = delivery.sd_id',
      );
      qb.addSelect(
        `COALESCE(
          CASE WHEN delivery.sd_loading_date_time IS NOT NULL AND TRIM(delivery.sd_loading_date_time) != ''
            THEN (delivery.sd_loading_date_time::timestamp)
            ELSE NULL
          END,
          minLoading.min_schedule
        )`,
        'eff_loading_date',
      );
      qb.orderBy('eff_loading_date', safeSortOrder);
    } else {
      qb.orderBy(`delivery.${safeSortBy}`, safeSortOrder);
    }
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [deliveries, total] = await qb.getManyAndCount();

    // 거래명세서 발행 완료(ISSUED·미삭제)에 포함된 판매항목 ID 목록 조회
    const allSalesItemIds = deliveries.flatMap((d) => (d.loadingItems || []).map((li) => li.salesItemId).filter(Boolean));
    const issuedSalesItemIds = new Set<string>();
    if (allSalesItemIds.length > 0) {
      const uniqueIds = [...new Set(allSalesItemIds)].map((id) => Number(id)).filter((n) => !Number.isNaN(n));
      if (uniqueIds.length === 0) {
        // no-op
      } else {
        const rows = await this.dataSource.query<{ si_id: string }[]>(
          `SELECT ii.si_id::text AS si_id FROM tb_invoice_item ii
           INNER JOIN tb_invoice iv ON iv.iv_id = ii.iv_id
           WHERE iv.iv_status = 'ISSUED' AND iv.iv_deleted_at IS NULL
           AND ii.si_id = ANY($1::bigint[])`,
          [uniqueIds],
        );
        rows.forEach((r) => issuedSalesItemIds.add(r.si_id));
      }
    }

    // 각 delivery의 loadingItems에 대해 창고 정보 + 거래명세서 발행 여부 + 표시용 컨테이너 순번 추가
    await this.attachDisplayContainerSequenceToLoadingItems(
      deliveries.flatMap((d) => d.loadingItems || []),
    );

    for (const delivery of deliveries) {
      // 상차지 순서: 상세정보와 동일하게 sdli_order 기준 정렬
      if (delivery.loadingItems && delivery.loadingItems.length > 0) {
        delivery.loadingItems.sort((a, b) => (a.order || 0) - (b.order || 0));
      }
      if (delivery.loadingItems && delivery.loadingItems.length > 0) {
        for (const item of delivery.loadingItems) {
          (item as any).invoiceIssued = issuedSalesItemIds.has(String(item.salesItemId));
          // SalesItem의 container.order.inbounds를 통해 창고 정보 조회
          const container = item.salesItem?.container;
          const order = container?.order;
          const inbounds = order?.inbounds || [];
          
          // 최신 confirmed inbound의 warehouse 이름으로 Warehouse 조회
          const confirmedInbounds = inbounds.filter(ib => ib.status === 'CONFIRMED');
          if (confirmedInbounds.length > 0) {
            // 최신 inbound (createdAt 기준)
            const latestInbound = confirmedInbounds.sort((a, b) => 
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )[0];
            
            if (latestInbound?.warehouse) {
              // warehouse는 문자열(이름) 또는 숫자(ID)일 수 있음
              const warehouseName = typeof latestInbound.warehouse === 'string' 
                ? latestInbound.warehouse 
                : null;
              
              if (warehouseName) {
                const warehouse = await this.warehouseRepository.findOne({
                  where: { name: warehouseName },
                });
                
                if (warehouse) {
                  // loadingWarehouse 속성 추가 (엔티티에 없지만 응답에 포함)
                  (item as any).loadingWarehouse = {
                    id: warehouse.id,
                    name: warehouse.name,
                  };
                }
              }
            }
          }
        }
      }
    }

    // tb_sales_delivery: timestamp/timestamptz가 pg 연결 타임존에 따라 잘못 해석될 수 있음
    // → raw 쿼리로 UTC 기준 ISO 문자열 직접 조회 (판매와 동일한 표시 보장)
    const deliveryIds = deliveries.map((d) => d.id);
    if (deliveryIds.length > 0) {
      const ids = deliveryIds.map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n));
      const rows = await this.dataSource.query<{ sd_id: string; created_at: string; updated_at: string }[]>(
        `SELECT sd_id::text AS sd_id,
          to_char(sd_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
          to_char(sd_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
         FROM tb_sales_delivery WHERE sd_id = ANY($1::bigint[])`,
        [ids],
      );
      const rowList = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] })?.rows ?? [];
      this.logger.log(
        `[운송관리-TIMESTAMP] raw결과 타입=${Array.isArray(rows) ? 'array' : typeof rows}, rowList길이=${rowList.length}, ` +
        `샘플(최대3건): ${JSON.stringify(rowList.slice(0, 3).map((r: { sd_id: string; created_at: string; updated_at: string }) => ({ sd_id: r.sd_id, created_at: r.created_at })))}`,
      );
      const tsMap = new Map(rowList.map((r: { sd_id: string; created_at: string; updated_at: string }) => [
          r.sd_id,
          { createdAt: r.created_at, updatedAt: r.updated_at },
        ]));
        for (const d of deliveries) {
          const ts = tsMap.get(d.id) as { createdAt: string; updatedAt: string } | undefined;
          if (ts) {
            (d as any).createdAt = ts.createdAt;
            (d as any).updatedAt = ts.updatedAt;
          }
        }
      const sample = deliveries.slice(0, 2).map((d) => ({ id: d.id, createdAt: (d as any).createdAt }));
      this.logger.log(`[운송관리-TIMESTAMP] 응답에 설정된 createdAt 샘플: ${JSON.stringify(sample)}`);
    }

    return {
      data: deliveries,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }

  /**
   * 목록/상세에서 요청/작업/실제 컨테이너마다 순번을 붙이기 위해
   * 각 컨테이너 번호를 컨테이너 FK(co_sequence)로 조회해 requestContainerSequence, workContainerSequence, displayContainerSequence 를 채웁니다.
   */
  private async attachDisplayContainerSequenceToLoadingItems(
    loadingItems: SalesDeliveryLoadingItem[],
  ): Promise<void> {
    if (!loadingItems?.length) return;
    const orderIds = new Set<string>();
    for (const item of loadingItems) {
      const container = item.salesItem?.container;
      const orderId = container?.order?.id;
      if (orderId) orderIds.add(orderId);
    }
    if (orderIds.size === 0) return;
    const containers = await this.tradeContainerRepository.find({
      where: { order: { id: In([...orderIds]) } },
      select: ['id', 'containerNo', 'sequence', 'order'],
      relations: ['order'],
    });
    const byOrderAndNo = new Map<string, number>();
    for (const c of containers) {
      if (c.order?.id != null && c.containerNo != null) {
        byOrderAndNo.set(`${c.order.id}:${String(c.containerNo).trim()}`, c.sequence);
      }
    }
    const getSeq = (orderId: string | undefined, containerNo: string | undefined, itemContainer: { containerNo?: string | null; sequence?: number } | null) => {
      const no = containerNo?.trim();
      if (!no || !orderId) return undefined;
      if (itemContainer?.containerNo != null && String(itemContainer.containerNo).trim() === no) return itemContainer.sequence ?? undefined;
      return byOrderAndNo.get(`${orderId}:${no}`);
    };
    for (const item of loadingItems) {
      const container = item.salesItem?.container;
      const orderId = container?.order?.id;
      const displayNo =
        (item.actualContainer?.trim()) ||
        (item.workContainer?.trim()) ||
        (item.requestContainer?.trim()) ||
        (container?.containerNo != null ? String(container.containerNo).trim() : '') ||
        '';
      if (item.requestContainer?.trim()) {
        const seq = getSeq(orderId, item.requestContainer, container ?? null);
        if (seq != null) (item as any).requestContainerSequence = seq;
      }
      if (item.workContainer?.trim()) {
        const seq = getSeq(orderId, item.workContainer, container ?? null);
        if (seq != null) (item as any).workContainerSequence = seq;
      }
      if (displayNo) {
        const seq = getSeq(orderId, displayNo, container ?? null);
        if (seq != null) (item as any).displayContainerSequence = seq;
      }
    }
  }

  async findOne(id: string) {
    const qb = this.salesDeliveryRepository.createQueryBuilder('delivery')
      .leftJoinAndSelect('delivery.sales', 'sales')
      .leftJoinAndSelect('sales.customer', 'customer')
      .leftJoinAndSelect('delivery.unloadingRegion', 'unloadingRegion')
      .leftJoinAndSelect('delivery.unloadingCity', 'unloadingCity')
      .leftJoinAndSelect('delivery.dispatchCompany', 'dispatchCompany')
      .leftJoinAndSelect('delivery.unloadingCompany', 'unloadingCompany')
      .leftJoinAndSelect('delivery.createdByUser', 'createdByUser')
      .leftJoinAndSelect('delivery.loadingItems', 'loadingItems')
      .leftJoinAndSelect('delivery.workLines', 'workLines')
      .leftJoinAndSelect('loadingItems.salesItem', 'salesItem')
      .leftJoinAndSelect('salesItem.container', 'container')
      .leftJoinAndSelect('container.order', 'containerOrder', 'containerOrder.to_deleted_at IS NULL')
      .leftJoinAndSelect('containerOrder.inbounds', 'inbounds')
      .where('delivery.id = :id', { id })
      .andWhere('delivery.deletedAt IS NULL');

    const delivery = await qb.getOne();

    if (!delivery) {
      throw new NotFoundException('배송 정보를 찾을 수 없습니다.');
    }

    if (delivery.loadingItems) {
      delivery.loadingItems.sort((a, b) => (a.order || 0) - (b.order || 0));
      await this.attachDisplayContainerSequenceToLoadingItems(delivery.loadingItems);

      // 각 loadingItem에 대해 창고 정보 추가
      for (const item of delivery.loadingItems) {
        // SalesItem의 container.order.inbounds를 통해 창고 정보 조회
        const container = item.salesItem?.container;
        const order = container?.order;
        const inbounds = order?.inbounds || [];
        
        // 최신 confirmed inbound의 warehouse 이름으로 Warehouse 조회
        const confirmedInbounds = inbounds.filter(ib => ib.status === 'CONFIRMED');
        if (confirmedInbounds.length > 0) {
          // 최신 inbound (createdAt 기준)
          const latestInbound = confirmedInbounds.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0];
          
          if (latestInbound?.warehouse) {
            // warehouse는 문자열(이름) 또는 숫자(ID)일 수 있음
            const warehouseName = typeof latestInbound.warehouse === 'string' 
              ? latestInbound.warehouse 
              : null;
            
            if (warehouseName) {
              const warehouse = await this.warehouseRepository.findOne({
                where: { name: warehouseName },
              });
              
              if (warehouse) {
                // loadingWarehouse 속성 추가 (엔티티에 없지만 응답에 포함)
                (item as any).loadingWarehouse = {
                  id: warehouse.id,
                  name: warehouse.name,
                };
              }
            }
          }
        }
      }
    }
    if (delivery.workLines) {
      delivery.workLines.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    // tb_sales_delivery: raw 쿼리로 UTC ISO 문자열 조회 (findAll과 동일, 타임존 해석 오류 방지)
    const numId = parseInt(delivery.id, 10);
    if (!Number.isNaN(numId)) {
      const rows = await this.dataSource.query<{ created_at: string; updated_at: string }[]>(
        `SELECT to_char(sd_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
                to_char(sd_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
         FROM tb_sales_delivery WHERE sd_id = $1`,
        [numId],
      );
      const row0 = Array.isArray(rows) ? rows[0] : (rows as { rows?: { created_at: string; updated_at: string }[] })?.rows?.[0];
      if (row0) {
        (delivery as any).createdAt = row0.created_at;
        (delivery as any).updatedAt = row0.updated_at;
      }
    }

    return delivery;
  }

  async create(dto: CreateSalesDeliveryDto, userId?: number) {
    this.logger.log(`[SERVICE] 배송 생성 시작 - salesId: ${dto.salesId}, userId: ${userId}`);

    const sales = await this.salesRepository.findOne({
      where: { id: dto.salesId },
      relations: ['customer', 'customer.regionEntity', 'customer.cityEntity'],
    });

    if (!sales) {
      throw new NotFoundException(`판매 정보를 찾을 수 없습니다. (ID: ${dto.salesId})`);
    }

    const customer = sales.customer;

    const delivery = this.salesDeliveryRepository.create({
      salesId: dto.salesId,
      status: dto.status || 'PENDING_DISPATCH',
      // 하차지 정보 (기본값은 고객 주소, 배송 시 변경 가능)
      requestVehicle: dto.requestVehicle || null,
      requestWeight: dto.requestWeight || null,
      unloadingPostalCode: dto.unloadingPostalCode || customer?.postalCode || null,
      unloadingAddress: dto.unloadingAddress || customer?.address || null,
      unloadingAddressDetail: dto.unloadingAddressDetail || customer?.addressDetail || null,
      unloadingRegionId: dto.unloadingRegion ? parseInt(dto.unloadingRegion) : (customer?.regionId ? parseInt(customer.regionId.toString()) : null),
      unloadingCityId: dto.unloadingCity ? parseInt(dto.unloadingCity) : (customer?.cityId ? parseInt(customer.cityId.toString()) : null),
      unloadingScheduleDate: dto.unloadingScheduleDate ? new Date(dto.unloadingScheduleDate) : null,
      unloadingScheduleTime: dto.unloadingScheduleTime || null,
      dispatchCompanyId: dto.dispatchCompanyId || null,
      unloadingCompanyId: dto.unloadingCompanyId || null,
      vehicleNumber: dto.vehicleNumber || null,
      driverName: dto.driverName || null,
      driverContact: dto.driverContact || null,
      entryTime: dto.entryTime || null,
      loadingDateTime: dto.loadingDateTime?.trim() || null,
      unloadingDateTime: dto.unloadingDateTime?.trim() || null,
      transportFee: dto.transportFee || null,
      weighingFee: null,
      freightPaymentType: dto.freightPaymentType || null,
      transportFeePaymentStatus: dto.transportFeePaymentStatus ?? 'UNPAID',
      notes: dto.notes || null,
      createdBy: userId || null,
    });

    const savedDelivery = await this.salesDeliveryRepository.save(delivery);

    // 상차 항목 생성
    if (dto.loadingItems && dto.loadingItems.length > 0) {
      const loadingItems = dto.loadingItems.map((item, index) =>
        this.loadingItemRepository.create({
          salesDeliveryId: savedDelivery.id,
          salesItemId: item.salesItemId, // 필수
          loadingSchedule: item.loadingSchedule ? new Date(item.loadingSchedule) : null,
          loadingScheduleTime: item.loadingScheduleTime || null,
          requestNotes: item.requestNotes || null,
          workBL: item.workBL || null,
          workContainer: item.workContainer || null,
          workContainerType: item.workContainerType || null,
          workWeight: item.workWeight || null,
          status: item.status || 'PENDING',
          order: item.order || index + 1,
        })
      );
      await this.loadingItemRepository.save(loadingItems);
    }

    this.logger.log(`[SERVICE] 배송 생성 완료 - ID: ${savedDelivery.id}, salesId: ${savedDelivery.salesId}`);

    const createdWithItems = await this.findOne(String(savedDelivery.id));
    const newDataJson = this.deliveryToJson(createdWithItems);
    await this.featureAuditLogService.create({
      domain: 'SALES',
      feature: 'TRANSPORT',
      action: 'CREATED',
      userId: userId ?? null,
      summary: `배송 등록 #${savedDelivery.id} (판매 #${savedDelivery.salesId})`,
      entityType: 'sales_delivery',
      entityId: parseInt(String(savedDelivery.id), 10) || undefined,
      payload: { deliveryId: savedDelivery.id, salesId: savedDelivery.salesId },
      newData: newDataJson as Record<string, unknown>,
    }).catch((err) => this.logger.warn('[기능이력] 배송 등록 로그 저장 실패', err));

    return savedDelivery;
  }

  /**
   * 운송번호 자동 생성
   * 형식: {담당자코드(2글자)}-{YYMM}-{순번(4자리)}
   * 예: AL-2512-0001, AL-2512-0002, ... 순차 증가
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
        const emailParts = user.email.split('@');
        if (emailParts.length > 0 && emailParts[0]) {
          const emailId = emailParts[0].trim();
          if (emailId.length >= 2) {
            managerCode = emailId.substring(0, 2).toUpperCase();
          } else if (emailId.length === 1) {
            managerCode = (emailId + 'X').toUpperCase();
          }
        }
      }
    }

    // 2. 년월 계산 (YYMM 형식)
    // createdAt은 findOne raw 쿼리에서 문자열로 반환될 수 있음
    const targetDate = createdAt ? (createdAt instanceof Date ? createdAt : new Date(createdAt)) : new Date();
    const year = targetDate.getFullYear().toString().slice(-2);
    const month = (targetDate.getMonth() + 1).toString().padStart(2, '0');
    const yearMonth = year + month;
    const prefix = `${managerCode}-${yearMonth}`;
    const pattern = `${prefix}-%`;

    // 3. 해당 prefix(담당자+년월)의 기존 운송번호 중 최대 순번 조회 (순차 증가)
    const rawResult = await this.salesDeliveryRepository.manager.query<[{ next_seq: string }]>(
      `SELECT COALESCE(MAX(
        CAST(REGEXP_REPLACE(sd_order_number, '^.*-', '') AS INTEGER)
      ), 0) + 1 AS next_seq
       FROM tb_sales_delivery
       WHERE sd_order_number IS NOT NULL AND sd_order_number LIKE $1`,
      [pattern],
    );
    const sequence = Math.max(1, parseInt(rawResult[0]?.next_seq ?? '1', 10) || 1);

    // 4. 새 운송번호 생성 (순번을 4자리로 패딩)
    const sequenceStr = sequence.toString().padStart(4, '0');
    return `${prefix}-${sequenceStr}`;
  }

  /**
   * 배차 요청 등에서 하차지 변경 시: tb_sales 하차지 + 연결 고객(tb_customer) 대표 주소 동기화
   */
  private async syncUnloadingFromDeliveryDtoToSalesAndCustomer(
    salesId: string | null | undefined,
    dto: UpdateSalesDeliveryDto,
  ): Promise<void> {
    if (!salesId) return;
    const touched =
      dto.unloadingPostalCode !== undefined ||
      dto.unloadingAddress !== undefined ||
      dto.unloadingAddressDetail !== undefined ||
      dto.unloadingRegion !== undefined ||
      dto.unloadingCity !== undefined ||
      dto.unloadingAddressRoad !== undefined ||
      dto.unloadingAddressJibun !== undefined ||
      dto.unloadingLegalBCode !== undefined ||
      dto.unloadingAddressDefaultType !== undefined;
    if (!touched) return;

    const sales = await this.salesRepository.findOne({ where: { id: salesId } });
    if (!sales) {
      this.logger.warn(`[배송-하차지동기화] 판매 없음 salesId=${salesId}`);
      return;
    }

    if (dto.unloadingPostalCode !== undefined) {
      sales.unloadingPostalCode = dto.unloadingPostalCode?.trim() || null;
    }
    if (dto.unloadingAddress !== undefined) {
      sales.unloadingAddress = dto.unloadingAddress?.trim() || null;
    }
    if (dto.unloadingAddressDetail !== undefined) {
      sales.unloadingAddressDetail = dto.unloadingAddressDetail?.trim() || null;
    }
    if (dto.unloadingAddressRoad !== undefined) {
      sales.unloadingAddressRoad = dto.unloadingAddressRoad?.trim() || null;
    }
    if (dto.unloadingAddressJibun !== undefined) {
      sales.unloadingAddressJibun = dto.unloadingAddressJibun?.trim() || null;
    }
    if (dto.unloadingLegalBCode !== undefined) {
      sales.unloadingLegalBCode =
        dto.unloadingLegalBCode?.replace(/\D/g, '').slice(0, 10) || null;
    }
    if (dto.unloadingRegion !== undefined) {
      const raw = dto.unloadingRegion?.trim();
      if (!raw) {
        sales.unloadingRegion = null;
      } else {
        const rid = parseInt(raw, 10);
        if (!isNaN(rid)) {
          const region = await this.regionRepository.findOne({ where: { id: rid } });
          sales.unloadingRegion = region?.name ?? null;
        } else {
          sales.unloadingRegion = raw;
        }
      }
    }
    if (dto.unloadingCity !== undefined) {
      const raw = dto.unloadingCity?.trim();
      if (!raw) {
        sales.unloadingCity = null;
      } else {
        const cid = parseInt(raw, 10);
        if (!isNaN(cid)) {
          const city = await this.cityRepository.findOne({ where: { id: cid } });
          sales.unloadingCity = city?.name ?? null;
        } else {
          sales.unloadingCity = raw;
        }
      }
    }

    await this.salesRepository.save(sales);
    this.logger.log(`[배송-하차지동기화] 판매(sa_id=${salesId}) 하차지 반영`);

    const customerId = sales.customerId;
    if (!customerId) return;

    const deliveryAddrId = dto.unloadingDeliveryAddressId?.trim();
    if (deliveryAddrId) {
      await this.customersService.applySalesUnloadingToDeliveryAddress(customerId, deliveryAddrId, {
        unloadingPostalCode: sales.unloadingPostalCode ?? undefined,
        unloadingAddress: sales.unloadingAddress ?? undefined,
        unloadingAddressRoad: sales.unloadingAddressRoad ?? undefined,
        unloadingAddressJibun: sales.unloadingAddressJibun ?? undefined,
        unloadingLegalBCode: sales.unloadingLegalBCode ?? undefined,
        unloadingAddressDetail: sales.unloadingAddressDetail ?? undefined,
        unloadingAddressDefaultType: dto.unloadingAddressDefaultType,
      });
      this.logger.log(
        `[배송-하차지동기화] 고객 배송지 행(cda_id=${deliveryAddrId}) 반영, 대표 주소는 유지`,
      );
      return;
    }

    if (dto.unloadingMirrorToCustomerDefault === false) {
      this.logger.log(`[배송-하차지동기화] 고객 대표 주소 동기화 생략 (판매만 반영)`);
      return;
    }

    const customer = await this.customerRepository.findOne({ where: { id: customerId } });
    if (!customer) return;

    customer.postalCode = sales.unloadingPostalCode ?? null;
    customer.address = sales.unloadingAddress ?? null;
    customer.addressDetail = sales.unloadingAddressDetail ?? null;
    customer.addressRoad = sales.unloadingAddressRoad ?? null;
    customer.addressJibun = sales.unloadingAddressJibun ?? null;
    customer.legalBCode = sales.unloadingLegalBCode ?? null;
    if (dto.unloadingAddressDefaultType !== undefined) {
      const udt = dto.unloadingAddressDefaultType?.trim();
      customer.addressDefaultType = udt && udt.length > 0 ? udt.slice(0, 50) : null;
    }
    if (dto.unloadingRegion !== undefined) {
      const raw = dto.unloadingRegion?.trim();
      if (!raw) {
        customer.regionId = null;
      } else {
        const rid = parseInt(raw, 10);
        customer.regionId = !isNaN(rid) ? rid : null;
      }
    }
    if (dto.unloadingCity !== undefined) {
      const raw = dto.unloadingCity?.trim();
      if (!raw) {
        customer.cityId = null;
      } else {
        const cid = parseInt(raw, 10);
        customer.cityId = !isNaN(cid) ? cid : null;
      }
    }

    await this.customerRepository.save(customer);
    this.logger.log(`[배송-하차지동기화] 고객(cu_id=${customerId}) 대표 주소 반영`);
  }

  async update(id: string, dto: UpdateSalesDeliveryDto, userId?: number) {
    const delivery = await this.findOne(id);

    // 배차 요청 시: 상차 항목이 모두 취소된 판매항목이면 명확한 오류 반환 (500 방지)
    if (dto.status === 'DISPATCH_REQUESTED' && dto.loadingItems && dto.loadingItems.length > 0) {
      const salesItemIds = dto.loadingItems.map((li) => li.salesItemId).filter(Boolean);
      if (salesItemIds.length > 0) {
        const nonCancelled = await this.salesItemRepository.count({
          where: { id: In(salesItemIds), salesId: delivery.salesId, status: Not('SALES_ITEM_CANCELLED') },
        });
        if (nonCancelled === 0) {
          throw new BadRequestException(
            '배차할 수 없습니다. 해당 배송의 모든 상차 항목이 취소된 판매입니다. 취소된 판매는 배차 대상에서 제외됩니다.',
          );
        }
      }
    }

    // 이력용: 변경 전 스냅샷 (중량·베일·컨테이너 등 전체)
    const oldDataJson = this.deliveryToJson(delivery);

    // 기본 정보 업데이트
    const previousStatus = delivery.status;

    // [하차완료 디버그] update 진입 시점 로그
    this.logger.log(
      `[하차완료 디버그] update() 진입 - 배송 ID: ${id}, dto.status: ${dto.status ?? '(없음)'}, previousStatus: ${previousStatus}, salesId: ${delivery.salesId ?? 'null'}, loadingItems 개수: ${dto.loadingItems?.length ?? 0}`,
    );
    if (dto.loadingItems && dto.loadingItems.length > 0) {
      dto.loadingItems.forEach((li, idx) => {
        this.logger.log(
          `[중량동기화] DTO loadingItems[${idx}] id=${li.id ?? 'null'}, salesItemId=${li.salesItemId ?? 'null'}, actualWeight=${li.actualWeight ?? 'undefined'}, actualContainer=${li.actualContainer ?? 'undefined'}`,
        );
      });
    }
    if (dto.status !== undefined) {
      delivery.status = dto.status;
      // 상차완료 → 하차완료 변경 시 추적용 (체크 포인트)
      if (dto.status === 'UNLOADING_COMPLETED' && previousStatus === 'LOADING_COMPLETED') {
        this.logger.log(
          `[하차완료 체크] ★ 상차완료 → 하차완료 변경 요청 - 배송 ID: ${id}, 판매 ID: ${delivery.salesId ?? '?'}`,
        );
        // DTO loadingItems id/actual/request 검증용 로그
        if (dto.loadingItems?.length) {
          dto.loadingItems.forEach((li, idx) => {
            this.logger.log(
              `[하차완료 체크] DTO[${idx}] id=${li.id ?? 'NULL'}, salesItemId=${li.salesItemId ?? 'null'}, ` +
                `requestBL=${li.requestBL ?? 'null'}, requestContainer=${li.requestContainer ?? 'null'}, requestBales=${li.requestBales ?? 'null'}, requestWeight=${li.requestWeight ?? 'null'}, ` +
                `workBL=${li.workBL ?? 'null'}, workContainer=${li.workContainer ?? 'null'}, workBales=${li.workBales ?? 'null'}, workWeight=${li.workWeight ?? 'null'}, ` +
                `actualBL=${li.actualBL ?? 'null'}, actualContainer=${li.actualContainer ?? 'null'}, actualBales=${li.actualBales ?? 'null'}, actualWeight=${li.actualWeight ?? 'null'}`,
            );
          });
        }
      }
    }
    
    // 배차 요청 또는 배차 완료/상차 완료로 변경 시 운송번호 자동 생성 (직접배차 등 DISPATCH_REQUESTED를 건너뛰는 경우 대응)
    const statusesThatRequireOrderNumber = ['DISPATCH_REQUESTED', 'DISPATCH_COMPLETED', 'LOADING', 'LOADING_COMPLETED', 'UNLOADING_COMPLETED'];
    if (dto.status && statusesThatRequireOrderNumber.includes(dto.status) && previousStatus !== dto.status) {
      if (!delivery.orderNumber) {
        const transportNumber = await this.generateTransportNumber(userId || null, delivery.createdAt);
        delivery.orderNumber = transportNumber;
        this.logger.log(`[SERVICE] 운송번호 자동 생성: ${transportNumber} (상태: ${previousStatus} → ${dto.status})`);
      }
    }
    if (dto.requestVehicle !== undefined) {
      delivery.requestVehicle =
        dto.requestVehicle == null ? null : String(dto.requestVehicle).trim() || null;
    }
    if (dto.requestWeight !== undefined) {
      delivery.requestWeight =
        dto.requestWeight == null ? null : String(dto.requestWeight).trim() || null;
    }
    if (dto.unloadingPostalCode !== undefined) delivery.unloadingPostalCode = dto.unloadingPostalCode?.trim() || null;
    if (dto.unloadingAddress !== undefined) delivery.unloadingAddress = dto.unloadingAddress?.trim() || null;
    if (dto.unloadingAddressDetail !== undefined) delivery.unloadingAddressDetail = dto.unloadingAddressDetail?.trim() || null;
    if (dto.unloadingRegion !== undefined) delivery.unloadingRegionId = dto.unloadingRegion ? parseInt(dto.unloadingRegion) : null;
    if (dto.unloadingCity !== undefined) delivery.unloadingCityId = dto.unloadingCity ? parseInt(dto.unloadingCity) : null;
    if (dto.unloadingScheduleDate !== undefined) delivery.unloadingScheduleDate = dto.unloadingScheduleDate ? new Date(dto.unloadingScheduleDate) : null;
    if (dto.unloadingScheduleTime !== undefined) delivery.unloadingScheduleTime = dto.unloadingScheduleTime;
    if (dto.dispatchCompanyId !== undefined) {
      // null 값도 명시적으로 처리
      delivery.dispatchCompanyId = dto.dispatchCompanyId === null ? null : dto.dispatchCompanyId;
    }
    if (dto.unloadingCompanyId !== undefined) {
      // null 값도 명시적으로 처리
      delivery.unloadingCompanyId = dto.unloadingCompanyId === null ? null : dto.unloadingCompanyId;
    }
    if (dto.directUnloadingContact !== undefined) {
      delivery.directUnloadingContact = dto.directUnloadingContact?.trim() || null;
    }
    if (dto.vehicleNumber !== undefined) {
      delivery.vehicleNumber =
        dto.vehicleNumber == null ? null : String(dto.vehicleNumber).trim() || null;
    }
    if (dto.driverName !== undefined) {
      delivery.driverName =
        dto.driverName == null ? null : String(dto.driverName).trim() || null;
    }
    if (dto.driverContact !== undefined) {
      delivery.driverContact =
        dto.driverContact == null ? null : String(dto.driverContact).trim() || null;
    }
    if (dto.entryTime !== undefined) {
      delivery.entryTime =
        dto.entryTime == null ? null : String(dto.entryTime).trim() || null;
    }
    if (dto.loadingDateTime !== undefined) delivery.loadingDateTime = dto.loadingDateTime?.trim() || null;
    if (dto.unloadingDateTime !== undefined) delivery.unloadingDateTime = dto.unloadingDateTime?.trim() || null;
    if (dto.transportFee !== undefined) delivery.transportFee = dto.transportFee;
    if (dto.weighingFee !== undefined) delivery.weighingFee = dto.weighingFee;
    if (dto.freightPaymentType !== undefined) delivery.freightPaymentType = dto.freightPaymentType;
    if (dto.transportFeePaymentStatus !== undefined) delivery.transportFeePaymentStatus = dto.transportFeePaymentStatus || null;
    if (dto.notes !== undefined) delivery.notes = dto.notes;
    if (dto.statusReason !== undefined) delivery.statusReason = dto.statusReason;
    if (dto.reprocessReason !== undefined) delivery.reprocessReason = dto.reprocessReason;
    if (dto.weighingCertInfo !== undefined) delivery.weighingCertInfo = dto.weighingCertInfo?.trim() || null;
    if (dto.weighingCertImagePaths !== undefined) delivery.weighingCertImagePaths = dto.weighingCertImagePaths?.trim() || null;

    // save를 사용하되, dispatchCompanyId와 unloadingCompanyId는 명시적으로 update로 처리
    await this.salesDeliveryRepository.save(delivery);
    
    // dispatchCompanyId, unloadingCompanyId, directUnloadingContact가 변경된 경우 명시적으로 update
    if (dto.dispatchCompanyId !== undefined || dto.unloadingCompanyId !== undefined || dto.directUnloadingContact !== undefined) {
      const updateData: any = {};
      if (dto.dispatchCompanyId !== undefined) {
        updateData.dispatchCompanyId = dto.dispatchCompanyId === null ? null : dto.dispatchCompanyId;
      }
      if (dto.unloadingCompanyId !== undefined) {
        updateData.unloadingCompanyId = dto.unloadingCompanyId === null ? null : dto.unloadingCompanyId;
      }
      if (dto.directUnloadingContact !== undefined) {
        updateData.directUnloadingContact = dto.directUnloadingContact?.trim() || null;
      }
      await this.salesDeliveryRepository.update(id, updateData);
    }

    // 상차 항목 업데이트 (id로 기존 매칭, 없으면 새 행 추가, DTO에 없는 기존 항목 삭제)
    // LoadingItem 삭제 + SalesItem CANCELLED는 트랜잭션으로 묶어 예외 시 orphan 방지
    let savedLoadingItems: SalesDeliveryLoadingItem[] = [];
    /** 하차 제외로 물리 삭제한 LoadingItem의 salesItemId (하차완료 시 해당 SalesItem을 CANCELLED 처리하기 위함) */
    let salesItemIdsFromRemovedLoadingItems: string[] = [];

    // [판매관리-행삭제] 하차완료 시 행 삭제 추적 로그
    this.logger.log(
      `[하차완료-행삭제] 요청 수신 - 배송 ID: ${id}, removedLoadingItemIds: ${JSON.stringify(dto.removedLoadingItemIds ?? [])}, loadingItems 개수: ${dto.loadingItems?.length ?? 'undefined'}`,
    );

    // removedLoadingItemIds만 전달된 경우(loadingItems 미전달): 행 삭제 처리 및 SalesItem 취소용 ID 수집
    const hasRemovedIds = (dto.removedLoadingItemIds?.length ?? 0) > 0;
    if (hasRemovedIds && dto.loadingItems === undefined) {
      await this.dataSource.transaction(async (manager) => {
        const loadingItemRepo = manager.getRepository(SalesDeliveryLoadingItem);
        const existingItems = await loadingItemRepo.find({
          where: { salesDeliveryId: id },
        });
        const removedSet = new Set((dto.removedLoadingItemIds || []).map((id) => String(id)));
        salesItemIdsFromRemovedLoadingItems = existingItems
          .filter((e) => removedSet.has(String(e.id)) && e.salesItemId)
          .map((e) => String(e.salesItemId));
        const itemsToDelete = existingItems.filter((e) => removedSet.has(String(e.id)));
        this.logger.log(
          `[하차완료-행삭제] loadingItems 없이 removedLoadingItemIds만 전달 - 삭제 대상 LoadingItem: ${itemsToDelete.map((e) => `id=${e.id}, salesItemId=${e.salesItemId}`).join('; ')}, salesItemIdsFromRemovedLoadingItems: [${salesItemIdsFromRemovedLoadingItems.join(', ')}]`,
        );
        if (itemsToDelete.length > 0) {
          await loadingItemRepo.remove(itemsToDelete);
        }
        // removedLoadingItemIds만 전달된 경우: CANCELLED도 같은 트랜잭션에서 처리 (orphan 방지)
        if (delivery.salesId && salesItemIdsFromRemovedLoadingItems.length > 0) {
          await manager.getRepository(SalesItem).update(
            { id: In(salesItemIdsFromRemovedLoadingItems), salesId: delivery.salesId },
            { status: 'SALES_ITEM_CANCELLED' },
          );
          this.logger.log(
            `[하차완료-행삭제] [트랜잭션] SalesItem CANCELLED 완료 - ID: [${salesItemIdsFromRemovedLoadingItems.join(', ')}]`,
          );
        }
      });
    }

    if (dto.loadingItems !== undefined) {
      const existingItems = await this.loadingItemRepository.find({
        where: { salesDeliveryId: id },
      });
      const existingItemsById = new Map(existingItems.map((item) => [String(item.id), item]));

      // [Diff 기반] DB vs Request 비교 → toAdd, toUpdate, toDelete
      const requestIds = new Set(
        dto.loadingItems
          .map((item) => item.id)
          .filter((lid) => lid != null && lid !== '' && !String(lid).startsWith('new-'))
          .map((lid) => String(lid))
          .filter((lid) => existingItemsById.has(lid)),
      );
      const toDelete = existingItems.filter((e) => !requestIds.has(String(e.id)));
      const toUpdateDtoItems = dto.loadingItems.filter(
        (item) => item.id && existingItemsById.has(String(item.id)),
      );
      const toAddDtoItems = dto.loadingItems.filter(
        (item) =>
          !item.id ||
          item.id === '' ||
          String(item.id).startsWith('new-') ||
          !existingItemsById.has(String(item.id)),
      );

      this.logger.log(
        `[하차완료-Diff] DB: ${existingItems.length}개, Request: ${dto.loadingItems.length}개 → toUpdate: ${toUpdateDtoItems.length}개, toAdd: ${toAddDtoItems.length}개, toDelete: ${toDelete.length}개`,
      );
      this.logger.log(
        `[하차완료-Diff] ★ Request ids: [${dto.loadingItems.map((i) => i.id ?? 'null').join(', ')}], ` +
          `DB ids: [${existingItems.map((e) => e.id).join(', ')}], requestIds(매칭): [${Array.from(requestIds).join(', ')}]`,
      );
      if (toAddDtoItems.length > 0) {
        this.logger.warn(
          `[하차완료-Diff] ★ toAdd ${toAddDtoItems.length}건 - DTO에 id 누락 가능성 (상차 수정 시 id 미포함 시 toUpdate 대신 toAdd 처리됨)`,
        );
      }

      // SalesItem 취소 대상: toDelete의 salesItemId 중, toUpdate·toAdd(부모/직접 연결)에서 해당 salesItemId를 사용하지 않는 것만
      const salesItemIdsInToUpdate = new Set<string>();
      for (const item of toUpdateDtoItems) {
        const sid = item.salesItemId ?? existingItemsById.get(String(item.id!))?.salesItemId;
        if (sid) salesItemIdsInToUpdate.add(String(sid));
      }
      for (const item of toAddDtoItems) {
        const pid = item.parentSalesItemId?.toString().trim();
        if (pid) salesItemIdsInToUpdate.add(pid);
        const addSid = item.salesItemId?.toString().trim();
        if (addSid) salesItemIdsInToUpdate.add(addSid);
      }
      const salesItemIdsFromToDelete = toDelete
        .filter((e) => e.salesItemId)
        .map((e) => String(e.salesItemId));
      salesItemIdsFromRemovedLoadingItems = salesItemIdsFromToDelete.filter(
        (sid) => !salesItemIdsInToUpdate.has(sid),
      );
      this.logger.log(
        `[하차완료-Diff] toDelete salesItemIds: [${salesItemIdsFromToDelete.join(', ')}], toUpdate 사용 중: [${Array.from(salesItemIdsInToUpdate).join(', ')}] → 취소 대상: [${salesItemIdsFromRemovedLoadingItems.join(', ')}]`,
      );

      const itemsToSave: SalesDeliveryLoadingItem[] = [];

      // toUpdate: 기존 항목 수정
      for (let index = 0; index < toUpdateDtoItems.length; index++) {
        const item = toUpdateDtoItems[index];
        const existingItem = existingItemsById.get(String(item.id!));
        if (!existingItem) continue;

        if (item.loadingSchedule !== undefined) existingItem.loadingSchedule = item.loadingSchedule ? new Date(item.loadingSchedule) : null;
        if (item.loadingScheduleTime !== undefined) existingItem.loadingScheduleTime = item.loadingScheduleTime || null;
        if (item.requestBL !== undefined) existingItem.requestBL = item.requestBL;
        if (item.requestContainer !== undefined) existingItem.requestContainer = item.requestContainer;
        if (item.requestContainerType !== undefined) existingItem.requestContainerType = item.requestContainerType;
        if (item.requestBales !== undefined) existingItem.requestBales = item.requestBales;
        if (item.requestWeight !== undefined) existingItem.requestWeight = item.requestWeight;
        if (item.requestNotes !== undefined) existingItem.requestNotes = item.requestNotes || null;
        if (item.workBL !== undefined) existingItem.workBL = item.workBL || null;
        if (item.workContainer !== undefined) existingItem.workContainer = item.workContainer || null;
        if (item.workContainerType !== undefined) existingItem.workContainerType = item.workContainerType || null;
        if (item.workWeight !== undefined) existingItem.workWeight = item.workWeight ?? null;
        if (item.workBales !== undefined) existingItem.workBales = item.workBales ?? null;
        // 실제: payload에 있으면 반영, 없으면 기존 유지 (작업 정보 수정 시 요청/실제 덮어쓰기 방지)
        if (item.actualBL !== undefined) existingItem.actualBL = item.actualBL || null;
        if (item.actualContainer !== undefined) {
          const cid = item.actualContainerId?.trim();
          if (cid) {
            const containerById = await this.tradeContainerRepository.findOne({ where: { id: cid }, select: ['containerNo'] });
            if (containerById?.containerNo) {
              existingItem.actualContainer = containerById.containerNo;
              if (item.actualContainer !== containerById.containerNo) {
                this.logger.log(`[하차완료] actualContainer 보정 - LoadingItem ID: ${existingItem.id}, "${item.actualContainer}" → "${containerById.containerNo}" (actualContainerId로 컨테이너번호 사용)`);
              }
            } else {
              existingItem.actualContainer = item.actualContainer || null;
            }
          } else {
            existingItem.actualContainer = item.actualContainer || null;
          }
        }
        if (item.actualContainerType !== undefined) existingItem.actualContainerType = item.actualContainerType || null;
        if (item.actualBales !== undefined) existingItem.actualBales = item.actualBales;
        if (item.actualWeight !== undefined) existingItem.actualWeight = item.actualWeight;
        existingItem.status = item.status || 'PENDING';
        existingItem.order = item.order || index + 1;
        itemsToSave.push(existingItem);
      }

      // toAdd: 새 행 추가 (빈 행은 건너뜀 - actualContainer/actualContainerId 없으면 의미 없는 추가)
      // salesItemId 없이 parentSalesItemId만 오면 → 먼저 SalesItem 생성 후 해당 id로 상차 행 저장(구 클라: 동일 si_id 복제 방식도 salesItemId로 허용)
      for (let index = 0; index < toAddDtoItems.length; index++) {
        const item = toAddDtoItems[index];
        const hasActualContainer = !!(item.actualContainer?.trim() || item.actualContainerId?.trim());
        if (!hasActualContainer) {
          this.logger.log(`[하차완료-Diff] toAdd 건너뜀 - actualContainer/actualContainerId 없음 (빈 추가 행)`);
          continue;
        }
        let actualContainerStr = item.actualContainer?.trim() || null;
        if (item.actualContainerId?.trim()) {
          const containerById = await this.tradeContainerRepository.findOne({
            where: { id: item.actualContainerId.trim() },
            select: ['containerNo'],
          });
          if (containerById?.containerNo) {
            actualContainerStr = containerById.containerNo;
            if (item.actualContainer?.trim() && item.actualContainer.trim() !== containerById.containerNo) {
              this.logger.log(
                `[하차완료-Diff] toAdd actualContainer 보정 - "${item.actualContainer}" → "${containerById.containerNo}" (actualContainerId)`,
              );
            }
          }
        }
        const providedSalesItemId = item.salesItemId?.toString().trim() || '';
        const parentId = item.parentSalesItemId?.toString().trim() || '';
        let salesItemIdForRow = providedSalesItemId || '';
        let rowActualBales = item.actualBales !== undefined ? item.actualBales : null;
        let rowActualWeight = item.actualWeight !== undefined ? item.actualWeight : null;
        let rowRequestBL = item.requestBL ?? null;
        let rowRequestContainer = item.requestContainer ?? null;
        let rowRequestBales = item.requestBales !== undefined ? item.requestBales : null;
        let rowRequestWeight = item.requestWeight !== undefined ? item.requestWeight : null;
        let rowRequestContainerType = item.requestContainerType ?? null;

        if (!salesItemIdForRow) {
          if (!parentId) {
            this.logger.warn(`[하차완료-Diff] toAdd 건너뜀 - salesItemId·parentSalesItemId 모두 없음`);
            continue;
          }
          const resolved = await this.resolveSalesItemForUnloadingAddedContainer({
            parentSalesItemId: parentId,
            salesId: delivery.salesId,
            actualBL: item.actualBL ?? null,
            actualContainerNo: actualContainerStr,
            actualContainerIdOptional: item.actualContainerId?.trim() || null,
            actualBales: item.actualBales ?? null,
            actualWeight: item.actualWeight ?? null,
            actualContainerType: (item.actualContainerType as 'CONTAINER' | 'CARGO' | null) ?? null,
          });
          if (!resolved) {
            this.logger.warn(`[하차완료-Diff] toAdd SalesItem 생성 실패 parent=${parentId}`);
            continue;
          }
          salesItemIdForRow = resolved.salesItemId;
          if (resolved.addTypeForCargo === 'CONTAINER') {
            rowActualBales = resolved.effBales ?? rowActualBales;
            rowActualWeight = resolved.effWeight ?? rowActualWeight;
            rowRequestBales = resolved.effBales ?? rowRequestBales;
            rowRequestWeight = resolved.effWeight ?? rowRequestWeight;
          }
          rowRequestBL = item.actualBL ?? rowRequestBL;
          rowRequestContainer = resolved.resolvedContainerNo;
          rowRequestContainerType = item.actualContainerType ?? rowRequestContainerType;
        }

        const salesItemCheck = await this.salesItemRepository.findOne({
          where: { id: salesItemIdForRow, salesId: delivery.salesId },
          select: ['id', 'status'],
        });
        if (salesItemCheck?.status === 'SALES_ITEM_CANCELLED') {
          this.logger.log(
            `[하차완료-행삭제] 상차완료 되돌림 시 하차 제외된 SalesItem(ID: ${salesItemIdForRow}) 재추가 건너뜀 - CANCELLED 상태 유지`,
          );
          continue;
        }
        const newItem = this.loadingItemRepository.create({
          salesDeliveryId: id,
          salesItemId: salesItemIdForRow,
          loadingSchedule: item.loadingSchedule ? new Date(item.loadingSchedule) : null,
          loadingScheduleTime: item.loadingScheduleTime || null,
          requestBL: rowRequestBL,
          requestContainer: rowRequestContainer,
          requestContainerType: rowRequestContainerType,
          requestBales: rowRequestBales,
          requestWeight: rowRequestWeight,
          requestNotes: item.requestNotes || null,
          workBL: item.workBL || null,
          workContainer: item.workContainer || null,
          workContainerType: item.workContainerType || null,
          workWeight: item.workWeight !== undefined ? item.workWeight : null,
          workBales: item.workBales !== undefined ? item.workBales : null,
          actualBL: item.actualBL || null,
          actualContainer: actualContainerStr,
          actualContainerType: item.actualContainerType || null,
          actualBales: rowActualBales,
          actualWeight: rowActualWeight,
          status: item.status || 'PENDING',
          order: item.order || toUpdateDtoItems.length + index + 1,
        });
        itemsToSave.push(newItem);
      }

      // toDelete + CANCELLED: 트랜잭션으로 묶어 예외 시 orphan 방지
      if (toDelete.length > 0 || itemsToSave.length > 0) {
        await this.dataSource.transaction(async (manager) => {
          const loadingItemRepo = manager.getRepository(SalesDeliveryLoadingItem);
          const salesItemRepo = manager.getRepository(SalesItem);
          if (itemsToSave.length > 0) {
            savedLoadingItems = await loadingItemRepo.save(itemsToSave);
            const addedCount = itemsToSave.filter((i) => i.id == null).length;
            if (addedCount > 0) {
              this.logger.log(`[하차완료] 컨테이너 추가 행 ${addedCount}건 저장됨 → 하차 블록에서 해당 판매에 새 항목(SalesItem) 생성 예정`);
            }
          }
          if (toDelete.length > 0) {
            await loadingItemRepo.remove(toDelete);
            this.logger.log(
              `[하차완료-Diff] 삭제 완료 - LoadingItem: [${toDelete.map((e) => `id=${e.id}, salesItemId=${e.salesItemId}`).join('; ')}]`,
            );
            // CANCELLED도 같은 트랜잭션에서 처리 (orphan 방지)
            if (delivery.salesId && salesItemIdsFromRemovedLoadingItems.length > 0) {
              await salesItemRepo.update(
                { id: In(salesItemIdsFromRemovedLoadingItems), salesId: delivery.salesId },
                { status: 'SALES_ITEM_CANCELLED' },
              );
              this.logger.log(
                `[하차완료-Diff] [트랜잭션] SalesItem CANCELLED 완료 - ID: [${salesItemIdsFromRemovedLoadingItems.join(', ')}]`,
              );
            }
          }
        });
      }

      // 상차 업체가 저장할 때만 work_line 동기화. 하차완료에서 행 삭제 시에는 syncWorkLine 없음 → 비고 등 상차 이력 유지
      // 상차 업체가 저장할 때만 work_line 동기화 (상차 업체가 작성한 BL/컨테이너/비고 등 이력 보존)
      if (dto.syncWorkLine === true) {
        await this.workLineRepository.delete({ salesDeliveryId: id });
        if (dto.loadingItems.length > 0) {
          const workLines = dto.loadingItems.map((item, index) =>
            this.workLineRepository.create({
              salesDeliveryId: id,
              workBL: item.workBL || null,
              workContainer: item.workContainer || null,
              workContainerType: item.workContainerType || null,
              workBales: item.workBales !== undefined ? item.workBales : null,
              workWeight: item.workWeight !== undefined ? item.workWeight : null,
              notes: item.notes ?? null, // 상차 업체가 작성한 비고 (loading_item에는 저장 안 함, work_line에만)
              order: item.order ?? index + 1,
            }),
          );
          await this.workLineRepository.save(workLines);
        }
      }
    }

    // 하차완료에서 상차완료로 변경 시 판매 정보 및 재고 상태 복구
    if (dto.status === 'LOADING_COMPLETED' && previousStatus === 'UNLOADING_COMPLETED' && delivery.salesId) {
        this.logger.log(`[상차완료 복구] 하차완료에서 상차완료로 상태 변경 시작 - 배송 ID: ${id}, 판매 ID: ${delivery.salesId}`);
      try {
        // 저장된 loadingItems 조회 (요청 정보가 포함된 데이터)
        const loadingItemsWithRelations = savedLoadingItems.length > 0 
          ? savedLoadingItems 
          : await this.loadingItemRepository.find({
              where: { salesDeliveryId: id },
              relations: ['salesItem', 'salesItem.container', 'salesItem.container.order'],
            });

        this.logger.log(`[상차완료 복구] 상차 항목 수: ${loadingItemsWithRelations.length}개`);
        // [판매1055 디버그] 상차완료 복구 시 LoadingItem별 salesItemId (하차 재실행 시 추가 컨테이너 분기 판단에 영향)
        this.logger.log(
          `[판매1055 디버그] 상차완료 복구 시작 - 판매 ID: ${delivery.salesId}, LoadingItem별 salesItemId: [${loadingItemsWithRelations.map((li) => `li.id=${li.id}→salesItemId=${li.salesItemId}`).join('; ')}]`,
        );

        // 컨테이너 ID Set (재고 상태 업데이트용)
        const containerIdsToUpdate = new Set<string>();

        // 각 loadingItem에 대해 요청 정보로 판매 정보 복구
        for (const loadingItem of loadingItemsWithRelations) {
          if (!loadingItem.salesItemId) continue;

          this.logger.log(`[상차완료 복구] ========== 상차 항목 처리 시작 - LoadingItem ID: ${loadingItem.id}, SalesItem ID: ${loadingItem.salesItemId} ==========`);

          // SalesItem 조회 (container와 order 관계 포함)
          const salesItem = await this.salesItemRepository.findOne({
            where: { id: loadingItem.salesItemId },
            relations: ['container', 'container.order'],
          });

          if (!salesItem) {
            this.logger.warn(`[상차완료 복구] SalesItem을 찾을 수 없습니다. ID: ${loadingItem.salesItemId}`);
            continue;
          }

          const container = salesItem.container;
          const order = container?.order;
          const currentContainerId = salesItem.containerId;

          // 요청 정보 (복구할 정보). request/actual에 작업텍스트 오염 시 containerNo로 보정
          const requestBL = loadingItem.requestBL || order?.bl || null;
          let requestContainerNo = loadingItem.requestContainer || container?.containerNo || null;
          const hasWorkText = (s: string | null) => s && s.length > 15 && /[가-힣a-zA-Z]/.test(s);
          if (requestContainerNo && hasWorkText(requestContainerNo) && container?.containerNo) {
            this.logger.log(`[상차완료 복구] requestContainer 보정 - "${requestContainerNo}" → "${container.containerNo}"`);
            requestContainerNo = container.containerNo;
            loadingItem.requestContainer = container.containerNo;
            if (loadingItem.actualContainer && hasWorkText(loadingItem.actualContainer)) {
              this.logger.log(`[상차완료 복구] actualContainer 보정 - "${loadingItem.actualContainer}" → "${container.containerNo}"`);
              loadingItem.actualContainer = container.containerNo;
            }
          }
          const actualContainerNo = loadingItem.actualContainer;
          const requestBales = loadingItem.requestBales !== null && loadingItem.requestBales !== undefined 
            ? loadingItem.requestBales 
            : (salesItem.cargoBales ? parseFloat(salesItem.cargoBales.toString()) : null);
          const requestWeight = loadingItem.requestWeight !== null && loadingItem.requestWeight !== undefined 
            ? loadingItem.requestWeight 
            : (salesItem.cargoWeight ? parseFloat(salesItem.cargoWeight.toString()) : null);
          const requestType = loadingItem.requestContainerType || salesItem.containerType || null;

          // 실제 정보 (현재 저장된 정보, 위에서 actualContainer 보정 시 반영됨)
          const actualBL = loadingItem.actualBL;
          const actualBales = loadingItem.actualBales;
          const actualWeight = loadingItem.actualWeight;
          const actualType = loadingItem.actualContainerType;

          this.logger.log(
            `[상차완료 복구] [요청 정보 - 복구 대상] BL: ${requestBL || '없음'}, 컨테이너: ${requestContainerNo || '없음'}, 타입: ${requestType || '없음'}, 베일: ${requestBales !== null && requestBales !== undefined ? requestBales : '없음'}, 중량: ${requestWeight !== null && requestWeight !== undefined ? requestWeight : '없음'}`
          );
          this.logger.log(
            `[상차완료 복구] [실제 정보 - 현재 저장됨] BL: ${actualBL || '없음'}, 컨테이너: ${actualContainerNo || '없음'}, 타입: ${actualType || '없음'}, 베일: ${actualBales !== null && actualBales !== undefined ? actualBales : '없음'}, 중량: ${actualWeight !== null && actualWeight !== undefined ? actualWeight : '없음'}`
          );
          this.logger.log(
            `[상차완료 복구] [판매 관리 - 현재 제품 정보] SalesItem ID: ${salesItem.id}, 컨테이너 ID: ${currentContainerId || '없음'}, 컨테이너 번호: ${container?.containerNo || '없음'}, 베일: ${salesItem.cargoBales || '없음'}, 중량: ${salesItem.cargoWeight || '없음'}, 타입: ${salesItem.containerType || '없음'}`
          );

          // 복구할 정보가 있는지 확인
          let hasAnyRestore = false;

          // 무역 부킹 BL(tb_trade_order.to_bl)은 무역 메뉴에서만 수정. 영업(상차복구)에서 마스터 BL을 덮어쓰지 않음.
          if (requestBL && actualBL && requestBL !== actualBL && order) {
            this.logger.log(
              `[상차완료 복구] 요청/실제 BL 상이 — 무역 부킹 BL 미변경. TradeOrder ID: ${order.id}, 실제 ${actualBL} / 요청 ${requestBL}`,
            );
          }

          // 컨테이너 복구: 요청 컨테이너와 실제 컨테이너가 다르면 요청 컨테이너로 복구
          if (requestContainerNo && actualContainerNo && requestContainerNo !== actualContainerNo && order) {
            this.logger.log(
              `[상차완료 복구] [컨테이너 복구 감지] SalesItem ID: ${salesItem.id}, 실제: ${actualContainerNo} → 요청: ${requestContainerNo}, Order ID: ${order.id}`
            );

            // 요청 컨테이너 찾기 (같은 TradeOrder 내에서)
            const requestContainer = await this.tradeContainerRepository.findOne({
              where: { 
                order: { id: order.id },
                containerNo: requestContainerNo,
              },
              relations: ['order'],
            });

            if (requestContainer) {
              this.logger.log(
                `[상차완료 복구] [요청 컨테이너 찾음] 컨테이너 번호: ${requestContainerNo}, 컨테이너 ID: ${requestContainer.id}`
              );

              // 실제 컨테이너도 재고 상태 업데이트에 포함
              if (actualContainerNo) {
                const actualContainer = await this.tradeContainerRepository.findOne({
                  where: { 
                    order: { id: order.id },
                    containerNo: actualContainerNo,
                  },
                  relations: ['order'],
                });
                if (actualContainer) {
                  containerIdsToUpdate.add(actualContainer.id);
                  this.logger.log(
                    `[상차완료 복구] [재고 관리] 실제 컨테이너 재고 상태 업데이트 예정 - 컨테이너 번호: ${actualContainerNo}, 컨테이너 ID: ${actualContainer.id}`
                  );
                }
              }

              // SalesItem의 containerId 및 관계를 요청 컨테이너로 복구 (관계를 null로 두면 save 시 co_id가 null로 나가 NOT NULL 제약 위반)
              const beforeContainerId = salesItem.containerId;
              salesItem.containerId = requestContainer.id;
              salesItem.container = requestContainer;
              hasAnyRestore = true;

              this.logger.log(
                `[상차완료 복구] [판매 관리 - 컨테이너 복구 완료] SalesItem ID: ${salesItem.id}, ` +
                `containerId: ${beforeContainerId || '없음'} → ${requestContainer.id}, ` +
                `컨테이너 번호: ${requestContainerNo}`
              );

              containerIdsToUpdate.add(requestContainer.id);
              this.logger.log(
                `[상차완료 복구] [재고 관리] 요청 컨테이너 재고 상태 업데이트 예정 - 컨테이너 번호: ${requestContainerNo}, 컨테이너 ID: ${requestContainer.id}`
              );
            } else {
              this.logger.warn(
                `[상차완료 복구] [요청 컨테이너 찾기 실패] 컨테이너 번호: ${requestContainerNo}, Order ID: ${order.id} - 같은 Order 내에서 찾을 수 없습니다.`
              );
            }
          } else if (currentContainerId) {
            // 컨테이너가 변경되지 않았어도 재고 상태 업데이트 필요
            containerIdsToUpdate.add(currentContainerId);
            this.logger.log(
              `[상차완료 복구] [재고 관리] 기존 컨테이너 재고 상태 업데이트 예정 - 컨테이너 ID: ${currentContainerId}, 컨테이너 번호: ${container?.containerNo || '없음'}`
            );
          }

          // 베일, 중량, 타입 복구: 요청 정보와 실제 정보가 다르면 요청 정보로 복구
          const needsBalesRestore = requestBales !== null && requestBales !== undefined && actualBales !== null && actualBales !== undefined && requestBales !== actualBales;
          const needsWeightRestore = requestWeight !== null && requestWeight !== undefined && actualWeight !== null && actualWeight !== undefined && requestWeight !== actualWeight;
          const needsTypeRestore = requestType && actualType && requestType !== actualType;

          if (needsBalesRestore || needsWeightRestore || needsTypeRestore) {
            this.logger.log(
              `[상차완료 복구] [판매 관리 - 제품 정보 복구] SalesItem ID: ${salesItem.id}, ` +
              `베일: ${actualBales !== null && actualBales !== undefined ? actualBales : '없음'} → ${requestBales !== null && requestBales !== undefined ? requestBales : '없음'}, ` +
              `중량: ${actualWeight !== null && actualWeight !== undefined ? actualWeight : '없음'} → ${requestWeight !== null && requestWeight !== undefined ? requestWeight : '없음'}, ` +
              `타입: ${actualType || '없음'} → ${requestType || '없음'}`
            );
            if (needsBalesRestore) {
              salesItem.cargoBales = requestBales!.toString();
              this.logger.log(
                `[상차완료 복구] [판매 관리 - 베일 복구] SalesItem ID: ${salesItem.id}, 베일: ${salesItem.cargoBales || '없음'} → ${requestBales}`
              );
            }
            if (needsWeightRestore) {
              salesItem.cargoWeight = requestWeight!.toString();
              this.logger.log(
                `[상차완료 복구] [판매 관리 - 중량 복구] SalesItem ID: ${salesItem.id}, 중량: ${salesItem.cargoWeight || '없음'} → ${requestWeight}`
              );
            }
            if (needsTypeRestore) {
              salesItem.containerType = requestType!;
              this.logger.log(
                `[상차완료 복구] [판매 관리 - 타입 복구] SalesItem ID: ${salesItem.id}, 타입: ${salesItem.containerType || '없음'} → ${requestType}`
              );
            }
            hasAnyRestore = true;
          }

          // 복구가 있을 때만 SalesItem 저장
          if (hasAnyRestore) {
            const updateData: any = {};
            if (salesItem.containerId !== currentContainerId) {
              updateData.containerId = salesItem.containerId;
            }
            if (needsBalesRestore) updateData.cargoBales = salesItem.cargoBales;
            if (needsWeightRestore) updateData.cargoWeight = salesItem.cargoWeight;
            if (needsTypeRestore) updateData.containerType = salesItem.containerType;

            if (Object.keys(updateData).length > 0) {
              this.logger.log(
                `[상차완료 복구] [판매 관리 - SalesItem 복구 실행] SalesItem ID: ${salesItem.id}, ` +
                `업데이트할 필드: ${Object.keys(updateData).join(', ')}`
              );
              await this.salesItemRepository.update(salesItem.id, updateData);
            }
          } else {
            this.logger.log(
              `[상차완료 복구] [판매 관리 - SalesItem] 복구할 내용이 없어 저장하지 않음 - SalesItem ID: ${salesItem.id}`
            );
          }

          this.logger.log(`[상차완료 복구] ========== 상차 항목 처리 완료 - LoadingItem ID: ${loadingItem.id} ==========`);
        }
        await this.loadingItemRepository.save(loadingItemsWithRelations);

        // 판매 항목 상태를 판매(SALES_ITEM_SOLD)로 복구
        // ★ 하차에서 삭제한 항목(SALES_ITEM_CANCELLED)은 절대 복구하지 않음 → loadingItems에 있는 항목만 복구
        const candidateIds = loadingItemsWithRelations
          .map((li) => li.salesItemId)
          .filter((id): id is string => !!id);
        const cancelledItems = await this.salesItemRepository.find({
          where: { id: In(candidateIds), salesId: delivery.salesId, status: 'SALES_ITEM_CANCELLED' },
          select: ['id'],
        });
        const cancelledIds = new Set(cancelledItems.map((si) => String(si.id)));
        const salesItemIdsToRestore = candidateIds.filter((id) => !cancelledIds.has(id));

        this.logger.log(
          `[상차완료 복구] [판매 관리 - 상태 복구] 판매 ID ${delivery.salesId}의 상차 항목 ${salesItemIdsToRestore.length}개만 판매(SALES_ITEM_SOLD)로 복구합니다. (하차 제외 취소 ${cancelledIds.size}건 제외, 삭제한 항목은 복구 안 함)`
        );

        let restoredItems: { affected?: number } = { affected: 0 };
        if (salesItemIdsToRestore.length > 0) {
          restoredItems = await this.salesItemRepository.update(
            { id: In(salesItemIdsToRestore), salesId: delivery.salesId },
            { status: 'SALES_ITEM_SOLD' },
          );
        }

        this.logger.log(
          `[상차완료 복구] [판매 관리 - 상태 복구 완료] 판매 ID ${delivery.salesId}의 판매 항목 상태를 판매로 복구했습니다. 복구된 항목 수: ${restoredItems.affected || 0}`
        );

        // 판매 전체 상태(sa_status)를 SOLD(판매)로 되돌림 (하차완료 시 COMPLETED로 바뀐 것을 상차완료 복구 시 복구)
        const salesToRestore = await this.salesRepository.findOne({
          where: { id: delivery.salesId },
          select: ['id', 'status'],
        });
        if (salesToRestore && salesToRestore.status === 'COMPLETED') {
          await this.salesRepository.update(delivery.salesId, { status: 'SOLD' });
          this.logger.log(
            `[상차완료 복구] [판매 관리 - Sales 상태 복구] 판매 ID ${delivery.salesId}, sa_status: COMPLETED → SOLD`,
          );
        }

        // 거래명세서 발행대기 해제 (상차완료 상태에서는 발행대기/판매항목선택 목록에 노출되지 않도록)
        try {
          const salesForInvoiceReset = await this.salesRepository.findOne({
            where: { id: delivery.salesId },
            select: ['id', 'invoiceStatus'],
          });
          if (salesForInvoiceReset) {
            const beforeInvoiceStatus = salesForInvoiceReset.invoiceStatus;
            salesForInvoiceReset.invoiceStatus = null;
            await this.salesRepository.save(salesForInvoiceReset);
            this.logger.log(
              `[상차완료 복구] [거래명세서] 발행대기 해제 - 판매 ID: ${delivery.salesId}, 기존: ${beforeInvoiceStatus ?? 'NULL'} → NULL (다시 하차완료 시 PENDING_ISSUE로 재설정됨)`,
            );
          }
        } catch (err) {
          this.logger.warn(
            `[상차완료 복구] 거래명세서 상태 초기화 실패 - 판매 ID: ${delivery.salesId}, ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        // 관련 컨테이너들의 재고 상태 업데이트
        if (containerIdsToUpdate.size > 0) {
          this.logger.log(
            `[상차완료 복구] [재고 관리] 재고 상태를 업데이트할 컨테이너 수: ${containerIdsToUpdate.size}개, 컨테이너 ID 목록: ${Array.from(containerIdsToUpdate).join(', ')}`
          );
          for (const containerId of containerIdsToUpdate) {
            const container = await this.tradeContainerRepository.findOne({
              where: { id: containerId },
              select: ['id', 'containerNo'],
            });
            this.logger.log(
              `[상차완료 복구] [재고 관리] 컨테이너 재고 상태 업데이트 시작 - 컨테이너 ID: ${containerId}, 컨테이너 번호: ${container?.containerNo || '없음'}`
            );
            await this.updateContainerInventoryStatus(containerId);
            this.logger.log(
              `[상차완료 복구] [재고 관리] 컨테이너 재고 상태 업데이트 완료 - 컨테이너 ID: ${containerId}, 컨테이너 번호: ${container?.containerNo || '없음'}`
            );
          }
          this.logger.log(
            `[상차완료 복구] [재고 관리] 판매 ID ${delivery.salesId}의 관련 컨테이너 ${containerIdsToUpdate.size}개의 재고 상태를 모두 업데이트했습니다.`
          );
        } else {
          // 컨테이너가 변경되지 않은 경우에도 기존 컨테이너들의 재고 상태 업데이트
          this.logger.log(
            `[상차완료 복구] [재고 관리] 컨테이너 변경이 없어 기존 컨테이너들의 재고 상태를 업데이트합니다.`
          );
        const salesItems = await this.salesItemRepository.find({
          where: { sales: { id: delivery.salesId } },
          relations: ['container'],
        });

        const containerIds = new Set<string>();
        salesItems.forEach((item) => {
          if (item.containerId) {
            containerIds.add(item.containerId);
          }
        });

          this.logger.log(
            `[상차완료 복구] [재고 관리] 재고 상태를 업데이트할 컨테이너 수: ${containerIds.size}개, 컨테이너 ID 목록: ${Array.from(containerIds).join(', ')}`
          );

        for (const containerId of containerIds) {
            const container = await this.tradeContainerRepository.findOne({
              where: { id: containerId },
              select: ['id', 'containerNo'],
            });
            this.logger.log(
              `[상차완료 복구] [재고 관리] 컨테이너 재고 상태 업데이트 시작 - 컨테이너 ID: ${containerId}, 컨테이너 번호: ${container?.containerNo || '없음'}`
            );
          await this.updateContainerInventoryStatus(containerId);
            this.logger.log(
              `[상차완료 복구] [재고 관리] 컨테이너 재고 상태 업데이트 완료 - 컨테이너 ID: ${containerId}, 컨테이너 번호: ${container?.containerNo || '없음'}`
            );
        }

        this.logger.log(
            `[상차완료 복구] [재고 관리] 판매 ID ${delivery.salesId}의 관련 컨테이너 ${containerIds.size}개의 재고 상태를 모두 업데이트했습니다.`
        );
        }

        this.logger.log(`[상차완료 복구] 하차완료에서 상차완료로 상태 변경 처리 완료 - 배송 ID: ${id}, 판매 ID: ${delivery.salesId}`);
        // [판매1055 디버그] 상차완료 복구 후 해당 판매의 SalesItem 개수 (취소 제외)
        const afterRestoreSalesItems = await this.salesItemRepository.find({
          where: { salesId: delivery.salesId, status: Not('SALES_ITEM_CANCELLED') },
          select: ['id', 'status'],
        });
        this.logger.log(
          `[판매1055 디버그] 상차완료 복구 완료 - 판매 ID: ${delivery.salesId}, SalesItem(취소제외) ${afterRestoreSalesItems.length}개: [${afterRestoreSalesItems.map((si) => `id=${si.id},status=${si.status}`).join('; ')}]`,
        );
      } catch (error) {
        this.logger.error(
          `[상차완료 복구] 판매 ID ${delivery.salesId}의 판매 항목 상태 및 재고 상태 복구 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined
        );
        // 판매 항목 상태 복구 실패해도 배송 상태 업데이트는 계속 진행
      }
    }

    // 하차완료 상태로 변경 시, 또는 이미 하차완료된 건의 하차정보 수정 시:
    // - 실제(actual) 정보를 판매(SalesItem, Order)에 반영 → "하차완료에서 수정한 것 = 판매에서 수정한 것"과 동일하게 동작
    // - 재고(컨테이너 inventoryStatus) 업데이트
    const isFirstUnloadingComplete = dto.status === 'UNLOADING_COMPLETED' && previousStatus !== 'UNLOADING_COMPLETED';
    const isUnloadingInfoEdit = previousStatus === 'UNLOADING_COMPLETED' && delivery.status === 'UNLOADING_COMPLETED' && dto.loadingItems !== undefined;
    // removedLoadingItemIds만 전달된 경우(loadingItems 미전달): isUnloadingInfoEdit=false → 블록 미진입 → CANCELLED 미처리 → orphan 발생
    // 행 삭제로 취소 대상이 있으면 반드시 진입하여 CANCELLED 처리
    const hasRemovedLoadingItemsToCancel = salesItemIdsFromRemovedLoadingItems.length > 0;
    const willEnterUnloadingBlock = (isFirstUnloadingComplete || isUnloadingInfoEdit || hasRemovedLoadingItemsToCancel) && delivery.salesId;

    this.logger.log(
      `[하차완료 디버그] 조건 체크 - isFirstUnloadingComplete: ${isFirstUnloadingComplete}, isUnloadingInfoEdit: ${isUnloadingInfoEdit}, hasRemovedLoadingItemsToCancel: ${hasRemovedLoadingItemsToCancel}, salesId 있음: ${!!delivery.salesId}, dto.loadingItems: ${dto.loadingItems !== undefined ? `있음(${dto.loadingItems?.length ?? 0}개)` : 'undefined'}, → 하차완료 블록 진입: ${willEnterUnloadingBlock}`,
    );
    if (!willEnterUnloadingBlock) {
      const reason =
        !delivery.salesId
          ? 'salesId 없음 (배송이 판매와 연결되지 않음)'
          : !isFirstUnloadingComplete && !isUnloadingInfoEdit && !hasRemovedLoadingItemsToCancel
            ? `dto.status=${dto.status ?? 'undefined'}, previousStatus=${previousStatus} (상차완료→하차완료가 아님)`
            : '알 수 없음';
      this.logger.log(`[하차완료 디버그] 판매 상태 변경 블록 미진입 - 이유: ${reason}`);
    }

    if (willEnterUnloadingBlock) {
      // 상차완료 → 하차완료 변경 시 추적용 로그 (체크 포인트)
      this.logger.log(
        `[하차완료 체크] 진입 - 배송 ID: ${id}, 판매 ID: ${delivery.salesId}, 이전상태: ${previousStatus}, 현재(dto)상태: ${dto.status}, isFirstUnloadingComplete: ${isFirstUnloadingComplete}, isUnloadingInfoEdit: ${isUnloadingInfoEdit}`,
      );
      this.logger.log(
        isUnloadingInfoEdit
          ? `[하차완료 수정] 하차정보 수정 반영 시작 - 배송 ID: ${id}, 판매 ID: ${delivery.salesId} (판매 쪽과 동일하게 반영)`
          : `[하차완료] 하차완료 상태 변경 시작 - 배송 ID: ${id}, 판매 ID: ${delivery.salesId}`,
      );
      this.logger.log(
        `[하차완료-행삭제] 하차완료 블록 진입 - salesItemIdsFromRemovedLoadingItems(행 삭제로 인한 취소 대상): [${salesItemIdsFromRemovedLoadingItems.join(', ')}]`,
      );
      try {
        // 최신 loadingItems 조회 (실제 정보가 포함된 데이터, relation 포함)
        // order 기준 정렬로 추가 행이 마지막에 오도록 보장 (savedLoadingItems와 dto 순서 일치)
        let loadingItemsWithRelations = await this.loadingItemRepository.find({
          where: { salesDeliveryId: id },
          relations: ['salesItem', 'salesItem.container', 'salesItem.container.order'],
          order: { order: 'ASC' },
        });

        // 하차 수정 시 또는 첫 하차완료 시: DTO의 actual* 값을 엔티티에 반영
        // (DB 반영 직후 find가 갱신값을 못 볼 수 있거나, 새 행은 id가 없어 fetch 결과에 반영 보완)
        if (dto.loadingItems && dto.loadingItems.length > 0) {
          const dtoByLoadingItemId = new Map(
            dto.loadingItems
              .filter((item) => item.id != null && item.id !== '')
              .map((item) => [String(item.id), item]),
          );
          for (const li of loadingItemsWithRelations) {
            const dtoItem = dtoByLoadingItemId.get(String(li.id));
            if (dtoItem) {
              // actual* undefined면 request* fallback (아무것도 안 입력하고 하차완료해도 상차지/컨테이너 표시)
              let usedActualContainer = dtoItem.actualContainer !== undefined ? (dtoItem.actualContainer || null) : (li.requestContainer || null);
              if (dtoItem.actualContainerId?.trim()) {
                const c = await this.tradeContainerRepository.findOne({ where: { id: dtoItem.actualContainerId.trim() }, select: ['containerNo'] });
                if (c?.containerNo) {
                  usedActualContainer = c.containerNo;
                  if (dtoItem.actualContainer && dtoItem.actualContainer !== c.containerNo) {
                    this.logger.log(`[하차완료] DTO 병합 시 actualContainer 보정 - LoadingItem ID: ${li.id}, "${dtoItem.actualContainer}" → "${c.containerNo}"`);
                  }
                }
              }
              if (dtoItem.actualContainer === undefined && !li.requestContainer) {
                this.logger.warn(
                  `[하차완료] ★ actualContainer null 경고 - LoadingItem ID: ${li.id}, DTO actualContainer: undefined, DB requestContainer: null (상차 수정 시 id 누락 가능성)`,
                );
              }
              li.actualBL = dtoItem.actualBL !== undefined ? (dtoItem.actualBL || null) : (li.requestBL || null);
              li.actualContainer = usedActualContainer;
              li.actualContainerType = dtoItem.actualContainerType !== undefined ? (dtoItem.actualContainerType || null) : (li.requestContainerType || null);
              li.actualBales = dtoItem.actualBales !== undefined ? dtoItem.actualBales : (li.requestBales ?? null);
              li.actualWeight = dtoItem.actualWeight !== undefined ? dtoItem.actualWeight : (li.requestWeight ?? null);
            } else {
              // ID 불일치(배송 수정 등으로 LoadingItem id 변경 후 프론트가 옛 id로 보낸 경우): DTO 매칭 실패해도 DB의 request/work로 actual 채움 → 판매 반영 대상에 포함
              const fallbackBL = li.requestBL ?? li.workBL ?? null;
              const fallbackContainer = li.requestContainer ?? li.workContainer ?? null;
              if (fallbackBL != null || fallbackContainer != null) {
                this.logger.log(
                  `[하차완료] ID 불일치 fallback - LoadingItem ID: ${li.id}(DTO에 해당 id 없음), actual* ← request/work (BL: ${fallbackBL ?? 'null'}, Container: ${fallbackContainer ?? 'null'})`,
                );
                li.actualBL = fallbackBL;
                li.actualContainer = fallbackContainer;
                li.actualContainerType = li.actualContainerType ?? li.requestContainerType ?? li.workContainerType ?? null;
                li.actualBales = li.actualBales ?? li.requestBales ?? li.workBales ?? null;
                li.actualWeight = li.actualWeight ?? li.requestWeight ?? li.workWeight ?? null;
              }
            }
          }
          // 새 행(컨테이너 추가): id가 없어 dtoByLoadingItemId에 없음 → savedLoadingItems 순서로 매칭하여 병합
          for (let i = 0; i < dto.loadingItems.length; i++) {
            const dtoItem = dto.loadingItems[i];
            if (dtoItem.id != null && dtoItem.id !== '') continue;
            if (savedLoadingItems.length <= i || !savedLoadingItems[i]?.id) continue;
            const newItemId = String(savedLoadingItems[i].id);
            const li = loadingItemsWithRelations.find((l) => String(l.id) === newItemId);
            if (li) {
              li.actualBL = dtoItem.actualBL !== undefined ? (dtoItem.actualBL || null) : (li.requestBL || null);
              li.actualContainer = dtoItem.actualContainer !== undefined ? (dtoItem.actualContainer || null) : (li.requestContainer || null);
              li.actualContainerType = dtoItem.actualContainerType !== undefined ? (dtoItem.actualContainerType || null) : (li.requestContainerType || null);
              li.actualBales = dtoItem.actualBales !== undefined ? dtoItem.actualBales : (li.requestBales ?? null);
              li.actualWeight = dtoItem.actualWeight !== undefined ? dtoItem.actualWeight : (li.requestWeight ?? null);
              this.logger.log(
                `[하차완료] 새 행 DTO 병합 - LoadingItem ID: ${newItemId}, actualBL: ${dtoItem.actualBL ?? '없음'}, actualContainer: ${dtoItem.actualContainer ?? '없음'}`,
              );
            }
          }
          this.logger.log(
            `[하차완료] DTO actual* 값을 LoadingItem 엔티티에 병합함 - 항목 수: ${dto.loadingItems.length}`,
          );
        }

        // 상태만으로 하차완료를 누른 경로(loading/dispatch 화면, 일괄 하차완료 등)에서는
        // actual*이 비어 있어 판매 동기화가 건너뛰어질 수 있음.
        // 이 경우 request 우선, 필요 시 work로 actual*을 보정해 판매/운송 불일치를 방지한다.
        const isStatusOnlyUnloadingComplete =
          isFirstUnloadingComplete && (!dto.loadingItems || dto.loadingItems.length === 0);
        if (isStatusOnlyUnloadingComplete) {
          const isLikelyContainerNo = (value: string | null | undefined): boolean => {
            if (!value) return false;
            const normalized = value.trim();
            if (!normalized) return false;
            // 작업 텍스트("21랩+스몰1랩" 등) 오염값 제외: 공백/특수문자/한글 제외
            return /^[A-Za-z0-9-]{4,20}$/.test(normalized);
          };

          let autoFilledCount = 0;
          for (const li of loadingItemsWithRelations) {
            const prev = {
              actualBL: li.actualBL,
              actualContainer: li.actualContainer,
              actualContainerType: li.actualContainerType,
              actualBales: li.actualBales,
              actualWeight: li.actualWeight,
            };

            if (li.actualBL == null) li.actualBL = li.requestBL ?? li.workBL ?? null;
            if (li.actualContainer == null) {
              const requestContainer = li.requestContainer?.trim() || null;
              const workContainer = isLikelyContainerNo(li.workContainer) ? li.workContainer!.trim() : null;
              li.actualContainer = requestContainer ?? workContainer;
            }
            if (li.actualContainerType == null) li.actualContainerType = li.requestContainerType ?? li.workContainerType ?? null;
            if (li.actualBales == null) li.actualBales = li.requestBales ?? li.workBales ?? null;
            if (li.actualWeight == null) li.actualWeight = li.requestWeight ?? li.workWeight ?? null;

            const changed =
              prev.actualBL !== li.actualBL ||
              prev.actualContainer !== li.actualContainer ||
              prev.actualContainerType !== li.actualContainerType ||
              prev.actualBales !== li.actualBales ||
              prev.actualWeight !== li.actualWeight;
            if (changed) autoFilledCount += 1;
          }

          this.logger.log(
            `[하차완료] status-only 요청 감지 - actual 자동 보정 ${autoFilledCount}건 (deliveryId=${id}, salesId=${delivery.salesId})`,
          );
        }

        // 실제 확정 정보가 하나라도 있는 항목만 재고/판매 반영 (행 삭제로 actual만 비운 항목은 제외)
        const loadingItemsToApply = loadingItemsWithRelations.filter(
          (li) =>
            li.actualBL != null ||
            li.actualContainer != null ||
            li.actualBales != null ||
            li.actualWeight != null,
        );
        this.logger.log(
          `[하차완료 체크] LoadingItem 조회 - 전체: ${loadingItemsWithRelations.length}개, 실제 반영 대상: ${loadingItemsToApply.length}개, ID목록: ${loadingItemsWithRelations.map((li) => li.id).join(', ')}`,
        );
        const dtoHasActual = (dto.loadingItems?.length ?? 0) > 0 && dto.loadingItems!.some(
          (it) => it.actualBL != null || it.actualContainer != null || it.actualBales != null || it.actualWeight != null,
        );
        if (loadingItemsToApply.length === 0 && dtoHasActual) {
          this.logger.warn(
            `[하차완료-판매미반영] 실제 반영 대상 0건인데 DTO에는 actual* 값이 있음 → 판매 항목 미반영 가능성. ` +
            `dto.loadingItems 개수: ${dto.loadingItems?.length ?? 0}, DB loadingItems 개수: ${loadingItemsWithRelations.length}. ` +
            `DTO id 목록: [${dto.loadingItems?.map((i) => i.id ?? 'null').join(', ')}]`,
          );
        }
        loadingItemsToApply.forEach((li, idx) => {
          this.logger.log(
            `[중량동기화] LoadingItem[${idx}] id=${li.id}, salesItemId=${li.salesItemId}, actualContainer=${li.actualContainer ?? 'null'}, actualWeight=${li.actualWeight ?? 'null'}, requestWeight=${li.requestWeight ?? 'null'}`,
          );
        });
        // [판매1055 디버그] 상차→하차 시 LoadingItem별 salesItemId (추가 컨테이너 분기 판단용)
        const sortedForDebug = [...loadingItemsToApply].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        this.logger.log(
          `[판매1055 디버그] 하차완료 처리 시작 - 판매 ID: ${delivery.salesId}, LoadingItem 수: ${sortedForDebug.length}, ` +
            `salesItemId 목록: [${sortedForDebug.map((li) => `li.id=${li.id}→salesItemId=${li.salesItemId}`).join('; ')}]`,
        );
        this.logger.log(
          `[하차완료] 상차 항목 수: ${loadingItemsWithRelations.length}개 (재고 반영: ${loadingItemsToApply.length}개)`,
        );

        // 컨테이너 ID Set (재고 상태 업데이트용)
        const containerIdsToUpdate = new Set<string>();
        // 동일 salesItemId로 여러 행(추가 컨테이너)이 오는 경우, 첫 행만 기존 SalesItem 업데이트, 이후는 새 SalesItem 생성
        const updatedSalesItemIds = new Set<string>();
        // 추가 컨테이너로 새로 만든 SalesItem id (상태 업데이트 시 판매완료 대상에 포함)
        const createdSalesItemIdsByAddContainer = new Set<string>();

        // order 기준 정렬 후 처리 (추가 행이 마지막에 오도록)
        const sortedLoadingItemsToApply = [...loadingItemsToApply].sort(
          (a, b) => (a.order ?? 0) - (b.order ?? 0),
        );

        // DTO에서 actualContainerId 맵 (동일 containerNo·다른 순번 구분용)
        // 기존 행: dto.id → actualContainerId, 새 행(컨테이너 추가): 저장 후 id로 매핑
        const dtoActualContainerIdByLoadingItemId = new Map<string, string>();
        if (dto.loadingItems?.length) {
          for (let i = 0; i < dto.loadingItems.length; i++) {
            const dtoItem = dto.loadingItems[i];
            const cid = dtoItem.actualContainerId?.trim();
            if (!cid) continue;
            const hasId = dtoItem.id != null && dtoItem.id !== '';
            if (hasId) {
              dtoActualContainerIdByLoadingItemId.set(String(dtoItem.id), cid);
            } else if (savedLoadingItems.length > i && savedLoadingItems[i]?.id) {
              dtoActualContainerIdByLoadingItemId.set(String(savedLoadingItems[i].id), cid);
              this.logger.log(
                `[하차완료] 새 행 actualContainerId 매핑 - 저장된 LoadingItem ID: ${savedLoadingItems[i].id}, 컨테이너 ID: ${cid}`,
              );
            }
          }
        }

        // 각 loadingItem에 대해 요청 정보와 실제 정보 비교하여 판매 정보 업데이트
        for (const loadingItem of sortedLoadingItemsToApply) {
          if (!loadingItem.salesItemId) continue;

          this.logger.log(`[하차완료] ========== 상차 항목 처리 시작 - LoadingItem ID: ${loadingItem.id}, SalesItem ID: ${loadingItem.salesItemId} ==========`);

          // 이미 이 salesItemId로 한 번 반영했으면 → 추가 컨테이너 행: 판매(sales)에 새 SalesItem 생성 후 이 LoadingItem을 그쪽으로 연결
          if (updatedSalesItemIds.has(loadingItem.salesItemId)) {
            this.logger.log(
              `[판매1055 디버그] 추가 컨테이너 분기 진입 - LoadingItem ID: ${loadingItem.id}, salesItemId: ${loadingItem.salesItemId} (이미 반영됨 → 새 SalesItem 생성)`,
            );
            const dtoContainerId = dtoActualContainerIdByLoadingItemId.get(String(loadingItem.id));
            const newSalesItemId = await this.applyAddedContainerAtUnloading(
              loadingItem,
              delivery.salesId,
              containerIdsToUpdate,
              dtoContainerId ?? undefined,
            );
            if (newSalesItemId) {
              createdSalesItemIdsByAddContainer.add(newSalesItemId);
              this.logger.log(`[하차완료] 컨테이너 추가 반영 완료 - 판매 ID ${delivery.salesId}에 새 SalesItem ID ${newSalesItemId} 추가됨 (판매 상세에서 제품 +1)`);
            }
            continue;
          }

          // SalesItem 조회 (container와 order 관계 포함)
          const salesItem = await this.salesItemRepository.findOne({
            where: { id: loadingItem.salesItemId },
            relations: ['container', 'container.order'],
          });

          if (!salesItem) {
            this.logger.warn(`[하차완료] SalesItem을 찾을 수 없습니다. ID: ${loadingItem.salesItemId}`);
            continue;
          }

          updatedSalesItemIds.add(salesItem.id);

          const container = salesItem.container;
          const order = container?.order;
          const previousContainerId = salesItem.containerId;

          // 작업 정보
          const workBL = loadingItem.workBL;
          const workContainerNo = loadingItem.workContainer;
          const workBales = loadingItem.workBales;
          const workWeight = loadingItem.workWeight;
          const workType = loadingItem.workContainerType;

          // 요청 정보 (요청 필드가 있으면 사용, 없으면 SalesItem에서 가져옴)
          const requestBL = loadingItem.requestBL || order?.bl || null;
          const requestContainerNo = loadingItem.requestContainer || container?.containerNo || null;
          const requestBales = loadingItem.requestBales !== null && loadingItem.requestBales !== undefined 
            ? loadingItem.requestBales 
            : (salesItem.cargoBales ? parseFloat(salesItem.cargoBales.toString()) : null);
          const requestWeight = loadingItem.requestWeight !== null && loadingItem.requestWeight !== undefined 
            ? loadingItem.requestWeight 
            : (salesItem.cargoWeight ? parseFloat(salesItem.cargoWeight.toString()) : null);
          const requestType = loadingItem.requestContainerType || salesItem.containerType || null;

          // 실제 정보
          const actualBL = loadingItem.actualBL;
          const actualContainerNo = loadingItem.actualContainer;
          const actualBales = loadingItem.actualBales;
          const actualWeight = loadingItem.actualWeight;
          const actualType = loadingItem.actualContainerType;

          // 요청/작업/실제 정보 로그 출력
          this.logger.log(
            `[하차완료] [요청 정보] BL: ${requestBL || '없음'}, 컨테이너: ${requestContainerNo || '없음'}, 타입: ${requestType || '없음'}, 베일: ${requestBales !== null && requestBales !== undefined ? requestBales : '없음'}, 중량: ${requestWeight !== null && requestWeight !== undefined ? requestWeight : '없음'}`
          );
          this.logger.log(
            `[하차완료] [작업 정보] BL: ${workBL || '없음'}, 컨테이너: ${workContainerNo || '없음'}, 타입: ${workType || '없음'}, 베일: ${workBales !== null && workBales !== undefined ? workBales : '없음'}, 중량: ${workWeight !== null && workWeight !== undefined ? workWeight : '없음'}`
          );
          this.logger.log(
            `[하차완료] [실제 정보] BL: ${actualBL || '없음'}, 컨테이너: ${actualContainerNo || '없음'}, 타입: ${actualType || '없음'}, 베일: ${actualBales !== null && actualBales !== undefined ? actualBales : '없음'}, 중량: ${actualWeight !== null && actualWeight !== undefined ? actualWeight : '없음'}`
          );
          // 요청/실제가 작업(work) 텍스트와 동일한지 검사 - 작업은 자유텍스트 가능, 요청/실제는 컨테이너번호만 있어야 함
          const workHasExtraText = workContainerNo && workContainerNo.length > 15 && /[가-힣a-zA-Z]/.test(workContainerNo);
          if (workHasExtraText && (requestContainerNo === workContainerNo || actualContainerNo === workContainerNo)) {
            this.logger.warn(
              `[하차완료] ★ 요청/실제=작업 동일 경고 - LoadingItem ID: ${loadingItem.id}, ` +
                `컨테이너값에 작업용 자유텍스트 포함됨(요청/실제는 컨테이너번호만 있어야 함). ` +
                `request=${requestContainerNo || 'null'}, actual=${actualContainerNo || 'null'}, work=${workContainerNo || 'null'}`,
            );
          }
          this.logger.log(
            `[하차완료] [판매 관리 - 현재 제품 정보] SalesItem ID: ${salesItem.id}, 컨테이너 ID: ${previousContainerId || '없음'}, 컨테이너 번호: ${container?.containerNo || '없음'}, 베일: ${salesItem.cargoBales || '없음'}, 중량: ${salesItem.cargoWeight || '없음'}, 타입: ${salesItem.containerType || '없음'}`
          );

          // 요청 정보와 실제 정보 비교하여 업데이트
          let hasAnyUpdate = false;

          // 무역 부킹 BL(tb_trade_order.to_bl)은 무역 메뉴에서만 수정. 실제 BL은 상차항목·판매 쪽에만 반영.
          if (actualBL && requestBL && actualBL !== requestBL && order) {
            this.logger.log(
              `[하차완료] 실제 BL 상이(요청 ${requestBL} / 실제 ${actualBL}) — 무역 부킹 BL 미변경. TradeOrder ID: ${order.id}`,
            );
          } else if (actualBL && requestBL && actualBL === requestBL) {
            this.logger.log(
              `[하차완료] [판매 관리 - BL] 요청 BL과 실제 BL이 동일하여 업데이트하지 않음 - BL: ${requestBL}`
            );
          }

          // 컨테이너 번호 비교 및 업데이트: 요청 컨테이너와 실제 컨테이너가 다를 때만 업데이트
          let requestContainerId: string | null = null;
          let updatedActualContainerNo: string | null = null; // 업데이트된 실제 컨테이너 번호 저장용
          let originalContainerIdBeforeUpdate: string | null = null; // 업데이트 전 원본 containerId 저장용
          this.logger.log(
            `[하차완료] [컨테이너 비교] SalesItem ID: ${salesItem.id}, 요청 컨테이너: ${requestContainerNo || '없음'}, 실제 컨테이너: ${actualContainerNo || '없음'}, 기존 컨테이너 ID: ${previousContainerId || '없음'}, 기존 컨테이너 번호: ${container?.containerNo || '없음'}`
          );

          let resolvedActualContainerEntity: TradeContainer | null = null;

          // 실제 컨테이너가 있으면 판매 반영 (요청 유무와 관계없이: 수정 시 실제만 입력해도 반영)
          this.logger.log(
            `[중량동기화] SalesItem ID=${salesItem.id} - actualContainerNo=${actualContainerNo ?? 'null'}, actualWeight=${actualWeight ?? 'null'}, salesItem.cargoWeight=${salesItem.cargoWeight ?? 'null'} → actualContainerNo 없으면 베일/중량 업데이트 블록 전체 스킵됨`,
          );
          if (actualContainerNo) {
            if (requestContainerNo && actualContainerNo !== requestContainerNo) {
              this.logger.log(
                `[하차완료] [컨테이너 변경 감지] SalesItem ID: ${salesItem.id}, 요청: ${requestContainerNo}, 실제: ${actualContainerNo}, Order ID: ${order?.id || '없음'}`
              );
            } else if (!requestContainerNo) {
              this.logger.log(
                `[하차완료] [컨테이너 - 실제만 있음] SalesItem ID: ${salesItem.id}, 실제: ${actualContainerNo}, 요청 없음 → 판매/재고 반영`,
              );
            }

            // 요청 컨테이너 ID 찾기 (재고 반영용, 같은 TradeOrder 내에서)
            if (order && requestContainerNo) {
              this.logger.log(
                `[하차완료] [요청 컨테이너 검색 시작] Order ID: ${order.id}, 컨테이너 번호: ${requestContainerNo}`
              );
              const requestContainer = await this.tradeContainerRepository.findOne({
                where: { 
                  order: { id: order.id },
                  containerNo: requestContainerNo,
                },
                relations: ['order'],
              });
              if (requestContainer) {
                requestContainerId = requestContainer.id;
                this.logger.log(
                  `[하차완료] [요청 컨테이너 찾음] 컨테이너 번호: ${requestContainerNo}, 컨테이너 ID: ${requestContainerId}`
                );
              } else {
                this.logger.warn(
                  `[하차완료] [요청 컨테이너 찾기 실패] 컨테이너 번호: ${requestContainerNo}, Order ID: ${order.id} - 같은 Order 내에서 찾을 수 없습니다.`
                );
              }
            } else {
              this.logger.warn(
                `[하차완료] [요청 컨테이너 검색 건너뜀] Order: ${order ? order.id : '없음'}, 요청 컨테이너 번호: ${requestContainerNo || '없음'}`
              );
            }

            // 실제 컨테이너 찾기 (actualContainerId가 있으면 ID로 직접 조회, 없으면 containerNo로 검색)
            let actualContainer = null;
            const dtoContainerId = dtoActualContainerIdByLoadingItemId.get(String(loadingItem.id));
            if (dtoContainerId) {
              actualContainer = await this.tradeContainerRepository.findOne({
                where: { id: dtoContainerId },
                relations: ['order'],
              });
              if (actualContainer) {
                this.logger.log(
                  `[하차완료] [실제 컨테이너 - ID로 조회] LoadingItem ID: ${loadingItem.id}, 컨테이너 ID: ${dtoContainerId}, 컨테이너 번호: ${actualContainer.containerNo}, 순번: ${actualContainer.sequence ?? '없음'}`
                );
              } else {
                this.logger.warn(
                  `[하차완료] [실제 컨테이너 - ID로 조회 실패] 컨테이너 ID: ${dtoContainerId}`
                );
              }
            }
            if (!actualContainer && order) {
              this.logger.log(
                `[하차완료] [실제 컨테이너 검색 시작 - 같은 Order 내] Order ID: ${order.id}, 컨테이너 번호: ${actualContainerNo}`
              );
              actualContainer = await this.tradeContainerRepository.findOne({
                where: { 
                  order: { id: order.id },
                  containerNo: actualContainerNo,
                },
                relations: ['order'],
              });
              if (actualContainer) {
                this.logger.log(
                  `[하차완료] [실제 컨테이너 찾음 - 같은 Order 내] 컨테이너 번호: ${actualContainerNo}, 컨테이너 ID: ${actualContainer.id}, Order ID: ${order.id}`
                );
              } else {
                this.logger.log(
                  `[하차완료] [실제 컨테이너 찾기 실패 - 같은 Order 내] 컨테이너 번호: ${actualContainerNo}, Order ID: ${order.id} - 전체에서 검색합니다.`
                );
              }
            } else {
              this.logger.warn(
                `[하차완료] [실제 컨테이너 검색 건너뜀 - Order 없음] Order: 없음, 실제 컨테이너 번호: ${actualContainerNo || '없음'} - 전체에서 검색합니다.`
              );
            }

            // 같은 TradeOrder에서 찾지 못했으면 전체에서 찾기
            if (!actualContainer && actualContainerNo) {
              this.logger.log(
                `[하차완료] [실제 컨테이너 검색 시작 - 전체] 컨테이너 번호: ${actualContainerNo}`
              );
              
              // 같은 Order의 모든 컨테이너 목록 조회 (디버깅용)
              if (order) {
                const allContainersInOrder = await this.tradeContainerRepository.find({
                  where: { 
                    order: { id: order.id },
                  },
                  relations: ['order'],
                  select: ['id', 'containerNo'],
                });
                this.logger.log(
                  `[하차완료] [디버깅 - 같은 Order의 모든 컨테이너] Order ID: ${order.id}, ` +
                  `컨테이너 수: ${allContainersInOrder.length}개, ` +
                  `컨테이너 목록: ${allContainersInOrder.map(c => `${c.containerNo} (ID: ${c.id})`).join(', ') || '없음'}`
                );
              }
              
              actualContainer = await this.tradeContainerRepository.findOne({
                where: { 
                  containerNo: actualContainerNo,
                },
                relations: ['order'],
              });
              if (actualContainer) {
                this.logger.log(
                  `[하차완료] [실제 컨테이너 찾음 - 전체 검색] 컨테이너 번호: ${actualContainerNo}, 컨테이너 ID: ${actualContainer.id}, Order ID: ${actualContainer.order?.id || '없음'}`
                );
              } else {
                this.logger.error(
                  `[하차완료] [실제 컨테이너 찾기 실패 - 전체 검색] 컨테이너 번호: ${actualContainerNo} - 전체 데이터베이스에서도 찾을 수 없습니다. ` +
                  `요청 컨테이너: ${requestContainerNo || '없음'}, Order ID: ${order?.id || '없음'}`
                );
              }
            }

            if (actualContainer) {
              resolvedActualContainerEntity = actualContainer;
              this.logger.log(
                `[하차완료] [판매 관리 - 컨테이너 업데이트 시작] SalesItem ID: ${salesItem.id}, ` +
                `요청 컨테이너: ${requestContainerNo} (ID: ${requestContainerId || '없음'}) → ` +
                `실제 컨테이너: ${actualContainerNo} (ID: ${actualContainer.id}), ` +
                `기존 컨테이너 ID: ${previousContainerId || '없음'}, ` +
                `기존 컨테이너 번호: ${container?.containerNo || '없음'}`
              );
              
              // 업데이트 전 SalesItem의 containerId 확인 및 저장
              const beforeContainerId = salesItem.containerId;
              originalContainerIdBeforeUpdate = beforeContainerId; // 업데이트 전 원본 containerId 저장
              this.logger.log(
                `[하차완료] [판매 관리 - 컨테이너 업데이트 전] SalesItem ID: ${salesItem.id}, 현재 containerId: ${beforeContainerId || '없음'}`
              );
              
              // containerId 및 관계 업데이트 (관계를 actualContainer로 설정해야 save 시 co_id가 null로 나가지 않음)
              salesItem.containerId = actualContainer.id;
              salesItem.container = actualContainer;
              updatedActualContainerNo = actualContainerNo; // 업데이트된 실제 컨테이너 번호 저장
              hasAnyUpdate = true;
              
              this.logger.log(
                `[하차완료] [판매 관리 - 컨테이너 업데이트 완료] SalesItem ID: ${salesItem.id}, ` +
                `containerId: ${beforeContainerId || '없음'} → ${actualContainer.id}, ` +
                `실제 컨테이너 번호: ${actualContainerNo}, 기존 컨테이너 번호: ${container?.containerNo || '없음'}`
              );
              
              // 요청 컨테이너와 실제 컨테이너 모두 재고 상태 업데이트
              if (requestContainerId) {
                containerIdsToUpdate.add(requestContainerId);
                this.logger.log(
                  `[하차완료] [재고 관리] 요청 컨테이너 재고 상태 업데이트 예정 - 컨테이너 번호: ${requestContainerNo}, 컨테이너 ID: ${requestContainerId}`
                );
              }
              containerIdsToUpdate.add(actualContainer.id);
              this.logger.log(
                `[하차완료] [재고 관리] 실제 컨테이너 재고 상태 업데이트 예정 - 컨테이너 번호: ${actualContainerNo}, 컨테이너 ID: ${actualContainer.id}`
              );
              // 기존 컨테이너도 업데이트 (이전에 다른 컨테이너였을 경우)
              if (previousContainerId && previousContainerId !== actualContainer.id && previousContainerId !== requestContainerId) {
                containerIdsToUpdate.add(previousContainerId);
                this.logger.log(
                  `[하차완료] [재고 관리] 기존 컨테이너 재고 상태 업데이트 예정 - 컨테이너 ID: ${previousContainerId}, 컨테이너 번호: ${container?.containerNo || '없음'}`
                );
              }
            } else {
              this.logger.error(
                `[하차완료] [판매 관리 - 컨테이너 업데이트 실패] 실제 컨테이너를 찾을 수 없습니다. ` +
                `컨테이너 번호: ${actualContainerNo}, Order ID: ${order?.id || '없음'}, ` +
                `요청 컨테이너: ${requestContainerNo || '없음'}, 기존 컨테이너 ID: ${previousContainerId || '없음'}`
              );
              // 요청 컨테이너는 재고 상태 업데이트
              if (requestContainerId) {
                containerIdsToUpdate.add(requestContainerId);
                this.logger.log(
                  `[하차완료] [재고 관리] 요청 컨테이너 재고 상태 업데이트 예정 (실제 컨테이너를 찾지 못함) - 컨테이너 번호: ${requestContainerNo}, 컨테이너 ID: ${requestContainerId}`
                );
              }
              if (previousContainerId) {
                containerIdsToUpdate.add(previousContainerId);
                this.logger.log(
                  `[하차완료] [재고 관리] 기존 컨테이너 재고 상태 업데이트 예정 (실제 컨테이너를 찾지 못함) - 컨테이너 ID: ${previousContainerId}, 컨테이너 번호: ${container?.containerNo || '없음'}`
                );
              }
            }
          } else if (actualContainerNo && requestContainerNo && actualContainerNo === requestContainerNo) {
            // 실제와 요청이 동일: SalesItem 변경 없음, 재고만 반영
            this.logger.log(
              `[하차완료] [컨테이너 변경 없음] 요청 컨테이너와 실제 컨테이너가 동일합니다. ` +
              `컨테이너 번호: ${requestContainerNo}, 기존 컨테이너 ID: ${previousContainerId || '없음'}`
            );
            if (previousContainerId) {
              containerIdsToUpdate.add(previousContainerId);
              this.logger.log(
                `[하차완료] [재고 관리] 컨테이너 변경 없음, 기존 컨테이너 재고 상태 업데이트 예정 - 컨테이너 ID: ${previousContainerId}, 컨테이너 번호: ${container?.containerNo || '없음'}`
              );
            }
          } else if (previousContainerId) {
            // 컨테이너가 변경되지 않았어도 재고 상태 업데이트 필요
            this.logger.log(
              `[하차완료] [컨테이너 정보 없음] 요청 또는 실제 컨테이너 정보가 없습니다. ` +
              `요청: ${requestContainerNo || '없음'}, 실제: ${actualContainerNo || '없음'}, ` +
              `기존 컨테이너 ID: ${previousContainerId}, 컨테이너 번호: ${container?.containerNo || '없음'}`
            );
            containerIdsToUpdate.add(previousContainerId);
            this.logger.log(
              `[하차완료] [재고 관리] 컨테이너 변경 없음, 기존 컨테이너 재고 상태 업데이트 예정 - 컨테이너 ID: ${previousContainerId}, 컨테이너 번호: ${container?.containerNo || '없음'}`
            );
          } else {
            this.logger.log(
              `[하차완료] [컨테이너 정보 없음] 요청 컨테이너와 실제 컨테이너가 모두 없습니다. ` +
              `요청: ${requestContainerNo || '없음'}, 실제: ${actualContainerNo || '없음'}, 기존 컨테이너 ID: ${previousContainerId || '없음'}`,
            );
            this.logger.warn(
              `[중량동기화] actualContainerNo 없음 - SalesItem ID=${salesItem.id}. 베일/중량은 아래 블록에서 actual* 있으면 별도 반영함.`,
            );
          }

          // CONTAINER 타입: 실제로 조회된 컨테이너 원장의 베일·중량(MT)으로 판매/상차항목 actual* 동기화 (요청 0 등과 무관하게 차감 일치)
          const typeForCargoSync =
            actualType ?? loadingItem.requestContainerType ?? salesItem.containerType ?? 'CONTAINER';
          let cargoSyncBales = actualBales;
          let cargoSyncWeight = actualWeight;
          if (typeForCargoSync === 'CONTAINER' && resolvedActualContainerEntity) {
            const fromBales = effectiveSalesBalesFromContainer(resolvedActualContainerEntity);
            const wRaw = resolvedActualContainerEntity.weight;
            const fromWeight =
              wRaw != null && String(wRaw).trim() !== '' ? Number(wRaw) : 0;
            cargoSyncBales = fromBales;
            cargoSyncWeight = fromWeight;
            loadingItem.actualBales = fromBales;
            loadingItem.actualWeight = fromWeight;
            this.logger.log(
              `[하차완료] CONTAINER 타입 — 실제 컨테이너(${resolvedActualContainerEntity.containerNo}) 원장 기준 베일·중량 적용: 베일 ${fromBales}, 중량 ${fromWeight} MT`,
            );
          }

          // 베일, 중량, 타입: 실제(actual)가 있으면 판매에 반영 (actualContainer 유무와 무관 - 컨테이너만 바꾼 경우가 아니어도 반영)
          const currentBales = salesItem.cargoBales != null ? parseFloat(salesItem.cargoBales.toString()) : null;
          const currentWeight = salesItem.cargoWeight != null ? parseFloat(salesItem.cargoWeight.toString()) : null;
          const needsBalesUpdate =
            cargoSyncBales !== null &&
            cargoSyncBales !== undefined &&
            (currentBales === null || currentBales !== cargoSyncBales);
          const needsWeightUpdate =
            cargoSyncWeight !== null &&
            cargoSyncWeight !== undefined &&
            (currentWeight === null || currentWeight !== cargoSyncWeight);
          const needsTypeUpdate = actualType && (salesItem.containerType !== actualType);

          this.logger.log(
            `[중량동기화] SalesItem ID=${salesItem.id} needsWeightUpdate=${needsWeightUpdate} (cargoSyncWeight=${cargoSyncWeight ?? 'null'}, currentWeight=${currentWeight ?? 'null'}), needsBalesUpdate=${needsBalesUpdate}, needsTypeUpdate=${needsTypeUpdate}`,
          );
          if (needsBalesUpdate || needsWeightUpdate || needsTypeUpdate) {
            this.logger.log(
              `[하차완료] [판매 관리 - 제품 정보 업데이트] SalesItem ID: ${salesItem.id}, ` +
              `베일: ${currentBales !== null && currentBales !== undefined ? currentBales : '없음'} → ${cargoSyncBales !== null && cargoSyncBales !== undefined ? cargoSyncBales : '없음'}, ` +
              `중량: ${currentWeight !== null && currentWeight !== undefined ? currentWeight : '없음'} → ${cargoSyncWeight !== null && cargoSyncWeight !== undefined ? cargoSyncWeight : '없음'}, ` +
              `타입: ${salesItem.containerType || '없음'} → ${actualType || '없음'}`
            );
            if (needsBalesUpdate) {
              salesItem.cargoBales = cargoSyncBales!.toString();
              this.logger.log(
                `[하차완료] [판매 관리 - 베일 업데이트] SalesItem ID: ${salesItem.id}, 베일: ${salesItem.cargoBales || '없음'} → ${cargoSyncBales}`
              );
            }
            if (needsWeightUpdate) {
              salesItem.cargoWeight = cargoSyncWeight!.toString();
              this.logger.log(
                `[하차완료] [판매 관리 - 중량 업데이트] SalesItem ID: ${salesItem.id}, 중량: ${salesItem.cargoWeight || '없음'} → ${cargoSyncWeight}`
              );
            }
            if (needsTypeUpdate) {
              salesItem.containerType = actualType!;
              this.logger.log(
                `[하차완료] [판매 관리 - 타입 업데이트] SalesItem ID: ${salesItem.id}, 타입: ${salesItem.containerType || '없음'} → ${actualType}`
              );
            }
            hasAnyUpdate = true;
          } else {
            this.logger.log(
              `[하차완료] [판매 관리 - 제품 정보] 요청 정보와 실제 정보가 동일하여 업데이트하지 않음 - SalesItem ID: ${salesItem.id}`
            );
          }

          // 업데이트가 있을 때만 SalesItem 저장
          if (hasAnyUpdate) {
            // 업데이트 전 원본 containerId 사용 (업데이트 후가 아닌 업데이트 전 값)
            const beforeSaveContainerId = originalContainerIdBeforeUpdate || salesItem.containerId;
            // 실제 컨테이너가 업데이트된 경우 updatedActualContainerNo 사용, 아니면 기존 container 번호 사용
            const beforeSaveContainerNo = updatedActualContainerNo || container?.containerNo;
            const beforeSaveType = salesItem.containerType;
            const beforeSaveBales = currentBales;
            const beforeSaveWeight = currentWeight;

            this.logger.log(
              `[하차완료] [판매 관리 - SalesItem 저장 전] SalesItem ID: ${salesItem.id}, ` +
              `containerId: ${beforeSaveContainerId || '없음'}, 컨테이너 번호: ${beforeSaveContainerNo || '없음'}, ` +
              `베일: ${salesItem.cargoBales || '없음'}, 중량: ${salesItem.cargoWeight || '없음'}, 타입: ${beforeSaveType || '없음'}`
            );
            
            // update() 메서드를 사용하여 직접 업데이트 (관계 충돌 방지)
            const updateData: any = {};
            if (beforeSaveContainerId !== salesItem.containerId) {
              updateData.containerId = salesItem.containerId;
              this.logger.log(
                `[하차완료] [판매 관리 - SalesItem containerId 업데이트] SalesItem ID: ${salesItem.id}, ` +
                `containerId: ${beforeSaveContainerId || '없음'} → ${salesItem.containerId || '없음'}`
              );
            }
            // 베일/중량은 위에서 이미 salesItem에 반영했으므로, 변경된 경우 반드시 updateData에 포함 (비교로는 누락됨)
            if (needsBalesUpdate && salesItem.cargoBales != null) updateData.cargoBales = salesItem.cargoBales;
            if (needsWeightUpdate && salesItem.cargoWeight != null) updateData.cargoWeight = salesItem.cargoWeight;
            if (beforeSaveType !== salesItem.containerType) updateData.containerType = salesItem.containerType;
            
            if (Object.keys(updateData).length > 0) {
              // uk_sales_item_sales_container: (salesId, containerId) 유일. 컨테이너 변경 시 같은 판매에서 이미 그 컨테이너를 쓰는 취소 항목이 있으면 유니크 위반 → 해당 취소 항목을 같은 Order의 다른 컨테이너로 옮겨 (salesId, 목적 containerId) 자리 확보
              const newContainerId = updateData.containerId;
              if (newContainerId != null && String(newContainerId) !== String(beforeSaveContainerId)) {
                const conflict = await this.salesItemRepository.findOne({
                  where: {
                    salesId: delivery.salesId,
                    containerId: newContainerId,
                    status: 'SALES_ITEM_CANCELLED',
                  },
                  select: ['id', 'containerId'],
                });
                if (conflict && String(conflict.id) !== String(salesItem.id) && order) {
                  const orderContainers = await this.tradeContainerRepository.find({
                    where: { order: { id: order.id } },
                    select: ['id'],
                  });
                  const avoidIds = new Set([String(newContainerId), String(beforeSaveContainerId)].filter(Boolean));
                  const alternateContainerId = orderContainers.find((c) => !avoidIds.has(String(c.id)))?.id;
                  if (alternateContainerId) {
                    this.logger.log(
                      `[하차완료] [uk_sales_item_sales_container] 취소 항목이 목적 컨테이너 사용 중 - SalesItem ID: ${conflict.id}, containerId: ${conflict.containerId} → ${alternateContainerId}(동일 Order)로 변경하여 유니크 해제`,
                    );
                    await this.salesItemRepository.update(
                      { id: conflict.id, salesId: delivery.salesId },
                      { containerId: alternateContainerId },
                    );
                  } else {
                    this.logger.warn(
                      `[하차완료] [uk_sales_item_sales_container] 동일 Order에 목적/기존 외 컨테이너 없음 - SalesItem ID: ${conflict.id}, 목적: ${newContainerId}, 기존: ${beforeSaveContainerId}. 유니크 위반 가능.`,
                    );
                  }
                }
              }
              this.logger.log(
                `[하차완료] [판매 관리 - SalesItem 업데이트 실행] SalesItem ID: ${salesItem.id}, ` +
                `업데이트할 필드: ${Object.keys(updateData).join(', ')}`,
              );
              this.logger.log(
                `[중량동기화] SalesItem DB 업데이트 호출 - id=${salesItem.id}, cargoWeight=${updateData.cargoWeight ?? '(미포함)'}`,
              );
              await this.salesItemRepository.update(salesItem.id, updateData);
            } else {
              // 업데이트할 필드가 없으면 save() 사용
              await this.salesItemRepository.save(salesItem);
            }
            
            // 저장 후 다시 조회하여 실제로 업데이트되었는지 확인
            const savedSalesItem = await this.salesItemRepository.findOne({
              where: { id: salesItem.id },
              relations: ['container'],
            });
            
            if (savedSalesItem) {
              const savedContainer = savedSalesItem.container;
              this.logger.log(
                `[하차완료] [판매 관리 - SalesItem 저장 후 확인] SalesItem ID: ${savedSalesItem.id}, ` +
                `containerId: ${savedSalesItem.containerId || '없음'} (변경 전: ${beforeSaveContainerId || '없음'}), ` +
                `컨테이너 번호: ${savedContainer?.containerNo || '없음'} (변경 전: ${beforeSaveContainerNo || '없음'}), ` +
                `베일: ${savedSalesItem.cargoBales || '없음'} (변경 전: ${beforeSaveBales || '없음'}), ` +
                `중량: ${savedSalesItem.cargoWeight || '없음'} (변경 전: ${beforeSaveWeight || '없음'}), ` +
                `타입: ${savedSalesItem.containerType || '없음'} (변경 전: ${beforeSaveType || '없음'})`
              );
              
              // 컨테이너 ID 변경 여부 확인 (실제로 바꾸려 했는데 반영 안 됐을 때만 WARN)
              if (beforeSaveContainerId !== savedSalesItem.containerId) {
                this.logger.log(
                  `[하차완료] [판매 관리 - 컨테이너 ID 변경 확인] SalesItem ID: ${savedSalesItem.id}, ` +
                  `containerId 변경됨: ${beforeSaveContainerId || '없음'} → ${savedSalesItem.containerId || '없음'}`
                );
              } else if (updateData.containerId != null && savedSalesItem.containerId === beforeSaveContainerId) {
                this.logger.warn(
                  `[하차완료] [판매 관리 - 컨테이너 ID 변경 없음] SalesItem ID: ${savedSalesItem.id}, ` +
                  `containerId 변경 예상했으나 저장 후에도 동일: ${beforeSaveContainerId}`
                );
              }
              
              // 컨테이너 번호 변경 여부 확인 (실제로 바꾸려 했는데 반영 안 됐을 때만 WARN)
              if (beforeSaveContainerNo !== savedContainer?.containerNo) {
                this.logger.log(
                  `[하차완료] [판매 관리 - 컨테이너 번호 변경 확인] SalesItem ID: ${savedSalesItem.id}, ` +
                  `컨테이너 번호 변경됨: ${beforeSaveContainerNo || '없음'} → ${savedContainer?.containerNo || '없음'}`
                );
              } else if (updateData.containerId != null && savedContainer?.containerNo && beforeSaveContainerNo === savedContainer.containerNo) {
                this.logger.warn(
                  `[하차완료] [판매 관리 - 컨테이너 번호 변경 없음] SalesItem ID: ${savedSalesItem.id}, ` +
                  `컨테이너 번호 변경 예상했으나 저장 후에도 동일: ${beforeSaveContainerNo}`
                );
              }
            } else {
              this.logger.error(
                `[하차완료] [판매 관리 - SalesItem 저장 후 확인 실패] SalesItem ID: ${salesItem.id} - 저장 후 조회 실패`
              );
            }
          } else {
            this.logger.log(
              `[하차완료] [판매 관리 - SalesItem] 업데이트할 내용이 없어 저장하지 않음 - SalesItem ID: ${salesItem.id}`
            );
          }

          // 실제 정보가 판매에 반영되었으므로 요청(request*)을 실제(actual*)와 동기화 → 화면에서 요청=적용된 실제로 표시
          const hasActual = (loadingItem.actualBL != null && loadingItem.actualBL !== '') ||
            (loadingItem.actualContainer != null && loadingItem.actualContainer !== '') ||
            (loadingItem.actualBales != null) ||
            (loadingItem.actualWeight != null);
          if (hasActual) {
            loadingItem.requestBL = loadingItem.actualBL ?? loadingItem.requestBL;
            loadingItem.requestContainer = loadingItem.actualContainer ?? loadingItem.requestContainer;
            loadingItem.requestContainerType = loadingItem.actualContainerType ?? loadingItem.requestContainerType;
            loadingItem.requestBales = loadingItem.actualBales ?? loadingItem.requestBales;
            loadingItem.requestWeight = loadingItem.actualWeight ?? loadingItem.requestWeight;
            await this.loadingItemRepository.save(loadingItem);
            this.logger.log(
              `[하차완료] [요청 정보 동기화] LoadingItem ID: ${loadingItem.id} - 요청을 실제 반영값으로 업데이트함 (BL/컨테이너/베일/중량)`,
            );
          }
          
          this.logger.log(`[하차완료] ========== 상차 항목 처리 완료 - LoadingItem ID: ${loadingItem.id} ==========`);
        }

        // 판매 항목 상태: 하차 제외된 항목만 취소, 나머지 해당 판매(sales)의 모든 항목은 판매완료
        // → 하차완료 = 이 배송이 끝난 것 = 해당 판매는 전부 판매완료로 처리 (하차 제외한 것만 취소)
        let appliedSalesItemIds = new Set(
          loadingItemsToApply.map((li) => String(li.salesItemId)).filter(Boolean),
        );
        createdSalesItemIdsByAddContainer.forEach((id) => appliedSalesItemIds.add(id));
        // 상차완료 후 다시 하차완료 시 actual*이 상차 저장 시 null로 덮어써져 loadingItemsToApply가 비었을 수 있음 → 남은 상차 항목 전부 판매완료 대상으로 처리
        if (appliedSalesItemIds.size === 0 && loadingItemsWithRelations.length > 0) {
          loadingItemsWithRelations.forEach((li) => {
            if (li.salesItemId) appliedSalesItemIds.add(String(li.salesItemId));
          });
          this.logger.log(
            `[하차완료] actual 반영 대상 0건이어서 상차 항목 전부 판매완료 대상으로 처리 - SalesItem ID: ${Array.from(appliedSalesItemIds).join(', ')}`,
          );
        }
        const removedLoadingItems = loadingItemsWithRelations.filter(
          (li) =>
            li.salesItemId &&
            !appliedSalesItemIds.has(String(li.salesItemId)) &&
            (li.actualBL == null) &&
            (li.actualContainer == null) &&
            (li.actualBales == null) &&
            (li.actualWeight == null),
        );
        // orphan: 이 배송에 LoadingItem이 없는 SalesItem (상차완료 복구 버그로 복구되었다가 재하차완료 시 정리 대상)
        const salesItemIdsInLoading = new Set(
          loadingItemsWithRelations.map((li) => String(li.salesItemId)).filter(Boolean),
        );
        const orphanSalesItems = await this.salesItemRepository.find({
          where: { salesId: delivery.salesId, status: Not('SALES_ITEM_CANCELLED') },
          select: ['id'],
        });
        const orphanIds = orphanSalesItems
          .map((si) => String(si.id))
          .filter((id) => id && !salesItemIdsInLoading.has(id));
        if (orphanIds.length > 0) {
          this.logger.log(
            `[하차완료-행삭제] orphan SalesItem 감지 (이 배송에 LoadingItem 없음): [${orphanIds.join(', ')}] → 취소 대상에 포함`,
          );
        }
        const removedSalesItemIds = [
          ...removedLoadingItems.map((li) => String(li.salesItemId)),
          ...salesItemIdsFromRemovedLoadingItems,
          ...orphanIds,
        ]
          .filter((id) => id && !appliedSalesItemIds.has(id));

        this.logger.log(
          `[하차완료-행삭제] 판매 항목 취소 계산 - appliedSalesItemIds: [${Array.from(appliedSalesItemIds).join(', ')}], ` +
          `removedLoadingItems(actual null): ${removedLoadingItems.map((li) => `li.id=${li.id}, salesItemId=${li.salesItemId}`).join('; ') || '(없음)'}, ` +
          `salesItemIdsFromRemovedLoadingItems: [${salesItemIdsFromRemovedLoadingItems.join(', ')}], ` +
          `removedSalesItemIds(최종 취소 대상): [${removedSalesItemIds.join(', ')}]`,
        );

        if (removedSalesItemIds.length > 0) {
          this.logger.log(
            `[하차완료] [판매 관리 - 행 삭제 반영] 하차 제외된 SalesItem ${removedSalesItemIds.length}건을 취소합니다. ID: ${removedSalesItemIds.join(', ')}`,
          );
          this.logger.log(
            `[하차완료-행삭제] [판매관리] SalesItem 취소 실행 - 판매 ID: ${delivery.salesId}, 취소 대상 ID: [${removedSalesItemIds.join(', ')}]`,
          );
          const cancelResult = await this.salesItemRepository.update(
            { id: In(removedSalesItemIds), salesId: delivery.salesId },
            { status: 'SALES_ITEM_CANCELLED' },
          );
          this.logger.log(
            `[하차완료-행삭제] [판매관리] SalesItem 취소 완료 - 요청: ${removedSalesItemIds.length}건, affected: ${cancelResult?.affected ?? '?'} (1이면 정상 반영)`,
          );
          // 취소된 SalesItem에 연결된 컨테이너 재고도 재계산 (하차 제외 시 해당 컨테이너 반영 감소)
          const removedSalesItems = await this.salesItemRepository.find({
            where: { id: In(removedSalesItemIds) },
            select: ['id', 'containerId'],
          });
          removedSalesItems.forEach((si) => {
            if (si.containerId) containerIdsToUpdate.add(si.containerId);
          });
        } else {
          this.logger.log(
            `[하차완료-행삭제] [판매관리] 취소 대상 없음 - removedSalesItemIds 비어있음 (salesItemIdsFromRemovedLoadingItems: [${salesItemIdsFromRemovedLoadingItems.join(', ')}])`,
          );
        }
        // 해당 판매(sales)의 모든 SalesItem 중 취소 제외 → 전부 판매완료 (하차완료 = 판매 완료)
        const removedSet = new Set(removedSalesItemIds);
        const allSalesItemIds = await this.salesItemRepository.find({
          where: { sales: { id: delivery.salesId } },
          select: ['id'],
        });
        const completedIds = allSalesItemIds
          .map((si) => String(si.id))
          .filter((id) => id && !removedSet.has(id));
        this.logger.log(
          `[하차완료 체크] 판매 항목 상태 계산 - 판매 ID ${delivery.salesId} 전체 SalesItem: ${allSalesItemIds.length}개, 취소 제외 후 판매완료 대상: ${completedIds.length}개, ID: ${completedIds.join(', ') || '(없음)'}`,
        );
        if (completedIds.length === 0) {
          this.logger.log(
            `[하차완료 디버그] ★ 판매관리 상태 변경 없음 - 판매완료 대상 SalesItem이 0건 (전체: ${allSalesItemIds.length}개, 취소: ${removedSalesItemIds.length}개)`,
          );
        }
        if (completedIds.length > 0) {
          this.logger.log(
            `[하차완료 디버그] ★ 판매관리 상태 변경 실행 - 판매 ID ${delivery.salesId}의 SalesItem ${completedIds.length}건 → SALES_ITEM_COMPLETED`,
          );
          this.logger.log(
            `[하차완료] [판매 관리 - 상태 업데이트] 판매 ID ${delivery.salesId}의 판매 항목 ${completedIds.length}건을 판매완료로 변경합니다. ID: ${completedIds.join(', ')}`,
          );
          const completeResult = await this.salesItemRepository.update(
            { id: In(completedIds), salesId: delivery.salesId },
            { status: 'SALES_ITEM_COMPLETED' },
          );
          this.logger.log(
            `[하차완료 디버그] ★ 판매관리 상태 변경 완료 - affected: ${completeResult?.affected ?? '?'}건`,
          );
          this.logger.log(
            `[하차완료 체크] SalesItem 판매완료(SALES_ITEM_COMPLETED) update 실행 - 요청: ${completedIds.length}건, 실제 반영(affected): ${completeResult?.affected ?? '?'}`,
          );
        }
        this.logger.log(
          `[하차완료] [판매 관리 - 상태 업데이트 완료] 판매 ID ${delivery.salesId} - 판매완료: ${completedIds.length}건, 취소(하차제외): ${removedSalesItemIds.length}건`,
        );

        // 관련 컨테이너들의 재고 상태 업데이트
        if (containerIdsToUpdate.size > 0) {
          this.logger.log(
            `[하차완료] [재고 관리] 재고 상태를 업데이트할 컨테이너 수: ${containerIdsToUpdate.size}개, 컨테이너 ID 목록: ${Array.from(containerIdsToUpdate).join(', ')}`
          );
          for (const containerId of containerIdsToUpdate) {
            const container = await this.tradeContainerRepository.findOne({
              where: { id: containerId },
              select: ['id', 'containerNo'],
            });
            this.logger.log(
              `[하차완료] [재고 관리] 컨테이너 재고 상태 업데이트 시작 - 컨테이너 ID: ${containerId}, 컨테이너 번호: ${container?.containerNo || '없음'}`
            );
            await this.updateContainerInventoryStatus(containerId);
            this.logger.log(
              `[하차완료] [재고 관리] 컨테이너 재고 상태 업데이트 완료 - 컨테이너 ID: ${containerId}, 컨테이너 번호: ${container?.containerNo || '없음'}`
            );
          }
          this.logger.log(
            `[하차완료] [재고 관리] 판매 ID ${delivery.salesId}의 관련 컨테이너 ${containerIdsToUpdate.size}개의 재고 상태를 모두 업데이트했습니다.`
          );
        } else {
          // 컨테이너가 변경되지 않은 경우에도 기존 컨테이너들의 재고 상태 업데이트
          this.logger.log(
            `[하차완료] [재고 관리] 컨테이너 변경이 없어 기존 컨테이너들의 재고 상태를 업데이트합니다.`
          );
          const salesItems = await this.salesItemRepository.find({
            where: { sales: { id: delivery.salesId } },
            relations: ['container'],
          });

          const containerIds = new Set<string>();
          salesItems.forEach((item) => {
            if (item.containerId) {
              containerIds.add(item.containerId);
            }
          });

          this.logger.log(
            `[하차완료] [재고 관리] 재고 상태를 업데이트할 컨테이너 수: ${containerIds.size}개, 컨테이너 ID 목록: ${Array.from(containerIds).join(', ')}`
          );

          for (const containerId of containerIds) {
            const container = await this.tradeContainerRepository.findOne({
              where: { id: containerId },
              select: ['id', 'containerNo'],
            });
            this.logger.log(
              `[하차완료] [재고 관리] 컨테이너 재고 상태 업데이트 시작 - 컨테이너 ID: ${containerId}, 컨테이너 번호: ${container?.containerNo || '없음'}`
            );
            await this.updateContainerInventoryStatus(containerId);
            this.logger.log(
              `[하차완료] [재고 관리] 컨테이너 재고 상태 업데이트 완료 - 컨테이너 ID: ${containerId}, 컨테이너 번호: ${container?.containerNo || '없음'}`
            );
          }

          this.logger.log(
            `[하차완료] [재고 관리] 판매 ID ${delivery.salesId}의 관련 컨테이너 ${containerIds.size}개의 재고 상태를 모두 업데이트했습니다.`
          );
        }
        
        this.logger.log(`[하차완료] 하차완료 상태 변경 처리 완료 - 배송 ID: ${id}, 판매 ID: ${delivery.salesId}`);
        // [판매1055 디버그] 하차완료 후 해당 판매의 SalesItem 최종 개수 (취소 제외)
        const finalSalesItems = await this.salesItemRepository.find({
          where: { salesId: delivery.salesId, status: Not('SALES_ITEM_CANCELLED') },
          select: ['id', 'status', 'containerId'],
          relations: ['container'],
        });
        this.logger.log(
          `[판매1055 디버그] 하차완료 완료 - 판매 ID: ${delivery.salesId}, SalesItem(취소제외) ${finalSalesItems.length}개: [${finalSalesItems.map((si) => `id=${si.id},status=${si.status},containerNo=${si.container?.containerNo ?? 'null'}`).join('; ')}]`,
        );
        this.logger.log(
          `[하차완료 체크] 상차완료→하차완료 처리 끝 - 배송 ID: ${id}, 판매 ID: ${delivery.salesId}, 이전상태: ${previousStatus} → UNLOADING_COMPLETED (판매 항목 SALES_ITEM_COMPLETED 반영됨 → 거래명세서 관리 발행대기·판매항목선택 목록 노출 대상)`,
        );

        // 판매(Sales) 상태 및 거래명세서 상태 자동 설정
        try {
          this.logger.log(
            `[하차완료→판매상태] 판매 상태·거래명세서 반영 시작 - 판매 ID: ${delivery.salesId}, 배송 ID: ${id}`,
          );
          const sales = await this.salesRepository.findOne({
            where: { id: delivery.salesId },
          });

          if (sales) {
            let needsSave = false;

            // 1. 판매 전체 상태(sa_status) → COMPLETED (판매 상세 화면에서 "판매완료" 표시)
            const previousSalesStatus = sales.status;
            if (previousSalesStatus !== 'COMPLETED') {
              sales.status = 'COMPLETED';
              needsSave = true;
              this.logger.log(
                `[하차완료→판매상태] sa_status 업데이트 - 판매 ID: ${delivery.salesId}, 기존: ${previousSalesStatus ?? 'NULL'} → COMPLETED`,
              );
            }

            // 2. invoiceStatus가 NULL이거나 PENDING_ISSUE가 아닌 경우에만 설정 (이미 ISSUED인 경우는 건너뜀)
            const currentInvoiceStatus = sales.invoiceStatus;
            if (currentInvoiceStatus !== 'ISSUED') {
              if (!currentInvoiceStatus || currentInvoiceStatus !== 'PENDING_ISSUE') {
                sales.invoiceStatus = 'PENDING_ISSUE';
                needsSave = true;
                this.logger.log(
                  `[하차완료→발행대기] 적용됨 - 판매 ID: ${delivery.salesId}, 기존: ${currentInvoiceStatus ?? 'NULL'} → PENDING_ISSUE`,
                );
              } else {
                this.logger.log(
                  `[하차완료→발행대기] 이미 발행대기 - 판매 ID: ${delivery.salesId} (이미 PENDING_ISSUE)`,
                );
              }
            } else {
              this.logger.log(`[하차완료→발행대기] 건너뜀 - 판매 ID: ${delivery.salesId} 이미 발행완료(ISSUED)`);
            }

            if (needsSave) {
              await this.salesRepository.save(sales);
              this.logger.log(
                `[하차완료→판매상태] Sales 저장 완료 - 판매 ID: ${delivery.salesId} (sa_status: COMPLETED, invoiceStatus 반영)`,
              );
            }
          } else {
            this.logger.warn(`[하차완료→판매상태] 건너뜀 - 판매 없음, 판매 ID: ${delivery.salesId}`);
          }
        } catch (error) {
          this.logger.error(
            `[하차완료] 판매 상태·거래명세서 설정 중 오류: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error.stack : undefined
          );
          // 판매 상태 설정 실패해도 배송 상태 업데이트는 계속 진행
        }
      } catch (error) {
        this.logger.error(
          `[하차완료] 판매 ID ${delivery.salesId}의 판매 항목 상태 및 재고 상태 업데이트 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined
        );
        // 판매 항목 상태 업데이트 실패해도 배송 상태 업데이트는 계속 진행
      }
    }

    await this.syncUnloadingFromDeliveryDtoToSalesAndCustomer(delivery.salesId, dto);

    // 관계를 포함한 최신 데이터를 다시 조회
    const updatedDelivery = await this.findOne(id);
    const newDataJson = this.deliveryToJson(updatedDelivery);
    await this.featureAuditLogService.create({
      domain: 'SALES',
      feature: 'TRANSPORT',
      action: 'UPDATED',
      userId: userId ?? null,
      summary: previousStatus !== updatedDelivery.status ? `배송 #${id} 상태 변경 ${previousStatus} → ${updatedDelivery.status}` : `배송 #${id} 수정`,
      entityType: 'sales_delivery',
      entityId: parseInt(id, 10) || undefined,
      payload: { deliveryId: id, previousStatus, newStatus: updatedDelivery.status },
      oldData: oldDataJson as Record<string, unknown>,
      newData: newDataJson as Record<string, unknown>,
    }).catch((err) => this.logger.warn('[기능이력] 배송 수정 로그 저장 실패', err));
    return updatedDelivery;
  }

  async remove(id: string, userId?: number) {
    this.logger.log(`[REMOVE] 배송 삭제 시작 - ID: ${id}`);
    const delivery = await this.findOne(id);

    const oldDataJson = this.deliveryToJson(delivery);

    // Soft delete
    delivery.deletedAt = new Date();
    delivery.deletedBy = userId || null;
    await this.salesDeliveryRepository.save(delivery);

    await this.featureAuditLogService.create({
      domain: 'SALES',
      feature: 'TRANSPORT',
      action: 'DELETED',
      userId: userId ?? null,
      summary: `배송 삭제 #${id}`,
      entityType: 'sales_delivery',
      entityId: parseInt(id, 10) || undefined,
      payload: { deliveryId: id },
      oldData: oldDataJson as Record<string, unknown>,
    }).catch((err) => this.logger.warn('[기능이력] 배송 삭제 로그 저장 실패', err));

    this.logger.log(`[REMOVE] 배송 삭제 완료 - ID: ${id}`);
    return { success: true, message: '배송 정보가 삭제되었습니다.' };
  }

  /** 판매 ID로 배송 1건 조회 (트랜잭션 내부에서 사용 시 manager 전달) */
  async findOneBySalesId(salesId: string, manager?: any): Promise<SalesDelivery | null> {
    const repo = manager ? manager.getRepository(SalesDelivery) : this.salesDeliveryRepository;
    return repo.findOne({
      where: { salesId, deletedAt: IsNull() },
      relations: ['loadingItems'],
    });
  }

  /** 판매 예약으로 변경 시 해당 배송 소프트 삭제 (트랜잭션 내부에서 사용) */
  async softDeleteBySalesId(salesId: string, userId: number | undefined, manager?: any): Promise<void> {
    const repo = manager ? manager.getRepository(SalesDelivery) : this.salesDeliveryRepository;
    const delivery = await repo.findOne({ where: { salesId } });
    if (!delivery) return;
    delivery.deletedAt = new Date();
    delivery.deletedBy = userId || null;
    await repo.save(delivery);
    this.logger.log(`[softDeleteBySalesId] 판매 예약 변경 - 배송 소프트 삭제 완료 salesId: ${salesId}, deliveryId: ${delivery.id}`);
  }

  /**
   * 판매에서 배송 자동 생성
   * 판매 항목 중 SALES_ITEM_SOLD(판매), SALES_ITEM_COMPLETED(판매완료), SALES_ITEM_RESERVED(판매예약=입고예정) 중 하나라도 있으면 배송 생성
   */
  async createFromSales(sales: Sales, salesItems: any[], userId?: number, manager?: any): Promise<SalesDelivery | null> {
    this.logger.log(`[createFromSales] 호출됨 - 판매 ID: ${sales.id}, 판매 항목 수: ${salesItems.length}`);
    
    // 판매 항목 중 판매 상태인 항목이 있는지 확인
    const itemStatuses = salesItems.map(item => ({ id: item.id, status: item.status, containerId: item.containerId }));
    this.logger.log(`[createFromSales] 판매 항목 상태 목록: ${JSON.stringify(itemStatuses)}`);
    
    const hasSoldItems = salesItems.some(
      (item) =>
        item.status === 'SALES_ITEM_SOLD' ||
        item.status === 'SALES_ITEM_COMPLETED' ||
        item.status === 'SALES_ITEM_RESERVED',
    );

    if (!hasSoldItems) {
      this.logger.log(
        `[createFromSales] 판매 ID ${sales.id}에는 판매/판매완료/판매예약 상태인 항목이 없어 배송을 생성하지 않습니다. (판매 항목 상태: ${salesItems.map((i) => i.status).join(', ')})`,
      );
      return null;
    }

    // 이미 배송이 있는지 확인 (트랜잭션 내부에서는 manager 사용)
    const deliveryRepository = manager ? manager.getRepository(SalesDelivery) : this.salesDeliveryRepository;
    const loadingItemRepository = manager ? manager.getRepository(SalesDeliveryLoadingItem) : this.loadingItemRepository;
    const existingDelivery = await deliveryRepository.findOne({
      where: { salesId: sales.id },
      relations: ['loadingItems'],
    });

    // 판매 정보 조회 (고객 정보 포함) - 트랜잭션 내부에서 실행될 수 있으므로 manager 사용
    let salesWithCustomer = sales;
    if (!sales.customer) {
      const salesRepository = manager ? manager.getRepository(Sales) : this.salesRepository;
      salesWithCustomer = await salesRepository.findOne({
        where: { id: sales.id },
        relations: ['customer', 'customer.regionEntity', 'customer.cityEntity'],
      });
    }

    if (!salesWithCustomer || !salesWithCustomer.customer) {
      this.logger.warn(`[createFromSales] 판매 ID ${sales.id}의 고객 정보를 찾을 수 없습니다.`);
      this.logger.warn(`[createFromSales] sales 객체: ${JSON.stringify({ id: sales.id, customerId: sales.customerId, hasCustomer: !!sales.customer })}`);
      return null;
    }

    const customer = salesWithCustomer.customer;

    let savedDelivery: SalesDelivery;
    
    if (existingDelivery) {
      this.logger.log(`[createFromSales] 판매 ID ${sales.id}에는 이미 배송이 존재합니다. loadingItems 동기화 시작.`);
      savedDelivery = existingDelivery;

      // 판매예약 → 판매 전환 시: 소프트 삭제된 배송 복원 (운송관리 목록에 다시 노출)
      if (existingDelivery.deletedAt != null) {
        existingDelivery.deletedAt = null;
        existingDelivery.deletedBy = null;
        await deliveryRepository.save(existingDelivery);
        this.logger.log(`[createFromSales] 소프트 삭제된 배송 복원 - salesId: ${sales.id}, deliveryId: ${existingDelivery.id}`);
      }

      // 기존 loadingItems 삭제 (판매 항목 변경에 맞춰 재생성하기 위해)
      if (existingDelivery.loadingItems && existingDelivery.loadingItems.length > 0) {
        await loadingItemRepository.remove(existingDelivery.loadingItems);
        this.logger.log(`[createFromSales] 기존 loadingItems ${existingDelivery.loadingItems.length}개 삭제 완료`);
      }
    } else {
      this.logger.log(`[createFromSales] 판매 ID ${sales.id}에서 배송 자동 생성 시작`);

      // 하차지 주소 우선순위: Sales의 하차지 주소 > Customer의 주소
      // Sales 엔티티의 하차지 주소 정보 사용
      let unloadingPostalCode = salesWithCustomer.unloadingPostalCode || customer?.postalCode || null;
      let unloadingAddress = salesWithCustomer.unloadingAddress || customer?.address || null;
      let unloadingAddressDetail = salesWithCustomer.unloadingAddressDetail || customer?.addressDetail || null;
      let unloadingRegionId: number | null = null;
      let unloadingCityId: number | null = null;

      // Region ID 찾기 (Sales의 unloadingRegion이 있으면 우선 사용)
      if (salesWithCustomer.unloadingRegion) {
        const regionRepository = manager ? manager.getRepository(Region) : this.regionRepository;
        const region = await regionRepository.findOne({
          where: { name: salesWithCustomer.unloadingRegion },
        });
        if (region) {
          unloadingRegionId = region.id;
        }
      }
      
      // Region ID를 찾지 못했으면 Customer의 regionId 사용
      if (!unloadingRegionId && customer?.regionId) {
        unloadingRegionId = parseInt(customer.regionId.toString());
      }

      // City ID 찾기 (Sales의 unloadingCity가 있고 Region ID가 있으면 조회)
      if (salesWithCustomer.unloadingCity && unloadingRegionId) {
        const cityRepository = manager ? manager.getRepository(City) : this.cityRepository;
        const city = await cityRepository.findOne({
          where: {
            name: salesWithCustomer.unloadingCity,
            regionId: unloadingRegionId,
          },
        });
        if (city) {
          unloadingCityId = city.id;
        }
      }
      
      // City ID를 찾지 못했으면 Customer의 cityId 사용
      if (!unloadingCityId && customer?.cityId) {
        unloadingCityId = parseInt(customer.cityId.toString());
      }

      // 배송 생성 (트랜잭션 내부에서는 manager 사용)
      // 하차지 정보: Sales의 하차지 주소 우선, 없으면 Customer 주소 사용
      const delivery = deliveryRepository.create({
        salesId: sales.id,
        status: 'PENDING_DISPATCH',
        unloadingPostalCode,
        unloadingAddress,
        unloadingAddressDetail,
        unloadingRegionId,
        unloadingCityId,
        createdBy: userId || null,
      });

      savedDelivery = await deliveryRepository.save(delivery);
    }

    // 상차 항목 생성 (각 SalesItem마다 개별 상차 항목 생성)
    const salesItemRepository = manager ? manager.getRepository(SalesItem) : this.salesItemRepository;
    
    // 판매(SOLD), 판매완료(COMPLETED), 판매예약(RESERVED=입고예정) 항목을 상차 항목으로 생성 (취소 제외, 수정 시 항목 수 일치)
    const soldItems = salesItems.filter(
      (item) =>
        item.status === 'SALES_ITEM_SOLD' ||
        item.status === 'SALES_ITEM_COMPLETED' ||
        item.status === 'SALES_ITEM_RESERVED',
    );
    
    // 각 SalesItem마다 개별 상차 항목 생성
    const loadingItems = await Promise.all(soldItems.map(async (salesItem, index) => {
      // SalesItem을 container와 order 관계를 포함하여 조회 (요청 정보 초기화용)
      let salesItemWithRelations = salesItem;
      if (!salesItem.container || !salesItem.container?.order) {
        const foundItem = await salesItemRepository.findOne({
          where: { id: salesItem.id },
          relations: ['container', 'container.order'],
        });
        if (foundItem) {
          salesItemWithRelations = foundItem;
        }
      }

      const container = salesItemWithRelations.container;
      const order = container?.order;
      
      // 요청 정보 초기화 (SalesItem의 현재 정보를 요청 정보로 저장)
      const requestBL = order?.bl || null;
      const requestContainer = container?.containerNo || null;
      const requestContainerType = salesItemWithRelations.containerType || null;
      const requestBales = salesItemWithRelations.cargoBales ? parseFloat(salesItemWithRelations.cargoBales.toString()) : null;
      const requestWeight = salesItemWithRelations.cargoWeight ? parseFloat(salesItemWithRelations.cargoWeight.toString()) : null;

      // 상차 항목 생성 (요청 정보 포함)
      return loadingItemRepository.create({
        salesDeliveryId: savedDelivery.id,
        salesItemId: salesItem.id, // SalesItem 참조
        // 요청 정보 초기화
        requestBL,
        requestContainer,
        requestContainerType,
        requestBales,
        requestWeight,
        status: 'PENDING',
        order: index + 1,
      });
    }));

    // 상차 항목 저장
    if (loadingItems.length > 0) {
      await loadingItemRepository.save(loadingItems);
      this.logger.log(`[createFromSales] 상차 항목 ${loadingItems.length}개 생성 완료`);
    } else {
      this.logger.warn(`[createFromSales] 생성할 상차 항목이 없습니다.`);
    }

    if (existingDelivery) {
      this.logger.log(`[createFromSales] 배송 loadingItems 동기화 완료 - ID: ${savedDelivery.id}, salesId: ${savedDelivery.salesId}`);
    } else {
      this.logger.log(`[createFromSales] 배송 자동 생성 완료 - ID: ${savedDelivery.id}, salesId: ${savedDelivery.salesId}`);
    }

    return savedDelivery;
  }

  /**
   * 하차 시 컨테이너 추가: 원본 판매행(parent) + 실제 확정(actual*) 기준으로 SalesItem을 생성/재사용합니다.
   * (applyAddedContainerAtUnloading / 하차 Diff toAdd 공통)
   */
  private async resolveSalesItemForUnloadingAddedContainer(options: {
    parentSalesItemId: string;
    salesId: string;
    actualBL?: string | null;
    actualContainerNo: string | null | undefined;
    actualContainerIdOptional?: string | null;
    actualBales?: number | null;
    actualWeight?: number | null;
    actualContainerType?: 'CONTAINER' | 'CARGO' | null;
    /** 로그용 (미저장 행은 undefined) */
    loadingItemIdForLog?: string;
  }): Promise<{
    salesItemId: string;
    effBales: number | null | undefined;
    effWeight: number | null | undefined;
    addTypeForCargo: 'CONTAINER' | 'CARGO' | null;
    resolvedContainerNo: string;
    containerId: string;
    orderForBlLog: { id: string; bl: string | null } | null;
  } | null> {
    const {
      parentSalesItemId,
      salesId,
      actualBL,
      actualContainerNo,
      actualContainerIdOptional,
      actualBales,
      actualWeight,
      actualContainerType,
      loadingItemIdForLog,
    } = options;
    const liTag = loadingItemIdForLog ? `LoadingItem ID: ${loadingItemIdForLog}` : '신규 상차 행(toAdd)';

    if (!actualContainerNo?.trim() && !actualContainerIdOptional?.trim()) {
      this.logger.warn(`[하차완료 추가컨테이너] ${liTag} - 실제 컨테이너 번호/ID가 없어 건너뜁니다.`);
      return null;
    }

    const originalSalesItem = await this.salesItemRepository.findOne({
      where: { id: parentSalesItemId },
      relations: ['container', 'container.order'],
    });
    if (!originalSalesItem) {
      this.logger.warn(`[하차완료 추가컨테이너] 원본 SalesItem을 찾을 수 없습니다. ID: ${parentSalesItemId} (${liTag})`);
      return null;
    }

    const order = originalSalesItem.container?.order;
    let actualContainer: TradeContainer | null = null;
    const cidOpt = actualContainerIdOptional?.trim();
    if (cidOpt) {
      actualContainer = await this.tradeContainerRepository.findOne({
        where: { id: cidOpt },
        relations: ['order'],
      });
      if (actualContainer) {
        this.logger.log(
          `[하차완료 추가컨테이너] 컨테이너 ID로 조회 - ${liTag}, 컨테이너 ID: ${cidOpt}, 번호: ${actualContainer.containerNo}`,
        );
      }
    }
    if (!actualContainer && order && actualContainerNo) {
      actualContainer = await this.tradeContainerRepository.findOne({
        where: { order: { id: order.id }, containerNo: actualContainerNo },
        relations: ['order'],
      });
    }
    if (!actualContainer && actualContainerNo) {
      actualContainer = await this.tradeContainerRepository.findOne({
        where: { containerNo: actualContainerNo },
        relations: ['order'],
      });
    }

    if (!actualContainer && order && actualContainerNo?.trim()) {
      const newContainer = this.tradeContainerRepository.create({
        order,
        containerNo: actualContainerNo.trim(),
        tradeBales: actualBales != null ? String(actualBales) : null,
        salesBales: null,
        weight: actualWeight != null ? String(actualWeight) : null,
      });
      actualContainer = await this.tradeContainerRepository.save(newContainer);
      this.logger.log(
        `[하차완료 추가컨테이너] 신규 컨테이너 생성 - 컨테이너 번호: ${actualContainerNo}, ID: ${actualContainer.id}, Order ID: ${order.id}`,
      );
    }

    if (!actualContainer) {
      this.logger.error(
        `[하차완료 추가컨테이너] 실제 컨테이너를 찾거나 생성할 수 없습니다. 컨테이너 번호: ${actualContainerNo ?? '없음'}, 컨테이너 ID: ${cidOpt ?? '없음'}, ${liTag}`,
      );
      return null;
    }

    const addTypeForCargo = actualContainerType ?? originalSalesItem.containerType ?? 'CONTAINER';
    let effBales = actualBales;
    let effWeight = actualWeight;
    if (addTypeForCargo === 'CONTAINER') {
      effBales = effectiveSalesBalesFromContainer(actualContainer);
      const wr = actualContainer.weight;
      effWeight = wr != null && String(wr).trim() !== '' ? Number(wr) : 0;
      this.logger.log(
        `[하차완료 추가컨테이너] CONTAINER — 컨테이너(${actualContainer.containerNo}) 원장 베일·중량 적용: ${effBales}, ${effWeight} MT (${liTag})`,
      );
    }

    let existingSalesItem = await this.salesItemRepository.findOne({
      where: {
        salesId,
        containerId: actualContainer.id,
        status: Not(In(['SALES_ITEM_CANCELLED'])),
      },
    });
    if (!existingSalesItem) {
      const cancelledOne = await this.salesItemRepository.findOne({
        where: {
          salesId,
          containerId: actualContainer.id,
          status: 'SALES_ITEM_CANCELLED',
        },
      });
      if (cancelledOne) {
        existingSalesItem = cancelledOne;
        this.logger.log(
          `[하차완료 추가컨테이너] 취소된 SalesItem 복구 - ID: ${cancelledOne.id}, 판매 ID: ${salesId}, 컨테이너: ${actualContainerNo} (uk 중복 방지)`,
        );
      }
    }
    let savedNewSalesItem: { id: string };
    if (existingSalesItem) {
      this.logger.log(
        `[하차완료 추가컨테이너] 기존 SalesItem 재사용 - ID: ${existingSalesItem.id}, 판매 ID: ${salesId}, 컨테이너: ${actualContainerNo} (uk_sales_item_sales_container 중복 방지)`,
      );
      savedNewSalesItem = existingSalesItem;
      const updates: Partial<SalesItem> = {};
      if (existingSalesItem.status === 'SALES_ITEM_CANCELLED') {
        updates.status = 'SALES_ITEM_COMPLETED';
      }
      if (effBales != null && existingSalesItem.cargoBales !== String(effBales)) updates.cargoBales = String(effBales);
      if (effWeight != null && existingSalesItem.cargoWeight !== String(effWeight)) updates.cargoWeight = String(effWeight);
      if (Object.keys(updates).length > 0) {
        await this.salesItemRepository.update(existingSalesItem.id, updates);
      }
    } else {
      const newSalesItem = this.salesItemRepository.create({
        salesId: originalSalesItem.salesId,
        containerId: actualContainer.id,
        containerType: actualContainerType ?? originalSalesItem.containerType ?? 'CONTAINER',
        cargoBales: effBales != null ? String(effBales) : null,
        cargoWeight: effWeight != null ? String(effWeight) : null,
        salesUnitPrice: originalSalesItem.salesUnitPrice,
        stoCost: originalSalesItem.stoCost,
        dtCost: originalSalesItem.dtCost,
        advancePaymentRatio: originalSalesItem.advancePaymentRatio,
        status: 'SALES_ITEM_COMPLETED',
      });
      savedNewSalesItem = await this.salesItemRepository.save(newSalesItem);
      this.logger.log(
        `[하차완료 추가컨테이너] 신규 SalesItem 생성 - ID: ${savedNewSalesItem.id}, 판매 ID: ${salesId}, 컨테이너: ${actualContainer.containerNo}`,
      );
    }

    const resolvedContainerNo = actualContainer.containerNo;
    return {
      salesItemId: savedNewSalesItem.id,
      effBales,
      effWeight,
      addTypeForCargo,
      resolvedContainerNo,
      containerId: actualContainer.id,
      orderForBlLog: order ? { id: order.id, bl: order.bl ?? null } : null,
    };
  }

  /**
   * 하차완료 시 "컨테이너 추가" 행 처리: 동일 salesItemId로 추가된 행에 대해 새 SalesItem을 생성하고 LoadingItem을 연결합니다.
   * @param actualContainerIdOptional DTO에서 넘긴 컨테이너 ID (동일 containerNo·다른 순번 구분용, 있으면 번호 검색 대신 사용)
   */
  private async applyAddedContainerAtUnloading(
    loadingItem: SalesDeliveryLoadingItem,
    salesId: string,
    containerIdsToUpdate: Set<string>,
    actualContainerIdOptional?: string,
  ): Promise<string | null> {
    const actualBL = loadingItem.actualBL;
    const actualType = loadingItem.actualContainerType;

    const resolved = await this.resolveSalesItemForUnloadingAddedContainer({
      parentSalesItemId: loadingItem.salesItemId,
      salesId,
      actualBL,
      actualContainerNo: loadingItem.actualContainer,
      actualContainerIdOptional: actualContainerIdOptional ?? null,
      actualBales: loadingItem.actualBales,
      actualWeight: loadingItem.actualWeight,
      actualContainerType: actualType ?? null,
      loadingItemIdForLog: loadingItem.id,
    });
    if (!resolved) return null;

    loadingItem.salesItemId = resolved.salesItemId;
    if (resolved.addTypeForCargo === 'CONTAINER') {
      loadingItem.actualBales = resolved.effBales;
      loadingItem.actualWeight = resolved.effWeight;
    }
    loadingItem.requestBL = actualBL ?? loadingItem.requestBL;
    loadingItem.requestContainer = resolved.resolvedContainerNo ?? loadingItem.requestContainer;
    loadingItem.requestContainerType = actualType ?? loadingItem.requestContainerType;
    loadingItem.requestBales = resolved.effBales ?? loadingItem.requestBales;
    loadingItem.requestWeight = resolved.effWeight ?? loadingItem.requestWeight;
    await this.loadingItemRepository.save(loadingItem);
    this.logger.log(
      `[하차완료 추가컨테이너] LoadingItem ID: ${loadingItem.id} → SalesItem ID: ${resolved.salesItemId} 연결 완료, 요청 정보를 실제값으로 동기화`,
    );

    containerIdsToUpdate.add(resolved.containerId);

    const ord = resolved.orderForBlLog;
    if (actualBL?.trim() && ord && ord.bl !== actualBL.trim()) {
      this.logger.log(
        `[하차완료 추가컨테이너] 실제 BL과 부킹 BL 상이 — 무역 부킹 BL 미변경. Order ID: ${ord.id}, 부킹 ${ord.bl ?? '(없음)'} / 실제 ${actualBL.trim()}`,
      );
    }
    return resolved.salesItemId;
  }

  /**
   * 컨테이너의 재고 상태를 계산하고 업데이트합니다.
   */
  private async updateContainerInventoryStatus(containerId: string): Promise<void> {
    this.logger.log(`[재고 관리] 재고 상태 업데이트 시작 - 컨테이너 ID: ${containerId}`);
    
    // 컨테이너 조회
    const container = await this.tradeContainerRepository.findOne({
      where: { id: containerId },
    });

    if (!container) {
      this.logger.warn(`[재고 관리] 컨테이너를 찾을 수 없습니다. 컨테이너 ID: ${containerId}`);
      return;
    }

    const effectiveBales = (container.salesBales != null && container.salesBales !== '' ? Number(container.salesBales) : (container.tradeBales ? Number(container.tradeBales) : 0));
    this.logger.log(
      `[재고 관리] 컨테이너 정보 - 컨테이너 ID: ${containerId}, 컨테이너 번호: ${container.containerNo || '없음'}, 원래 수량: 베일 ${effectiveBales}, 중량 ${container.weight || 0}, 현재 재고 상태: ${container.inventoryStatus || '없음'}`
    );

    // 컨테이너의 모든 판매 항목 조회 (취소 제외)
    const salesItems = await this.salesItemRepository.find({
      where: { containerId },
    });

    this.logger.log(
      `[재고 관리] 컨테이너에 연결된 판매 항목 수: ${salesItems.length}개, SalesItem ID 목록: ${salesItems.map(item => item.id).join(', ')}`
    );

    // 판매 수량 계산
    let soldBales = 0;
    let soldWeight = 0;
    let hasReservedOnly = true; // 판매예약만 있는지 확인
    let hasCompleted = false; // 판매완료가 있는지 확인
    let hasInProgress = false; // SALES_ITEM_SOLD(판매) 등 미하차 항목이 있는지

    salesItems.forEach((item, index) => {
      // 취소된 판매는 제외
      if (item.status === 'SALES_ITEM_CANCELLED') {
        this.logger.log(
          `[재고 관리] 판매 항목 ${index + 1} - SalesItem ID: ${item.id}, 상태: ${item.status} (취소됨, 제외)`
        );
        return;
      }

      // 판매예약이 아닌 항목이 있으면 hasReservedOnly = false
      if (item.status !== 'SALES_ITEM_RESERVED') {
        hasReservedOnly = false;
      }

      // 판매완료가 있으면 hasCompleted = true
      if (item.status === 'SALES_ITEM_COMPLETED' || item.status === 'INVENTORY_CONSUMPTION') {
        hasCompleted = true;
      }

      // SALES_ITEM_SOLD(판매) = 하차 전 → 아직 판매 완료 아님
      if (item.status === 'SALES_ITEM_SOLD' || item.status === 'SALES_ITEM_RESERVED') {
        hasInProgress = true;
      }

      const originalBales = (container.salesBales != null && container.salesBales !== '' ? Number(container.salesBales) : (container.tradeBales ? Number(container.tradeBales) : 0));
      const originalWeight = container.weight ? Number(container.weight) : 0;
      let itemBales = 0;
      let itemWeight = 0;

      if (item.containerType === 'CONTAINER') {
        // CONTAINER 타입: cargoBales/cargoWeight가 둘 다 null이면 전체 컨테이너 수량 사용 (영업 베일 기준)
        // 한쪽만 있으면 나머지는 컨테이너 전체로 채움 → 컨테이너 통째로 판매인데 중량만 입력된 경우에도 베일 차감
        if (item.cargoBales == null && item.cargoWeight == null) {
          itemBales = originalBales;
          itemWeight = originalWeight;
          soldBales += originalBales;
          soldWeight += originalWeight;
        } else {
          const cargoBales = item.cargoBales != null && item.cargoBales !== ''
            ? Number(item.cargoBales)
            : originalBales;
          const cargoWeight = item.cargoWeight != null && item.cargoWeight !== ''
            ? Number(item.cargoWeight)
            : originalWeight;
          itemBales = cargoBales;
          itemWeight = cargoWeight;
          soldBales += cargoBales;
          soldWeight += cargoWeight;
        }
      } else {
        // CARGO 타입: cargoBales/cargoWeight 사용
        const cargoBales = item.cargoBales ? Number(item.cargoBales) : 0;
        const cargoWeight = item.cargoWeight ? Number(item.cargoWeight) : 0;
        itemBales = cargoBales;
        itemWeight = cargoWeight;
        soldBales += cargoBales;
        soldWeight += cargoWeight;
      }

      this.logger.log(
        `[재고 관리] 판매 항목 ${index + 1} - SalesItem ID: ${item.id}, 상태: ${item.status}, 타입: ${item.containerType || '없음'}, 판매 수량: 베일 ${itemBales}, 중량 ${itemWeight}`
      );
    });

    // 가용 수량 계산 (영업 베일 기준)
    const originalBales = (container.salesBales != null && container.salesBales !== '' ? Number(container.salesBales) : (container.tradeBales ? Number(container.tradeBales) : 0));
    const originalWeight = container.weight ? Number(container.weight) : 0;
    const availableBales = originalBales - soldBales;
    const availableWeight = originalWeight - soldWeight;

    this.logger.log(
      `[재고 관리] 판매 수량 계산 완료 - 총 판매 수량: 베일 ${soldBales}, 중량 ${soldWeight}, 가용 수량: 베일 ${availableBales}, 중량 ${availableWeight}, 판매예약만: ${hasReservedOnly}, 판매완료 포함: ${hasCompleted}, 미하차 항목 있음: ${hasInProgress}`
    );

    // 재고 상태 결정
    let inventoryStatus: 'AVAILABLE' | 'RESERVED' | 'PARTIALLY_RESERVED' | 'PARTIALLY_SOLD' | 'PARTIALLY_SOLD_COMPLETED' | 'SELLING' | 'SOLD_OUT' | null = null;

    // 모두 판매됨 판단: 가용 0 이하 = 다 나감 (음수는 과다 판매 포함)
    const hasOriginalBales = originalBales > 0;
    const hasOriginalWeight = originalWeight > 0;
    const isSoldOut =
      (hasOriginalBales && availableBales <= 0 && (!hasOriginalWeight || availableWeight <= 0)) ||
      (hasOriginalWeight && availableWeight <= 0 && (!hasOriginalBales || availableBales <= 0)) ||
      (hasOriginalBales && hasOriginalWeight && availableBales <= 0 && availableWeight <= 0);

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

    this.logger.log(
      `[재고 관리] 재고 상태 결정 - 컨테이너 ID: ${containerId}, 컨테이너 번호: ${container.containerNo || '없음'}, 이전 상태: ${container.inventoryStatus || '없음'} → 새 상태: ${inventoryStatus}`
    );

    // 재고 상태 업데이트
    await this.tradeContainerRepository.update(containerId, { inventoryStatus });

    this.logger.log(
      `[재고 관리] 재고 상태 업데이트 완료 - 컨테이너 ID: ${containerId}, 컨테이너 번호: ${container.containerNo || '없음'}, 판매수량: 베일 ${soldBales}, 중량 ${soldWeight}, 가용수량: 베일 ${availableBales}, 중량 ${availableWeight}, 상태: ${inventoryStatus}`
    );
  }

  /**
   * 판매 vs 운송관리 불일치 조회
   * - 하차완료(UNLOADING_COMPLETED) 상태인 운송만 체크
   * - 판매 항목 N개, 운송 항목 M개를 값 기준으로 전수 비교 (a-c, a-d, b-c, b-d 등)
   * - 개수 불일치(N≠M)도 불일치로 보고
   * - 순서 무관, 값(BL/컨테이너/베일/중량) 기준 이분 매칭
   * - CONTAINER: BL·컨번호만, CARGO: 모두 체크
   */
  async getSalesTransportMismatch(): Promise<any[]> {
    const raw = await this.dataSource.query(`
      WITH sales_qty AS (
        SELECT
          si.si_id,
          si.sa_id,
          si.co_id,
          si.si_container_type,
          o.to_bl AS sales_bl,
          c.co_container_no AS sales_container,
          CASE
            WHEN si.si_container_type = 'CARGO' THEN si.si_cargo_bales::numeric
            WHEN si.si_container_type = 'CONTAINER' AND si.si_cargo_bales IS NOT NULL AND si.si_cargo_bales::text != ''
              THEN si.si_cargo_bales::numeric
            ELSE COALESCE(c.co_sales_bales::numeric, c.co_trade_bales::numeric)
          END AS sales_bales,
          CASE
            WHEN si.si_container_type = 'CARGO' THEN si.si_cargo_weight::numeric
            WHEN si.si_container_type = 'CONTAINER' AND si.si_cargo_weight IS NOT NULL AND si.si_cargo_weight::text != ''
              THEN si.si_cargo_weight::numeric
            ELSE c.co_weight::numeric
          END AS sales_weight
        FROM tb_sales_item si
        JOIN tb_container c ON c.co_id = si.co_id
        JOIN tb_trade_order o ON o.to_id = c.co_order_id AND o.to_deleted_at IS NULL
        WHERE COALESCE(si.si_status, '') != 'SALES_ITEM_CANCELLED'
      ),
      loading_display AS (
        SELECT
          li.sdli_id,
          li.sdli_sales_item_id,
          li.sdli_sales_delivery_id,
          COALESCE(NULLIF(TRIM(li.sdli_actual_bl), ''), NULLIF(TRIM(li.sdli_work_bl), ''), NULLIF(TRIM(li.sdli_request_bl), '')) AS transport_bl,
          COALESCE(NULLIF(TRIM(li.sdli_actual_container), ''), NULLIF(TRIM(li.sdli_work_container), ''), NULLIF(TRIM(li.sdli_request_container), '')) AS transport_container,
          COALESCE(li.sdli_actual_bales::numeric, li.sdli_work_bales::numeric, li.sdli_request_bales::numeric) AS transport_bales,
          COALESCE(li.sdli_actual_weight::numeric, li.sdli_work_weight::numeric, li.sdli_request_weight::numeric) AS transport_weight
        FROM tb_sales_delivery_loading_item li
      ),
      paired AS (
        SELECT
          sd.sd_order_number AS "orderNumber",
          sd.sd_id::text AS "deliveryId",
          sd.sd_sales_id::text AS "salesId",
          o.to_contract_no AS "contractNo",
          cu.cu_company_name AS "farmName",
          cu.cu_company_name AS "companyName",
          cu.cu_ceo AS "ceo",
          w.wh_name AS "warehouseName",
          s.si_id::text AS "salesItemId",
          COALESCE(s.si_container_type, 'CONTAINER') AS "type",
          s.sales_bl AS "salesBl",
          s.sales_container AS "salesContainer",
          s.sales_bales::float AS "salesBales",
          s.sales_weight::float AS "salesWeight",
          li.sdli_id::text AS "loadingItemId",
          li.transport_bl AS "transportBl",
          li.transport_container AS "transportContainer",
          li.transport_bales::float AS "transportBales",
          li.transport_weight::float AS "transportWeight"
        FROM sales_qty s
        JOIN loading_display li ON li.sdli_sales_item_id = s.si_id
        JOIN tb_sales_delivery sd ON sd.sd_id = li.sdli_sales_delivery_id
        JOIN tb_sales sa ON sa.sa_id = sd.sd_sales_id
        LEFT JOIN tb_customer cu ON cu.cu_id = sa.cu_id
        JOIN tb_container c ON c.co_id = s.co_id
        JOIN tb_trade_order o ON o.to_id = c.co_order_id AND o.to_deleted_at IS NULL
        LEFT JOIN tb_trade_order_inbound ti ON ti.ti_order_id = o.to_id AND ti.ti_status = 'CONFIRMED' AND ti.ti_warehouse IS NOT NULL
        LEFT JOIN tb_warehouse w ON TRIM(w.wh_name) = TRIM(ti.ti_warehouse)
        WHERE sd.sd_deleted_at IS NULL AND sd.sd_status = 'UNLOADING_COMPLETED'
      ),
      orphan_sales AS (
        SELECT
          sd.sd_order_number AS "orderNumber",
          sd.sd_id::text AS "deliveryId",
          sd.sd_sales_id::text AS "salesId",
          o.to_contract_no AS "contractNo",
          cu.cu_company_name AS "farmName",
          cu.cu_company_name AS "companyName",
          cu.cu_ceo AS "ceo",
          w.wh_name AS "warehouseName",
          s.si_id::text AS "salesItemId",
          COALESCE(s.si_container_type, 'CONTAINER') AS "type",
          s.sales_bl AS "salesBl",
          s.sales_container AS "salesContainer",
          s.sales_bales::float AS "salesBales",
          s.sales_weight::float AS "salesWeight",
          NULL::text AS "loadingItemId",
          NULL::text AS "transportBl",
          NULL::text AS "transportContainer",
          NULL::float AS "transportBales",
          NULL::float AS "transportWeight"
        FROM sales_qty s
        JOIN tb_sales_delivery sd ON sd.sd_sales_id = s.sa_id
        JOIN tb_sales sa ON sa.sa_id = sd.sd_sales_id
        LEFT JOIN tb_customer cu ON cu.cu_id = sa.cu_id
        JOIN tb_container c ON c.co_id = s.co_id
        JOIN tb_trade_order o ON o.to_id = c.co_order_id AND o.to_deleted_at IS NULL
        LEFT JOIN tb_trade_order_inbound ti ON ti.ti_order_id = o.to_id AND ti.ti_status = 'CONFIRMED' AND ti.ti_warehouse IS NOT NULL
        LEFT JOIN tb_warehouse w ON TRIM(w.wh_name) = TRIM(ti.ti_warehouse)
        WHERE sd.sd_deleted_at IS NULL AND sd.sd_status = 'UNLOADING_COMPLETED'
          AND NOT EXISTS (
            SELECT 1 FROM tb_sales_delivery_loading_item li
            WHERE li.sdli_sales_delivery_id = sd.sd_id AND li.sdli_sales_item_id = s.si_id
          )
      )
      SELECT * FROM paired
      UNION ALL
      SELECT * FROM orphan_sales
      ORDER BY "orderNumber", "salesId", "salesItemId"
    `);

    const byDelivery = new Map<string, typeof raw>();
    for (const r of raw) {
      const key = r.deliveryId;
      if (!byDelivery.has(key)) byDelivery.set(key, []);
      byDelivery.get(key)!.push(r);
    }

    const results: any[] = [];
    const seenPairs = new Set<string>();

    for (const [, rows] of byDelivery) {
      const salesByItem = new Map<string, { item: any; row: any }>();
      const loadingByItem = new Map<string, { item: any; row: any }>();
      for (const r of rows) {
        const siKey = r.salesItemId;
        if (!salesByItem.has(siKey)) {
          salesByItem.set(siKey, {
            item: {
              salesItemId: r.salesItemId,
              type: r.type,
              salesBl: (r.salesBl ?? '').toString().trim(),
              salesContainer: (r.salesContainer ?? '').toString().trim(),
              salesBales: r.salesBales ?? 0,
              salesWeight: r.salesWeight ?? 0,
            },
            row: r,
          });
        }
        if (r.loadingItemId) {
          const liKey = r.loadingItemId;
          if (!loadingByItem.has(liKey)) {
            loadingByItem.set(liKey, {
              item: {
                loadingItemId: r.loadingItemId,
                transportBl: (r.transportBl ?? '').toString().trim(),
                transportContainer: (r.transportContainer ?? '').toString().trim(),
                transportBales: r.transportBales ?? 0,
                transportWeight: r.transportWeight ?? 0,
              },
              row: r,
            });
          }
        }
      }

      const salesList = Array.from(salesByItem.values());
      const loadingList = Array.from(loadingByItem.values());
      const salesItems = salesList.map((x) => x.item);
      const loadingItems = loadingList.map((x) => x.item);

      const { unmatchedSalesIndices, unmatchedLoadingIndices } = this.findUnmatchedByValue(salesItems, loadingItems);

      const addResult = (r: any, si: any, li: any) => {
        const isContainer = (si?.type || 'CONTAINER') === 'CONTAINER';
        const blM = (si?.salesBl ?? '') !== (li?.transportBl ?? '') ? 'Y' : '-';
        const cnM = (si?.salesContainer ?? '') !== (li?.transportContainer ?? '') ? 'Y' : '-';
        const baM = !isContainer && Math.abs((si?.salesBales ?? 0) - (li?.transportBales ?? 0)) > 0.001 ? 'Y' : '-';
        const wtM = !isContainer && Math.abs((si?.salesWeight ?? 0) - (li?.transportWeight ?? 0)) > 0.001 ? 'Y' : '-';
        const key = `${r.salesItemId}|${r.loadingItemId ?? 'null'}`;
        if (seenPairs.has(key)) return;
        seenPairs.add(key);
        results.push({
          orderNumber: r.orderNumber,
          salesId: r.salesId,
          salesItemId: r.salesItemId,
          type: r.type,
          deliveryId: r.deliveryId,
          loadingItemId: r.loadingItemId ?? null,
          contractNo: r.contractNo,
          farmName: r.farmName,
          companyName: r.companyName,
          ceo: r.ceo,
          warehouseName: r.warehouseName,
          salesBl: r.salesBl,
          transportBl: r.transportBl ?? null,
          salesContainer: r.salesContainer,
          transportContainer: r.transportContainer ?? null,
          salesBales: r.salesBales,
          transportBales: r.transportBales ?? null,
          salesWeight: r.salesWeight,
          transportWeight: r.transportWeight ?? null,
          blMismatch: blM,
          containerMismatch: cnM,
          balesMismatch: baM,
          weightMismatch: wtM,
        });
      };

      for (const i of unmatchedSalesIndices) {
        const { row } = salesList[i];
        const li = row.loadingItemId ? loadingList.find((x) => x.item.loadingItemId === row.loadingItemId) : null;
        addResult(row, salesItems[i], li?.item ?? null);
      }
      for (const j of unmatchedLoadingIndices) {
        const { row } = loadingList[j];
        if (!seenPairs.has(`${row.salesItemId}|${row.loadingItemId}`)) {
          const siIdx = salesList.findIndex((x) => x.item.salesItemId === row.salesItemId);
          addResult(row, siIdx >= 0 ? salesItems[siIdx] : null, loadingItems[j]);
        }
      }
    }

    this.logger.log(`[getSalesTransportMismatch] 불일치 ${results.length}건 조회 (값 기준 전수 비교, 개수 불일치 포함)`);
    return results;
  }

  /**
   * 값 기준 매칭: 판매 N개 vs 운송 M개를 a-c, a-d, b-c, b-d 등 전수 비교
   * - 순서 무관, 이분 매칭으로 매칭 가능한지 판단
   * - 개수 불일치(N≠M)도 불일치로 처리
   */
  private findUnmatchedByValue(
    salesItems: Array<{ salesItemId: string; type: string; salesBl: string; salesContainer: string; salesBales: number; salesWeight: number }>,
    loadingItems: Array<{ loadingItemId: string; transportBl: string; transportContainer: string; transportBales: number; transportWeight: number }>,
  ): { unmatchedSalesIndices: number[]; unmatchedLoadingIndices: number[] } {
    const n = salesItems.length;
    const m = loadingItems.length;

    if (n === 0 && m === 0) return { unmatchedSalesIndices: [], unmatchedLoadingIndices: [] };
    if (n === 0) return { unmatchedSalesIndices: [], unmatchedLoadingIndices: Array.from({ length: m }, (_, j) => j) };
    if (m === 0) return { unmatchedSalesIndices: Array.from({ length: n }, (_, i) => i), unmatchedLoadingIndices: [] };

    const matches = (si: (typeof salesItems)[0], li: (typeof loadingItems)[0]) => {
      const isContainer = (si.type || 'CONTAINER') === 'CONTAINER';
      if (si.salesBl !== li.transportBl || si.salesContainer !== li.transportContainer) return false;
      if (!isContainer) {
        if (Math.abs(si.salesBales - li.transportBales) > 0.001) return false;
        if (Math.abs(si.salesWeight - li.transportWeight) > 0.001) return false;
      }
      return true;
    };

    const adj: number[][] = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        if (matches(salesItems[i], loadingItems[j])) adj[i].push(j);
      }
    }

    const matchTo = new Array<number>(m).fill(-1);
    const tryMatch = (siIdx: number, visited: boolean[]): boolean => {
      for (const liIdx of adj[siIdx]) {
        if (visited[liIdx]) continue;
        visited[liIdx] = true;
        if (matchTo[liIdx] === -1 || tryMatch(matchTo[liIdx], visited)) {
          matchTo[liIdx] = siIdx;
          return true;
        }
      }
      return false;
    };

    for (let i = 0; i < n; i++) {
      tryMatch(i, new Array(m).fill(false));
    }

    const matchedSales = new Set<number>();
    for (let j = 0; j < m; j++) {
      if (matchTo[j] >= 0) matchedSales.add(matchTo[j]);
    }
    const unmatchedSalesIndices = Array.from({ length: n }, (_, i) => i).filter((i) => !matchedSales.has(i));
    const unmatchedLoadingIndices = Array.from({ length: m }, (_, j) => j).filter((j) => matchTo[j] === -1);

    return { unmatchedSalesIndices, unmatchedLoadingIndices };
  }
}

