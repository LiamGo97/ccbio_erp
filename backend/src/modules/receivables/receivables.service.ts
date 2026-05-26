import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource, LessThanOrEqual, IsNull, Brackets } from 'typeorm';
import * as XLSX from 'xlsx';
import { unlinkSync } from 'fs';
import { AccountsReceivable } from './entities/accounts-receivable.entity';
import { ReceivableCollection } from './entities/receivable-collection.entity';
import { ReceivableWarningConfig } from './entities/receivable-warning-config.entity';
import { Invoice } from '../sales/entities/invoice.entity';
import { InvoiceItem } from '../sales/entities/invoice-item.entity';
import { SalesItem } from '../sales/entities/sales-item.entity';
import { CustomerPrepayment } from '../sales/entities/customer-prepayment.entity';
import { GetReceivablesDto } from './dto/get-receivables.dto';
import { GetCollectionsDto } from './dto/get-collections.dto';
import { CollectReceivableDto } from './dto/collect-receivable.dto';
import { CollectByCustomerDto } from './dto/collect-by-customer.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { UpdateReceivableWarningConfigDto } from './dto/update-receivable-warning-config.dto';
import { CreateReceivableWarningConfigDto } from './dto/create-receivable-warning-config.dto';
import { TransactionNumberGenerator } from './utils/transaction-number-generator';
import { Customer } from '../customers/entities/customer.entity';
import { CustomerStatementName } from '../customers/entities/customer-statement-name.entity';
import { calculatePaymentDueDate } from './utils/payment-due-date-calculator';
import { AligoService } from '../aligo/aligo.service';
import { SmsSenderService } from '../sms-sender/sms-sender.service';
import { SmsTemplatesService } from '../sms-templates/sms-templates.service';
import { SendReceivableWarningSmsDto } from './dto/send-receivable-warning-sms.dto';
import { ReceivableSmsBatch } from './entities/receivable-sms-batch.entity';
import { SmsHistory } from '../sms-history/entities/sms-history.entity';

export interface ReceivableListItem {
  id: string;
  customerId: string;
  customerName: string | null;
  customerType: string | null;
  occurredDate: string;
  totalSales: number;
  totalCollected: number;
  balance: number;
  status: string;
  warningStatus: string | null;
  createdAt: string;
}

export interface GetReceivablesResponse {
  data: ReceivableListItem[];
  total: number;
  page: number;
  limit: number;
  lastPage: number;
}

export interface ReceivableDetail {
  id: string;
  customerId: string;
  customerName: string | null;
  occurredDate: string;
  totalSales: number;
  totalCollected: number;
  balance: number;
  status: string;
  warningStatus: string | null;
  notes: string | null;
  paymentTermsType?: 'DAYS' | 'THIS_MONTH_DAY' | 'NEXT_MONTH_DAY' | 'THIS_MONTH_END' | 'NEXT_MONTH_END';
  paymentTermsValue?: number | null;
  lastPaymentDueDate?: string | null;
  // 호환성을 위한 필드들 (프론트엔드에서 사용)
  receivableAmount?: number;
  outstandingAmount?: number;
  collectedAmount?: number;
  prepaymentDeducted?: number;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReceivableCollectionItem {
  id: string;
  collectionAmount: number;
  collectionDate: string;
  collectionMethod: string | null;
  notes: string | null;
  isPrepayment: boolean;
  createdAt: string;
}

export interface LedgerEntry {
  date: string;
  type: 'INVOICE' | 'COLLECTION';
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  collectionId?: string | null;
  collectionNumber?: string | null;
  amount: number;
  balance: number;
  notes?: string | null;
  paymentDueDate?: string | null; // 결제조건일
  paymentTermsType?: string | null; // 결제조건 타입
  paymentTermsValue?: number | null; // 결제조건 값
  /** 수금( COLLECTION ) 행만 */
  isPrepayment?: boolean;
  /** 거래명세서 품목 요약 (INVOICE 행) */
  productLabel?: string | null;
}

export interface CustomerLedgerResponse {
  customerId: string;
  customerName: string | null;
  entries: LedgerEntry[];
  totalSales: number;
  totalCollected: number;
  currentBalance: number;
}

export interface CollectionListItem {
  id: string;
  collectionNumber: string | null;
  receivableId: string;
  customerId: string;
  customerName: string | null;
  companyName: string | null;
  ceo: string | null;
  phone: string | null;
  collectionAmount: number;
  collectionDate: string;
  collectionMethod: string | null;
  notes: string | null;
  isPrepayment: boolean;
  createdAt: string;
  /** tb_sms_history 최신 sh_status (relatedType=RECEIVABLE_COLLECTION) */
  smsStatus?: string | null;
}

export interface GetCollectionsResponse {
  data: CollectionListItem[];
  total: number;
  page: number;
  limit: number;
  lastPage: number;
  /** 현재 필터(검색·기간·선수금 구분 등)에 맞는 전체 수금액 합계(페이지와 무관) */
  totalCollectionAmount: number;
}

/** 이카운트 엑셀·시스템 잔액 비교 결과 */
export interface CompareWithExcelResult {
  onlyInSystem: { name: string; balance: number }[];
  onlyInExcel: { name: string; balance: number }[];
  balanceMismatch: { name: string; systemBalance: number; excelBalance: number; difference: number }[];
  matchCount: number;
}

export interface CustomerWithReceivable {
  customerId: string;
  companyName: string | null;
  ceo: string | null;
  phone: string | null;
  customerType: string | null;
  balance: number;
  receivableId: string;
  /** 채권(tb_accounts_receivable.ar_notes) 메모 */
  receivableNotes?: string | null;
  warningStatus: string | null;
  occurredDate: string;
  salesManagerName?: string | null;
  salesManagerEmail?: string | null;
  supplierId?: number | null;
  supplierCompanyName?: string | null;
}

export interface GetCustomersWithReceivablesResponse {
  data: CustomerWithReceivable[];
  total: number;
  page: number;
  limit: number;
  lastPage: number;
  totalBalance?: number; // 필터 적용된 전체 데이터의 잔액 합계 (페이지 구분 없음)
}

@Injectable()
export class ReceivablesService {
  private readonly logger = new Logger(ReceivablesService.name);

  constructor(
    @InjectRepository(AccountsReceivable)
    private readonly receivableRepository: Repository<AccountsReceivable>,
    @InjectRepository(ReceivableCollection)
    private readonly collectionRepository: Repository<ReceivableCollection>,
    @InjectRepository(ReceivableWarningConfig)
    private readonly warningConfigRepository: Repository<ReceivableWarningConfig>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerStatementName)
    private readonly statementNameRepository: Repository<CustomerStatementName>,
    @InjectRepository(CustomerPrepayment)
    private readonly prepaymentRepository: Repository<CustomerPrepayment>,
    @InjectRepository(ReceivableSmsBatch)
    private readonly receivableSmsBatchRepository: Repository<ReceivableSmsBatch>,
    @InjectRepository(SmsHistory)
    private readonly smsHistoryRepository: Repository<SmsHistory>,
    private readonly dataSource: DataSource,
    private readonly transactionNumberGenerator: TransactionNumberGenerator,
    private readonly aligoService: AligoService,
    private readonly smsSenderService: SmsSenderService,
    private readonly smsTemplatesService: SmsTemplatesService,
  ) {}

