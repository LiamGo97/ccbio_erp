import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Invoice } from '../../sales/entities/invoice.entity';
import { ReceivableCollection } from '../entities/receivable-collection.entity';

/**
 * 통합 번호 생성기
 * 거래명세서와 수금이 같은 날짜면 순번이 연속되도록 생성
 * 형식: YYYY/MM/DD-순번
 * 해당 날짜 기존 번호 중 MAX(순번)+1 사용 → 취소/삭제/순번공백 있어도 중복 방지.
 */
@Injectable()
export class TransactionNumberGenerator {
  private readonly logger = new Logger(TransactionNumberGenerator.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(ReceivableCollection)
    private readonly collectionRepository: Repository<ReceivableCollection>,
  ) {}

  /**
   * 통합 번호 생성
   * 해당 날짜의 거래명세서·수금 중 MAX(순번) + 1 (취소된 건 포함, 순번 공백 있어도 중복 방지)
   */
  async generateTransactionNumber(targetDate?: Date): Promise<string> {
    const date = targetDate || new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const datePart = `${year}/${month}/${day}`;
    const pattern = `${datePart}-%`;

    // 거래명세서 중 해당 날짜 최대 순번 (취소 포함, SPLIT_PART로 순번 추출)
    const invoiceResult = await this.dataSource.query<[{ max_seq: string | null }]>(
      `SELECT COALESCE(MAX(
        CAST(NULLIF(SPLIT_PART(iv_invoice_number, '-', 2), '') AS integer)
      ), 0) AS max_seq
       FROM tb_invoice
       WHERE iv_invoice_number IS NOT NULL AND iv_invoice_number LIKE $1`,
      [pattern],
    );
    const invoiceMaxSeq = Number(invoiceResult[0]?.max_seq ?? 0);

    // 수금 중 해당 날짜 최대 순번
    const collectionResult = await this.dataSource.query<[{ max_seq: string | null }]>(
      `SELECT COALESCE(MAX(
        CAST(NULLIF(SPLIT_PART(rc_collection_number, '-', 2), '') AS integer)
      ), 0) AS max_seq
       FROM tb_receivable_collection
       WHERE rc_collection_number IS NOT NULL AND rc_collection_number LIKE $1`,
      [pattern],
    );
    const collectionMaxSeq = Number(collectionResult[0]?.max_seq ?? 0);

    // 순번 = MAX(거래명세서최대, 수금최대) + 1
    const maxSeq = Math.max(invoiceMaxSeq, collectionMaxSeq);
    const sequence = maxSeq + 1;
    const generatedNumber = `${datePart}-${sequence}`;

    this.logger.log(
      `[generateTransactionNumber] datePart=${datePart} | ` +
        `invoiceMaxSeq=${invoiceMaxSeq} | collectionMaxSeq=${collectionMaxSeq} | ` +
        `sequence=${sequence} → 생성번호=${generatedNumber}`,
    );

    return generatedNumber;
  }
}
