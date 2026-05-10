import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, IsNull, SelectQueryBuilder } from 'typeorm';
import { SalesService } from './sales.service';
import { Invoice } from './entities/invoice.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { Sales } from './entities/sales.entity';
import { SalesItem } from './entities/sales-item.entity';
import { SalesDelivery } from '../sales-delivery/entities/sales-delivery.entity';
import { SalesDeliveryLoadingItem } from '../sales-delivery/entities/sales-delivery-loading-item.entity';
import { SmsHistory } from '../sms-history/entities/sms-history.entity';
import { AccountsReceivable } from '../receivables/entities/accounts-receivable.entity';
import { ReceivableCollection } from '../receivables/entities/receivable-collection.entity';
import { CustomerPrepayment } from './entities/customer-prepayment.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { GetPendingInvoicesDto } from './dto/get-pending-invoices.dto';
import { GetAvailableSalesItemsDto } from './dto/get-available-sales-items.dto';
import { TransactionNumberGenerator } from '../receivables/utils/transaction-number-generator';
import { calculatePaymentDueDate } from '../receivables/utils/payment-due-date-calculator';
import { FeatureAuditLogService } from '../feature-audit-log/feature-audit-log.service';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly invoiceItemRepository: Repository<InvoiceItem>,
    @InjectRepository(Sales)
    private readonly salesRepository: Repository<Sales>,
    @InjectRepository(SalesItem)
    private readonly salesItemRepository: Repository<SalesItem>,
    @InjectRepository(SalesDelivery)
    private readonly salesDeliveryRepository: Repository<SalesDelivery>,
    @InjectRepository(SmsHistory)
    private readonly smsHistoryRepository: Repository<SmsHistory>,
    private readonly dataSource: DataSource,
    private readonly transactionNumberGenerator: TransactionNumberGenerator,
    private readonly salesService: SalesService,
    private readonly featureAuditLogService: FeatureAuditLogService,
  ) {}

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
   * 프론트 datetime-local에서 오는 발행일시를 UTC Date로 변환
   * "YYYY-MM-DDTHH:mm:ss" 또는 "YYYY-MM-DD" → 항상 한국시간(KST)으로 해석
   */
  private parseIssuedAtAsKoreaTime(s: string): Date {
    const str = String(s).trim();
    const dateTimeMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{3}))?/);
    if (dateTimeMatch) {
      const [, y, m, d, h, min, sec = 0] = dateTimeMatch.map((x) => (x ? parseInt(x, 10) : 0));
      return new Date(Date.UTC(y, m - 1, d, h - 9, min, sec));
    }
    const dateOnlyMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateOnlyMatch) {
      const [, y, m, d] = dateOnlyMatch.map((x) => parseInt(x, 10));
      return new Date(Date.UTC(y, m - 1, d, -9, 0, 0));
    }
    const fallback = new Date(str);
    if (Number.isNaN(fallback.getTime())) throw new BadRequestException('발행일시 형식이 올바르지 않습니다.');
    return fallback;
  }

  /** 거래명세서 번호(YYYY/MM/DD-N) 비교: 날짜·일련번호 기준 (10 > 9 > 2) */
  private compareInvoiceNumber(a: string, b: string, order: 'asc' | 'desc'): number {
    const parse = (s: string): { date: number; seq: number } => {
      if (!s || typeof s !== 'string') return { date: 0, seq: 0 };
      const dash = s.indexOf('-');
      if (dash === -1) {
        const date = new Date(s.replace(/\//g, '-')).getTime();
        return { date: Number.isNaN(date) ? 0 : date, seq: 0 };
      }
      const datePart = s.slice(0, dash).trim().replace(/\//g, '-');
      const seqPart = s.slice(dash + 1).trim();
      const date = datePart ? new Date(datePart).getTime() : 0;
      const seq = parseInt(seqPart, 10) || 0;
      return { date: Number.isNaN(date) ? 0 : date, seq };
    };
    const pa = parse(a);
    const pb = parse(b);
    if (pa.date !== pb.date) return order === 'asc' ? pa.date - pb.date : pb.date - pa.date;
    return order === 'asc' ? pa.seq - pb.seq : pb.seq - pa.seq;
  }

  /**
   * 컨테이너별 운송비 계산 (kg당)
   * 단순화: 전체 운송비를 컨테이너 중량으로 나눔 (정확한 분배를 위해서는 전체 중량이 필요하지만, 여기서는 단순화)
   */
  private calculateTransportFeePerKg(
    totalTransportFee: number | null,
    containerWeight: number | null,
  ): number {
    if (!totalTransportFee || !containerWeight || containerWeight === 0) {
      return 0;
    }
    // 단순화: 전체 운송비를 컨테이너 중량으로 나눔
    return totalTransportFee / (containerWeight * 1000);
  }

  /**
   * 발행대기 목록 조회
   * 조건: 하차완료 + 발행대기 상태
   */
  async findPendingInvoices(dto: GetPendingInvoicesDto) {
    const { page = 1, limit = 20, search } = dto;

    const queryBuilder = this.salesRepository
      .createQueryBuilder('sales')
      .leftJoinAndSelect('sales.items', 'items')
      .leftJoinAndSelect('items.container', 'container')
      .leftJoinAndSelect('sales.customer', 'customer')
      .innerJoin(
        'tb_sales_delivery',
        'delivery',
        'delivery.sd_sales_id = sales.sa_id AND delivery.sd_status = :status AND delivery.sd_deleted_at IS NULL',
        {
          status: 'UNLOADING_COMPLETED',
        },
      )
      .where('(sales.sa_invoice_status = :pendingStatus OR sales.sa_invoice_status IS NULL)', {
        pendingStatus: 'PENDING_ISSUE',
      })
      .addSelect([
        'delivery.sd_id as delivery_id',
        'delivery.sd_status as delivery_status',
        'delivery.sd_unloading_date_time as delivery_unloading_date_time',
      ]);

    if (search) {
      queryBuilder.andWhere(
        '(sales.sa_id::text LIKE :search OR customer.companyName LIKE :search)',
        { search: `%${search}%` },
      );
    }

    // 전체 데이터 조회 (정렬을 위해)
    const [allData, total] = await queryBuilder.getManyAndCount();

    // delivery 정보를 각 sales 객체에 추가하고 정렬 정보 포함
    const salesWithDelivery = await Promise.all(
      allData.map(async (sale) => {
        const delivery = await this.salesDeliveryRepository.findOne({
          where: { salesId: sale.id },
          select: ['id', 'status', 'unloadingDateTime'],
        });
        return {
          ...sale,
          delivery: delivery
            ? {
                id: delivery.id,
                status: delivery.status,
                unloadingDateTime: delivery.unloadingDateTime,
              }
            : null,
        };
      }),
    );

    // 하차 일시 기준으로 내림차순 정렬, 그 다음 생성일 기준
    salesWithDelivery.sort((a, b) => {
      const dateA = a.delivery?.unloadingDateTime 
        ? new Date(a.delivery.unloadingDateTime).getTime() 
        : a.createdAt?.getTime() || 0;
      const dateB = b.delivery?.unloadingDateTime 
        ? new Date(b.delivery.unloadingDateTime).getTime() 
        : b.createdAt?.getTime() || 0;
      return dateB - dateA; // 내림차순
    });

    // 페이지네이션 적용
    const paginatedData = salesWithDelivery.slice((page - 1) * limit, page * limit);

    return {
      data: paginatedData,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }

  /**
   * 발행된 거래명세서 목록 조회
   * SMS 발송 상태 정보 포함
   */
  /** 발행된 거래명세서에 연결된 판매 중 취소된 것이 있는지 여부 */
  private hasCancelledSales(invoice: Invoice): boolean {
    const items = invoice.items ?? [];
    return items.some((item) => {
      const sales = (item as any).salesItem?.sales;
      return sales?.cancelledAt != null;
    });
  }

  async findIssuedInvoices(dto: GetPendingInvoicesDto) {
    const {
      page = 1,
      limit = 20,
      search,
      smsStatus,
      smsStatuses,
      ecountProcessingStatus,
      ecountProcessingStatuses,
      issuedAtStartDate,
      issuedAtEndDate,
      supplierId,
      supplierIds,
      excludeCancelled = false,
      sortBy = 'invoiceNumber',
      sortOrder: sortOrderParam,
    } = dto;
    const smsFilterList =
      smsStatuses !== undefined ? smsStatuses : smsStatus ? [smsStatus] : undefined;
    const ecountFilterList =
      ecountProcessingStatuses !== undefined
        ? ecountProcessingStatuses
        : ecountProcessingStatus
          ? [ecountProcessingStatus]
          : undefined;
    const supplierFilterList =
      supplierIds !== undefined ? supplierIds : supplierId !== undefined && supplierId !== null ? [supplierId] : undefined;
    const sortOrder = (sortOrderParam ?? 'desc').toLowerCase() as 'asc' | 'desc';

    const queryBuilder = this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .leftJoinAndSelect('invoice.supplier', 'supplier')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.salesItem', 'salesItem')
      .leftJoinAndSelect('salesItem.container', 'itemContainer')
      .leftJoinAndSelect('itemContainer.order', 'itemOrder', 'itemOrder.to_deleted_at IS NULL')
      .leftJoinAndSelect('itemOrder.inbounds', 'itemOrderInbounds')
      .leftJoinAndSelect('salesItem.sales', 'sales')
      .leftJoinAndSelect('invoice.issuedByUser', 'issuedByUser')
      .leftJoinAndSelect('invoice.smsManager', 'smsManager')
      .leftJoinAndSelect('invoice.ecountProcessedByUser', 'ecountProcessedByUser')
      .where('invoice.status = :status', { status: 'ISSUED' });
    // 취소(소프트삭제)된 거래명세서도 목록에 포함

    if (search) {
      const searchLower = `%${search.toLowerCase()}%`;
      queryBuilder.andWhere(
        '(LOWER(invoice.invoiceNumber) LIKE :search OR ' +
        'LOWER(customer.companyName) LIKE :search OR ' +
        'LOWER(customer.ceo) LIKE :search)',
        { search: searchLower },
      );
    }

    // 발행일시 기간 필터링
    if (issuedAtStartDate) {
      const startDate = new Date(issuedAtStartDate);
      startDate.setHours(0, 0, 0, 0);
      queryBuilder.andWhere('invoice.issuedAt >= :issuedAtStartDate', { issuedAtStartDate: startDate });
    }

    if (issuedAtEndDate) {
      const endDate = new Date(issuedAtEndDate);
      endDate.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('invoice.issuedAt <= :issuedAtEndDate', { issuedAtEndDate: endDate });
    }

    // 공급자 필터 (0 = 미지정, >0 = 특정 공급자). 다중 선택 시 OR
    if (supplierFilterList !== undefined) {
      if (supplierFilterList.length === 0) {
        queryBuilder.andWhere('1 = 0');
      } else {
        const hasNull = supplierFilterList.includes(0);
        const ids = supplierFilterList.filter((id) => id > 0);
        if (hasNull && ids.length > 0) {
          queryBuilder.andWhere('(invoice.supplierId IS NULL OR invoice.supplierId IN (:...supplierIds))', {
            supplierIds: ids,
          });
        } else if (hasNull) {
          queryBuilder.andWhere('invoice.supplierId IS NULL');
        } else {
          queryBuilder.andWhere('invoice.supplierId IN (:...supplierIds)', { supplierIds: ids });
        }
      }
    }

    // 전체 거래명세서 조회 (SMS 상태 필터 적용 전) - deletedAt 있는 건도 포함
    const [rawData, rawTotal] = await queryBuilder
      .orderBy('invoice.issuedAt', 'DESC')
      .getManyAndCount();

    // 취소 건 제외 옵션 (excludeCancelled: true면 발행취소·판매취소 모두 제외)
    let allData = rawData;
    if (excludeCancelled) {
      allData = allData.filter((inv) => inv.deletedAt == null && !this.hasCancelledSales(inv));
    }

    // 각 명세에 판매 취소 여부·거래명세서 취소 여부 부여 (프론트 배지 표시용)
    const allDataWithSalesCancelled = allData.map((inv) => ({
      ...inv,
      salesCancelled: this.hasCancelledSales(inv),
      invoiceCancelled: inv.deletedAt != null,
    }));

    // 모든 거래명세서의 SMS 이력 조회 (배치 처리)
    const allInvoiceIds = allDataWithSalesCancelled.map((inv) => Number(inv.id));
    const allSmsHistories = allInvoiceIds.length > 0
      ? await this.smsHistoryRepository
          .createQueryBuilder('sh')
          .where('sh.invoiceId IN (:...ids)', { ids: allInvoiceIds })
          .andWhere('sh.templateType = :type', { type: 'INVOICE' })
          .orderBy('sh.createdAt', 'DESC')
          .getMany()
      : [];

    // Invoice ID별 최신 SMS 이력 매핑 (최신 이력만)
    const smsHistoryMap = new Map<number, SmsHistory>();
    allSmsHistories.forEach(sh => {
      const invoiceId = Number(sh.invoiceId);
      if (invoiceId && !smsHistoryMap.has(invoiceId)) {
        smsHistoryMap.set(invoiceId, sh);
      }
    });

    // Invoice에 SMS 상태 정보 추가 및 필터링 (smsNotApplicable이면 NOT_APPLICABLE로 표시)
    const dataWithSms = allDataWithSalesCancelled.map((invoice) => {
      const smsHistory = smsHistoryMap.get(Number(invoice.id));
      const resolvedSmsStatus = (invoice as Invoice).smsNotApplicable
        ? 'NOT_APPLICABLE'
        : (smsHistory?.status || null);
      return {
        ...invoice,
        smsStatus: resolvedSmsStatus,
        smsSentAt: smsHistory?.sentAt || null,
        smsResultMessage: smsHistory?.resultMessage || null,
      };
    });

    // SMS 상태 필터 적용 (다중: 하나라도 일치)
    let filteredData = dataWithSms;
    if (smsFilterList !== undefined) {
      if (smsFilterList.length === 0) {
        filteredData = [];
      } else {
        filteredData = filteredData.filter((inv) =>
          smsFilterList.some((token) => {
            if (token === 'NONE' || token === 'null') {
              return !inv.smsStatus;
            }
            if (token === 'not_applicable' || token === 'NOT_APPLICABLE') {
              return inv.smsStatus === 'NOT_APPLICABLE';
            }
            return inv.smsStatus === token;
          }),
        );
      }
    }

    // 이카운트 처리 상태 필터 적용 (다중)
    if (ecountFilterList !== undefined) {
      if (ecountFilterList.length === 0) {
        filteredData = [];
      } else {
        filteredData = filteredData.filter((inv) =>
          ecountFilterList.some((token) => {
            if (token === 'processed') {
              return inv.ecountProcessingStatus === 'PROCESSED';
            }
            if (token === 'not_processed') {
              return !inv.ecountProcessingStatus || inv.ecountProcessingStatus === 'NOT_PROCESSED';
            }
            if (token === 'needs_confirmation') {
              return inv.ecountProcessingStatus === 'NEEDS_CONFIRMATION';
            }
            if (token === 'not_applicable' || token === 'NOT_APPLICABLE') {
              return inv.ecountProcessingStatus === 'NOT_APPLICABLE';
            }
            return false;
          }),
        );
      }
    }

    // 필터링 후 총 개수
    const filteredTotal = filteredData.length;

    // 정렬 적용 (백엔드)
    const allowedSortColumns = ['invoiceNumber', 'customerName', 'supplier', 'issuedAt', 'items', 'invoiceAmount', 'issuedByUser', 'smsStatus', 'ecountProcessingStatus'];
    const safeSortBy = sortBy && allowedSortColumns.includes(sortBy) ? sortBy : 'invoiceNumber';
    filteredData.sort((a, b) => {
      const order = sortOrder === 'asc' ? 1 : -1;
      if (safeSortBy === 'invoiceNumber') {
        return this.compareInvoiceNumber(a.invoiceNumber || '', b.invoiceNumber || '', sortOrder);
      }
      let aVal: string | number;
      let bVal: string | number;
      switch (safeSortBy) {
        case 'customerName':
          aVal = a.customer?.companyName || '';
          bVal = b.customer?.companyName || '';
          break;
        case 'supplier':
          aVal = (a as any).supplier?.companyName || '';
          bVal = (b as any).supplier?.companyName || '';
          break;
        case 'issuedAt':
          aVal = a.issuedAt ? new Date(a.issuedAt).getTime() : 0;
          bVal = b.issuedAt ? new Date(b.issuedAt).getTime() : 0;
          break;
        case 'items':
          aVal = a.items?.length ?? 0;
          bVal = b.items?.length ?? 0;
          break;
        case 'invoiceAmount':
          aVal = a.invoiceAmount ?? 0;
          bVal = b.invoiceAmount ?? 0;
          break;
        case 'issuedByUser':
          aVal = (a as any).issuedByUser?.name || '';
          bVal = (b as any).issuedByUser?.name || '';
          break;
        case 'smsStatus':
          aVal = (a as any).smsStatus || '';
          bVal = (b as any).smsStatus || '';
          break;
        case 'ecountProcessingStatus':
          aVal = (a as any).ecountProcessingStatus || '';
          bVal = (b as any).ecountProcessingStatus || '';
          break;
        default:
          return 0;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return order * (sortOrder === 'asc' ? aVal.localeCompare(bVal, 'ko') : bVal.localeCompare(aVal, 'ko'));
      }
      return order * ((aVal as number) - (bVal as number));
    });

    // 페이지네이션 적용
    const paginatedData = filteredData.slice((page - 1) * limit, page * limit);

    // tb_invoice: timestamp 컬럼이 pg 연결 타임존에 따라 잘못 해석될 수 있음
    // → raw 쿼리로 UTC 기준 ISO 문자열 직접 조회 (운송·판매와 동일한 표시 보장)
    const invoiceIds = paginatedData.map((inv) => Number(inv.id)).filter((n) => !Number.isNaN(n));
    if (invoiceIds.length > 0) {
      const rows = await this.dataSource.query<
        { iv_id: string; issued_at: string | null; created_at: string; updated_at: string }[]
      >(
        `SELECT iv_id::text AS iv_id,
          CASE WHEN iv_issued_at IS NOT NULL THEN to_char(iv_issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ELSE NULL END AS issued_at,
          to_char(iv_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
          to_char(iv_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
         FROM tb_invoice WHERE iv_id = ANY($1::bigint[])`,
        [invoiceIds],
      );
      const rowList = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] })?.rows ?? [];
      const tsMap = new Map(
        rowList.map((r: { iv_id: string; issued_at: string | null; created_at: string; updated_at: string }) => [
          r.iv_id,
          { issuedAt: r.issued_at, createdAt: r.created_at, updatedAt: r.updated_at },
        ]),
      );
      for (const inv of paginatedData) {
        const ts = tsMap.get(String(inv.id)) as
          | { issuedAt: string | null; createdAt: string; updatedAt: string }
          | undefined;
        if (ts) {
          (inv as any).issuedAt = ts.issuedAt;
          (inv as any).createdAt = ts.createdAt;
          (inv as any).updatedAt = ts.updatedAt;
        }
      }
    }

    return {
      data: paginatedData,
      total: filteredTotal,
      page,
      lastPage: Math.ceil(filteredTotal / limit),
    };
  }

  /**
   * 이카운트 ERP 처리 상태 업데이트 (PROCESSED | NOT_PROCESSED | NOT_APPLICABLE)
   */
  async updateEcountProcessingStatus(
    invoiceId: string,
    status: 'PROCESSED' | 'NOT_PROCESSED' | 'NOT_APPLICABLE',
    userId: number,
  ) {
    const invoice = await this.invoiceRepository.findOne({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException('거래명세서를 찾을 수 없습니다.');
    }

    invoice.ecountProcessingStatus = status;
    if (status === 'PROCESSED') {
      invoice.ecountProcessedAt = new Date();
      invoice.ecountProcessedBy = userId;
    } else {
      invoice.ecountProcessedAt = null;
      invoice.ecountProcessedBy = null;
    }

    await this.invoiceRepository.save(invoice);

    return await this.findOne(invoiceId);
  }

  /**
   * SMS 해당없음 설정 업데이트
   */
  async updateSmsNotApplicable(invoiceId: string, smsNotApplicable: boolean) {
    const invoice = await this.invoiceRepository.findOne({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException('거래명세서를 찾을 수 없습니다.');
    }

    invoice.smsNotApplicable = smsNotApplicable;
    await this.invoiceRepository.save(invoice);

    return await this.findOne(invoiceId);
  }

  /**
   * 거래명세서 발행일만 수정 (임시 기능, 채권 상세에서 발행일만 변경할 때 사용)
   * 채권의 lastPaymentDueDate도 재계산하여 반영한다.
   */
  async updateIssuedAt(invoiceId: string, issuedAt: string) {
    const invoice = await this.invoiceRepository.findOne({
      where: { id: invoiceId, deletedAt: null },
    });
    if (!invoice) {
      throw new NotFoundException('거래명세서를 찾을 수 없습니다.');
    }
    const parsed = this.parseIssuedAtAsKoreaTime(issuedAt);
    invoice.issuedAt = parsed;
    await this.invoiceRepository.save(invoice);

    const customerId = invoice.customerId ?? null;
    if (customerId) {
      const arRepo = this.dataSource.getRepository(AccountsReceivable);
      const receivable = await arRepo.findOne({ where: { customerId } });
      if (receivable) {
        const allInvoices = await this.invoiceRepository
          .createQueryBuilder('invoice')
          .where('invoice.customerId = :customerId', { customerId })
          .andWhere('invoice.deletedAt IS NULL')
          .andWhere(
            `NOT EXISTS (
              SELECT 1 FROM tb_invoice_item ii
              INNER JOIN tb_sales_item si ON si.si_id = ii.si_id
              INNER JOIN tb_sales s ON s.sa_id = si.sa_id
              WHERE ii.iv_id = invoice.iv_id AND s.sa_cancelled_at IS NOT NULL
            )`,
          )
          .orderBy('invoice.issuedAt', 'DESC')
          .getMany();
        const paymentDueDates: Date[] = [];
        const paymentTermsType = receivable.paymentTermsType || 'DAYS';
        const paymentTermsValue = receivable.paymentTermsValue;
        for (const inv of allInvoices) {
          if (inv.issuedAt) {
            const dueDate = calculatePaymentDueDate(
              inv.issuedAt,
              paymentTermsType as any,
              paymentTermsValue ?? undefined,
            );
            paymentDueDates.push(dueDate);
          }
        }
        if (paymentDueDates.length > 0) {
          const lastPaymentDueDate = paymentDueDates.reduce((a, b) => (b > a ? b : a));
          receivable.lastPaymentDueDate = lastPaymentDueDate;
          await arRepo.save(receivable);
        }
      }
    }
    return await this.findOne(invoiceId);
  }

  /**
   * 명세 상세·발행/수정 응답용 조인 (소프트 삭제된 무역 부킹은 제외)
   * @param includeSoftDeleted true면 발행 취소(iv_deleted_at 설정)된 명세도 조회 — 목록과 동일하게 상세 Drawer에서 볼 수 있게 함
   */
  private createInvoiceDetailQueryBuilder(
    invRepo: Repository<Invoice>,
    invoiceId: string,
    options?: { includeSoftDeleted?: boolean },
  ): SelectQueryBuilder<Invoice> {
    const qb = invRepo
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .leftJoinAndSelect('invoice.statementName', 'statementName')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.salesItem', 'salesItem')
      .leftJoinAndSelect('salesItem.container', 'itemTradeContainer')
      .leftJoinAndSelect(
        'itemTradeContainer.order',
        'itemTradeOrder',
        'itemTradeOrder.to_deleted_at IS NULL',
      )
      .leftJoinAndSelect('salesItem.sales', 'itemSales')
      .leftJoinAndSelect('itemSales.customer', 'itemSalesCustomer')
      .leftJoinAndSelect('invoice.issuedByUser', 'issuedByUser')
      .leftJoinAndSelect('invoice.smsManager', 'smsManager')
      .leftJoinAndSelect('invoice.ecountProcessedByUser', 'ecountProcessedByUser')
      .leftJoinAndSelect('invoice.supplier', 'supplier')
      .where('invoice.id = :id', { id: invoiceId });
    if (!options?.includeSoftDeleted) {
      qb.andWhere('invoice.deletedAt IS NULL');
    }
    return qb;
  }

  /**
   * 거래명세서 상세 조회
   * SMS 발송 상태 정보 포함
   */
  async findOne(id: string) {
    const invoice = await this.createInvoiceDetailQueryBuilder(this.invoiceRepository, id, {
      includeSoftDeleted: true,
    }).getOne();

    if (!invoice) {
      throw new NotFoundException('거래명세서를 찾을 수 없습니다.');
    }

    // 전일잔액 표시: 장부 잔액(이 명세서 직전 시점)으로 통일 (저장값이 잘못돼 있어도 조회 시 재계산해 표시)
    const issuedAt = invoice.issuedAt ? new Date(invoice.issuedAt) : new Date();
    const invoiceNumber = invoice.invoiceNumber ?? '';
    if (invoice.customerId && invoiceNumber) {
      const displayPrevious = await this.dataSource.transaction((manager) =>
        this.getLedgerBalanceBeforeInvoice(manager, String(invoice.customerId), issuedAt, invoiceNumber),
      );
      invoice.previousBalance = displayPrevious;
    }

    // tb_invoice: iv_issued_at은 KST로 저장됨 → Asia/Seoul 해석, created/updated는 UTC
    const numId = parseInt(id, 10);
    if (!Number.isNaN(numId)) {
      const rows = await this.dataSource.query<
        { issued_at: string | null; created_at: string; updated_at: string }[]
      >(
        `SELECT
          CASE WHEN iv_issued_at IS NOT NULL THEN to_char(iv_issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ELSE NULL END AS issued_at,
          to_char(iv_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
          to_char(iv_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
         FROM tb_invoice WHERE iv_id = $1`,
        [numId],
      );
      const row0 = Array.isArray(rows) ? rows[0] : (rows as { rows?: { issued_at: string | null; created_at: string; updated_at: string }[] })?.rows?.[0];
      if (row0) {
        (invoice as any).issuedAt = row0.issued_at;
        (invoice as any).createdAt = row0.created_at;
        (invoice as any).updatedAt = row0.updated_at;
      }
    }

    // 최신 SMS 이력 조회
    const latestSmsHistory = await this.smsHistoryRepository.findOne({
      where: {
        invoiceId: Number(id),
        templateType: 'INVOICE',
      },
      order: { createdAt: 'DESC' },
    });

    // SMS 상태 정보 + 목록과 동일한 취소 배지용 플래그
    return {
      ...invoice,
      smsStatus: latestSmsHistory?.status || null,
      smsSentAt: latestSmsHistory?.sentAt || null,
      smsResultMessage: latestSmsHistory?.resultMessage || null,
      invoiceCancelled: invoice.deletedAt != null,
      salesCancelled: this.hasCancelledSales(invoice),
    };
  }

  /**
   * 거래명세서 번호 자동 생성 (통합 번호 체계 사용)
   * 형식: YYYY/MM/DD-순번
   * 거래명세서와 수금이 같은 날짜면 순번이 연속됨
   */
  private async generateInvoiceNumber(targetDate?: Date): Promise<string> {
    return this.transactionNumberGenerator.generateTransactionNumber(targetDate);
  }

  /**
   * 이 거래명세서 직전 시점의 장부 잔액(전일잔액)을 계산.
   * 거래처관리대장과 동일: (이전 발행 명세서 합계) - (그 시점까지의 수금 합계).
   * 수금이 있으면 직전 명세서 금일잔액이 아니라 실제 잔액이 0이 될 수 있음.
   */
  private async getLedgerBalanceBeforeInvoice(
    manager: any,
    customerId: string,
    issuedAt: Date,
    invoiceNumber: string,
  ): Promise<number> {
    const issuedDateOnly = new Date(issuedAt.getFullYear(), issuedAt.getMonth(), issuedAt.getDate());
    const issuedDateOnlyStr = `${issuedDateOnly.getFullYear()}-${String(issuedDateOnly.getMonth() + 1).padStart(2, '0')}-${String(issuedDateOnly.getDate()).padStart(2, '0')}`;
    const invRepo = manager.getRepository(Invoice);
    const arRepo = manager.getRepository(AccountsReceivable);
    const colRepo = manager.getRepository(ReceivableCollection);

    // 이 명세서보다 이전에 발행된 유효 명세서 합계 (발행취소·판매취소 제외, issuedAt IS NOT NULL)
    const invoiceSums = await invRepo
      .createQueryBuilder('inv')
      .select('COALESCE(SUM(inv.invoiceAmount), 0)', 'total')
      .where('inv.customerId = :customerId', { customerId })
      .andWhere('inv.deletedAt IS NULL')
      .andWhere('inv.status = :status', { status: 'ISSUED' })
      .andWhere('inv.issuedAt IS NOT NULL')
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM tb_invoice_item ii
          INNER JOIN tb_sales_item si ON si.si_id = ii.si_id
          INNER JOIN tb_sales s ON s.sa_id = si.sa_id
          WHERE ii.iv_id = inv.iv_id AND s.sa_cancelled_at IS NOT NULL
        )`,
      )
      .andWhere(
        '(inv.issuedAt < :issuedAt OR (inv.issuedAt = :issuedAt AND inv.invoiceNumber < :invoiceNumber))',
        { issuedAt, invoiceNumber },
      )
      .getRawOne();
    const invoiceSum = invoiceSums && invoiceSums.total != null ? Number(invoiceSums.total) || 0 : 0;

    const receivable = await arRepo.findOne({ where: { customerId } });
    if (!receivable) return invoiceSum;

    // 발행일 직전 날짜까지의 수금 합계 (발행일 당일 수금은 장부상 이 명세서 다음이므로 제외)
    const collectionSums = await colRepo
      .createQueryBuilder('rc')
      .select('COALESCE(SUM(rc.collectionAmount), 0)', 'total')
      .where('rc.receivableId = :arId', { arId: receivable.id })
      .andWhere('DATE(rc.collectionDate) < :issuedDate', { issuedDate: issuedDateOnlyStr })
      .getRawOne();
    const collectionSum = collectionSums && collectionSums.total != null ? Number(collectionSums.total) || 0 : 0;

    return invoiceSum - collectionSum;
  }

  /**
   * 거래명세서 발행
   */
  async createInvoice(dto: CreateInvoiceDto, userId: number) {
    // 고객 정보 조회
    const customer = await this.dataSource
      .getRepository('Customer')
      .findOne({ where: { id: dto.customerId } });

    if (!customer) {
      throw new NotFoundException('고객 정보를 찾을 수 없습니다.');
    }

    // 거래명세서 항목 검증
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('거래명세서 항목이 없습니다.');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      // 금액 및 수량 계산
      let subtotal = 0;
      let vatAmount = 0;
      let totalQuantity = 0;
      const invoiceItems = dto.items.map((item, index) => {
        // amount가 직접 입력된 경우 우선 사용, 없으면 quantity * unitPrice로 계산
        const amount = item.amount != null 
          ? Number(item.amount) 
          : (item.quantity != null && item.unitPrice != null 
              ? Number(item.quantity) * Number(item.unitPrice) 
              : 0);
        subtotal += amount;
        vatAmount += item.vatAmount || 0;
        // 수량이 null이면 총 수량에 포함하지 않음
        if (item.quantity != null) {
          totalQuantity += Number(item.quantity) || 0;
        }

        let salesItemId: string | null = null;
        if (item.salesItemId) {
          const parsedSalesItemId = item.salesItemId.toString().trim();
          if (parsedSalesItemId && /^\d+$/.test(parsedSalesItemId)) {
            salesItemId = parsedSalesItemId;
          } else {
            this.logger.warn(
              `[createInvoice] salesItemId 검증 실패 - order: ${item.order || index + 1}, ` +
              `productName: ${item.productName}, 원본값: ${item.salesItemId}, 파싱값: ${parsedSalesItemId}`
            );
          }
        } else {
          this.logger.warn(
            `[createInvoice] salesItemId가 없음 - order: ${item.order || index + 1}, ` +
            `productName: ${item.productName}`
          );
        }

        this.logger.log(
          `[createInvoice] 거래명세서 항목 생성 - order: ${item.order || index + 1}, ` +
          `productName: ${item.productName}, salesItemId: ${salesItemId || 'null'}`
        );

        const invoiceItem = manager.create(InvoiceItem, {
          invoiceId: '', // 나중에 설정
          order: item.order || index + 1,
          salesItemId: salesItemId,
          productName: item.productName || null,
          quantity: item.quantity || null,
          unit: item.unit || null,
          unitPrice: item.unitPrice || null,
          amount: item.amount != null ? Number(item.amount) : amount,
          vatAmount: item.vatAmount || null,
          weight: item.weight || null,
          notes: item.notes || null,
        });

        return invoiceItem;
      });

      const vatApplied = dto.vatApplied ?? false;
      const vatRate = dto.vatRate ?? 10.0;
      const finalVatAmount = vatApplied ? vatAmount : 0;
      const invoiceAmount = subtotal + finalVatAmount;

      // 발행일시 설정 (프론트 datetime-local → 항상 한국시간으로 해석 후 UTC 저장)
      let issuedAt: Date;
      if (dto.issuedAt) {
        issuedAt = this.parseIssuedAtAsKoreaTime(dto.issuedAt);
      } else {
        issuedAt = new Date();
      }

      // 거래명세서 번호 생성 (없으면 발행일시 기준으로 자동 생성)
      let invoiceNumber = dto.invoiceNumber?.trim() || null;
      if (invoiceNumber) {
        // 프론트에서 번호를 보냈어도 이미 존재하면 자동 생성으로 대체 (취소 후 재발행 등)
        const existing = await this.dataSource.query<
          { iv_invoice_number: string; iv_deleted_at: string | null }[]
        >(
          'SELECT iv_invoice_number, iv_deleted_at FROM tb_invoice WHERE iv_invoice_number = $1 LIMIT 1',
          [invoiceNumber],
        );
        if (existing.length > 0) {
          this.logger.warn(
            `[createInvoice] 프론트 요청번호 "${invoiceNumber}" 이미 존재(취소여부: ${existing[0].iv_deleted_at ? '취소됨' : '유효'}) → 자동생성으로 대체, issuedAt=${issuedAt?.toISOString?.()}`,
          );
          invoiceNumber = null;
        } else {
          this.logger.log(`[createInvoice] 프론트 요청번호 "${invoiceNumber}" 사용, issuedAt=${issuedAt?.toISOString?.()}`);
        }
      }
      if (!invoiceNumber) {
        invoiceNumber = await this.generateInvoiceNumber(issuedAt);
        this.logger.log(`[createInvoice] 자동생성 번호="${invoiceNumber}", issuedAt=${issuedAt?.toISOString?.()}`);
      }

      // 전일잔액 = 이 명세서 직전 시점의 장부 잔액 (거래처관리대장과 동일: 명세서 합계 - 수금 합계)
      const previousBalance = await this.getLedgerBalanceBeforeInvoice(
        manager,
        String(dto.customerId),
        issuedAt,
        invoiceNumber,
      );
      const arRepo = manager.getRepository(AccountsReceivable);
      let receivable = await arRepo.findOne({
        where: { customerId: dto.customerId },
      });

      // 거래명세서 생성
      this.logger.log(
        `[createInvoice] INSERT 시도 - iv_invoice_number="${invoiceNumber}", customerId=${dto.customerId}`,
      );
      const invoice = manager.create(Invoice, {
        customerId: dto.customerId,
        invoiceNumber: invoiceNumber,
        status: 'ISSUED',
        netWeight: dto.netWeight || null,
        invoiceAmount: invoiceAmount,
        subtotal: subtotal,
        totalQuantity: totalQuantity,
        vatAmount: finalVatAmount,
        vatApplied: vatApplied,
        vatRate: vatRate,
        issuedAt: issuedAt,
        issuedBy: userId,
        notes: dto.notes || null,
        smsManagerId: dto.smsManagerId || null,
        supplierId: dto.supplierId || null,
        previousBalance: previousBalance,
        statementNameId: dto.statementNameId || null,
        companyName: dto.companyName || null,
        ceo: dto.ceo || null,
        phone: dto.phone || null,
        attachmentImageUrl: dto.attachmentImageUrl ?? null,
        attachmentImagePath: dto.attachmentImagePath ?? null,
      });

      const savedInvoice = await manager.save(Invoice, invoice);

      this.logger.log(
        `[createInvoice] 전일잔액 계산 완료 - 거래처 채권 잔액: ${previousBalance}`,
      );

      // 거래명세서 항목에 invoiceId 설정 (savedInvoice 생성 후)
      invoiceItems.forEach((item) => {
        item.invoiceId = savedInvoice.id;
        this.logger.log(
          `[createInvoice] 거래명세서 항목 저장 - invoiceId: ${savedInvoice.id}, ` +
          `order: ${item.order}, productName: ${item.productName}, ` +
          `salesItemId: ${item.salesItemId || 'null'}`
        );
      });
      const savedItems = await manager.save(InvoiceItem, invoiceItems);

      // 판매 항목 동기화: 거래명세서 단가/수량 변경 시 SalesItem 반영
      const affectedContainerIds: string[] = [];
      const syncedWeightBySalesItemId = new Map<string, number>();
      for (let i = 0; i < dto.items.length; i++) {
        const dtoItem = dto.items[i];
        const orderLabel = dtoItem.order ?? i + 1;
        const salesItemIdRaw = dtoItem.salesItemId?.toString().trim() ?? '';
        const salesItemId = salesItemIdRaw;
        if (!salesItemId) {
          this.logger.log(
            `[createInvoice][명세-판매동기] 행 스킵 order=${orderLabel} reason=NO_SALES_ITEM_ID ` +
              `qty=${dtoItem.quantity ?? 'null'} unitPrice=${dtoItem.unitPrice ?? 'null'} weight필드=${dtoItem.weight ?? 'null'} (중량동기는 quantity kg만 사용)`,
          );
          continue;
        }
        if (!/^\d+$/.test(salesItemId)) {
          this.logger.warn(
            `[createInvoice][명세-판매동기] 행 스킵 order=${orderLabel} reason=INVALID_SALES_ITEM_ID salesItemId="${dtoItem.salesItemId}"`,
          );
          continue;
        }
        const salesItem = await manager.findOne(SalesItem, {
          where: { id: salesItemId },
          select: ['id', 'containerId', 'containerType', 'salesUnitPrice', 'cargoWeight', 'cargoBales'],
        });
        if (!salesItem) {
          this.logger.warn(
            `[createInvoice][명세-판매동기] 행 스킵 order=${orderLabel} reason=SALES_ITEM_NOT_FOUND salesItemId=${salesItemId}`,
          );
          continue;
        }
        const updates: Partial<SalesItem> = {};
        if (dtoItem.unitPrice != null) {
          updates.salesUnitPrice = String(dtoItem.unitPrice);
        }
        if (dtoItem.quantity != null) {
          // 거래명세서 수량(kg) → DB cargoWeight(톤): kg / 1000
          const qtyKg = Number(dtoItem.quantity);
          const qtyTon = qtyKg / 1000;
          updates.cargoWeight = String(qtyTon);
          syncedWeightBySalesItemId.set(salesItemId, qtyTon);
        }
        if (Object.keys(updates).length > 0) {
          await manager.update(SalesItem, { id: salesItemId }, updates);
          if (salesItem.containerId) {
            affectedContainerIds.push(salesItem.containerId);
          }
          this.logger.log(
            `[createInvoice][명세-판매동기] 반영 order=${orderLabel} salesItemId=${salesItemId} ` +
              `cargoWeightTon=${updates.cargoWeight ?? 'unchanged'} salesUnitPrice=${updates.salesUnitPrice ?? 'unchanged'} ` +
              `dtoQtyKg=${dtoItem.quantity ?? 'null'} dtoWeight필드=${dtoItem.weight ?? 'null'}`,
          );
        } else {
          this.logger.log(
            `[createInvoice][명세-판매동기] 행 변경없음 order=${orderLabel} salesItemId=${salesItemId} ` +
              `(quantity·unitPrice 모두 null이면 SalesItem 미갱신)`,
          );
        }
      }

      this.logger.log(
        `[createInvoice][명세-운송동기-요약] invoiceId=${savedInvoice.id} ` +
          `중량동기대상 salesItem 수=${syncedWeightBySalesItemId.size} ` +
          `map=${JSON.stringify(Object.fromEntries(syncedWeightBySalesItemId))}`,
      );

      // 거래명세서 수량 수정 시 운송 loading_item 중량도 함께 동기화
      // - 하차완료: 실제값(actualWeight)까지 맞춰 판매/운송 불일치 방지
      // - 그 외 상태: 요청값(requestWeight)만 반영 (작업/실제 이력 보존)
      if (syncedWeightBySalesItemId.size > 0) {
        const loadingItemsToSync = await manager.find(SalesDeliveryLoadingItem, {
          where: { salesItemId: In(Array.from(syncedWeightBySalesItemId.keys())) },
          relations: ['salesDelivery'],
        });

        if (loadingItemsToSync.length === 0) {
          this.logger.warn(
            `[createInvoice][명세-운송동기] SalesDeliveryLoadingItem 0건 — salesItemIds=${JSON.stringify([
              ...syncedWeightBySalesItemId.keys(),
            ])} (해당 판매행에 상차 loading_item 없음)`,
          );
        } else {
          this.logger.log(
            `[createInvoice][명세-운송동기] 매칭된 loading_item ${loadingItemsToSync.length}건 — ` +
              `ids=${JSON.stringify(
                loadingItemsToSync.map((li) => ({
                  loadingItemId: li.id,
                  salesItemId: li.salesItemId,
                  salesDeliveryId: li.salesDeliveryId,
                  status: li.salesDelivery?.status ?? null,
                })),
              )}`,
          );
        }

        const matchedSiForTransport = new Set(
          loadingItemsToSync.map((li) => String(li.salesItemId)),
        );
        const noLoadingRowForTransport = [...syncedWeightBySalesItemId.keys()].filter(
          (sid) => !matchedSiForTransport.has(String(sid)),
        );
        if (noLoadingRowForTransport.length > 0) {
          this.logger.warn(
            `[createInvoice][명세-운송동기] 판매중량(SalesItem)만 반영, 운송행 없음 — salesItemIds=${JSON.stringify(noLoadingRowForTransport)} ` +
              `(tb_sales_delivery_loading_item에 해당 si_id 없음 → 명세로는 운송 중량 미갱신. 판매 저장 시 createFromSales가 상차 행을 만듦)`,
          );
        }

        for (const loadingItem of loadingItemsToSync) {
          const syncedWeight = syncedWeightBySalesItemId.get(String(loadingItem.salesItemId));
          if (syncedWeight == null) continue;

          const deliveryStatus = loadingItem.salesDelivery?.status ?? null;
          const updatePayload: Partial<SalesDeliveryLoadingItem> = {
            requestWeight: syncedWeight,
          };
          if (deliveryStatus === 'UNLOADING_COMPLETED') {
            updatePayload.actualWeight = syncedWeight;
          }

          await manager.update(SalesDeliveryLoadingItem, { id: loadingItem.id }, updatePayload);
          this.logger.log(
            `[createInvoice] 운송 중량 동기화 - loadingItemId: ${loadingItem.id}, salesItemId: ${loadingItem.salesItemId}, ` +
              `deliveryStatus: ${deliveryStatus ?? 'null'}, requestWeight: ${syncedWeight}, ` +
              `${deliveryStatus === 'UNLOADING_COMPLETED' ? `actualWeight: ${syncedWeight}` : 'actualWeight: 유지'}`,
          );
        }
      }

      // cargoWeight 변경 시 해당 컨테이너 재고 상태 재계산
      if (affectedContainerIds.length > 0) {
        await this.salesService.recalculateContainerInventory(affectedContainerIds, manager);
      }

      // 거래처 채권 조회/생성 및 업데이트
      const amount = Number(invoiceAmount);
      const occurredDate = savedInvoice.issuedAt ? new Date(savedInvoice.issuedAt) : new Date();

      if (!receivable) {
        // 채권이 없으면 새로 생성 (기본 결제조건: 7일)
        receivable = arRepo.create({
          customerId: dto.customerId,
          totalSales: String(amount),
          totalCollected: '0',
          balance: String(amount),
          status: 'OUTSTANDING',
          warningStatus: null,
          occurredDate,
          notes: dto.notes || null,
          paymentTermsType: 'DAYS',
          paymentTermsValue: 7,
        });
        await arRepo.save(receivable);
        this.logger.log(
          `[createInvoice] 거래처 채권 생성 완료 - arId: ${receivable.id}, customerId: ${dto.customerId}, ` +
          `총 판매액: ${amount}, 잔액: ${amount}`,
        );
      } else {
        // 채권이 있으면 업데이트
        const currentTotalSales = Number(receivable.totalSales);
        const currentTotalCollected = Number(receivable.totalCollected);
        const newTotalSales = currentTotalSales + amount;
        const newBalance = newTotalSales - currentTotalCollected;

        receivable.totalSales = String(newTotalSales);
        receivable.balance = String(newBalance);

        // 상태 업데이트
        if (newBalance <= 0) {
          receivable.status = 'COMPLETED';
        } else if (currentTotalCollected > 0) {
          receivable.status = 'PARTIAL';
        } else {
          receivable.status = 'OUTSTANDING';
        }

        await arRepo.save(receivable);
        this.logger.log(
          `[createInvoice] 거래처 채권 업데이트 완료 - arId: ${receivable.id}, customerId: ${dto.customerId}, ` +
          `총 판매액: ${currentTotalSales} → ${newTotalSales}, 잔액: ${newBalance}`,
        );
      }

      // 거래명세서와 채권 연결
      savedInvoice.receivableId = receivable.id;
      await manager.save(Invoice, savedInvoice);

      // 마지막 결제조건일 계산 및 업데이트
      // 고객의 모든 거래명세서 조회
      const allInvoices = await manager.find(Invoice, {
        where: { 
          customerId: dto.customerId,
          deletedAt: null,
        },
        order: { issuedAt: 'DESC' },
      });

      // 각 거래명세서의 결제조건일 계산
      const paymentDueDates: Date[] = [];
      const paymentTermsType = receivable.paymentTermsType || 'DAYS';
      const paymentTermsValue = receivable.paymentTermsValue;

      for (const inv of allInvoices) {
        if (inv.issuedAt) {
          const dueDate = calculatePaymentDueDate(
            inv.issuedAt,
            paymentTermsType as any,
            paymentTermsValue ?? undefined,
          );
          paymentDueDates.push(dueDate);
        }
      }

      // 가장 늦은 결제조건일 찾기
      if (paymentDueDates.length > 0) {
        const lastPaymentDueDate = paymentDueDates.reduce((latest, current) => {
          return current > latest ? current : latest;
        });

        receivable.lastPaymentDueDate = lastPaymentDueDate;
        await arRepo.save(receivable);

        this.logger.log(
          `[createInvoice] 마지막 결제조건일 업데이트 완료 - lastPaymentDueDate: ${lastPaymentDueDate.toISOString().split('T')[0]}`,
        );
      }
      
      this.logger.log(
        `[createInvoice] 거래명세서 발행 완료 - invoiceId: ${savedInvoice.id}, ` +
        `항목 수: ${savedItems.length}, salesItemId가 있는 항목: ` +
        `${savedItems.filter(item => item.salesItemId).length}개`
      );

      // 트랜잭션 내에서 관계 로드하여 반환
      const invoiceWithRelations = await this.createInvoiceDetailQueryBuilder(
        manager.getRepository(Invoice),
        String(savedInvoice.id),
      ).getOne();

      if (!invoiceWithRelations) {
        throw new NotFoundException('거래명세서를 찾을 수 없습니다.');
      }

      return invoiceWithRelations;
    });
    const inv = result as Invoice;
    await this.featureAuditLogService.create({
      domain: 'SALES',
      feature: 'INVOICE',
      action: 'CREATED',
      userId: userId ?? null,
      summary: `거래명세서 발행 ${inv.invoiceNumber ?? inv.id}`,
      entityType: 'invoice',
      entityId: typeof inv.id === 'string' ? parseInt(inv.id, 10) : Number(inv.id),
      payload: { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber },
    }).catch((err) => this.logger.warn('[기능이력] 거래명세서 발행 로그 저장 실패', err));
    return result;
  }

  async updateInvoice(id: string, dto: CreateInvoiceDto, userId: number) {
    // 거래명세서 조회
    const existingInvoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!existingInvoice) {
      throw new NotFoundException('거래명세서를 찾을 수 없습니다.');
    }

    // 고객 정보 조회
    const customer = await this.dataSource
      .getRepository('Customer')
      .findOne({ where: { id: dto.customerId } });

    if (!customer) {
      throw new NotFoundException('고객 정보를 찾을 수 없습니다.');
    }

    // 거래명세서 항목 검증
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('거래명세서 항목이 없습니다.');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      // 기존 항목 삭제
      await manager.delete(InvoiceItem, { invoiceId: id });

      // 금액 및 수량 계산
      let subtotal = 0;
      let vatAmount = 0;
      let totalQuantity = 0;
      const invoiceItems = dto.items.map((item, index) => {
        // amount가 직접 입력된 경우 우선 사용, 없으면 quantity * unitPrice로 계산
        const amount = item.amount != null 
          ? Number(item.amount) 
          : (item.quantity != null && item.unitPrice != null 
              ? Number(item.quantity) * Number(item.unitPrice) 
              : 0);
        subtotal += amount;
        vatAmount += item.vatAmount || 0;
        // 수량이 null이면 총 수량에 포함하지 않음
        if (item.quantity != null) {
          totalQuantity += Number(item.quantity) || 0;
        }

        let salesItemId: string | null = null;
        if (item.salesItemId) {
          const parsedSalesItemId = item.salesItemId.toString().trim();
          if (parsedSalesItemId && /^\d+$/.test(parsedSalesItemId)) {
            salesItemId = parsedSalesItemId;
          } else {
            this.logger.warn(
              `[updateInvoice] salesItemId 검증 실패 - order: ${item.order || index + 1}, ` +
              `productName: ${item.productName}, 원본값: ${item.salesItemId}, 파싱값: ${parsedSalesItemId}`
            );
          }
        } else {
          this.logger.warn(
            `[updateInvoice] salesItemId가 없음 - order: ${item.order || index + 1}, ` +
            `productName: ${item.productName}`
          );
        }

        this.logger.log(
          `[updateInvoice] 거래명세서 항목 생성 - order: ${item.order || index + 1}, ` +
          `productName: ${item.productName}, salesItemId: ${salesItemId || 'null'}`
        );

        const invoiceItem = manager.create(InvoiceItem, {
          invoiceId: id,
          order: item.order || index + 1,
          salesItemId: salesItemId,
          productName: item.productName || null,
          quantity: item.quantity || null,
          unit: item.unit || null,
          unitPrice: item.unitPrice || null,
          amount: item.amount != null ? Number(item.amount) : amount,
          vatAmount: item.vatAmount || null,
          weight: item.weight || null,
          notes: item.notes || null,
        });

        return invoiceItem;
      });

      const vatApplied = dto.vatApplied ?? false;
      const vatRate = dto.vatRate ?? 10.0;
      const finalVatAmount = vatApplied ? vatAmount : 0;
      const invoiceAmount = subtotal + finalVatAmount;

      // 거래명세서 수정 시 이카운트 처리 상태 변경: 처리완료 → 확인 필요
      const updatePayload: Record<string, any> = {
        customerId: dto.customerId,
        invoiceNumber: dto.invoiceNumber || null,
        netWeight: dto.netWeight || null,
        invoiceAmount: invoiceAmount,
        subtotal: subtotal,
        totalQuantity: totalQuantity,
        vatAmount: finalVatAmount,
        vatApplied: vatApplied,
        vatRate: vatRate,
        notes: dto.notes || null,
        smsManagerId: dto.smsManagerId || null,
        supplierId: dto.supplierId || null,
        statementNameId: dto.statementNameId !== undefined ? dto.statementNameId : existingInvoice.statementNameId,
        companyName: dto.companyName !== undefined ? dto.companyName : existingInvoice.companyName,
        ceo: dto.ceo !== undefined ? dto.ceo : existingInvoice.ceo,
        phone: dto.phone !== undefined ? dto.phone : existingInvoice.phone,
        attachmentImageUrl:
          dto.attachmentImageUrl !== undefined
            ? dto.attachmentImageUrl
            : existingInvoice.attachmentImageUrl,
        attachmentImagePath:
          dto.attachmentImagePath !== undefined
            ? dto.attachmentImagePath
            : existingInvoice.attachmentImagePath,
      };
      if (existingInvoice.ecountProcessingStatus === 'PROCESSED') {
        updatePayload.ecountProcessingStatus = 'NEEDS_CONFIRMATION';
      }

      await manager.update(Invoice, { id }, updatePayload);

      // 거래명세서 항목 저장
      const savedItems = await manager.save(InvoiceItem, invoiceItems);
      
      this.logger.log(
        `[updateInvoice] 거래명세서 수정 완료 - invoiceId: ${id}, ` +
        `항목 수: ${savedItems.length}, salesItemId가 있는 항목: ` +
        `${savedItems.filter(item => item.salesItemId).length}개`
      );

      // 판매 항목 동기화: 거래명세서 단가/수량 변경 시 SalesItem 반영
      const affectedContainerIds: string[] = [];
      const syncedWeightBySalesItemId = new Map<string, number>();
      for (let i = 0; i < dto.items.length; i++) {
        const dtoItem = dto.items[i];
        const orderLabel = dtoItem.order ?? i + 1;
        const salesItemIdRaw = dtoItem.salesItemId?.toString().trim() ?? '';
        const salesItemId = salesItemIdRaw;
        if (!salesItemId) {
          this.logger.log(
            `[updateInvoice][명세-판매동기] 행 스킵 order=${orderLabel} reason=NO_SALES_ITEM_ID ` +
              `qty=${dtoItem.quantity ?? 'null'} unitPrice=${dtoItem.unitPrice ?? 'null'} weight필드=${dtoItem.weight ?? 'null'} (중량동기는 quantity kg만 사용)`,
          );
          continue;
        }
        if (!/^\d+$/.test(salesItemId)) {
          this.logger.warn(
            `[updateInvoice][명세-판매동기] 행 스킵 order=${orderLabel} reason=INVALID_SALES_ITEM_ID salesItemId="${dtoItem.salesItemId}"`,
          );
          continue;
        }
        const salesItem = await manager.findOne(SalesItem, {
          where: { id: salesItemId },
          select: ['id', 'containerId', 'containerType', 'salesUnitPrice', 'cargoWeight', 'cargoBales'],
        });
        if (!salesItem) {
          this.logger.warn(
            `[updateInvoice][명세-판매동기] 행 스킵 order=${orderLabel} reason=SALES_ITEM_NOT_FOUND salesItemId=${salesItemId}`,
          );
          continue;
        }
        const updates: Partial<SalesItem> = {};
        if (dtoItem.unitPrice != null) {
          updates.salesUnitPrice = String(dtoItem.unitPrice);
        }
        if (dtoItem.quantity != null) {
          // 거래명세서 수량(kg) → DB cargoWeight(톤): kg / 1000
          const qtyKg = Number(dtoItem.quantity);
          const qtyTon = qtyKg / 1000;
          updates.cargoWeight = String(qtyTon);
          syncedWeightBySalesItemId.set(salesItemId, qtyTon);
        }
        if (Object.keys(updates).length > 0) {
          await manager.update(SalesItem, { id: salesItemId }, updates);
          if (salesItem.containerId) {
            affectedContainerIds.push(salesItem.containerId);
          }
          this.logger.log(
            `[updateInvoice][명세-판매동기] 반영 order=${orderLabel} salesItemId=${salesItemId} ` +
              `cargoWeightTon=${updates.cargoWeight ?? 'unchanged'} salesUnitPrice=${updates.salesUnitPrice ?? 'unchanged'} ` +
              `dtoQtyKg=${dtoItem.quantity ?? 'null'} dtoWeight필드=${dtoItem.weight ?? 'null'}`,
          );
        } else {
          this.logger.log(
            `[updateInvoice][명세-판매동기] 행 변경없음 order=${orderLabel} salesItemId=${salesItemId} ` +
              `(quantity·unitPrice 모두 null이면 SalesItem 미갱신)`,
          );
        }
      }

      this.logger.log(
        `[updateInvoice][명세-운송동기-요약] invoiceId=${id} ` +
          `중량동기대상 salesItem 수=${syncedWeightBySalesItemId.size} ` +
          `map=${JSON.stringify(Object.fromEntries(syncedWeightBySalesItemId))}`,
      );

      // 거래명세서 수량 수정 시 운송 loading_item 중량도 함께 동기화 (발행(create)과 동일)
      // - 하차완료: actualWeight까지 맞춤 / 그 외: requestWeight만
      if (syncedWeightBySalesItemId.size > 0) {
        const loadingItemsToSync = await manager.find(SalesDeliveryLoadingItem, {
          where: { salesItemId: In(Array.from(syncedWeightBySalesItemId.keys())) },
          relations: ['salesDelivery'],
        });

        if (loadingItemsToSync.length === 0) {
          this.logger.warn(
            `[updateInvoice][명세-운송동기] SalesDeliveryLoadingItem 0건 — salesItemIds=${JSON.stringify([
              ...syncedWeightBySalesItemId.keys(),
            ])} (해당 판매행에 상차 loading_item 없음)`,
          );
        } else {
          this.logger.log(
            `[updateInvoice][명세-운송동기] 매칭된 loading_item ${loadingItemsToSync.length}건 — ` +
              `ids=${JSON.stringify(
                loadingItemsToSync.map((li) => ({
                  loadingItemId: li.id,
                  salesItemId: li.salesItemId,
                  salesDeliveryId: li.salesDeliveryId,
                  status: li.salesDelivery?.status ?? null,
                })),
              )}`,
          );
        }

        const matchedSiForTransportUpd = new Set(
          loadingItemsToSync.map((li) => String(li.salesItemId)),
        );
        const noLoadingRowForTransportUpd = [...syncedWeightBySalesItemId.keys()].filter(
          (sid) => !matchedSiForTransportUpd.has(String(sid)),
        );
        if (noLoadingRowForTransportUpd.length > 0) {
          this.logger.warn(
            `[updateInvoice][명세-운송동기] 판매중량(SalesItem)만 반영, 운송행 없음 — salesItemIds=${JSON.stringify(noLoadingRowForTransportUpd)} ` +
              `(tb_sales_delivery_loading_item에 해당 si_id 없음 → 명세로는 운송 중량 미갱신. 판매 저장 시 createFromSales가 상차 행을 만듦)`,
          );
        }

        for (const loadingItem of loadingItemsToSync) {
          const syncedWeight = syncedWeightBySalesItemId.get(String(loadingItem.salesItemId));
          if (syncedWeight == null) continue;

          const deliveryStatus = loadingItem.salesDelivery?.status ?? null;
          const liPayload: Partial<SalesDeliveryLoadingItem> = {
            requestWeight: syncedWeight,
          };
          if (deliveryStatus === 'UNLOADING_COMPLETED') {
            liPayload.actualWeight = syncedWeight;
          }

          await manager.update(SalesDeliveryLoadingItem, { id: loadingItem.id }, liPayload);
          this.logger.log(
            `[updateInvoice] 운송 중량 동기화 - loadingItemId: ${loadingItem.id}, salesItemId: ${loadingItem.salesItemId}, ` +
              `deliveryStatus: ${deliveryStatus ?? 'null'}, requestWeight: ${syncedWeight}, ` +
              `${deliveryStatus === 'UNLOADING_COMPLETED' ? `actualWeight: ${syncedWeight}` : 'actualWeight: 유지'}`,
          );
        }
      }

      // cargoWeight 변경 시 해당 컨테이너 재고 상태 재계산
      if (affectedContainerIds.length > 0) {
        await this.salesService.recalculateContainerInventory(affectedContainerIds, manager);
      }

      // 채권 정보 업데이트 (거래명세서 금액이 변경된 경우)
      if (dto.customerId) {
        const arRepo = manager.getRepository(AccountsReceivable);
        const existingReceivable = await arRepo.findOne({
          where: { customerId: dto.customerId },
        });

        if (existingReceivable) {
          // 기존 거래명세서 금액 조회
          const oldInvoiceAmount = Number(existingInvoice.invoiceAmount) || 0;
          const newInvoiceAmount = invoiceAmount;
          const amountDifference = newInvoiceAmount - oldInvoiceAmount;

          // 총 판매액 업데이트
          const currentTotalSales = Number(existingReceivable.totalSales);
          const newTotalSales = currentTotalSales + amountDifference;
          const currentTotalCollected = Number(existingReceivable.totalCollected);
          const newBalance = newTotalSales - currentTotalCollected;

          existingReceivable.totalSales = String(newTotalSales);
          existingReceivable.balance = String(newBalance);

          // 상태 업데이트
          if (newBalance <= 0) {
            existingReceivable.status = 'COMPLETED';
          } else if (currentTotalCollected > 0) {
            existingReceivable.status = 'PARTIAL';
          } else {
            existingReceivable.status = 'OUTSTANDING';
          }

          await arRepo.save(existingReceivable);

          this.logger.log(
            `[updateInvoice] 채권 업데이트 완료 - arId: ${existingReceivable.id}, ` +
            `기존 금액: ${oldInvoiceAmount}, 새 금액: ${newInvoiceAmount}, ` +
            `총 판매액: ${currentTotalSales} → ${newTotalSales}, 잔액: ${newBalance}`
          );
        }
      }

      // 트랜잭션 내에서 관계 로드하여 반환
      const invoiceWithRelations = await this.createInvoiceDetailQueryBuilder(
        manager.getRepository(Invoice),
        id,
      ).getOne();

      if (!invoiceWithRelations) {
        throw new NotFoundException('거래명세서를 찾을 수 없습니다.');
      }

      return invoiceWithRelations;
    });
    await this.featureAuditLogService.create({
      domain: 'SALES',
      feature: 'INVOICE',
      action: 'UPDATED',
      userId: userId ?? null,
      summary: `거래명세서 수정 #${id}`,
      entityType: 'invoice',
      entityId: parseInt(id, 10) || undefined,
      payload: { invoiceId: id },
    }).catch((err) => this.logger.warn('[기능이력] 거래명세서 수정 로그 저장 실패', err));
    return result;
  }

  /**
   * 거래명세서 삭제 (소프트 삭제)
   * 채권 역처리 포함
   */
  async deleteInvoice(id: string, userId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // 거래명세서 조회
      const invoice = await manager.findOne(Invoice, {
        where: { id },
        relations: ['customer'],
      });

      if (!invoice) {
        throw new NotFoundException('거래명세서를 찾을 수 없습니다.');
      }

      // 이미 삭제된 경우
      if (invoice.deletedAt) {
        throw new BadRequestException('이미 삭제된 거래명세서입니다.');
      }

      // 채권 역처리
      if (invoice.receivableId && invoice.customerId) {
        const arRepo = manager.getRepository(AccountsReceivable);
        const receivable = await arRepo.findOne({
          where: { id: invoice.receivableId },
        });

        if (receivable) {
          const invoiceAmount = Number(invoice.invoiceAmount) || 0;
          const currentTotalSales = Number(receivable.totalSales);
          const currentTotalCollected = Number(receivable.totalCollected);
          
          // 총 판매액에서 거래명세서 금액 차감
          const newTotalSales = Math.max(0, currentTotalSales - invoiceAmount);
          const newBalance = newTotalSales - currentTotalCollected;

          receivable.totalSales = String(newTotalSales);
          receivable.balance = String(newBalance);

          // 상태 업데이트
          if (newBalance <= 0) {
            receivable.status = 'COMPLETED';
          } else if (currentTotalCollected > 0) {
            receivable.status = 'PARTIAL';
          } else {
            receivable.status = 'OUTSTANDING';
          }

          await arRepo.save(receivable);

          this.logger.log(
            `[deleteInvoice] 채권 역처리 완료 - arId: ${receivable.id}, ` +
            `거래명세서 금액: ${invoiceAmount}, ` +
            `총 판매액: ${currentTotalSales} → ${newTotalSales}, 잔액: ${newBalance}`
          );
        }
      }

      // 거래명세서 소프트 삭제 (취소 시 이카운트 처리완료 → 확인 필요, 수정과 동일)
      const deletePayload: Record<string, any> = {
        deletedAt: new Date(),
        deletedBy: userId,
      };
      if (invoice.ecountProcessingStatus === 'PROCESSED') {
        deletePayload.ecountProcessingStatus = 'NEEDS_CONFIRMATION';
      }
      await manager.update(Invoice, { id }, deletePayload);

      this.logger.log(
        `[deleteInvoice] 거래명세서 삭제 완료 - invoiceId: ${id}, userId: ${userId}`
      );
    });
    await this.featureAuditLogService.create({
      domain: 'SALES',
      feature: 'INVOICE',
      action: 'DELETED',
      userId: userId ?? null,
      summary: `거래명세서 삭제(취소) #${id}`,
      entityType: 'invoice',
      entityId: parseInt(id, 10) || undefined,
      payload: { invoiceId: id },
    }).catch((err) => this.logger.warn('[기능이력] 거래명세서 삭제 로그 저장 실패', err));
  }

  /**
   * salesId로 배송 조회 (헬퍼 메서드)
   */
  async findDeliveryBySalesId(salesId: string): Promise<SalesDelivery | null> {
    return await this.salesDeliveryRepository.findOne({
      where: { salesId },
    });
  }

  /**
   * 거래명세서 발행 가능한 판매 항목 목록 조회
   * 조건: 하차완료된 배송이 있는 판매 + 판매항목 완료 + 거래명세서 미발행(발행대기)
   */
  async findAvailableSalesItems(dto: GetAvailableSalesItemsDto) {
    const { page = 1, limit = 20, search, product, salesId, sortBy, sortOrder } = dto;

    const queryBuilder = this.salesItemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.sales', 'sales')
      .leftJoinAndSelect('item.container', 'container')
      .leftJoinAndSelect('container.order', 'order', 'order.to_deleted_at IS NULL')
      .leftJoinAndSelect('order.contract', 'contract', 'contract.tc_deleted_at IS NULL')
      .leftJoinAndSelect('order.inbounds', 'inbounds')
      .leftJoinAndSelect('sales.customer', 'customer')
      .where('item.si_status = :status', { status: 'SALES_ITEM_COMPLETED' })
      .andWhere('(sales.sa_invoice_status IS NULL OR sales.sa_invoice_status = :pendingStatus)', {
        pendingStatus: 'PENDING_ISSUE',
      })
      // 발행대기와 동일: 하차완료된 배송이 있는 판매만 (item.salesId 기준 서브쿼리로 조인 순서 무관)
      .andWhere(
        `item.sa_id IN (
          SELECT sd_sales_id FROM tb_sales_delivery
          WHERE sd_status = 'UNLOADING_COMPLETED' AND sd_deleted_at IS NULL
        )`,
      )
      // 발행완료(미삭제) 거래명세서에 포함된 항목 제외. 발행취소(소프트삭제)된 명세에만 있던 항목은 다시 노출
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM tb_invoice_item ii
          INNER JOIN tb_invoice iv ON iv.iv_id = ii.iv_id AND iv.iv_status = 'ISSUED' AND iv.iv_deleted_at IS NULL
          WHERE ii.si_id = item.si_id
        )`,
      );

    // 특정 판매 ID로 필터링 (선택적)
    if (salesId) {
      queryBuilder.andWhere('sales.sa_id = :salesId', { salesId });
    }

    // 제품 필터
    if (product) {
      queryBuilder.andWhere('container.product = :product', { product });
    }

    // 검색 필터
    if (search) {
      queryBuilder.andWhere(
        '(container.product LIKE :search OR container.containerNo LIKE :search OR customer.companyName LIKE :search OR sales.sa_id::text LIKE :search OR order.bl LIKE :search)',
        { search: `%${search}%` },
      );
    }

    // 정렬: sortBy/sortOrder 있으면 적용, 없으면 기본값
    const orderDir = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const allowedSortColumns: Record<string, string> = {
      customerName: 'customer.companyName',
      bl: 'order.bl',
      containerNo: 'container.containerNo',
      productName: 'container.product',
      packingName: 'container.packingType',
      packingType: 'container.packingType',
      tradeGradeName: 'container.tradeGrade',
      tradeGrade: 'container.tradeGrade',
      salesGradeName: 'container.salesGrade',
      salesGrade: 'container.salesGrade',
      containerType: 'item.containerType',
      bales: 'container.tradeBales',
      weight: 'container.weight',
      unitPrice: 'item.salesUnitPrice',
      salesCreatedAt: 'sales.createdAt',
      createdAt: 'item.createdAt',
    };
    if (sortBy && allowedSortColumns[sortBy]) {
      const orderColumn = allowedSortColumns[sortBy];
      queryBuilder.orderBy(orderColumn, orderDir);
    }
    queryBuilder.addOrderBy('sales.createdAt', 'DESC').addOrderBy('item.createdAt', 'DESC');

    // 전체 개수
    const total = await queryBuilder.getCount();
    this.logger.log(
      `[findAvailableSalesItems] 조회 결과 - 전체 ${total}건 (조건: 하차완료 배송 + 판매항목 SALES_ITEM_COMPLETED + 거래명세서 미발행), page=${page}, limit=${limit}`,
    );

    // 진단: 하차완료했는데 목록에 안 나올 때 원인 확인 (판매 160 / 항목 234 등 대표 건)
    const diagSalesId = '160';
    const diagItemId = '234';
    try {
      const [diagItem, diagSales, diagDelivery, inIssuedCount] = await Promise.all([
        this.salesItemRepository.findOne({ where: { id: diagItemId }, select: ['id', 'status', 'salesId'] }),
        this.salesRepository.findOne({ where: { id: diagSalesId }, select: ['id', 'invoiceStatus'] }),
        this.salesDeliveryRepository.findOne({
          where: { salesId: diagSalesId },
          select: ['id', 'status', 'deletedAt'],
        }),
        this.invoiceItemRepository
          .createQueryBuilder('ii')
          .innerJoin('ii.invoice', 'inv', "inv.status = 'ISSUED' AND inv.deletedAt IS NULL")
          .where('ii.salesItemId = :siId', { siId: diagItemId })
          .getCount(),
      ]);
      this.logger.log(
        `[findAvailableSalesItems] 진단(판매 ${diagSalesId} / 항목 ${diagItemId}): ` +
          `item.status=${diagItem?.status ?? 'null'}, sales.invoiceStatus=${diagSales?.invoiceStatus ?? 'null'}, ` +
          `delivery.status=${diagDelivery?.status ?? 'null'}, delivery.deletedAt=${diagDelivery?.deletedAt ?? 'null'}, ` +
          `발행완료 거래명세서 포함=${inIssuedCount > 0}, total=${total}`,
      );
      if (total === 0) {
        this.logger.log(`[findAvailableSalesItems] 생성 SQL: ${queryBuilder.getSql()}`);
      }
    } catch (e) {
      this.logger.warn(`[findAvailableSalesItems] 진단 로그 실패: ${e instanceof Error ? e.message : String(e)}`);
    }

    // total 0일 때 조건별 개수 진단 (어떤 조건에서 걸리는지 확인)
    if (total === 0) {
      try {
        const rawDelivery = await this.salesDeliveryRepository
          .createQueryBuilder('d')
          .select('COUNT(1)', 'cnt')
          .where('d.status = :status', { status: 'UNLOADING_COMPLETED' })
          .andWhere('d.deletedAt IS NULL')
          .getRawOne<{ cnt: string }>();
        const deliveryUnloadingCount = Number(rawDelivery?.cnt ?? 0);
        const salesWithPending = await this.salesRepository
          .createQueryBuilder('s')
          .where('(s.invoiceStatus = :pending OR s.invoiceStatus IS NULL)', { pending: 'PENDING_ISSUE' })
          .getCount();
        const itemsCompleted = await this.salesItemRepository
          .createQueryBuilder('item')
          .where('item.status = :status', { status: 'SALES_ITEM_COMPLETED' })
          .getCount();
        const salesIdsWithUnloading = await this.salesDeliveryRepository.find({
          where: { status: 'UNLOADING_COMPLETED', deletedAt: IsNull() },
          select: ['salesId'],
        });
        const unloadSalesIds = salesIdsWithUnloading.map((d) => String(d.salesId));
        this.logger.log(
          `[findAvailableSalesItems] 진단(total=0): ` +
            `하차완료 배송 수=${deliveryUnloadingCount}, ` +
            `발행대기/미설정 판매 수=${salesWithPending}, ` +
            `SALES_ITEM_COMPLETED 항목 수=${itemsCompleted}, ` +
            `하차완료 배송이 있는 판매 ID 목록=[${unloadSalesIds.slice(0, 10).join(', ')}${unloadSalesIds.length > 10 ? '...' : ''}]`,
        );
        if (unloadSalesIds.length > 0) {
          const firstSalesId = unloadSalesIds[0];
          const salesOne = await this.salesRepository.findOne({
            where: { id: firstSalesId },
            select: ['id', 'invoiceStatus'],
          });
          const itemsOfSales = await this.salesItemRepository.find({
            where: { salesId: firstSalesId },
            select: ['id', 'status'],
          });
          this.logger.log(
            `[findAvailableSalesItems] 진단 - 대표 판매 ID ${firstSalesId}: invoiceStatus=${salesOne?.invoiceStatus ?? 'null'}, ` +
              `SalesItem 수=${itemsOfSales.length}, 상태=[${itemsOfSales.map((i) => `${i.id}:${i.status ?? 'null'}`).join(', ')}]`,
          );
        }
      } catch (e) {
        this.logger.warn(`[findAvailableSalesItems] 진단 로그 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 페이지네이션
    queryBuilder.skip((page - 1) * limit).take(limit);

    // 데이터 조회
    const items = await queryBuilder.getMany();

    // 판매별 운송번호 조회 (salesId -> orderNumber)
    const salesIds = [...new Set(items.map((i) => i.salesId))];
    const deliveries = await this.salesDeliveryRepository.find({
      where: { salesId: In(salesIds) },
      select: ['salesId', 'orderNumber'],
    });
    const deliveryOrderNumberBySalesId = new Map<string, string | null>();
    deliveries.forEach((d) => deliveryOrderNumberBySalesId.set(d.salesId, d.orderNumber ?? null));

    // 응답 데이터 매핑 - 프론트엔드가 기대하는 형식으로 변환
    const data = items.map((item) => {
      const container = item.container;
      const order = container?.order;
      const contract = order?.contract;
      const containerType = item.containerType || 'CONTAINER';
      const weight = containerType === 'CARGO' && item.cargoWeight
        ? Number(item.cargoWeight)
        : container?.weight
          ? Number(container.weight)
          : null;
      const bales = containerType === 'CARGO' && item.cargoBales
        ? Number(item.cargoBales)
        : container
          ? (container.salesBales != null && container.salesBales !== '' ? Number(container.salesBales) : (container.tradeBales ? Number(container.tradeBales) : null))
          : null;

      // 환율 및 창고 정보 (입고 상태에 따라 status가 맞는 inbound 사용 - 배열 순서 의존 X)
      let exchangeRate: number | null = null;
      let inboundWarehouse: string | null = null;
      let inboundWarehouseName: string | null = null;
      const inboundStatus = order?.inboundStatus;
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
        // 창고 이름은 코드 마스터에서 조회해야 하지만, 여기서는 null로 설정
      }

      return {
        id: item.id,
        itemId: item.id, // 판매 항목 ID (tb_sales_item.si_id)
        salesId: item.salesId,
        containerId: container?.id ?? null,
        sequence: container?.sequence ?? null,
        productName: container?.product ?? contract?.productName ?? '-',
        specification: container?.packingType ?? contract?.packingType ?? null,
        weight: weight,
        cargoWeight: item.cargoWeight ? Number(item.cargoWeight) : null,
        unitPrice: item.salesUnitPrice ? Number(item.salesUnitPrice) : null,
        containerNo: container?.containerNo ?? null,
        bl: order?.bl ?? null,
        packingType: container?.packingType ?? contract?.packingType ?? null,
        packingName: null, // 코드 마스터에서 조회해야 하지만, 여기서는 null로 설정
        exporter: contract?.exporter ?? null,
        exporterName: null, // 코드 마스터에서 조회해야 하지만, 여기서는 null로 설정
        tradeGrade: container?.tradeGrade ?? null,
        tradeGradeName: null, // 코드 마스터에서 조회해야 하지만, 여기서는 null로 설정
        salesGrade: container?.salesGrade ?? null,
        salesGradeName: null, // 코드 마스터에서 조회해야 하지만, 여기서는 null로 설정
        containerType: containerType,
        bales: bales,
        cargoBales: item.cargoBales ? Number(item.cargoBales) : null,
        // margin 계산 (판매단가 - 원가 - 운송비)
        // confirmedPurchaseCost(확정원가)에 이미 STO/DT/작업비가 kg당 반영되어 있으므로, 별도로 빼지 않음
        margin: (() => {
          const salesUnitPriceNum = item.salesUnitPrice ? Number(item.salesUnitPrice) : null;
          const purchaseCost = container?.confirmedPurchaseCost
            ? Number(container.confirmedPurchaseCost)
            : container?.pendingPurchaseCost
              ? Number(container.pendingPurchaseCost)
              : null;
          const totalTransportFee = item.sales?.transportFee != null ? Number(item.sales.transportFee) : null;
          const transportFeePerKg = this.calculateTransportFeePerKg(totalTransportFee, weight);
          return this.calculateMargin(salesUnitPriceNum, purchaseCost, transportFeePerKg, 0, 0, 0);
        })(),
        exchangeRate: exchangeRate,
        etaDate: order?.etaDate 
          ? (order.etaDate instanceof Date 
              ? order.etaDate.toISOString().split('T')[0] 
              : typeof order.etaDate === 'string' 
                ? (order.etaDate as string).split('T')[0] 
                : new Date(order.etaDate as any).toISOString().split('T')[0])
          : null,
        inboundStatus: inboundStatus ?? null,
        inboundWarehouse: inboundWarehouse,
        inboundWarehouseName: inboundWarehouseName,
        salesDate: item.sales?.salesDate
          ? (item.sales.salesDate instanceof Date
              ? item.sales.salesDate.toISOString().split('T')[0]
              : typeof item.sales.salesDate === 'string'
                ? (item.sales.salesDate as string).split('T')[0]
                : (() => {
                    const d = new Date(item.sales!.salesDate as any);
                    return Number.isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
                  })())
          : null,
        deliveryOrderNumber: deliveryOrderNumberBySalesId.get(item.salesId) ?? null,
        sales: {
          id: item.sales?.id,
          customer: item.sales?.customer
            ? {
                id: item.sales.customer.id.toString(),
                companyName: item.sales.customer.companyName ?? null,
                phone: item.sales.customer.phone ?? null,
                ceo: item.sales.customer.ceo ?? null,
              }
            : null,
        },
      };
    });

    return {
      data,
      total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }
}