  /**
   * 이번달 발생 채권금액 조회 (해당 월에 발행된 거래명세서 금액 합계)
   */
  async getMonthlyReceivablesSummary(year: number, month: number): Promise<{ amount: number }> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const result = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(invoice.invoiceAmount), 0)', 'amount')
      .where('invoice.status = :status', { status: 'ISSUED' })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM tb_invoice_item ii
          INNER JOIN tb_sales_item si ON si.si_id = ii.si_id
          INNER JOIN tb_sales s ON s.sa_id = si.sa_id
          WHERE ii.iv_id = invoice.iv_id AND s.sa_cancelled_at IS NOT NULL
        )`,
      )
      .andWhere('invoice.issuedAt IS NOT NULL')
      .andWhere('invoice.issuedAt >= :startDate', { startDate })
      .andWhere('invoice.issuedAt <= :endDate', { endDate })
      .getRawOne<{ amount: string }>();

    const amount = result?.amount != null ? Number(result.amount) : 0;
    return { amount };
  }

  async findAll(dto: GetReceivablesDto): Promise<GetReceivablesResponse> {
    const page = Math.max(1, parseInt(String(dto.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(dto.limit), 10) || 20));
    const { customerId, status, warningStatus, customerType } = dto;

    const qb = this.receivableRepository
      .createQueryBuilder('ar')
      .leftJoinAndSelect('ar.customer', 'customer');

    if (customerId) {
      qb.andWhere('ar.customerId = :customerId', { customerId });
    }
    if (status) {
      qb.andWhere('ar.status = :status', { status });
    }
    if (warningStatus) {
      qb.andWhere('ar.warningStatus = :warningStatus', { warningStatus });
    }
    if (customerType) {
      qb.andWhere('customer.cu_customer_type = :customerType', { customerType });
    }

    qb.orderBy('ar.occurredDate', 'DESC').addOrderBy('ar.id', 'DESC');

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data: ReceivableListItem[] = items.map((ar) => {
      const cust = ar.customer;
      const customerName = cust?.companyName ?? cust?.ceo ?? null;
      
      return {
        id: ar.id,
        customerId: ar.customerId,
        customerName,
        customerType: (cust as any)?.customerType ?? null,
        occurredDate:
          ar.occurredDate instanceof Date
            ? ar.occurredDate.toISOString().slice(0, 10)
            : String(ar.occurredDate),
        totalSales: Number(ar.totalSales),
        totalCollected: Number(ar.totalCollected),
        balance: Number(ar.balance),
        status: ar.status,
        warningStatus: ar.warningStatus ?? null,
        createdAt:
          ar.createdAt instanceof Date ? ar.createdAt.toISOString() : String(ar.createdAt),
      };
    });

    return {
      data,
      total,
      page,
      limit,
      lastPage: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(id: string): Promise<ReceivableDetail | null> {
    const receivable = await this.receivableRepository.findOne({
      where: { id },
      relations: ['customer'],
    });

    if (!receivable) {
      return null;
    }

    const cust = receivable.customer;
    const customerName = cust?.companyName ?? cust?.ceo ?? null;

    return {
      id: receivable.id,
      customerId: receivable.customerId,
      customerName,
      occurredDate:
        receivable.occurredDate instanceof Date
          ? receivable.occurredDate.toISOString().slice(0, 10)
          : String(receivable.occurredDate),
      totalSales: Number(receivable.totalSales),
      totalCollected: Number(receivable.totalCollected),
      balance: Number(receivable.balance),
      receivableAmount: Number(receivable.totalSales),
      outstandingAmount: Number(receivable.balance),
      collectedAmount: Number(receivable.totalCollected),
      prepaymentDeducted: 0,
      invoiceId: null,
      invoiceNumber: null,
      status: receivable.status,
      warningStatus: receivable.warningStatus ?? null,
      notes: receivable.notes ?? null,
      paymentTermsType: receivable.paymentTermsType || 'DAYS',
      paymentTermsValue: receivable.paymentTermsValue ?? null,
      lastPaymentDueDate: receivable.lastPaymentDueDate
        ? (receivable.lastPaymentDueDate instanceof Date
            ? receivable.lastPaymentDueDate.toISOString().slice(0, 10)
            : String(receivable.lastPaymentDueDate))
        : null,
      createdAt:
        receivable.createdAt instanceof Date ? receivable.createdAt.toISOString() : String(receivable.createdAt),
      updatedAt:
        receivable.updatedAt instanceof Date ? receivable.updatedAt.toISOString() : String(receivable.updatedAt),
    };
  }

  async findCollections(receivableId: string): Promise<ReceivableCollectionItem[]> {
    const collections = await this.collectionRepository.find({
      where: { receivableId },
      order: { collectionDate: 'DESC', createdAt: 'DESC' },
    });

    return collections.map((col) => ({
      id: col.id,
      collectionAmount: Number(col.collectionAmount),
      collectionDate:
        col.collectionDate instanceof Date
          ? col.collectionDate.toISOString().slice(0, 10)
          : String(col.collectionDate),
      collectionMethod: col.collectionMethod ?? null,
      notes: col.notes ?? null,
      isPrepayment: col.isPrepayment ?? false,
      createdAt:
        col.createdAt instanceof Date ? col.createdAt.toISOString() : String(col.createdAt),
    }));
  }

  async collect(receivableId: string, dto: CollectReceivableDto): Promise<ReceivableDetail> {
    const receivable = await this.receivableRepository.findOne({
      where: { id: receivableId },
    });

    if (!receivable) {
      throw new NotFoundException('채권을 찾을 수 없습니다.');
    }

    const collectionAmount = Number(dto.collectionAmount);
    const currentBalance = Number(receivable.balance);

    // 수금/환불 금액이 0이면 안 됨
    if (collectionAmount === 0) {
      throw new BadRequestException('수금/환불 금액은 0이 될 수 없습니다.');
    }

    // 수금인 경우 (양수)
    if (collectionAmount > 0) {
      // 수금 금액이 잔액을 초과하는지 확인
      if (collectionAmount > currentBalance) {
        throw new BadRequestException(
          `수금 금액(${collectionAmount.toLocaleString()})이 잔액(${currentBalance.toLocaleString()})을 초과할 수 없습니다.`,
        );
      }
    }
    // 환불인 경우 (음수)
    // 환불 금액은 제한 없음 (초과 입금액만큼 환불 가능)

    // 수금 이력 생성
    const collection = this.collectionRepository.create({
      receivableId: receivable.id,
      collectionAmount: collectionAmount.toString(),
      collectionDate: new Date(dto.collectionDate),
      collectionMethod: dto.collectionMethod ?? null,
      notes: dto.notes ?? null,
      isPrepayment: dto.isPrepayment === true,
    });

    await this.collectionRepository.save(collection);

    // 채권 정보 업데이트
    // 수금(양수): totalCollected 증가, balance 감소
    // 환불(음수): totalCollected 감소, balance 증가
    const newCollectedAmount = Number(receivable.totalCollected) + collectionAmount;
    const newBalance = currentBalance - collectionAmount;

    receivable.totalCollected = String(newCollectedAmount);
    receivable.balance = String(newBalance);

    // 상태 업데이트
    if (newBalance <= 0) {
      receivable.status = 'COMPLETED';
    } else if (newCollectedAmount > 0) {
      receivable.status = 'PARTIAL';
    } else {
      receivable.status = 'OUTSTANDING';
    }

    // 수금이 발생하면 경고 상태 초기화
    receivable.warningStatus = null;

    await this.receivableRepository.save(receivable);

    // 업데이트된 채권 정보 반환
    return this.findOne(receivableId) as Promise<ReceivableDetail>;
  }

  /**
   * 고객 기준 수금 등록 (거래처 중심)
   * 선입금/일반 수금 구분 없이 단순히 수금만 기록
   * 사용자가 거래처관리대장의 날짜와 잔액을 보고 판단
   */
  async collectByCustomer(customerId: string, dto: CollectByCustomerDto): Promise<ReceivableDetail> {
    return await this.dataSource.transaction(async (manager) => {
      // 고객 확인
      const customer = await manager.findOne(Customer, {
        where: { id: customerId },
      });

      if (!customer) {
        throw new NotFoundException('고객을 찾을 수 없습니다.');
      }

      // 거래처 채권 조회 (없으면 생성)
      let receivable = await manager.findOne(AccountsReceivable, {
        where: { customerId },
      });

      if (!receivable) {
        // 채권이 없으면 새로 생성
        const occurredDate = new Date(dto.collectionDate);
        const receivableSupplierId =
          dto.supplierId !== undefined && dto.supplierId !== null
            ? (dto.supplierId === 0 ? null : dto.supplierId)
            : undefined;
        receivable = manager.create(AccountsReceivable, {
          customerId,
          totalSales: '0',
          totalCollected: '0',
          balance: '0',
          status: 'OUTSTANDING',
          warningStatus: null,
          occurredDate,
          notes: null,
          supplierId: receivableSupplierId,
        });
        await manager.save(AccountsReceivable, receivable);
        this.logger.log(
          `[collectByCustomer] 거래처 채권 생성 완료 - arId: ${receivable.id}, customerId: ${customerId}`,
        );
      }

      // 통합 번호 생성
      const collectionNumber = await this.transactionNumberGenerator.generateTransactionNumber(
        new Date(dto.collectionDate),
      );

      // 수금 이력 저장
      const collection = manager.create(ReceivableCollection, {
        receivableId: receivable.id,
        customerId,
        collectionNumber,
        collectionAmount: String(dto.collectionAmount),
        collectionDate: new Date(dto.collectionDate),
        collectionMethod: dto.collectionMethod || null,
        notes: dto.notes || null,
        isPrepayment: dto.isPrepayment === true,
      });

      await manager.save(ReceivableCollection, collection);

      // 거래처 채권 업데이트
      const currentTotalCollected = Number(receivable.totalCollected);
      const currentTotalSales = Number(receivable.totalSales);
      const newTotalCollected = currentTotalCollected + dto.collectionAmount;
      const newBalance = currentTotalSales - newTotalCollected;

      receivable.totalCollected = String(newTotalCollected);
      receivable.balance = String(newBalance);

      // 채권 공급자 지정 (수금만인 경우 등)
      if (dto.supplierId !== undefined) {
        receivable.supplierId = dto.supplierId === 0 ? null : dto.supplierId;
      }

      // 상태 업데이트
      if (newBalance <= 0) {
        receivable.status = 'COMPLETED';
      } else if (newTotalCollected > 0) {
        receivable.status = 'PARTIAL';
      } else {
        receivable.status = 'OUTSTANDING';
      }

      // 수금이 발생하면 경고 상태 초기화
      receivable.warningStatus = null;

      await manager.save(AccountsReceivable, receivable);

      this.logger.log(
        `[collectByCustomer] 수금 등록 완료 - customerId: ${customerId}, ` +
        `수금액: ${dto.collectionAmount}, 총 수금액: ${newTotalCollected}, 잔액: ${newBalance}`,
      );

      // 업데이트된 채권 정보 반환
      return this.findOne(receivable.id) as Promise<ReceivableDetail>;
    });
  }

  /** 거래명세서 품목명 목록 → 목록/활동 이력용 한 줄 라벨 */
  private formatInvoiceProductLabel(names: string[]): string {
    const unique = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))];
    if (unique.length === 0) return '품목 미정';
    if (unique.length === 1) return unique[0];
    if (unique.length === 2) return `${unique[0]}, ${unique[1]}`;
    return `${unique[0]} 외 ${unique.length - 1}건`;
  }

  /**
   * 거래처관리대장 조회
   * 거래명세서와 수금을 날짜순으로 표시하고 잔액 계산
   */
  async getCustomerLedger(
    customerId: string,
    dto?: { startDate?: string; endDate?: string },
  ): Promise<CustomerLedgerResponse> {
    // 고객 확인
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('고객을 찾을 수 없습니다.');
    }

    // 거래명세서 조회 (발행된 것만, 발행일 있는 것만: 취소/미발행/판매취소 제외, 상세 잔액과 동일 기준)
    const invoiceQuery = this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.customerId = :customerId', { customerId })
      .andWhere('invoice.status = :invoiceStatus', { invoiceStatus: 'ISSUED' })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM tb_invoice_item ii
          INNER JOIN tb_sales_item si ON si.si_id = ii.si_id
          INNER JOIN tb_sales s ON s.sa_id = si.sa_id
          WHERE ii.iv_id = invoice.iv_id AND s.sa_cancelled_at IS NOT NULL
        )`,
      )
      .andWhere('invoice.issuedAt IS NOT NULL')
      .orderBy('invoice.issuedAt', 'ASC')
      .addOrderBy('invoice.id', 'ASC');

    if (dto?.startDate) {
      invoiceQuery.andWhere('DATE(invoice.issuedAt) >= :startDate', { startDate: dto.startDate });
    }
    if (dto?.endDate) {
      invoiceQuery.andWhere('DATE(invoice.issuedAt) <= :endDate', { endDate: dto.endDate });
    }

    const invoices = await invoiceQuery.getMany();

    const productLabelByInvoiceId = new Map<string, string>();
    if (invoices.length > 0) {
      const invoiceIds = invoices.map((inv) => inv.id);
      const invoiceItems = await this.dataSource
        .getRepository(InvoiceItem)
        .createQueryBuilder('item')
        .select(['item.invoiceId', 'item.productName', 'item.order'])
        .where('item.invoiceId IN (:...invoiceIds)', { invoiceIds })
        .orderBy('item.order', 'ASC')
        .addOrderBy('item.id', 'ASC')
        .getMany();
      const namesByInvoiceId = new Map<string, string[]>();
      invoiceItems.forEach((item) => {
        const key = String(item.invoiceId);
        const list = namesByInvoiceId.get(key) ?? [];
        list.push((item.productName ?? '').trim());
        namesByInvoiceId.set(key, list);
      });
      namesByInvoiceId.forEach((names, invId) => {
        productLabelByInvoiceId.set(invId, this.formatInvoiceProductLabel(names));
      });
    }

    // 수금 조회
    const receivable = await this.receivableRepository.findOne({
      where: { customerId },
    });

    let collections: ReceivableCollection[] = [];
    if (receivable) {
      const collectionQuery = this.collectionRepository
        .createQueryBuilder('collection')
        .where('collection.receivableId = :receivableId', { receivableId: receivable.id })
        .orderBy('collection.collectionDate', 'ASC')
        .addOrderBy('collection.id', 'ASC');

      if (dto?.startDate) {
        collectionQuery.andWhere('DATE(collection.collectionDate) >= :startDate', {
          startDate: dto.startDate,
        });
      }
      if (dto?.endDate) {
        collectionQuery.andWhere('DATE(collection.collectionDate) <= :endDate', {
          endDate: dto.endDate,
        });
      }

      collections = await collectionQuery.getMany();
    }

    // 거래명세서와 수금을 날짜순으로 합치기

    const entries: LedgerEntry[] = [];

    // 채권의 결제조건 정보 가져오기
    const paymentTermsType = receivable?.paymentTermsType || 'DAYS';
    const paymentTermsValue = receivable?.paymentTermsValue;

    // 거래명세서 추가
    invoices.forEach((invoice) => {
      let dateStr: string;
      if (invoice.issuedAt instanceof Date) {
        // 한국 시간대 기준으로 날짜 포맷팅 (YYYY-MM-DD)
        const year = invoice.issuedAt.getFullYear();
        const month = String(invoice.issuedAt.getMonth() + 1).padStart(2, '0');
        const day = String(invoice.issuedAt.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
      } else {
        dateStr = String(invoice.issuedAt);
      }

      // 각 거래명세서의 결제조건일 계산
      let paymentDueDateStr: string | null = null;
      if (invoice.issuedAt) {
        let issuedDate: Date;
        if (invoice.issuedAt instanceof Date) {
          issuedDate = new Date(invoice.issuedAt);
        } else {
          // 문자열인 경우 YYYY-MM-DD 형식으로 파싱하여 로컬 시간대로 생성
          const dateStr = String(invoice.issuedAt);
          const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (match) {
            const [, year, month, day] = match;
            issuedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          } else {
            issuedDate = new Date(dateStr);
          }
        }
        // 시간을 0으로 설정하여 날짜만 사용
        issuedDate.setHours(0, 0, 0, 0);
        const dueDate = calculatePaymentDueDate(
          issuedDate,
          paymentTermsType as any,
          paymentTermsValue ?? undefined,
        );
        const year = dueDate.getFullYear();
        const month = String(dueDate.getMonth() + 1).padStart(2, '0');
        const day = String(dueDate.getDate()).padStart(2, '0');
        paymentDueDateStr = `${year}-${month}-${day}`;
      }
      
      entries.push({
        date: dateStr,
        type: 'INVOICE',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber || null,
        amount: Number(invoice.invoiceAmount) || 0,
        balance: 0, // 나중에 계산
        notes: invoice.notes || null,
        paymentDueDate: paymentDueDateStr,
        paymentTermsType: paymentTermsType,
        paymentTermsValue: paymentTermsValue ?? null,
        productLabel: productLabelByInvoiceId.get(String(invoice.id)) ?? '품목 미정',
      });
    });

    // 수금 추가
    collections.forEach((collection) => {
      let dateStr: string;
      if (collection.collectionDate instanceof Date) {
        // 한국 시간대 기준으로 날짜 포맷팅 (YYYY-MM-DD)
        const year = collection.collectionDate.getFullYear();
        const month = String(collection.collectionDate.getMonth() + 1).padStart(2, '0');
        const day = String(collection.collectionDate.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
      } else {
        dateStr = String(collection.collectionDate);
      }
      
      entries.push({
        date: dateStr,
        type: 'COLLECTION',
        collectionId: collection.id,
        collectionNumber: collection.collectionNumber || null,
        amount: -Number(collection.collectionAmount) || 0, // 수금은 음수로 표시
        balance: 0, // 나중에 계산
        notes: collection.notes || null,
        isPrepayment: collection.isPrepayment ?? false,
        productLabel: collection.isPrepayment ? '선수금 수금' : '수금',
      });
    });

    // 날짜순으로 정렬 (같은 날짜면 거래명세서가 먼저)
    entries.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      // 같은 날짜면 거래명세서가 먼저
      if (a.type === 'INVOICE' && b.type === 'COLLECTION') return -1;
      if (a.type === 'COLLECTION' && b.type === 'INVOICE') return 1;
      return 0;
    });

    // 잔액 계산
    let runningBalance = 0;

    entries.forEach((entry) => {
      if (entry.type === 'INVOICE') {
        // 거래명세서: 잔액 증가
        runningBalance += entry.amount;
      } else {
        // 수금: 잔액 감소
        runningBalance += entry.amount; // amount는 이미 음수
      }
      entry.balance = runningBalance;
    });

    return {
      customerId,
      customerName: customer.companyName || customer.ceo || null,
      entries,
      totalSales: invoices.reduce((sum, inv) => sum + (Number(inv.invoiceAmount) || 0), 0),
      totalCollected: collections.reduce(
        (sum, col) => sum + (Number(col.collectionAmount) || 0),
        0,
      ),
      currentBalance: runningBalance,
    };
  }

  /**
   * 고객의 선입금 신청 목록 조회 (REQUESTED 상태)
   */
  async findPrepaymentRequests(customerId: string) {
    const prepayments = await this.prepaymentRepository.find({
      where: {
        customerId,
        paymentStatus: 'REQUESTED',
      },
      relations: ['sales'],
      order: { requestedDate: 'DESC', createdAt: 'DESC' },
    });

    return prepayments.map((prepayment) => ({
      id: prepayment.id,
      salesId: prepayment.salesId,
      salesNumber: prepayment.sales?.id || null,
      prepaymentAmount: Number(prepayment.prepaymentAmount),
      requestedDate: prepayment.requestedDate
        ? (() => {
            if (prepayment.requestedDate instanceof Date) {
              // 한국 시간대 기준으로 날짜 포맷팅 (YYYY-MM-DD)
              const year = prepayment.requestedDate.getFullYear();
              const month = String(prepayment.requestedDate.getMonth() + 1).padStart(2, '0');
              const day = String(prepayment.requestedDate.getDate()).padStart(2, '0');
              return `${year}-${month}-${day}`;
            }
            return String(prepayment.requestedDate);
          })()
        : null,
      notes: prepayment.notes || null,
    }));
  }

  async updateCollection(
    receivableId: string,
    collectionId: string,
    dto: UpdateCollectionDto,
  ): Promise<ReceivableDetail> {
    const receivable = await this.receivableRepository.findOne({
      where: { id: receivableId },
    });

    if (!receivable) {
      throw new NotFoundException('채권을 찾을 수 없습니다.');
    }

    const collection = await this.collectionRepository.findOne({
      where: { id: collectionId, receivableId },
    });

    if (!collection) {
      throw new NotFoundException('수금 이력을 찾을 수 없습니다.');
    }

    const newCollectionAmount = Number(dto.collectionAmount);
    const oldCollectionAmount = Number(collection.collectionAmount);
    const amountDifference = newCollectionAmount - oldCollectionAmount;
    const currentBalance = Number(receivable.balance);

    // 수금/환불 금액이 0이면 안 됨
    if (newCollectionAmount === 0) {
      throw new BadRequestException('수금/환불 금액은 0이 될 수 없습니다.');
    }

    // 수금 금액을 늘리는 경우에만 잔액 음수 여부 검사 (금액 미변경·환불 증가 시에는 통과)
    if (amountDifference > 0 && currentBalance - amountDifference < 0) {
      throw new BadRequestException(
        `수금 금액 수정으로 인해 잔액이 음수가 될 수 없습니다. (현재 잔액: ${currentBalance.toLocaleString()}, 변경 금액: ${amountDifference.toLocaleString()})`,
      );
    }

    // 수금 이력 업데이트
    collection.collectionAmount = String(newCollectionAmount);
    collection.collectionDate = new Date(dto.collectionDate);
    collection.collectionMethod = dto.collectionMethod ?? null;
    collection.notes = dto.notes ?? null;
    if (dto.isPrepayment !== undefined) {
      collection.isPrepayment = dto.isPrepayment;
    }

    await this.collectionRepository.save(collection);

    // 채권 정보 업데이트 (차액만큼 조정)
    const newCollectedAmount = Number(receivable.totalCollected) + amountDifference;
    const newBalance = currentBalance - amountDifference;

    receivable.totalCollected = String(newCollectedAmount);
    receivable.balance = String(newBalance);

    // 채권 공급자 지정 (수정 시 전달된 경우)
    if (dto.supplierId !== undefined && dto.supplierId !== null) {
      receivable.supplierId = dto.supplierId === 0 ? null : dto.supplierId;
    }

    // 상태 업데이트
    if (newBalance <= 0) {
      receivable.status = 'COMPLETED';
    } else if (newCollectedAmount > 0 && Number(receivable.totalSales) > 0) {
      receivable.status = 'PARTIAL';
    } else {
      receivable.status = 'OUTSTANDING';
    }

    await this.receivableRepository.save(receivable);

    // 업데이트된 채권 정보 반환
    return this.findOne(receivableId) as Promise<ReceivableDetail>;
  }

  async deleteCollection(receivableId: string, collectionId: string): Promise<ReceivableDetail> {
    const receivable = await this.receivableRepository.findOne({
      where: { id: receivableId },
    });

    if (!receivable) {
      throw new NotFoundException('채권을 찾을 수 없습니다.');
    }

    const collection = await this.collectionRepository.findOne({
      where: { id: collectionId, receivableId },
    });

    if (!collection) {
      throw new NotFoundException('수금 이력을 찾을 수 없습니다.');
    }

    const collectionAmount = Number(collection.collectionAmount);

    // 수금 이력 삭제
    await this.collectionRepository.remove(collection);

    // 채권 정보 업데이트 (수금액 차감, 잔액 증가)
    const newCollectedAmount = Number(receivable.totalCollected) - collectionAmount;
    const newBalance = Number(receivable.balance) + collectionAmount;

    receivable.totalCollected = String(Math.max(0, newCollectedAmount));
    receivable.balance = String(newBalance);

    // 상태 업데이트
    if (newBalance <= 0) {
      receivable.status = 'COMPLETED';
    } else if (newCollectedAmount > 0 && Number(receivable.totalSales) > 0) {
      receivable.status = 'PARTIAL';
    } else {
      receivable.status = 'OUTSTANDING';
    }

    await this.receivableRepository.save(receivable);

    // 업데이트된 채권 정보 반환
    return this.findOne(receivableId) as Promise<ReceivableDetail>;
  }

  /**
   * 채권 경고 상태 자동 업데이트
   * 마지막 결제조건일(lastPaymentDueDate) 기준으로 경과일을 계산하여 경고 상태를 자동으로 설정
   * 
   * 경고 단계:
   * - 채권위반 시작: lastPaymentDueDate 경과
   * - 1차 경고: 채권위반일 + 7일 경과
   * - 2차 경고: 1차 경고 발생일 + 7일 경과
   * - 3차 경고: 2차 경고 발생일 + 14일 경과
   * - 악성: 3차 경고 발생일 + 15일 경과
   */
  async updateWarningStatuses(): Promise<{ updated: number; details: Array<{ id: string; oldStatus: string | null; newStatus: string }> }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 미수금이 있는 채권만 조회 (COMPLETED 상태 제외)
    const receivables = await this.receivableRepository.find({
      where: [
        { status: 'OUTSTANDING' },
        { status: 'PARTIAL' },
      ],
    });

    const details: Array<{ id: string; oldStatus: string | null; newStatus: string }> = [];
    let updatedCount = 0;

    for (const receivable of receivables) {
      // lastPaymentDueDate가 없으면 스킵 (아직 거래명세서가 없거나 계산되지 않음)
      if (!receivable.lastPaymentDueDate) {
        continue;
      }

      // 마지막 결제조건일 기준 경과일 계산
      const paymentDueDate = receivable.lastPaymentDueDate instanceof Date 
        ? receivable.lastPaymentDueDate 
        : new Date(receivable.lastPaymentDueDate);
      paymentDueDate.setHours(0, 0, 0, 0);
      
      // 결제조건일 경과일 계산 (결제조건일이 지난 일수)
      const daysSinceDueDate = Math.floor((today.getTime() - paymentDueDate.getTime()) / (1000 * 60 * 60 * 24));

      // 결제조건일이 아직 지나지 않았으면 경고 없음
      if (daysSinceDueDate < 0) {
        const oldWarningStatus = receivable.warningStatus;
        if (oldWarningStatus !== null) {
          receivable.warningStatus = null;
          await this.receivableRepository.save(receivable);
          updatedCount++;
          details.push({
            id: receivable.id,
            oldStatus: oldWarningStatus,
            newStatus: 'NULL',
          });
        }
        continue;
      }

      // 경고 단계 계산 (고정된 일수 기준)
      // 채권위반일 + 7일 = 1차, 1차 + 7일 = 2차, 2차 + 14일 = 3차, 3차 + 15일 = 악성
      let newWarningStatus: string | null = null;
      
      if (daysSinceDueDate >= 7 + 7 + 14 + 15) {
        // 악성: 채권위반일 + 43일 이상
        newWarningStatus = 'MALICIOUS';
      } else if (daysSinceDueDate >= 7 + 7 + 14) {
        // 3차 경고: 채권위반일 + 28일 이상
        newWarningStatus = 'WARNING_3RD';
      } else if (daysSinceDueDate >= 7 + 7) {
        // 2차 경고: 채권위반일 + 14일 이상
        newWarningStatus = 'WARNING_2ND';
      } else if (daysSinceDueDate >= 7) {
        // 1차 경고: 채권위반일 + 7일 이상
        newWarningStatus = 'WARNING_1ST';
      }
      // daysSinceDueDate < 7이면 경고 없음 (null)

      // 경고 상태가 변경된 경우에만 업데이트
      const oldWarningStatus = receivable.warningStatus;
      if (oldWarningStatus !== newWarningStatus) {
        receivable.warningStatus = newWarningStatus;
        await this.receivableRepository.save(receivable);
        updatedCount++;
        details.push({
          id: receivable.id,
          oldStatus: oldWarningStatus,
          newStatus: newWarningStatus || 'NULL',
        });
        this.logger.log(
          `[updateWarningStatuses] 채권 경고 상태 업데이트 - ID: ${receivable.id}, ` +
          `결제조건일 경과일: ${daysSinceDueDate}일, 이전: ${oldWarningStatus || 'NULL'}, 현재: ${newWarningStatus || 'NULL'}`,
        );
      }
    }

    this.logger.log(`[updateWarningStatuses] 채권 경고 상태 업데이트 완료 - 총 ${updatedCount}개 업데이트`);
    return { updated: updatedCount, details };
  }

  /**
   * 채권 경고 설정 목록 조회
   * userId가 제공되면 해당 사용자 설정과 전역 설정을 병합하여 반환
   * 사용자 설정이 있으면 우선 사용, 없으면 전역 설정 사용
   */
  async findAllWarningConfigs(userId?: number): Promise<ReceivableWarningConfig[]> {
    // 전역 설정 조회 (userId가 null인 것)
    const globalConfigs = await this.warningConfigRepository.find({
      where: { userId: null },
      order: { order: 'ASC' },
    });

    // userId가 제공되지 않으면 전역 설정만 반환
    if (!userId) {
      return globalConfigs;
    }

    // 사용자별 설정 조회
    const userConfigs = await this.warningConfigRepository.find({
      where: { userId },
      order: { order: 'ASC' },
    });

    // 병합: 각 경고 단계별로 사용자 설정이 있으면 사용, 없으면 전역 설정 사용
    const warningLevels: Array<'WARNING_1ST' | 'WARNING_2ND' | 'WARNING_3RD' | 'MALICIOUS'> = [
      'WARNING_1ST',
      'WARNING_2ND',
      'WARNING_3RD',
      'MALICIOUS',
    ];

    const mergedConfigs: ReceivableWarningConfig[] = [];

    for (const level of warningLevels) {
      const userConfig = userConfigs.find((c) => c.warningLevel === level);
      const globalConfig = globalConfigs.find((c) => c.warningLevel === level);

      if (userConfig) {
        // 사용자 설정이 있으면 사용
        mergedConfigs.push(userConfig);
      } else if (globalConfig) {
        // 사용자 설정이 없으면 전역 설정 사용 (userId는 null로 유지)
        mergedConfigs.push(globalConfig);
      }
      // 둘 다 없으면 스킵
    }

    return mergedConfigs;
  }

  /**
   * 채권 경고 설정 수정
   */
  async updateWarningConfig(
    id: number,
    dto: UpdateReceivableWarningConfigDto,
  ): Promise<ReceivableWarningConfig> {
    const config = await this.warningConfigRepository.findOne({
      where: { id },
    });

    if (!config) {
      throw new NotFoundException('채권 경고 설정을 찾을 수 없습니다.');
    }

    config.daysThreshold = dto.daysThreshold;
    config.smsEnabled = dto.smsEnabled;
    config.smsDaily = dto.smsDaily;
    config.smsTemplateType = dto.smsTemplateType ?? null;
    config.description = dto.description ?? null;
    config.order = dto.order;
    config.isActive = dto.isActive;
    // userId는 업데이트하지 않음 (기존 설정의 userId 유지)

    return this.warningConfigRepository.save(config);
  }

  /**
   * 채권 경고 설정 생성
   */
  async createWarningConfig(
    dto: CreateReceivableWarningConfigDto,
  ): Promise<ReceivableWarningConfig> {
    // 동일한 warningLevel과 userId 조합이 이미 존재하는지 확인
    const existing = await this.warningConfigRepository.findOne({
      where: {
        warningLevel: dto.warningLevel,
        userId: dto.userId ?? null,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `이미 해당 경고 단계(${dto.warningLevel})에 대한 설정이 존재합니다.`,
      );
    }

    const config = this.warningConfigRepository.create({
      warningLevel: dto.warningLevel,
      daysThreshold: dto.daysThreshold,
      smsEnabled: dto.smsEnabled,
      smsDaily: dto.smsDaily,
      smsTemplateType: dto.smsTemplateType ?? null,
      description: dto.description ?? null,
      order: dto.order,
      isActive: dto.isActive,
      userId: dto.userId ?? null,
    });

    return this.warningConfigRepository.save(config);
  }

  /**
   * 채권 경고 설정 삭제
   */
  async deleteWarningConfig(id: number): Promise<void> {
    const config = await this.warningConfigRepository.findOne({
      where: { id },
    });

    if (!config) {
      throw new NotFoundException('채권 경고 설정을 찾을 수 없습니다.');
    }

    await this.warningConfigRepository.remove(config);
  }

  /**
   * 채권 결제조건 업데이트
   * 결제조건 변경 시 모든 거래명세서의 결제조건일을 재계산하여 lastPaymentDueDate 업데이트
   */
  async updatePaymentTerms(
    receivableId: string,
    paymentTermsType: 'DAYS' | 'THIS_MONTH_DAY' | 'NEXT_MONTH_DAY' | 'THIS_MONTH_END' | 'NEXT_MONTH_END',
    paymentTermsValue?: number | null,
  ): Promise<AccountsReceivable> {
    const receivable = await this.receivableRepository.findOne({
      where: { id: receivableId },
    });

    if (!receivable) {
      throw new NotFoundException('채권을 찾을 수 없습니다.');
    }

    // 결제조건 업데이트
    receivable.paymentTermsType = paymentTermsType;
    receivable.paymentTermsValue = paymentTermsValue ?? null;

    // 고객의 모든 거래명세서 조회 (발행취소·판매취소 제외)
    const allInvoices = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.customerId = :customerId', { customerId: receivable.customerId })
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

    // 각 거래명세서의 결제조건일 계산
    const paymentDueDates: Date[] = [];

    for (const invoice of allInvoices) {
      if (invoice.issuedAt) {
        const dueDate = calculatePaymentDueDate(
          invoice.issuedAt,
          paymentTermsType,
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
    } else {
      receivable.lastPaymentDueDate = null;
    }

    await this.receivableRepository.save(receivable);

    this.logger.log(
      `[updatePaymentTerms] 채권 결제조건 업데이트 완료 - receivableId: ${receivableId}, ` +
      `결제조건: ${paymentTermsType}${paymentTermsValue ? ` (${paymentTermsValue})` : ''}, ` +
      `lastPaymentDueDate: ${receivable.lastPaymentDueDate ? receivable.lastPaymentDueDate.toISOString().split('T')[0] : 'null'}`,
    );

    return receivable;
  }

  /**
   * 채권 비고(ar_notes) 저장
   */
  async updateReceivableNotes(
    receivableId: string,
    notes: string | null,
  ): Promise<ReceivableDetail> {
    const receivable = await this.receivableRepository.findOne({
      where: { id: receivableId },
    });

    if (!receivable) {
      throw new NotFoundException('채권을 찾을 수 없습니다.');
    }

    if (notes == null || (typeof notes === 'string' && notes.trim() === '')) {
      receivable.notes = null;
    } else {
      receivable.notes = notes;
    }

    await this.receivableRepository.save(receivable);
    const detail = await this.findOne(receivableId);
    if (!detail) {
      throw new NotFoundException('채권을 찾을 수 없습니다.');
    }
    return detail;
  }

  /**
   * 고객의 SMS 발송 제외 설정 업데이트
   */
  async updateSmsExcluded(customerId: string, smsExcluded: boolean): Promise<{ success: boolean; smsExcluded: boolean }> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('고객을 찾을 수 없습니다.');
    }

    customer.smsExcluded = smsExcluded;
    await this.customerRepository.save(customer);

    this.logger.log(
      `[updateSmsExcluded] 고객 SMS 발송 제외 설정 업데이트 - 고객 ID: ${customerId}, 제외 여부: ${smsExcluded}`,
    );

    return { success: true, smsExcluded };
  }

  async batchUpdateSmsExcluded(
    customerIds: string[],
    smsExcluded: boolean,
  ): Promise<{ success: boolean; updatedCount: number }> {
    if (!customerIds || customerIds.length === 0) {
      throw new BadRequestException('고객 ID 목록이 필요합니다.');
    }

    // 중복 제거
    const uniqueCustomerIds = [...new Set(customerIds)];

    // 배치 업데이트
    const result = await this.customerRepository
      .createQueryBuilder()
      .update()
      .set({ smsExcluded })
      .where('id IN (:...customerIds)', { customerIds: uniqueCustomerIds })
      .execute();

    const updatedCount = result.affected || 0;

    this.logger.log(
      `[batchUpdateSmsExcluded] 배치 SMS 발송 제외 설정 업데이트 - 고객 수: ${uniqueCustomerIds.length}, 업데이트된 수: ${updatedCount}, 제외 여부: ${smsExcluded}`,
    );

    return {
      success: true,
      updatedCount,
    };
  }

  /**
   * 수금 목록 조회
   */
  async findAllCollections(dto: GetCollectionsDto): Promise<GetCollectionsResponse> {
    const page = Math.max(1, parseInt(String(dto.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(dto.limit), 10) || 20));
    const { customerId, search, startDate, endDate } = dto;

    const qb = this.collectionRepository
      .createQueryBuilder('collection')
      .leftJoinAndSelect('collection.receivable', 'receivable')
      .leftJoinAndSelect('collection.customer', 'customer')
      .leftJoinAndSelect('receivable.customer', 'receivableCustomer');

    if (customerId) {
      qb.andWhere('(collection.customerId = :customerId OR receivable.customerId = :customerId)', {
        customerId,
      });
    }
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      qb.andWhere(
        '(customer.companyName LIKE :search OR customer.ceo LIKE :search OR receivableCustomer.companyName LIKE :search OR receivableCustomer.ceo LIKE :search)',
        { search: searchTerm },
      );
    }
    if (startDate) {
      qb.andWhere('DATE(collection.collectionDate) >= :startDate', { startDate });
    }
    if (endDate) {
      qb.andWhere('DATE(collection.collectionDate) <= :endDate', { endDate });
    }
    if (dto.prepaymentFilter === 'prepayment') {
      qb.andWhere('collection.isPrepayment = :prepaymentOnly', { prepaymentOnly: true });
    } else if (dto.prepaymentFilter === 'normal') {
      qb.andWhere('collection.isPrepayment = :normalOnly', { normalOnly: false });
    }

    /** 수금 알림 문자 이력(tb_sms_history) — 발송 연동 시 relatedId=수금ID, relatedType 고정 */
    const COLLECTION_SMS_HISTORY_RELATED_TYPE = 'RECEIVABLE_COLLECTION';
    const latestCollectionSmsStatusSql = `(
      SELECT sh.sh_status
      FROM tb_sms_history sh
      WHERE sh.sh_related_type = :collSmsRelType
        AND sh.sh_related_id = collection.id
      ORDER BY sh.sh_created_at DESC NULLS LAST
      LIMIT 1
    )`;

    qb.setParameter('collSmsRelType', COLLECTION_SMS_HISTORY_RELATED_TYPE);
    const smsFilterList = dto.smsStatuses;
    if (smsFilterList !== undefined) {
      if (smsFilterList.length === 0) {
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere(
          new Brackets((wqb) => {
            smsFilterList.forEach((token, idx) => {
              const raw = String(token).trim();
              if (raw === 'NONE' || raw === 'null') {
                wqb.orWhere(`${latestCollectionSmsStatusSql} IS NULL`);
              } else if (raw === 'not_applicable' || raw === 'NOT_APPLICABLE') {
                wqb.orWhere('0 = 1');
              } else {
                wqb.orWhere(`${latestCollectionSmsStatusSql} = :collSmsTok${idx}`, {
                  [`collSmsTok${idx}`]: raw,
                });
              }
            });
          }),
        );
      }
    }

    const sumRow = await qb
      .clone()
      .select('COALESCE(SUM(collection.collectionAmount), 0)', 'totalCollectionAmount')
      .getRawOne<Record<string, string | number>>();
    const sumVal =
      sumRow &&
      (sumRow.totalCollectionAmount ?? sumRow.totalcollectionamount ?? Object.values(sumRow)[0]);
    const totalCollectionAmount = Number(sumVal ?? 0);

    const sortOrderUpper = dto.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const idOrder = dto.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const sortBy = dto.sortBy;

    const orderExpressions: Record<string, string> = {
      collectionDate: 'collection.collectionDate',
      collectionNumber: 'collection.collectionNumber',
      collectionAmount: 'collection.collectionAmount',
      collectionMethod: 'collection.collectionMethod',
      isPrepayment: 'collection.isPrepayment',
      notes: 'collection.notes',
      createdAt: 'collection.createdAt',
      companyName: 'COALESCE(customer.companyName, receivableCustomer.companyName)',
      ceo: 'COALESCE(customer.ceo, receivableCustomer.ceo)',
    };

    if (sortBy && orderExpressions[sortBy]) {
      qb.orderBy(orderExpressions[sortBy], sortOrderUpper).addOrderBy('collection.id', idOrder);
    } else {
      qb.orderBy('collection.collectionDate', 'DESC').addOrderBy('collection.id', 'DESC');
    }

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const collectionIds = items.map((c) => c.id).filter((id) => id != null && id !== '');
    const numericCollectionIds = collectionIds
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n));
    const smsLatestByCollectionId = new Map<string, string | null>();
    if (numericCollectionIds.length > 0) {
      const histories = await this.smsHistoryRepository.find({
        where: {
          relatedType: COLLECTION_SMS_HISTORY_RELATED_TYPE,
          relatedId: In(numericCollectionIds),
        },
        order: { createdAt: 'DESC' },
      });
      for (const h of histories) {
        if (h.relatedId == null) continue;
        const rid = String(h.relatedId);
        if (!smsLatestByCollectionId.has(rid)) {
          smsLatestByCollectionId.set(rid, h.status ?? null);
        }
      }
    }

    const data: CollectionListItem[] = items.map((collection) => {
      const customer =
        collection.customer ?? collection.receivable?.customer ?? null;
      const companyName = customer?.companyName ?? null;
      const ceo = customer?.ceo ?? null;
      const phone = customer?.phone ?? null;
      const customerName = companyName ?? ceo ?? null;

      return {
        id: collection.id,
        collectionNumber: collection.collectionNumber ?? null,
        receivableId: collection.receivableId,
        customerId: collection.customerId ?? collection.receivable?.customerId ?? '',
        customerName,
        companyName,
        ceo,
        phone,
        collectionAmount: Number(collection.collectionAmount),
        collectionDate: (() => {
          if (collection.collectionDate instanceof Date) {
            // 한국 시간대 기준으로 날짜 포맷팅 (YYYY-MM-DD)
            const year = collection.collectionDate.getFullYear();
            const month = String(collection.collectionDate.getMonth() + 1).padStart(2, '0');
            const day = String(collection.collectionDate.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          }
          return String(collection.collectionDate);
        })(),
        collectionMethod: collection.collectionMethod ?? null,
        notes: collection.notes ?? null,
        isPrepayment: collection.isPrepayment ?? false,
        createdAt:
          collection.createdAt instanceof Date
            ? collection.createdAt.toISOString()
            : String(collection.createdAt),
        smsStatus: smsLatestByCollectionId.get(String(collection.id)) ?? null,
      };
    });

    return {
      data,
      total,
      page,
      limit,
      lastPage: Math.ceil(total / limit),
      totalCollectionAmount,
    };
  }

  /**
   * 채권이 있는 고객 목록을 조회합니다.
   * AccountsReceivable 테이블에 레코드가 있는 고객만 반환합니다.
   * 조회 시 실시간으로 채권 상태를 계산합니다.
   */
  async findCustomersWithReceivables(
    search?: string,
    page: number = 1,
    limit: number = 20,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
    warningStatus?: (string | null)[],
    excludeZeroBalance: boolean = false,
    supplierIds?: number[],
    customerType?: string,
    dueDateLte?: string,
    /** 계산 잔액(거래처관리대장 기준) 구간 다중 선택. 없거나 3종 전부면 필터 없음. 빈 배열이면 결과 없음 */
    balanceCategories?: string[],
    /** 계산 잔액이 이 값 미만인 거래처는 목록·합계에서 제외 (양수일 때만 적용) */
    minReceivableBalance?: number,
  ): Promise<GetCustomersWithReceivablesResponse> {
    const pageNum = Math.max(1, page);
    const limitNum = Math.min(100, Math.max(1, limit));

    const BALANCE_CATEGORY_VALUES = ['RECEIVABLE', 'ZERO', 'PREPAYMENT'] as const;
    type BalanceCategory = (typeof BALANCE_CATEGORY_VALUES)[number];
    let normalizedBalanceCategories: BalanceCategory[] | undefined;
    if (balanceCategories !== undefined) {
      if (balanceCategories.length === 0) {
        return {
          data: [],
          total: 0,
          page: pageNum,
          limit: limitNum,
          lastPage: 1,
          totalBalance: 0,
        };
      }
      const set = new Set<BalanceCategory>();
      for (const c of balanceCategories) {
        const u = String(c).toUpperCase();
        if (BALANCE_CATEGORY_VALUES.includes(u as BalanceCategory)) set.add(u as BalanceCategory);
      }
      const arr = [...set];
      normalizedBalanceCategories =
        arr.length === 0 || arr.length >= BALANCE_CATEGORY_VALUES.length ? undefined : arr;
    }
    const hasBalancePostFilter =
      normalizedBalanceCategories !== undefined && normalizedBalanceCategories.length > 0;
    const hasMinBalanceFilter =
      minReceivableBalance != null &&
      Number.isFinite(minReceivableBalance) &&
      minReceivableBalance > 0;

    const qb = this.receivableRepository
      .createQueryBuilder('ar')
      .leftJoinAndSelect('ar.customer', 'customer')
      .leftJoinAndSelect('customer.salesManagerUser', 'salesManagerUser')
      .leftJoinAndSelect('ar.supplier', 'arSupplier');

    // 허용된 정렬 필드 매핑 (보안을 위해 화이트리스트 사용)
    const allowedSortFields: Record<string, string> = {
      companyName: 'customer.companyName',
      ceo: 'customer.ceo',
      phone: 'customer.phone',
      occurredDate: 'ar.occurredDate',
      balance: 'ar.balance',
      warningStatus: 'ar.warningStatus',
      salesManagerName: 'salesManagerUser.name',
    };

    // 정렬 필드 및 방향 결정
    const validSortBy = sortBy && allowedSortFields[sortBy] ? sortBy : 'companyName';
    const validSortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC';
    const sortField = allowedSortFields[validSortBy];

    // 정렬 적용
    qb.orderBy(sortField, validSortOrder);

    // 기본 정렬이 회사명이 아닌 경우, 회사명을 보조 정렬로 추가
    if (validSortBy !== 'companyName') {
      qb.addOrderBy('customer.companyName', 'ASC');
    }

    // 검색어가 있으면 고객명 또는 대표자명으로 필터링
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      qb.andWhere(
        '(customer.companyName LIKE :search OR customer.ceo LIKE :search)',
        { search: searchTerm },
      );
    }

    // 고객 구분 필터 (농가/유통)
    if (customerType) {
      qb.andWhere('customer.cu_customer_type = :customerType', { customerType });
    }

    // 0원 제외: AR 테이블 잔액 기준 (계산 잔액 구간 필터 사용 시에는 전부 불러온 뒤 목록에서 걸러냄)
    if (excludeZeroBalance && !hasBalancePostFilter) {
      qb.andWhere('ar.balance <> 0');
    }

    // 결제조건일 기준 ~ 선택일 이하 (dueDateLte: YYYY-MM-DD)
    if (dueDateLte && /^\d{4}-\d{2}-\d{2}$/.test(dueDateLte.trim())) {
      qb.andWhere('ar.lastPaymentDueDate IS NOT NULL AND ar.lastPaymentDueDate <= :dueDateLte', {
        dueDateLte: dueDateLte.trim(),
      });
    }

    // 공급자 필터 (다중 선택)
    if (supplierIds !== undefined && supplierIds !== null && supplierIds.length > 0) {
      const hasNone = supplierIds.includes(0);
      const positiveIds = supplierIds.filter((id) => id > 0);

      const conditions: string[] = [];
      const params: Record<string, any> = {};

      if (hasNone) {
        // 공급자 없음: 거래명세서도 없고 채권(ar)에도 공급자 미지정인 경우만
        conditions.push(`(
          (ar.ar_supplier_id IS NULL)
          AND (
            NOT EXISTS (
              SELECT 1 FROM tb_invoice inv2
              WHERE inv2.cu_id = ar.cu_id
              AND inv2.iv_status = 'ISSUED'
              AND inv2.iv_deleted_at IS NULL
              AND inv2.iv_issued_at IS NOT NULL
            )
            OR EXISTS (
              SELECT 1 FROM tb_invoice inv
              WHERE inv.cu_id = ar.cu_id
              AND inv.iv_status = 'ISSUED'
              AND inv.iv_deleted_at IS NULL
              AND inv.iv_issued_at IS NOT NULL
              AND (inv.iv_supplier_id IS NULL)
              AND inv.iv_issued_at = (
                SELECT MAX(iv2.iv_issued_at) FROM tb_invoice iv2
                WHERE iv2.cu_id = ar.cu_id
                AND iv2.iv_status = 'ISSUED'
                AND iv2.iv_deleted_at IS NULL
                AND iv2.iv_issued_at IS NOT NULL
              )
            )
          )
        )`);
      }

      if (positiveIds.length > 0) {
        params.supplierIds = positiveIds;
        // 마지막 발행 거래명세서 공급자만 (화면 supplierId와 동일). ar_supplier_id는 예전 공급사가 남아 이중 집계되므로 필터에 쓰지 않음.
        conditions.push(
          `(
            EXISTS (
              SELECT 1 FROM tb_invoice inv
              WHERE inv.cu_id = ar.cu_id
              AND inv.iv_status = 'ISSUED'
              AND inv.iv_deleted_at IS NULL
              AND inv.iv_issued_at IS NOT NULL
              AND inv.iv_supplier_id IN (:...supplierIds)
              AND inv.iv_issued_at = (
                SELECT MAX(iv2.iv_issued_at) FROM tb_invoice iv2
                WHERE iv2.cu_id = ar.cu_id
                AND iv2.iv_status = 'ISSUED'
                AND iv2.iv_deleted_at IS NULL
                AND iv2.iv_issued_at IS NOT NULL
              )
            )
          )`,
        );
      }

      if (conditions.length > 0) {
        qb.andWhere(`(${conditions.join(' OR ')})`, params);
      }
    }

    // 채권 상태 필터링은 조회 후 계산된 경고 상태를 기준으로 하므로
    // 필터링이 있으면 먼저 모든 데이터를 조회한 후 필터링
    // undefined: 필터링 안 함, 빈 배열: 아무것도 표시하지 않음, 값이 있는 배열: 필터링
    const hasWarningStatusFilter = warningStatus !== undefined;
    const needsFullScan = hasWarningStatusFilter || hasBalancePostFilter || hasMinBalanceFilter;

    // 필터 적용 전체의 잔액 합계 (목록과 동일: 발행된 거래명세서 - 수금, 삭제/취소 제외)
    let totalBalance: number = 0;
    if (!hasWarningStatusFilter && !hasBalancePostFilter && !hasMinBalanceFilter) {
      const allFiltered = await qb.clone().skip(0).take(100000).getMany();
      if (allFiltered.length > 0) {
        const allCustomerIds = [...new Set(allFiltered.map((ar) => ar.customerId))];
        const allReceivableIds = allFiltered.map((ar) => ar.id);
        const invoiceSumsAll = await this.invoiceRepository
          .createQueryBuilder('invoice')
          .select('invoice.customerId', 'customerId')
          .addSelect('COALESCE(SUM(invoice.invoiceAmount), 0)', 'total')
          .where('invoice.customerId IN (:...allCustomerIds)', { allCustomerIds })
          .andWhere('invoice.status = :status', { status: 'ISSUED' })
          .andWhere('invoice.deletedAt IS NULL')
          .andWhere(
            `NOT EXISTS (
              SELECT 1 FROM tb_invoice_item ii
              INNER JOIN tb_sales_item si ON si.si_id = ii.si_id
              INNER JOIN tb_sales s ON s.sa_id = si.sa_id
              WHERE ii.iv_id = invoice.iv_id AND s.sa_cancelled_at IS NOT NULL
            )`,
          )
          .andWhere('invoice.issuedAt IS NOT NULL')
          .groupBy('invoice.customerId')
          .getRawMany<{ customerId: string; total: string }>();
        const collectionSumsAll = await this.collectionRepository
          .createQueryBuilder('collection')
          .select('collection.receivableId', 'receivableId')
          .addSelect('COALESCE(SUM(collection.collectionAmount), 0)', 'total')
          .where('collection.receivableId IN (:...allReceivableIds)', { allReceivableIds })
          .groupBy('collection.receivableId')
          .getRawMany<{ receivableId: string; total: string }>();
        const salesByCustomer = new Map<string, number>();
        for (const row of invoiceSumsAll) salesByCustomer.set(String(row.customerId), Number(row.total) || 0);
        const collectedByReceivable = new Map<string, number>();
        for (const row of collectionSumsAll) collectedByReceivable.set(String(row.receivableId), Number(row.total) || 0);
        for (const ar of allFiltered) {
          const sales = salesByCustomer.get(ar.customerId) ?? 0;
          const collected = collectedByReceivable.get(ar.id) ?? 0;
          totalBalance += sales - collected;
        }
      }
    }

    let items: any[];
    let total: number;

    if (needsFullScan) {
      // 경고·잔액 구간 필터는 계산 잔액 기준이므로 전체 조회 후 필터·페이지네이션
      [items, total] = await qb.getManyAndCount();
    } else {
      [items, total] = await qb
        .skip((pageNum - 1) * limitNum)
        .take(limitNum)
        .getManyAndCount();
    }

    // 각 고객의 마지막 거래명세서 발행일 및 공급자 조회
    const customerIds = items.map((ar) => ar.customerId);
    const lastInvoiceDates = new Map<string, Date | null>();
    const lastInvoiceSuppliers = new Map<string, { supplierId: number | null; supplierCompanyName: string | null }>();

    if (customerIds.length > 0) {
      const lastInvoices = await this.invoiceRepository
        .createQueryBuilder('invoice')
        .select('invoice.customerId', 'customerId')
        .addSelect('MAX(invoice.issuedAt)', 'lastIssuedAt')
        .where('invoice.customerId IN (:...customerIds)', { customerIds })
        .andWhere('invoice.issuedAt IS NOT NULL')
        .andWhere('invoice.deletedAt IS NULL')
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM tb_invoice_item ii
            INNER JOIN tb_sales_item si ON si.si_id = ii.si_id
            INNER JOIN tb_sales s ON s.sa_id = si.sa_id
            WHERE ii.iv_id = invoice.iv_id AND s.sa_cancelled_at IS NOT NULL
          )`,
        )
        .groupBy('invoice.customerId')
        .getRawMany();

      for (const row of lastInvoices) {
        const customerId = String(row.customerId);
        const lastIssuedAt = row.lastIssuedAt 
          ? (row.lastIssuedAt instanceof Date ? row.lastIssuedAt : new Date(row.lastIssuedAt))
          : null;
        lastInvoiceDates.set(customerId, lastIssuedAt);
      }

      // 각 고객의 최근 거래명세서의 공급자 조회 (발행일 내림차순, 고객별 첫 건)
      const invoicesWithSupplier = await this.invoiceRepository
        .createQueryBuilder('invoice')
        .leftJoinAndSelect('invoice.supplier', 'supplier')
        .where('invoice.customerId IN (:...customerIds)', { customerIds })
        .andWhere('invoice.status = :status', { status: 'ISSUED' })
        .andWhere('invoice.deletedAt IS NULL')
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM tb_invoice_item ii
            INNER JOIN tb_sales_item si ON si.si_id = ii.si_id
            INNER JOIN tb_sales s ON s.sa_id = si.sa_id
            WHERE ii.iv_id = invoice.iv_id AND s.sa_cancelled_at IS NOT NULL
          )`,
        )
        .andWhere('invoice.issuedAt IS NOT NULL')
        .orderBy('invoice.issuedAt', 'DESC')
        .getMany();

      const seen = new Set<string>();
      for (const inv of invoicesWithSupplier) {
        const cid = String(inv.customerId ?? '');
        if (!cid || seen.has(cid)) continue;
        seen.add(cid);
        lastInvoiceSuppliers.set(cid, {
          supplierId: inv.supplierId ?? inv.supplier?.id ?? null,
          supplierCompanyName: inv.supplier?.companyName ?? null,
        });
      }
    }

    // 목록 잔액 = 상세(거래처관리대장)와 동일하게 계산: 발행된 거래명세서 합계 - 수금 합계 (취소/미발행 제외)
    const balanceFromLedger = new Map<string, number>();
    if (customerIds.length > 0) {
      const invoiceSums = await this.invoiceRepository
        .createQueryBuilder('invoice')
        .select('invoice.customerId', 'customerId')
        .addSelect('COALESCE(SUM(invoice.invoiceAmount), 0)', 'total')
        .where('invoice.customerId IN (:...customerIds)', { customerIds })
        .andWhere('invoice.status = :status', { status: 'ISSUED' })
        .andWhere('invoice.deletedAt IS NULL')
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM tb_invoice_item ii
            INNER JOIN tb_sales_item si ON si.si_id = ii.si_id
            INNER JOIN tb_sales s ON s.sa_id = si.sa_id
            WHERE ii.iv_id = invoice.iv_id AND s.sa_cancelled_at IS NOT NULL
          )`,
        )
        .andWhere('invoice.issuedAt IS NOT NULL')
        .groupBy('invoice.customerId')
        .getRawMany<{ customerId: string; total: string }>();

      const receivableIds = items.map((ar) => ar.id);
      const collectionSums = await this.collectionRepository
        .createQueryBuilder('collection')
        .select('collection.receivableId', 'receivableId')
        .addSelect('COALESCE(SUM(collection.collectionAmount), 0)', 'total')
        .where('collection.receivableId IN (:...receivableIds)', { receivableIds })
        .groupBy('collection.receivableId')
        .getRawMany<{ receivableId: string; total: string }>();

      const receivableIdToCustomerId = new Map<string, string>();
      for (const ar of items) {
        receivableIdToCustomerId.set(ar.id, ar.customerId);
      }
      const collectionByCustomer = new Map<string, number>();
      for (const row of collectionSums) {
        const cid = receivableIdToCustomerId.get(row.receivableId);
        if (cid) collectionByCustomer.set(cid, Number(row.total) || 0);
      }
      for (const row of invoiceSums) {
        const cid = String(row.customerId);
        const sales = Number(row.total) || 0;
        const collected = collectionByCustomer.get(cid) ?? 0;
        balanceFromLedger.set(cid, sales - collected);
      }
      // AR에는 있지만 발행된 거래명세서가 없는 고객: 수금만 있으면 잔액 = -수금 (선수금/과납), 없으면 0
      for (const cid of customerIds) {
        if (!balanceFromLedger.has(cid)) {
          const collected = collectionByCustomer.get(cid) ?? 0;
          balanceFromLedger.set(cid, -collected);
        }
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const data: CustomerWithReceivable[] = items.map((ar) => {
      // 마지막 거래명세서 발행일 (명세서 발행일 컬럼용)
      const lastIssuedAt = lastInvoiceDates.get(ar.customerId);
      let lastInvoiceDateStr: string | null = null;
      
      if (lastIssuedAt) {
        const lastDate = lastIssuedAt instanceof Date ? lastIssuedAt : new Date(lastIssuedAt);
        lastDate.setHours(0, 0, 0, 0);
        const year = lastDate.getFullYear();
        const month = String(lastDate.getMonth() + 1).padStart(2, '0');
        const day = String(lastDate.getDate()).padStart(2, '0');
        lastInvoiceDateStr = `${year}-${month}-${day}`;
      } else {
        // 거래명세서가 없으면 발생일 사용 (fallback)
        const occurredDate = ar.occurredDate instanceof Date 
          ? ar.occurredDate 
          : new Date(ar.occurredDate);
        occurredDate.setHours(0, 0, 0, 0);
        const year = occurredDate.getFullYear();
        const month = String(occurredDate.getMonth() + 1).padStart(2, '0');
        const day = String(occurredDate.getDate()).padStart(2, '0');
        lastInvoiceDateStr = `${year}-${month}-${day}`;
      }

      // 마지막 결제조건일 기준 경과일 계산
      let daysElapsed = 0;
      if (ar.lastPaymentDueDate) {
        const paymentDueDate = ar.lastPaymentDueDate instanceof Date 
          ? ar.lastPaymentDueDate 
          : new Date(ar.lastPaymentDueDate);
        paymentDueDate.setHours(0, 0, 0, 0);
        // 결제조건일 경과일 계산 (결제조건일이 지난 일수, 음수면 아직 안 지남)
        daysElapsed = Math.floor((today.getTime() - paymentDueDate.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        // 결제조건일이 없으면 발생일 기준으로 계산 (fallback)
        const occurredDate = ar.occurredDate instanceof Date 
          ? ar.occurredDate 
          : new Date(ar.occurredDate);
        occurredDate.setHours(0, 0, 0, 0);
        daysElapsed = Math.floor((today.getTime() - occurredDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      // 경고 상태 계산 (고정된 일수 기준)
      // 결제조건일 경과 → 채권위반 시작 (경고 없음)
      // 경과일 >= 7일 → 1차 경고
      // 경과일 >= 14일 → 2차 경고 (1차 + 7일)
      // 경과일 >= 28일 → 3차 경고 (2차 + 14일)
      // 경과일 >= 43일 → 악성 (3차 + 15일)
      // 단, 잔액이 10만원 미만이면 제외 상태로 처리 (SMS 발송 대상에서 제외)
      let calculatedWarningStatus: string | null = null;
      // 상세(거래처관리대장)와 동일한 기준으로 계산한 잔액 사용 (취소된 거래명세서 제외)
      const balance = balanceFromLedger.get(ar.customerId) ?? Number(ar.balance) ?? 0;
      const MIN_BALANCE_FOR_WARNING = 100000; // 10만원
      
      // 잔액이 10만원 미만이면 제외 상태로 처리
      if (balance < MIN_BALANCE_FOR_WARNING) {
        calculatedWarningStatus = 'EXCLUDED';
      } else if (daysElapsed < 0) {
        // 결제조건일이 아직 지나지 않았으면 경고 없음
        calculatedWarningStatus = null;
      } else if (daysElapsed >= 43) {
        // 악성: 경과일 43일 이상
        calculatedWarningStatus = 'MALICIOUS';
      } else if (daysElapsed >= 28) {
        // 3차 경고: 경과일 28일 이상
        calculatedWarningStatus = 'WARNING_3RD';
      } else if (daysElapsed >= 14) {
        // 2차 경고: 경과일 14일 이상
        calculatedWarningStatus = 'WARNING_2ND';
      } else if (daysElapsed >= 7) {
        // 1차 경고: 경과일 7일 이상
        calculatedWarningStatus = 'WARNING_1ST';
      }
      // daysElapsed < 7이면 경고 없음 (null, 채권위반 시작)

      const fromInvoice = lastInvoiceSuppliers.get(ar.customerId);
      const supplierId = fromInvoice?.supplierId ?? ar.supplierId ?? null;
      const supplierCompanyName =
        fromInvoice?.supplierCompanyName ?? ar.supplier?.companyName ?? null;

      const sm = ar.customer?.salesManagerUser;
      const salesManagerName = sm ? (sm.name?.trim() || null) : null;
      const salesManagerEmail = sm ? (sm.email || null) : null;

      return {
        customerId: ar.customerId,
        companyName: ar.customer?.companyName ?? null,
        ceo: ar.customer?.ceo ?? null,
        phone: ar.customer?.phone ?? null,
        customerType: ar.customer?.customerType ?? null,
        balance,
        receivableId: ar.id,
        receivableNotes: ar.notes ?? null,
        warningStatus: calculatedWarningStatus,
        occurredDate: lastInvoiceDateStr || (ar.occurredDate instanceof Date
          ? ar.occurredDate.toISOString().slice(0, 10)
          : String(ar.occurredDate)),
        salesManagerName,
        salesManagerEmail,
        smsExcluded: ar.customer?.smsExcluded ?? false,
        lastPaymentDueDate: ar.lastPaymentDueDate 
          ? (ar.lastPaymentDueDate instanceof Date 
              ? ar.lastPaymentDueDate.toISOString().slice(0, 10)
              : String(ar.lastPaymentDueDate))
          : null,
        paymentTermsType: ar.paymentTermsType || 'DAYS',
        paymentTermsValue: ar.paymentTermsValue ?? null,
        dDay: daysElapsed, // 음수면 D-DAY (아직 안 지남), 양수면 경과일
        supplierId,
        supplierCompanyName,
      };
    });

    // 계산된 경고·잔액 구간을 기준으로 필터링 (전체 스캔 경로)
    let filteredData = data;
    if (hasWarningStatusFilter) {
      if (warningStatus!.length === 0) {
        return {
          data: [],
          total: 0,
          page: pageNum,
          limit: limitNum,
          lastPage: 1,
          totalBalance: 0,
        };
      }

      filteredData = filteredData.filter((item) => {
        const hasNull = warningStatus!.includes(null);
        const nonNullValues = warningStatus!.filter((v) => v !== null) as string[];
        const itemStatus = item.warningStatus;

        if (hasNull && nonNullValues.length > 0) {
          return itemStatus === null || (itemStatus !== null && nonNullValues.includes(itemStatus));
        }
        if (hasNull) {
          return itemStatus === null;
        }
        return itemStatus !== null && nonNullValues.includes(itemStatus);
      });
    }

    if (hasBalancePostFilter && normalizedBalanceCategories) {
      const cats = normalizedBalanceCategories;
      const eps = 0.01; // 원 단위 부동소수 오차
      filteredData = filteredData.filter((item) => {
        const b = item.balance;
        if (b > eps) return cats.includes('RECEIVABLE');
        if (Math.abs(b) <= eps) return cats.includes('ZERO');
        return cats.includes('PREPAYMENT');
      });
    }

    if (hasMinBalanceFilter) {
      const floor = minReceivableBalance!;
      filteredData = filteredData.filter((item) => (item.balance ?? 0) >= floor);
    }

    if (needsFullScan) {
      if (sortBy) {
        const allowedSortFields: Record<string, keyof CustomerWithReceivable> = {
          companyName: 'companyName',
          ceo: 'ceo',
          phone: 'phone',
          occurredDate: 'occurredDate',
          balance: 'balance',
          warningStatus: 'warningStatus',
          salesManagerName: 'salesManagerName',
        };

        const sortField = allowedSortFields[sortBy] || 'companyName';
        const sortOrderValue = sortOrder === 'desc' ? -1 : 1;

        filteredData.sort((a, b) => {
          const aValue = a[sortField];
          const bValue = b[sortField];

          if (aValue === null && bValue === null) return 0;
          if (aValue === null) return 1;
          if (bValue === null) return -1;

          if (typeof aValue === 'string' && typeof bValue === 'string') {
            return aValue.localeCompare(bValue) * sortOrderValue;
          }
          if (typeof aValue === 'number' && typeof bValue === 'number') {
            return (aValue - bValue) * sortOrderValue;
          }

          return 0;
        });
      }

      const filteredTotal = filteredData.length;
      const startIndex = (pageNum - 1) * limitNum;
      const totalBalanceFiltered = filteredData.reduce((sum, item) => sum + (item.balance || 0), 0);
      const pageSlice = filteredData.slice(startIndex, startIndex + limitNum);

      return {
        data: pageSlice,
        total: filteredTotal,
        page: pageNum,
        limit: limitNum,
        lastPage: Math.ceil(filteredTotal / limitNum) || 1,
        totalBalance: totalBalanceFiltered,
      };
    }

    return {
      data,
      total,
      page: pageNum,
      limit: limitNum,
      lastPage: Math.ceil(total / limitNum) || 1,
      totalBalance,
    };
  }

  /**
   * 기준일 이하만 반영한 잔액으로 고객 목록 조회 (주별입금예상액용)
   * - 거래명세서: 결제조건일 ≤ 기준일 인 금액 합산
   * - 수금: 수금일 ≤ 기준일 인 금액 합산
   * - 잔액 = (명세서 합계) - (수금 합계)
   */
  async findCustomersWithBalanceByCutoff(
    cutoffDate: string,
    page: number = 1,
    limit: number = 20,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
    search?: string,
    customerType?: string,
    supplierIds?: number[],
    excludeZeroBalance: boolean = true,
  ): Promise<GetCustomersWithReceivablesResponse> {
    const cutoff = new Date(cutoffDate + 'T00:00:00');
    if (Number.isNaN(cutoff.getTime())) {
      throw new BadRequestException('Invalid cutoff date');
    }
    const pageNum = Math.max(1, page);
    const limitNum = Math.min(100, Math.max(1, limit));

    const receivables = await this.receivableRepository.find({
      relations: ['customer', 'customer.salesManagerUser', 'supplier'],
      order: { customerId: 'ASC' },
    });

    type Row = CustomerWithReceivable & {
      lastPaymentDueDate?: string | null;
      paymentTermsType?: string;
      paymentTermsValue?: number | null;
      dDay?: number;
      smsExcluded?: boolean;
    };
    const results: Row[] = [];

    for (const ar of receivables) {
      const paymentTermsType = (ar.paymentTermsType || 'DAYS') as 'DAYS' | 'THIS_MONTH_DAY' | 'NEXT_MONTH_DAY' | 'THIS_MONTH_END' | 'NEXT_MONTH_END';
      const paymentTermsValue = ar.paymentTermsValue ?? undefined;

      const invoices = await this.invoiceRepository
        .createQueryBuilder('invoice')
        .where('invoice.customerId = :customerId', { customerId: ar.customerId })
        .andWhere('invoice.status = :status', { status: 'ISSUED' })
        .andWhere('invoice.deletedAt IS NULL')
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM tb_invoice_item ii
            INNER JOIN tb_sales_item si ON si.si_id = ii.si_id
            INNER JOIN tb_sales s ON s.sa_id = si.sa_id
            WHERE ii.iv_id = invoice.iv_id AND s.sa_cancelled_at IS NOT NULL
          )`,
        )
        .getMany();
      let invoiceSum = 0;
      let maxDueDateStr: string | null = null;
      let maxDueDate: Date | null = null;
      let occurredDateStr: string | null = null;

      for (const inv of invoices) {
        if (!inv.issuedAt) continue;
        const issued = inv.issuedAt instanceof Date ? inv.issuedAt : new Date(inv.issuedAt);
        const due = calculatePaymentDueDate(issued, paymentTermsType, paymentTermsValue);
        const dueStr = due.toISOString().slice(0, 10);
        if (dueStr <= cutoffDate) {
          invoiceSum += Number(inv.invoiceAmount) || 0;
          if (!maxDueDate || due > maxDueDate) {
            maxDueDate = due;
            maxDueDateStr = dueStr;
            occurredDateStr =
              issued.getFullYear() +
              '-' +
              String(issued.getMonth() + 1).padStart(2, '0') +
              '-' +
              String(issued.getDate()).padStart(2, '0');
          }
        }
      }

      const collections = await this.collectionRepository.find({
        where: { receivableId: ar.id },
      });
      let collectionSum = 0;
      for (const col of collections) {
        const d = col.collectionDate instanceof Date ? col.collectionDate : new Date(col.collectionDate);
        const dStr = d.toISOString().slice(0, 10);
        if (dStr <= cutoffDate) {
          collectionSum += Number(col.collectionAmount) || 0;
        }
      }

      const balance = invoiceSum - collectionSum;
      if (excludeZeroBalance && balance <= 0) continue;

      const searchTerm = search?.trim();
      if (searchTerm) {
        const name = (ar.customer?.companyName ?? '').toLowerCase();
        const ceo = (ar.customer?.ceo ?? '').toLowerCase();
        const term = searchTerm.toLowerCase();
        if (!name.includes(term) && !ceo.includes(term)) continue;
      }
      if (customerType && (ar.customer?.customerType ?? '') !== customerType) continue;

      const dDay = maxDueDateStr
        ? Math.floor((cutoff.getTime() - new Date(maxDueDateStr + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      const supplierId = ar.supplierId ?? null;
      const supplierCompanyName = ar.supplier?.companyName ?? null;

      if (supplierIds !== undefined && supplierIds !== null && supplierIds.length > 0) {
        const hasNone = supplierIds.includes(0);
        const positiveIds = supplierIds.filter((id) => id > 0);
        if (hasNone && positiveIds.length === 0 && supplierId != null) continue;
        if (hasNone && positiveIds.length === 0) {
          // 공급자 없음만: supplierId가 null이어야 함
          if (supplierId != null) continue;
        }
        if (positiveIds.length > 0 && !positiveIds.includes(supplierId ?? 0)) continue;
      }

      const smUser = ar.customer?.salesManagerUser;
      const salesManagerName = smUser ? (smUser.name?.trim() || null) : null;
      const salesManagerEmail = smUser ? (smUser.email || null) : null;

      results.push({
        customerId: ar.customerId,
        companyName: ar.customer?.companyName ?? null,
        ceo: ar.customer?.ceo ?? null,
        phone: ar.customer?.phone ?? null,
        customerType: ar.customer?.customerType ?? null,
        balance,
        receivableId: ar.id,
        receivableNotes: ar.notes ?? null,
        warningStatus: null,
        occurredDate: occurredDateStr ?? (ar.occurredDate instanceof Date ? ar.occurredDate.toISOString().slice(0, 10) : String(ar.occurredDate ?? '')),
        lastPaymentDueDate: maxDueDateStr,
        paymentTermsType: ar.paymentTermsType || 'DAYS',
        paymentTermsValue: ar.paymentTermsValue ?? null,
        dDay,
        supplierId,
        supplierCompanyName,
        salesManagerName,
        salesManagerEmail,
        smsExcluded: ar.customer?.smsExcluded ?? false,
      } as Row);
    }

    const allowedSort: Record<string, keyof CustomerWithReceivable> = {
      companyName: 'companyName',
      ceo: 'ceo',
      phone: 'phone',
      occurredDate: 'occurredDate',
      balance: 'balance',
      salesManagerName: 'salesManagerName',
    };
    const sortField = (sortBy && allowedSort[sortBy]) || 'companyName';
    const desc = sortOrder === 'desc';
    results.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return desc ? 1 : -1;
      if (bVal == null) return desc ? -1 : 1;
      if (typeof aVal === 'number' && typeof bVal === 'number') return desc ? bVal - aVal : aVal - bVal;
      return (String(aVal).localeCompare(String(bVal)) * (desc ? -1 : 1));
    });

    const total = results.length;
    const totalBalance = results.reduce((sum, r) => sum + (r.balance ?? 0), 0);
    const start = (pageNum - 1) * limitNum;
    const paged = results.slice(start, start + limitNum);
    const lastPage = Math.max(1, Math.ceil(total / limitNum));

    const data: CustomerWithReceivable[] = paged.map((r) => ({
      customerId: r.customerId,
      companyName: r.companyName,
      ceo: r.ceo,
      phone: r.phone,
      customerType: r.customerType,
      balance: r.balance,
      receivableId: r.receivableId,
      receivableNotes: r.receivableNotes ?? null,
      warningStatus: r.warningStatus,
      occurredDate: r.occurredDate,
      lastPaymentDueDate: r.lastPaymentDueDate,
      paymentTermsType: r.paymentTermsType,
      paymentTermsValue: r.paymentTermsValue,
      dDay: r.dDay,
      supplierId: r.supplierId,
      supplierCompanyName: r.supplierCompanyName,
      salesManagerName: r.salesManagerName,
      salesManagerEmail: r.salesManagerEmail,
      smsExcluded: r.smsExcluded,
    }));

    return {
      data,
      total,
      page: pageNum,
      limit: limitNum,
      lastPage,
      totalBalance,
    };
  }

  /**
   * 채권 경고 문자 일괄 발송
   * 필터 조건에 맞는 1차/2차/3차/악성 채권 대상에게 경고 단계별 템플릿으로 SMS 발송
   */
  async sendReceivableWarningSms(
    dto: SendReceivableWarningSmsDto,
    userId?: number,
  ): Promise<{
    success: boolean;
    sentCount: number;
    failCount: number;
    results: Array<{ customerId: string; companyName: string | null; success: boolean; error?: string }>;
    batchId: number;
  }> {
    const WARNING_STATUSES = ['WARNING_1ST', 'WARNING_2ND', 'WARNING_3RD', 'MALICIOUS'] as const;
    const TEMPLATE_TYPE_MAP: Record<string, string> = {
      WARNING_1ST: 'RECEIVABLE_WARNING_1ST',
      WARNING_2ND: 'RECEIVABLE_WARNING_2ND',
      WARNING_3RD: 'RECEIVABLE_WARNING_3RD',
      MALICIOUS: 'RECEIVABLE_MALICIOUS',
    };
    const WARNING_LABEL: Record<string, string> = {
      WARNING_1ST: '1차 경고',
      WARNING_2ND: '2차 경고',
      WARNING_3RD: '3차 경고',
      MALICIOUS: '악성 채권',
    };

    const sender = await this.smsSenderService.findOne(dto.senderId);
    const senderPhone = sender.phone?.replace(/[^0-9]/g, '') || '';
    if (!senderPhone) {
      throw new BadRequestException('발신자 전화번호가 없습니다.');
    }

    // 화면 필터와 동일: 미전달 시 1차/2차/3차/악성 전체, 빈 배열이면 발송 대상 없음
    const warningStatusFilter =
      dto.warningStatus === undefined || dto.warningStatus === null
        ? [...WARNING_STATUSES]
        : dto.warningStatus.length === 0
          ? []
          : dto.warningStatus.filter((s) => s != null && WARNING_STATUSES.includes(s as any));

    const response = await this.findCustomersWithReceivables(
      dto.search,
      1,
      10000,
      dto.sortBy || 'companyName',
      dto.sortOrder || 'asc',
      warningStatusFilter,
      dto.excludeZeroBalance ?? false,
      dto.supplierIds,
      dto.customerType,
      undefined,
      dto.balanceCategories,
      undefined,
    );

    const eligible = (response.data || []).filter(
      (c) =>
        !(c as any).smsExcluded &&
        c.phone &&
        c.warningStatus &&
        WARNING_STATUSES.includes(c.warningStatus as any) &&
        (warningStatusFilter.length === 0 || warningStatusFilter.includes(c.warningStatus as any)),
    );

    if (eligible.length === 0) {
      throw new BadRequestException('발송 대상이 없습니다.');
    }

    const templates: Record<string, string> = {};
    for (const status of WARNING_STATUSES) {
      const type = TEMPLATE_TYPE_MAP[status];
      const list = await this.smsTemplatesService.findByType(type, null);
      templates[status] = list?.length ? (list[0]?.content || '') : '';
    }

    const replaceTokens = (content: string, c: any): string => {
      const customerName = c.ceo || c.companyName || '고객';
      const customerCompanyName = c.companyName || '';
      const issuedDate = c.occurredDate || (c.lastPaymentDueDate || '').slice(0, 10) || '';
      const formattedBalance = new Intl.NumberFormat('ko-KR').format(c.balance ?? 0);
      const warningLevel = WARNING_LABEL[c.warningStatus] || '';
      return content
        .replace(/{customerName}/g, customerName)
        .replace(/{customerCompanyName}/g, customerCompanyName)
        .replace(/{invoiceNumber}/g, '')
        .replace(/{issuedDate}/g, issuedDate)
        .replace(/{receivableAmount}/g, formattedBalance)
        .replace(/{outstandingAmount}/g, formattedBalance)
        .replace(/{balance}/g, formattedBalance)
        .replace(/{warningLevel}/g, warningLevel);
    };

    const results: Array<{ customerId: string; companyName: string | null; success: boolean; error?: string }> = [];
    let sentCount = 0;
    let failCount = 0;

    for (const c of eligible) {
      const templateContent = templates[c.warningStatus!];
      if (!templateContent) {
        results.push({
          customerId: c.customerId,
          companyName: c.companyName,
          success: false,
          error: `해당 경고 단계(${WARNING_LABEL[c.warningStatus!]}) 템플릿이 없습니다.`,
        });
        failCount++;
        continue;
      }

      const message = replaceTokens(templateContent, c);
      const phone = String(c.phone).replace(/[^0-9]/g, '');
      if (!phone) {
        results.push({ customerId: c.customerId, companyName: c.companyName, success: false, error: '전화번호 없음' });
        failCount++;
        continue;
      }

      try {
        await this.aligoService.sendSms({
          message,
          recipients: [{ phone, name: c.companyName || c.ceo || undefined }],
          sender: senderPhone,
          templateType: TEMPLATE_TYPE_MAP[c.warningStatus!],
          templateContent,
          relatedId: Number(c.receivableId) || undefined,
          relatedType: 'RECEIVABLE',
          createdById: userId,
        });
        results.push({ customerId: c.customerId, companyName: c.companyName, success: true });
        sentCount++;
      } catch (err: any) {
        this.logger.warn(`[채권 경고 SMS] ${c.companyName} 발송 실패: ${err?.message || err}`);
        results.push({
          customerId: c.customerId,
          companyName: c.companyName,
          success: false,
          error: err?.message || String(err),
        });
        failCount++;
      }
    }

    this.logger.log(`[채권 경고 SMS] 발송 완료 - 성공: ${sentCount}, 실패: ${failCount}`);

    const batch = await this.receivableSmsBatchRepository.save({
      createdById: userId ?? null,
      trigger: 'MANUAL',
      senderId: dto.senderId,
      filterParams: {
        search: dto.search ?? undefined,
        sortBy: dto.sortBy ?? undefined,
        sortOrder: dto.sortOrder ?? undefined,
        excludeZeroBalance: dto.excludeZeroBalance ?? undefined,
        balanceCategories: dto.balanceCategories ?? undefined,
        supplierIds: dto.supplierIds ?? undefined,
      },
      totalTarget: eligible.length,
      sentCount,
      failCount,
      results,
    });

    return {
      success: failCount === 0,
      sentCount,
      failCount,
      results,
      batchId: batch.id,
    };
  }

  /**
   * 채권 경고 문자 일괄 발송 이력 조회
   */
  async findSmsBatchHistory(
    page = 1,
    limit = 20,
  ): Promise<{
    data: Array<{
      id: number;
      createdAt: string;
      createdBy: { id: number; name: string | null } | null;
      trigger: string;
      senderId: number;
      senderName: string | null;
      filterParams: Record<string, unknown> | null;
      totalTarget: number;
      sentCount: number;
      failCount: number;
      results: Array<{ customerId: string; companyName: string | null; success: boolean; error?: string }> | null;
    }>;
    total: number;
    page: number;
    limit: number;
    lastPage: number;
  }> {
    const [items, total] = await this.receivableSmsBatchRepository.findAndCount({
      where: {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['createdBy', 'sender'],
    });

    return {
      data: items.map((b) => ({
        id: b.id,
        createdAt: b.createdAt.toISOString(),
        createdBy: b.createdBy
          ? { id: b.createdBy.id, name: b.createdBy.name ?? null }
          : null,
        trigger: b.trigger,
        senderId: b.senderId,
        senderName: b.sender?.name ?? null,
        filterParams: b.filterParams as Record<string, unknown> | null,
        totalTarget: b.totalTarget,
        sentCount: b.sentCount,
        failCount: b.failCount,
        results: b.results,
      })),
      total,
      page,
      limit,
      lastPage: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * 이카운트 엑셀 파일과 시스템 채권 데이터를 비교합니다.
   * - 시스템: 0원 잔액 제외
   * - 엑셀: 잔액이 비어 있는 행 제외
   * - 이름 매칭: (주), (주식회사), 주식회사, ㈜ 제거 후 비교. 거래명세서 발행용 이름(statementName)도 매칭에 사용
   */
  async compareWithExcel(filePath: string, supplierIds?: number[]): Promise<CompareWithExcelResult> {
    try {
      // 1. 시스템 채권 데이터 조회 (전체 페이지 순회 - findCustomersWithReceivables limit 최대 100)
      // excludeZeroBalance: false로 조회 후, 응답의 계산된 잔액(balance)으로 0원 제외
      // supplierIds: 선택된 공급자만 필터 (미선택 시 전체)
      const pageSize = 100;
      let systemItems: CustomerWithReceivable[] = [];
      let page = 1;
      let lastPage = 1;
      do {
        const res = await this.findCustomersWithReceivables(
          undefined,
          page,
          pageSize,
          'companyName',
          'asc',
          undefined,
          false, // excludeZeroBalance: false - 계산 잔액으로 아래에서 필터
          supplierIds,
          undefined,
          undefined,
          undefined,
          undefined,
        );
        systemItems = systemItems.concat(res.data);
        lastPage = res.lastPage ?? 1;
        page += 1;
      } while (page <= lastPage);
      systemItems = systemItems.filter((item) => Math.abs(item.balance) > 0.01);

      // 2. 거래명세서 발행용 이름(statementName) 조회 - 엑셀/이카운트와 동일한 명칭으로 등록된 경우 매칭
      const customerIds = [...new Set(systemItems.map((i) => i.customerId))];
      const statementNames =
        customerIds.length > 0
          ? await this.statementNameRepository.find({
              where: { customerId: In(customerIds) },
              select: ['customerId', 'displayName', 'companyName'],
            })
          : [];
      const statementNamesByCustomer = new Map<string, string[]>();
      for (const sn of statementNames) {
        const list = statementNamesByCustomer.get(sn.customerId) ?? [];
        if (sn.displayName?.trim()) list.push(sn.displayName.trim());
        if (sn.companyName?.trim() && sn.companyName !== sn.displayName) list.push(sn.companyName.trim());
        statementNamesByCustomer.set(sn.customerId, list);
      }

      // 2-1. 최근 발행 거래명세서의 iv_company_name (실제 발행 시 사용된 거래처명)
      const recentInvoices =
        customerIds.length > 0
          ? await this.invoiceRepository.find({
              where: {
                customerId: In(customerIds),
                status: 'ISSUED',
                deletedAt: IsNull(),
              },
              select: ['customerId', 'companyName', 'issuedAt'],
              order: { issuedAt: 'DESC' },
              take: customerIds.length * 5, // 고객당 최대 5건 (최근 발행)
            })
          : [];
      const invoiceCompanyNameByCustomer = new Map<string, string>();
      for (const inv of recentInvoices) {
        if (inv.companyName?.trim() && !invoiceCompanyNameByCustomer.has(inv.customerId!)) {
          invoiceCompanyNameByCustomer.set(inv.customerId!, inv.companyName.trim());
        }
      }

      // 3. 엑셀 파싱 (이카운트 형식: 2행=헤더, 3행~=데이터)
      const workbook = XLSX.readFile(filePath);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        defval: null,
        raw: false,
        range: 1, // 2행(0-indexed)을 헤더로 사용
      }) as Record<string, unknown>[];

      // 4. 컬럼명 찾기 (거래처명, 잔액 - 다양한 가능성 대응)
      if (!rows || rows.length === 0) {
        throw new BadRequestException('엑셀 파일에 데이터가 없습니다.');
      }
      const firstRow = rows[0];
      if (!firstRow || typeof firstRow !== 'object') {
        throw new BadRequestException('엑셀 파일 형식이 올바르지 않습니다. (2행: 헤더, 3행~: 데이터)');
      }
      const keys = Object.keys(firstRow);
      const nameKey = keys.find((k) => k?.trim() === '거래처명' || k?.includes('거래처명')) ?? keys[0];
      const balanceKey = keys.find((k) => k?.trim() === '잔액' || k?.includes('잔액')) ?? keys.find((k) => k !== nameKey) ?? keys[1];
      if (!nameKey || !balanceKey) {
        throw new BadRequestException('엑셀에 "거래처명", "잔액" 컬럼이 필요합니다.');
      }

      // 5. 이름 정규화 함수 - 비교용 키 생성 (유니코드 정규화, 접두어/접미어 제거, 공백·보이지않는문자 제거)
      const normalizeNameForKey = (name: string): string => {
        if (!name || typeof name !== 'string') return '';
        let s = name.trim();
        if (!s) return '';
        // 보이지 않는 문자 제거 (제로너비공백, NBSP 등)
        s = s.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');
        // 유니코드 NFC 정규화 (조합형/완성형 통일)
        s = s.normalize('NFC');
        // ㈜ 제거
        s = s.replace(/^㈜\s*/g, '');
        // 접두어 제거
        s = s.replace(/^\((주)\)\s*/gi, '');
        s = s.replace(/^\((주식회사)\)\s*/gi, '');
        s = s.replace(/^주식회사\s*/gi, '');
        // 접미어 제거
        s = s.replace(/\s*\((주)\)\s*$/gi, '');
        s = s.replace(/\s*\((주식회사)\)\s*$/gi, '');
        s = s.replace(/\s*주식회사\s*$/gi, '');
        // 모든 공백 제거 (공백 위치 차이로 인한 미매칭 방지)
        s = s.replace(/\s+/g, '');
        return s.trim();
      };

      const parseBalance = (val: unknown): number | null => {
        if (val === null || val === undefined || val === '') return null;
        return Number(String(val).replace(/,/g, ''));
      };

      // 6. 시스템 맵 생성 (키 -> 고객정보) - companyName, statementName, invoice.companyName 모두 매칭 키로 사용
      const systemMap = new Map<string, { name: string; balance: number; customerId: string }>();
      for (const item of systemItems) {
        const primaryName = item.companyName ?? item.ceo ?? '';
        const entry = { name: primaryName.trim(), balance: item.balance, customerId: item.customerId };
        const keysToAdd = new Set<string>();
        if (primaryName?.trim()) {
          const k = normalizeNameForKey(primaryName);
          if (k) keysToAdd.add(k);
        }
        const stNames = statementNamesByCustomer.get(item.customerId) ?? [];
        for (const dn of stNames) {
          const k = normalizeNameForKey(dn);
          if (k) keysToAdd.add(k);
        }
        const invCompanyName = invoiceCompanyNameByCustomer.get(item.customerId);
        if (invCompanyName) {
          const k = normalizeNameForKey(invCompanyName);
          if (k) keysToAdd.add(k);
        }
        for (const k of keysToAdd) {
          systemMap.set(k, entry);
        }
      }

      // 7. 엑셀 맵 생성 (잔액 빈 행 제외)
      const excelMap = new Map<string, { name: string; balance: number }>();
      for (const row of rows) {
        const rawName = row[nameKey];
        const name = rawName != null ? String(rawName).trim() : '';
        if (!name) continue;
        const balanceVal = parseBalance(row[balanceKey]);
        if (balanceVal === null || Number.isNaN(balanceVal)) continue;
        const key = normalizeNameForKey(name);
        if (!key) continue;
        excelMap.set(key, { name, balance: balanceVal });
      }

      // 8. 비교 결과 계산 (고객 단위로 중복 제거 - 한 고객이 여러 키로 매핑되어 중복 카운트 방지)
      const onlyInSystem: { name: string; balance: number }[] = [];
      const onlyInExcel: { name: string; balance: number }[] = [];
      const balanceMismatch: {
        name: string;
        systemBalance: number;
        excelBalance: number;
        difference: number;
      }[] = [];
      let matchCount = 0;
      const processedCustomerIds = new Set<string>();

      for (const item of systemItems) {
        const primaryName = item.companyName ?? item.ceo ?? '';
        const keys = new Set<string>();
        if (primaryName?.trim()) {
          const k = normalizeNameForKey(primaryName);
          if (k) keys.add(k);
        }
        const stNames = statementNamesByCustomer.get(item.customerId) ?? [];
        for (const dn of stNames) {
          const k = normalizeNameForKey(dn);
          if (k) keys.add(k);
        }
        const invCompanyName = invoiceCompanyNameByCustomer.get(item.customerId);
        if (invCompanyName) {
          const k = normalizeNameForKey(invCompanyName);
          if (k) keys.add(k);
        }
        const matchedKey = [...keys].find((k) => excelMap.has(k));
        const excelEntry = matchedKey ? excelMap.get(matchedKey)! : null;
        if (!excelEntry) {
          if (!processedCustomerIds.has(item.customerId)) {
            processedCustomerIds.add(item.customerId);
            onlyInSystem.push({ name: primaryName.trim(), balance: item.balance });
          }
        } else if (Math.abs(item.balance - excelEntry.balance) > 0.01) {
          if (!processedCustomerIds.has(item.customerId)) {
            processedCustomerIds.add(item.customerId);
            balanceMismatch.push({
              name: primaryName.trim(),
              systemBalance: item.balance,
              excelBalance: excelEntry.balance,
              difference: item.balance - excelEntry.balance,
            });
          }
        } else {
          if (!processedCustomerIds.has(item.customerId)) {
            processedCustomerIds.add(item.customerId);
            matchCount++;
          }
        }
      }
      for (const [key, excel] of excelMap) {
        if (!systemMap.has(key)) {
          onlyInExcel.push(excel);
        }
      }

      // 디버그 로그: 분석 결과 요약 및 이름별 위치
      this.logger.log(
        `[이카운트 비교] 시스템 ${systemMap.size}건(고유키), 엑셀 ${excelMap.size}건 | 결과: 시스템만 ${onlyInSystem.length}건, 엑셀만 ${onlyInExcel.length}건, 불일치 ${balanceMismatch.length}건, 일치 ${matchCount}건`,
      );
      if (onlyInSystem.length > 0) {
        this.logger.log(`[이카운트 비교] 시스템에만 있음: ${onlyInSystem.map((x) => `"${x.name}"(${x.balance})`).join(', ')}`);
      }
      if (onlyInExcel.length > 0) {
        this.logger.log(`[이카운트 비교] 엑셀에만 있음: ${onlyInExcel.map((x) => `"${x.name}"(${x.balance})`).join(', ')}`);
      }
      if (balanceMismatch.length > 0) {
        this.logger.log(
          `[이카운트 비교] 잔액 불일치: ${balanceMismatch.map((x) => `"${x.name}" sys=${x.systemBalance} excel=${x.excelBalance}`).join(', ')}`,
        );
      }
      // 특정 이름(CJ목장 등) 검색 시 어디에 있는지 로그
      const debugNames = ['CJ목장', 'cj목장'];
      for (const searchName of debugNames) {
        const normSearch = normalizeNameForKey(searchName);
        if (!normSearch) continue;
        const inSystem = systemMap.has(normSearch);
        const excelEntry = excelMap.get(normSearch);
        const inExcel = !!excelEntry;
        const inOnlySystem = onlyInSystem.some((x) => normalizeNameForKey(x.name) === normSearch);
        const inOnlyExcel = onlyInExcel.some((x) => normalizeNameForKey(x.name) === normSearch);
        const inMismatch = balanceMismatch.some((x) => normalizeNameForKey(x.name) === normSearch);
        const systemKeysContaining = [...systemMap.keys()].filter((k) => k.includes(normSearch) || normSearch.includes(k));
        const excelKeysContaining = [...excelMap.keys()].filter((k) => k.includes(normSearch) || normSearch.includes(k));
        this.logger.log(
          `[이카운트 비교] "${searchName}"(norm=${normSearch}) → 시스템: ${inSystem ? '있음' : '없음'}, 엑셀: ${inExcel ? `있음(${excelEntry?.balance})` : '없음'} | 분류: ${inOnlySystem ? '시스템만' : inOnlyExcel ? '엑셀만' : inMismatch ? '잔액불일치' : inSystem && inExcel ? '일치' : '해당없음'}`,
        );
        if (systemKeysContaining.length > 0 || excelKeysContaining.length > 0) {
          this.logger.log(
            `[이카운트 비교] "${searchName}" 유사키 - 시스템: [${systemKeysContaining.join(', ')}], 엑셀: [${excelKeysContaining.join(', ')}]`,
          );
        }
      }

      return {
        onlyInSystem,
        onlyInExcel,
        balanceMismatch,
        matchCount,
      };
    } finally {
      try {
        unlinkSync(filePath);
      } catch {
        // ignore
      }
    }
  }
}
