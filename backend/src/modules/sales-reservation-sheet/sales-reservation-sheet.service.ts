import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Equal, Repository } from 'typeorm';
import { Code } from '../codes/entities/code.entity';
import { Customer } from '../customers/entities/customer.entity';
import { TradeOrder } from '../trade-contracts/entities/trade-order.entity';
import { SalesReservationSheetRow } from './entities/sales-reservation-sheet-row.entity';
import {
  SalesReservationSheetRowLog,
  SalesReservationSheetRowLogAction,
} from './entities/sales-reservation-sheet-row-log.entity';
import { UpsertSheetRowDto } from './dto/upsert-sheet-row.dto';
import { SalesReservationSheetSseService } from './sales-reservation-sheet-sse.service';

function emptyToNull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === '' ? null : t;
}

/** A~J 모두 비어 있으면 DB에 행을 두지 않음(삭제) */
function isRowDataEmpty(p: {
  productCode?: string | null;
  salesGrade?: string | null;
  bl?: string | null;
  companyName?: string | null;
  contact?: string | null;
  requestedQty?: string | null;
  vehicleCode?: string | null;
  loadingSchedule?: string | null;
  arrivalSchedule?: string | null;
  remarks?: string | null;
  reference?: string | null;
  unitPrice?: string | null;
  status?: string | null;
}): boolean {
  const price = p.unitPrice;
  const priceEmpty =
    price == null ||
    (typeof price === 'string' && price.trim() === '');
  return (
    !p.productCode?.trim() &&
    !p.salesGrade?.trim() &&
    !p.bl?.trim() &&
    !p.companyName?.trim() &&
    !p.contact?.trim() &&
    !p.requestedQty?.trim() &&
    !p.vehicleCode?.trim() &&
    !p.loadingSchedule?.trim() &&
    !p.arrivalSchedule?.trim() &&
    !p.remarks?.trim() &&
    !p.reference?.trim() &&
    !p.status?.trim() &&
    priceEmpty
  );
}

export type UpsertRowResult =
  | SalesReservationSheetRow
  | { deleted: true; rowIndex: number };

/** 로그 보강용 — 프론트 `vehicle-requested-container-qty.ts` 와 동일 값 유지 */
const VEHICLE_DEFAULT_CONTAINER_QTY: Record<string, number> = {
  TRUCK_1T: 0.1,
  TRUCK_3_5T: 0.2,
  TRUCK_5T_CARGO: 0.6,
  TRUCK_25T_CARGO: 0.8,
  CONTAINER: 1,
};

function normalizeVehicleStoredForLog(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('__legacy__:')) {
    return t.slice('__legacy__:'.length).trim();
  }
  return t;
}

