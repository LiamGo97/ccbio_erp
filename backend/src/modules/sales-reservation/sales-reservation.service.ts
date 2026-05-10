import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesReservation } from './entities/sales-reservation.entity';
import { TradeOrder } from '../trade-contracts/entities/trade-order.entity';
import { TradeContractsService } from '../trade-contracts/trade-contracts.service';
import { CreateSalesReservationDto } from './dto/create-sales-reservation.dto';
import { UpdateSalesReservationDto } from './dto/update-sales-reservation.dto';
import { GetSalesReservationsDto } from './dto/get-sales-reservations.dto';

function trimBl(bl?: string | null): string | null {
  const t = bl?.trim();
  return t ? t : null;
}

function parseDateOnly(value?: string | null): Date | null {
  if (value == null || String(value).trim() === '') return null;
  const s = String(value).trim();
  const d = new Date(s + 'T12:00:00.000Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateOnly(d?: Date | null): string | null {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return x.toISOString().slice(0, 10);
}

/** 입고확정(CONFIRMED) 행 창고 우선, 없으면 첫 창고 값 */
function pickInboundWarehouseFromOrder(order: TradeOrder): string | null {
  const list = order.inbounds ?? [];
  const confirmed = list.filter((x) => x.status === 'CONFIRMED' && x.warehouse?.trim());
  if (confirmed.length) return confirmed[0]!.warehouse!.trim();
  const anyWh = list.find((x) => x.warehouse?.trim());
  return anyWh?.warehouse?.trim() ?? null;
}

export type SalesReservationRow = {
  id: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerCeo: string | null;
  bl: string | null;
  tradeOrderId: string | null;
  containerId: string | null;
  containerNo: string | null;
  orderProductNameLabel: string | null;
  contractProductName: string | null;
  contractNo: string | null;
  /** 발주 영업 입고 상태(salesStatus 우선, 없으면 inboundStatus) */
  tradeOrderInboundStatus: string | null;
  containerProductCode: string | null;
  contactPhone: string | null;
  requestedQty: string | null;
  qtyUnit: string | null;
  vehicleType: string | null;
  loadingWarehouseId: number | null;
  loadingWarehouseName: string | null;
  loadingWarehouseText: string | null;
  customsDate: string | null;
  loadingDate: string | null;
  loadingScheduleNote: string | null;
  remarks: string | null;
  unitPrice: string | null;
  unitPriceStage: string | null;
  reference: string | null;
  sortOrder: number;
  status: string;
  registeredById: number | null;
  registeredByName: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class SalesReservationService {
  private readonly logger = new Logger(SalesReservationService.name);

  constructor(
    @InjectRepository(SalesReservation)
    private readonly repo: Repository<SalesReservation>,
    @InjectRepository(TradeOrder)
    private readonly tradeOrderRepo: Repository<TradeOrder>,
    private readonly tradeContractsService: TradeContractsService,
  ) {}

  private baseQb() {
    return this.repo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.customer', 'cu')
      .leftJoinAndSelect('r.tradeOrder', 'ord')
      .leftJoinAndSelect('ord.contract', 'tc', 'tc.tc_deleted_at IS NULL')
      .leftJoinAndSelect('r.container', 'co')
      .leftJoinAndSelect('r.loadingWarehouse', 'wh')
      .leftJoinAndSelect('r.registeredByUser', 'reg');
  }

  private mapRow(r: SalesReservation): SalesReservationRow {
    const ord = r.tradeOrder;
    const tc = ord?.contract;
    const co = r.container;
    return {
      id: r.id,
      customerId: r.customerId ?? null,
      customerName: r.customer?.companyName ?? null,
      customerPhone: r.customer?.phone ?? null,
      customerCeo: r.customer?.ceo ?? null,
      bl: r.bl ?? null,
      tradeOrderId: r.tradeOrderId ?? null,
      containerId: r.containerId ?? null,
      containerNo: co?.containerNo ?? null,
      orderProductNameLabel: ord?.productNameLabel ?? null,
      contractProductName: tc?.productName ?? null,
      contractNo: tc?.contractNo ?? null,
      tradeOrderInboundStatus: ord?.salesStatus ?? ord?.inboundStatus ?? null,
      containerProductCode: co?.product ?? null,
      contactPhone: r.contactPhone ?? null,
      requestedQty: r.requestedQty ?? null,
      qtyUnit: r.qtyUnit ?? null,
      vehicleType: r.vehicleType ?? null,
      loadingWarehouseId: r.loadingWarehouseId ?? null,
      loadingWarehouseName: r.loadingWarehouse?.name ?? null,
      loadingWarehouseText: r.loadingWarehouseText ?? null,
      customsDate: formatDateOnly(r.customsDate),
      loadingDate: formatDateOnly(r.loadingDate),
      loadingScheduleNote: r.loadingScheduleNote ?? null,
      remarks: r.remarks ?? null,
      unitPrice: r.unitPrice ?? null,
      unitPriceStage: r.unitPriceStage ?? null,
      reference: r.reference ?? null,
      sortOrder: r.sortOrder ?? 0,
      status: r.status ?? 'ACTIVE',
      registeredById: r.registeredById ?? null,
      registeredByName: r.registeredByUser?.name ?? null,
      createdAt: r.createdAt?.toISOString?.() ?? String(r.createdAt),
      updatedAt: r.updatedAt?.toISOString?.() ?? String(r.updatedAt),
    };
  }

  /** BL로 발주 매칭 (TRIM 비교). 여러 건이면 to_id 오름차순 첫 건 */
  async resolveTradeOrderIdFromBl(bl?: string | null): Promise<string | null> {
    const t = trimBl(bl);
    if (!t) return null;
    const raw = await this.tradeOrderRepo
      .createQueryBuilder('o')
      .select('o.to_id', 'id')
      .where('TRIM(o.to_bl) = :bl', { bl: t })
      .andWhere('o.to_deleted_at IS NULL')
      .orderBy('o.to_id', 'ASC')
      .limit(1)
      .getRawOne<{ id: string }>();
    return raw?.id ?? null;
  }

  async lookupByBl(bl: string, excludeReservationId?: string | null) {
    const t = trimBl(bl);
    if (!t) {
      return { bl: null as string | null, matches: [] as Array<Record<string, unknown>> };
    }
    const orders = await this.tradeOrderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.contract', 'c')
      .leftJoinAndSelect('o.inbounds', 'ib')
      .where('TRIM(o.to_bl) = :bl', { bl: t })
      .andWhere('o.to_deleted_at IS NULL')
      .orderBy('o.to_id', 'ASC')
      .addOrderBy('ib.ti_id', 'ASC')
      .getMany();

    const stockMap = await this.tradeContractsService.aggregateStockByTradeOrderIds(
      orders.map((o) => String(o.id)),
      excludeReservationId?.trim() || undefined,
    );

    return {
      bl: t,
      matches: orders.map((o) => {
        const s = stockMap[String(o.id)];
        return {
          tradeOrderId: o.id,
          bl: o.bl ?? null,
          bk: o.bk ?? null,
          contractNo: o.contract?.contractNo ?? null,
          productNameLabel: o.productNameLabel ?? null,
          contractProductName: o.contract?.productName ?? null,
          etaDate: formatDateOnly(o.etaDate ?? null),
          customsDate: formatDateOnly(o.customsDate ?? null),
          inboundWarehouse: pickInboundWarehouseFromOrder(o),
          tradeOrderInboundStatus: o.salesStatus ?? o.inboundStatus ?? null,
          containerCount: s?.containerCount ?? 0,
          totalBales: s?.totalBales ?? 0,
          totalAvailableBales: s?.totalAvailableBales ?? 0,
          totalReservedBales: s?.totalReservedBales ?? 0,
          totalCompletedBales: s?.totalCompletedBales ?? 0,
          totalWeightMt: s?.totalWeightMt ?? 0,
          totalAvailableWeightMt: s?.totalAvailableWeightMt ?? 0,
          totalReservedWeightMt: s?.totalReservedWeightMt ?? 0,
          totalCompletedWeightMt: s?.totalCompletedWeightMt ?? 0,
          totalSheetReservationBales: s?.totalSheetReservationBales ?? 0,
          totalSheetReservationWeightMt: s?.totalSheetReservationWeightMt ?? 0,
          availableContainerEquivDisplay: s?.availableContainerEquivDisplay ?? 0,
          containerEquivOutflow: s?.containerEquivOutflow ?? 0,
        };
      }),
    };
  }

  async findAll(query: GetSalesReservationsDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 200) : 50;
    const qb = this.baseQb();

    if (query.customerId?.trim()) {
      qb.andWhere('r.cu_id = :cuId', { cuId: query.customerId.trim() });
    }
    if (query.status?.trim()) {
      qb.andWhere('r.sres_status = :st', { st: query.status.trim() });
    }
    if (query.search?.trim()) {
      const s = `%${query.search.trim()}%`;
      qb.andWhere(
        '(r.sres_bl ILIKE :s OR r.sres_remarks ILIKE :s OR r.sres_reference ILIKE :s OR r.sres_loading_schedule_note ILIKE :s OR cu.companyName ILIKE :s)',
        { s },
      );
    }

    qb.orderBy('r.loadingDate', 'DESC', 'NULLS LAST')
      .addOrderBy('r.sortOrder', 'ASC')
      .addOrderBy('r.id', 'DESC');

    const total = await qb.clone().getCount();
    const rows = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      data: rows.map((r) => this.mapRow(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string): Promise<SalesReservationRow> {
    const row = await this.baseQb().where('r.sres_id = :id', { id }).getOne();
    if (!row) {
      throw new NotFoundException('판매예약을 찾을 수 없습니다.');
    }
    return this.mapRow(row);
  }

  private applyDto(
    entity: SalesReservation,
    dto: CreateSalesReservationDto | UpdateSalesReservationDto,
    userId?: number | null,
    isCreate?: boolean,
  ) {
    if (dto.customerId !== undefined) {
      entity.customerId = dto.customerId?.trim() ? dto.customerId.trim() : null;
    }
    if (dto.bl !== undefined) {
      entity.bl = trimBl(dto.bl);
    }
    if (dto.tradeOrderId !== undefined) {
      entity.tradeOrderId = dto.tradeOrderId?.trim() ? dto.tradeOrderId.trim() : null;
    }
    if (dto.containerId !== undefined) {
      entity.containerId = dto.containerId?.trim() ? dto.containerId.trim() : null;
    }
    if (dto.contactPhone !== undefined) {
      entity.contactPhone = dto.contactPhone?.trim() ? dto.contactPhone.trim() : null;
    }
    if (dto.requestedQty !== undefined) {
      const q = dto.requestedQty?.trim();
      entity.requestedQty = q ? q : null;
    }
    if (dto.qtyUnit !== undefined) {
      const t = dto.qtyUnit?.trim();
      entity.qtyUnit = t ? t : 'BALE';
    }
    if (dto.vehicleType !== undefined) {
      entity.vehicleType = dto.vehicleType?.trim() ? dto.vehicleType.trim() : null;
    }
    if (dto.loadingWarehouseId !== undefined) {
      entity.loadingWarehouseId =
        dto.loadingWarehouseId != null && dto.loadingWarehouseId > 0 ? dto.loadingWarehouseId : null;
    }
    if (dto.loadingWarehouseText !== undefined) {
      entity.loadingWarehouseText = dto.loadingWarehouseText?.trim()
        ? dto.loadingWarehouseText.trim()
        : null;
    }
    if (dto.customsDate !== undefined) {
      entity.customsDate = parseDateOnly(dto.customsDate);
    }
    if (dto.loadingDate !== undefined) {
      entity.loadingDate = parseDateOnly(dto.loadingDate);
    }
    if (dto.loadingScheduleNote !== undefined) {
      entity.loadingScheduleNote = dto.loadingScheduleNote?.trim()
        ? dto.loadingScheduleNote.trim()
        : null;
    }
    if (dto.remarks !== undefined) {
      entity.remarks = dto.remarks?.trim() ? dto.remarks.trim() : null;
    }
    if (dto.unitPrice !== undefined) {
      const p = dto.unitPrice?.trim();
      entity.unitPrice = p ? p : null;
    }
    if (dto.unitPriceStage !== undefined) {
      entity.unitPriceStage = dto.unitPriceStage?.trim() ? dto.unitPriceStage.trim() : null;
    }
    if (dto.reference !== undefined) {
      entity.reference = dto.reference?.trim() ? dto.reference.trim() : null;
    }
    if (dto.sortOrder !== undefined) {
      entity.sortOrder = dto.sortOrder ?? 0;
    }
    if (dto.status !== undefined) {
      entity.status = dto.status?.trim() ? dto.status.trim() : 'ACTIVE';
    }
    if (isCreate && userId != null) {
      entity.registeredById = userId;
    }
  }

  async create(dto: CreateSalesReservationDto, userId?: number | null): Promise<SalesReservationRow> {
    const entity = this.repo.create({
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status?.trim() || 'ACTIVE',
    });
    this.applyDto(entity, dto, userId, true);

    if (!entity.qtyUnit?.trim()) {
      entity.qtyUnit = 'BALE';
    }

    if (!entity.tradeOrderId && entity.bl) {
      entity.tradeOrderId = await this.resolveTradeOrderIdFromBl(entity.bl);
    }

    const saved = await this.repo.save(entity);
    this.logger.log(`[create] sres_id=${saved.id}`);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateSalesReservationDto, userId?: number | null): Promise<SalesReservationRow> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('판매예약을 찾을 수 없습니다.');
    }
    this.applyDto(entity, dto, userId, false);

    if (dto.bl !== undefined || dto.tradeOrderId !== undefined) {
      if (entity.tradeOrderId == null && entity.bl) {
        entity.tradeOrderId = await this.resolveTradeOrderIdFromBl(entity.bl);
      }
    }

    await this.repo.save(entity);
    return this.findOne(id);
  }

  async remove(id: string) {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('판매예약을 찾을 수 없습니다.');
    }
    await this.repo.remove(entity);
    return { success: true };
  }
}