function rowToLogSnapshot(row: SalesReservationSheetRow): Record<string, unknown> {
  return {
    id: row.id,
    sheetId: row.sheetId,
    rowIndex: row.rowIndex,
    productCode: row.productCode ?? null,
    salesGrade: row.salesGrade ?? null,
    bl: row.bl ?? null,
    companyName: row.companyName ?? null,
    contact: row.contact ?? null,
    requestedQty: row.requestedQty ?? null,
    vehicleCode: row.vehicleCode ?? null,
    loadingSchedule: row.loadingSchedule ?? null,
    arrivalSchedule: row.arrivalSchedule ?? null,
    remarks: row.remarks ?? null,
    unitPrice: row.unitPrice ?? null,
    reference: row.reference ?? null,
    status: row.status ?? null,
    userId: row.userId ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

type SheetLogCodeLists = {
  sheetStatusCodes: Code[];
  productCodes: Code[];
  salesGradeCodes: Code[];
  /** 차량분류 — 프론트와 동일 그룹 `CONSULTATION_REQUEST_WEIGHT` */
  vehicleCodes: Code[];
};

type CustomerLogResolution = 'none' | 'exact' | 'ambiguous' | 'fuzzy_unique';

type BlLogResolution = 'none' | 'unique' | 'ambiguous';

@Injectable()
export class SalesReservationSheetService {
  private readonly logger = new Logger(SalesReservationSheetService.name);

  constructor(
    @InjectRepository(SalesReservationSheetRow)
    private readonly repo: Repository<SalesReservationSheetRow>,
    @InjectRepository(SalesReservationSheetRowLog)
    private readonly rowLogRepo: Repository<SalesReservationSheetRowLog>,
    @InjectRepository(Code)
    private readonly codeRepo: Repository<Code>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(TradeOrder)
    private readonly tradeOrderRepo: Repository<TradeOrder>,
    private readonly sse: SalesReservationSheetSseService,
  ) {}

  async findAll(sheetId: string) {
    const id = sheetId.trim() || 'product-reservations-sheet';
    return this.repo.find({
      where: { sheetId: id },
      order: { rowIndex: 'ASC' },
    });
  }

  private async loadLogCodeLists(): Promise<SheetLogCodeLists> {
    const [sheetStatusCodes, productCodes, salesGradeCodes, vehicleCodes] = await Promise.all([
      this.codeRepo.find({
        where: { group: 'SALES_RESERVATION_SHEET_STATUS' },
        order: { order: 'ASC' },
      }),
      this.codeRepo.find({
        where: { group: 'PRODUCT' },
        order: { order: 'ASC' },
      }),
      this.codeRepo.find({
        where: { group: 'SALES_GRADE' },
        order: { order: 'ASC' },
      }),
      this.codeRepo.find({
        where: { group: 'CONSULTATION_REQUEST_WEIGHT' },
        order: { order: 'ASC' },
      }),
    ]);
    return { sheetStatusCodes, productCodes, salesGradeCodes, vehicleCodes };
  }

  /** `cd_value` 또는 `cd_name` 이 저장값과 일치하면 둘 다 채움 */
  private resolveCodeValueAndName(
    raw: string,
    codes: Code[],
  ): { codeValue: string | null; displayName: string | null } {
    const s = raw.trim();
    if (!s) {
      return { codeValue: null, displayName: null };
    }
    for (const c of codes) {
      const v = (c.value ?? '').trim();
      const n = (c.name ?? '').trim();
      if (v === s || n === s) {
        return {
          codeValue: v || null,
          displayName: (n || v || null) as string | null,
        };
      }
    }
    return { codeValue: null, displayName: null };
  }

  private resolveStatusCodeAndDisplay(
    raw: string,
    codes: Code[],
  ): { statusCode: string | null; statusDisplayName: string | null } {
    const pair = this.resolveCodeValueAndName(raw, codes);
    const s = raw.trim();
    if (!s) {
      return { statusCode: null, statusDisplayName: null };
    }
    if (pair.codeValue != null || pair.displayName != null) {
      return { statusCode: pair.codeValue, statusDisplayName: pair.displayName };
    }
    return { statusCode: null, statusDisplayName: s };
  }

  private async resolveCustomerForLog(
    companyNameRaw: string | null | undefined,
    cache: Map<
      string,
      {
        customerId: string | null;
        resolution: CustomerLogResolution;
        customerMasterCompanyName: string | null;
      }
    >,
  ): Promise<{
    customerId: string | null;
    resolution: CustomerLogResolution;
    customerMasterCompanyName: string | null;
  }> {
    const trimmed = (companyNameRaw ?? '').trim();
    if (!trimmed) {
      return { customerId: null, resolution: 'none', customerMasterCompanyName: null };
    }
    const hit = cache.get(trimmed);
    if (hit) return hit;

    let list = await this.customerRepo.find({
      where: { companyName: Equal(trimmed) },
      take: 2,
      select: ['id', 'companyName'],
    });
    if (list.length === 1) {
      const row0 = list[0]!;
      const out = {
        customerId: String(row0.id),
        resolution: 'exact' as const,
        customerMasterCompanyName: row0.companyName?.trim() || null,
      };
      cache.set(trimmed, out);
      return out;
    }
    if (list.length > 1) {
      const out = {
        customerId: null,
        resolution: 'ambiguous' as const,
        customerMasterCompanyName: null,
      };
      cache.set(trimmed, out);
      return out;
    }

    list = await this.customerRepo
      .createQueryBuilder('c')
      .select(['c.id', 'c.companyName'])
      .where('TRIM(c.cu_company_name) ILIKE TRIM(:n)', { n: trimmed })
      .take(2)
      .getMany();
    if (list.length === 1) {
      const row0 = list[0]!;
      const out = {
        customerId: String(row0.id),
        resolution: 'fuzzy_unique' as const,
        customerMasterCompanyName: row0.companyName?.trim() || null,
      };
      cache.set(trimmed, out);
      return out;
    }
    if (list.length > 1) {
      const out = {
        customerId: null,
        resolution: 'ambiguous' as const,
        customerMasterCompanyName: null,
      };
      cache.set(trimmed, out);
      return out;
    }

    const out = {
      customerId: null,
      resolution: 'none' as const,
      customerMasterCompanyName: null,
    };
    cache.set(trimmed, out);
    return out;
  }

  private async resolveBlForLog(
    blRaw: string | null | undefined,
    cache: Map<
      string,
      {
        tradeOrderId: string | null;
        blLinkedSummary: string | null;
        resolution: BlLogResolution;
      }
    >,
  ): Promise<{
    tradeOrderId: string | null;
    blLinkedSummary: string | null;
    resolution: BlLogResolution;
  }> {
    const bl = (blRaw ?? '').trim();
    if (!bl) {
      return { tradeOrderId: null, blLinkedSummary: null, resolution: 'none' };
    }
    const hit = cache.get(bl);
    if (hit) return hit;

    const list = await this.tradeOrderRepo.find({
      where: { bl: Equal(bl) },
      take: 2,
      order: { id: 'DESC' },
      select: ['id', 'bl', 'productNameLabel', 'etaDate'],
    });

    if (list.length === 1) {
      const o = list[0]!;
      const eta =
        o.etaDate instanceof Date && !Number.isNaN(o.etaDate.getTime())
          ? o.etaDate.toISOString().slice(0, 10)
          : null;
      const parts = [o.productNameLabel?.trim() || null, eta].filter(Boolean);
      const summary = parts.length > 0 ? parts.join(' · ') : o.bl ?? bl;
      const out = {
        tradeOrderId: String(o.id),
        blLinkedSummary: summary,
        resolution: 'unique' as const,
      };
      cache.set(bl, out);
      return out;
    }
    if (list.length > 1) {
      const out = {
        tradeOrderId: null,
        blLinkedSummary: null,
        resolution: 'ambiguous' as const,
      };
      cache.set(bl, out);
      return out;
    }

    const out = {
      tradeOrderId: null,
      blLinkedSummary: null,
      resolution: 'none' as const,
    };
    cache.set(bl, out);
    return out;
  }

  private async buildAuditSnapshot(
    row: SalesReservationSheetRow,
    codeLists: SheetLogCodeLists,
    customerCache: Map<
      string,
      {
        customerId: string | null;
        resolution: CustomerLogResolution;
        customerMasterCompanyName: string | null;
      }
    >,
    blCache: Map<
      string,
      {
        tradeOrderId: string | null;
        blLinkedSummary: string | null;
        resolution: BlLogResolution;
      }
    >,
  ): Promise<Record<string, unknown>> {
    const base = rowToLogSnapshot(row);
    const rawStatus = typeof base.status === 'string' ? base.status : '';
    const { statusCode, statusDisplayName } = this.resolveStatusCodeAndDisplay(
      rawStatus,
      codeLists.sheetStatusCodes,
    );

    const rawProduct = typeof base.productCode === 'string' ? base.productCode : '';
    const productPair = this.resolveCodeValueAndName(rawProduct, codeLists.productCodes);

    const rawGrade = typeof base.salesGrade === 'string' ? base.salesGrade : '';
    const gradePair = this.resolveCodeValueAndName(rawGrade, codeLists.salesGradeCodes);

    const rawVehicle = typeof base.vehicleCode === 'string' ? base.vehicleCode : '';
    const vehicleNorm = normalizeVehicleStoredForLog(rawVehicle);
    const vehiclePair = this.resolveCodeValueAndName(vehicleNorm, codeLists.vehicleCodes);

    const qtyRaw = String(row.requestedQty ?? '')
      .trim()
      .replace(/,/g, '');
    const vehicleKeyJoined = (vehiclePair.codeValue ?? vehicleNorm).trim();
    const vehicleKeyForDefault = vehicleKeyJoined !== '' ? vehicleKeyJoined : null;
    let requestedQtyMatchesVehicleDefault: boolean | null = null;
    let requestedQtyLogNote: string | null = null;
    if (qtyRaw) {
      const q = parseFloat(qtyRaw);
      if (vehicleKeyForDefault && Number.isFinite(q)) {
        const def = VEHICLE_DEFAULT_CONTAINER_QTY[vehicleKeyForDefault];
        if (def !== undefined && Math.abs(q - def) < 1e-9) {
          requestedQtyMatchesVehicleDefault = true;
          requestedQtyLogNote = `차량코드(${vehicleKeyForDefault}) 기본 컨 환산 ${def}과 일치`;
        } else if (def !== undefined) {
          requestedQtyMatchesVehicleDefault = false;
          requestedQtyLogNote = `저장 ${q}컨, 차량(${vehicleKeyForDefault}) 기본값 ${def}컨과 다름`;
        } else {
          requestedQtyMatchesVehicleDefault = false;
          requestedQtyLogNote = `저장 ${q}컨 (차량 기본 환산 테이블에 없는 코드)`;
        }
      } else if (Number.isFinite(q)) {
        requestedQtyLogNote = `저장 ${q}컨 (차량 미선택·미해석)`;
      }
    }

    const { customerId, resolution, customerMasterCompanyName } =
      await this.resolveCustomerForLog(row.companyName, customerCache);

    const blInfo = await this.resolveBlForLog(row.bl, blCache);

    return {
      ...base,
      statusCode,
      statusDisplayName,
      customerId,
      customerIdResolution: (row.companyName ?? '').trim() ? resolution : null,
      customerMasterCompanyName: (row.companyName ?? '').trim()
        ? customerMasterCompanyName
        : null,
      productCodeResolved: productPair.codeValue,
      productNameResolved: productPair.displayName,
      salesGradeCodeResolved: gradePair.codeValue,
      salesGradeNameResolved: gradePair.displayName,
      vehicleCodeResolved: vehiclePair.codeValue,
      vehicleNameResolved: vehiclePair.displayName,
      blTradeOrderId: blInfo.tradeOrderId,
      blLinkedSummary: blInfo.blLinkedSummary,
      blResolution: (row.bl ?? '').trim() ? blInfo.resolution : null,
      requestedQtyMatchesVehicleDefault,
      requestedQtyLogNote,
    };
  }

  private async appendRowLog(params: {
    sheetId: string;
    rowIndex: number;
    action: SalesReservationSheetRowLogAction;
    userId: number | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      const log = this.rowLogRepo.create({
        sheetId: params.sheetId,
        rowIndex: params.rowIndex,
        action: params.action,
        userId: params.userId ?? null,
        before: params.before,
        after: params.after,
      });
      await this.rowLogRepo.save(log);
    } catch (err) {
      this.logger.warn(
        `[판매예약시트 로그] 저장 실패 sheetId=${params.sheetId} row=${params.rowIndex} action=${params.action}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async upsertRow(
    sheetId: string,
    rowIndex: number,
    dto: UpsertSheetRowDto,
    userId: number | null,
  ): Promise<UpsertRowResult> {
    const sid = sheetId.trim() || 'product-reservations-sheet';

    const existing = await this.repo.findOne({
      where: { sheetId: sid, rowIndex },
    });

    let unitPrice: string | null = null;
    if (dto.unitPrice === null || dto.unitPrice === undefined) {
      unitPrice = null;
    } else if (typeof dto.unitPrice === 'number' && Number.isFinite(dto.unitPrice)) {
      unitPrice = String(dto.unitPrice);
    }

    const payload: Partial<SalesReservationSheetRow> & {
      sheetId: string;
      rowIndex: number;
    } = {
      sheetId: sid,
      rowIndex,
      productCode: emptyToNull(dto.productCode as string | undefined),
      salesGrade: emptyToNull(dto.salesGrade as string | undefined),
      bl: emptyToNull(dto.bl as string | undefined),
      companyName: emptyToNull(dto.companyName as string | undefined),
      contact: emptyToNull(dto.contact as string | undefined),
      requestedQty: emptyToNull(dto.requestedQty as string | undefined),
      vehicleCode: emptyToNull(dto.vehicleCode as string | undefined),
      loadingSchedule: emptyToNull(dto.loadingSchedule as string | undefined),
      arrivalSchedule: emptyToNull(dto.arrivalSchedule as string | undefined),
      remarks: emptyToNull(dto.remarks as string | undefined),
      reference: emptyToNull(dto.reference as string | undefined),
      status: emptyToNull(dto.status as string | undefined),
      unitPrice,
      userId: userId ?? null,
    };

    const dataOnly = {
      productCode: payload.productCode,
      salesGrade: payload.salesGrade,
      bl: payload.bl,
      companyName: payload.companyName,
      contact: payload.contact,
      requestedQty: payload.requestedQty,
      vehicleCode: payload.vehicleCode,
      loadingSchedule: payload.loadingSchedule,
      arrivalSchedule: payload.arrivalSchedule,
      remarks: payload.remarks,
      reference: payload.reference,
      status: payload.status,
      unitPrice: payload.unitPrice,
    };

    if (isRowDataEmpty(dataOnly)) {
      if (!existing) {
        return { deleted: true, rowIndex };
      }
      const codeListsDel = await this.loadLogCodeLists();
      const customerLogCacheDel = new Map<
        string,
        {
          customerId: string | null;
          resolution: CustomerLogResolution;
          customerMasterCompanyName: string | null;
        }
      >();
      const blLogCacheDel = new Map<
        string,
        {
          tradeOrderId: string | null;
          blLinkedSummary: string | null;
          resolution: BlLogResolution;
        }
      >();
      const beforeSnap = await this.buildAuditSnapshot(
        existing,
        codeListsDel,
        customerLogCacheDel,
        blLogCacheDel,
      );
      await this.repo.delete({ sheetId: sid, rowIndex });
      this.sse.broadcastRowDeleted(sid, rowIndex);
      await this.appendRowLog({
        sheetId: sid,
        rowIndex,
        action: 'DELETE',
        userId,
        before: beforeSnap,
        after: null,
      });
      return { deleted: true, rowIndex };
    }

    const codeLists = await this.loadLogCodeLists();
    const customerLogCache = new Map<
      string,
      {
        customerId: string | null;
        resolution: CustomerLogResolution;
        customerMasterCompanyName: string | null;
      }
    >();
    const blLogCache = new Map<
      string,
      {
        tradeOrderId: string | null;
        blLinkedSummary: string | null;
        resolution: BlLogResolution;
      }
    >();

    // findOne + save 는 동시 요청 시 둘 다 INSERT → uq_srsr_sheet_row 충돌. ON CONFLICT 로 원자 처리.
    await this.repo.upsert(payload, {
      conflictPaths: ['sheetId', 'rowIndex'],
      skipUpdateIfNoValuesChanged: false,
    });

    const saved = await this.repo.findOneOrFail({
      where: { sheetId: sid, rowIndex },
    });
    this.sse.broadcastRowUpdated(sid, saved);

    const afterSnap = await this.buildAuditSnapshot(
      saved,
      codeLists,
      customerLogCache,
      blLogCache,
    );
    const action: SalesReservationSheetRowLogAction = existing ? 'UPDATE' : 'INSERT';
    const beforeSnap = existing
      ? await this.buildAuditSnapshot(existing, codeLists, customerLogCache, blLogCache)
      : null;
    await this.appendRowLog({
      sheetId: sid,
      rowIndex,
      action,
      userId,
      before: beforeSnap,
      after: afterSnap,
    });

    return saved;
  }
}
