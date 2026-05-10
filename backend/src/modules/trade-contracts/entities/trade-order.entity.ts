import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TradeContract } from './trade-contract.entity';
import { TradeOrderPayment } from './trade-order-payment.entity';
import { TradeOrderBookingTempPayment } from './trade-order-booking-temp-payment.entity';
import { TradeContainer } from './trade-container.entity';
import { TradeOrderInbound } from './trade-order-inbound.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'tb_trade_order' })
@Unique(['contract', 'sequence', 'sequenceSub'])
export class TradeOrder {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'to_id' })
  id!: string;

  @ManyToOne(() => TradeContract, (contract) => contract.orders, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tc_id' })
  contract!: TradeContract;

  @Column({ name: 'to_sequence', type: 'int' })
  sequence!: number;

  /** 서브순번. 0이면 없음(표시 "7"), 1 이상이면 "7-1", "7-2" 등. DB: to_sequence_sub NOT NULL DEFAULT 0 */
  @Column({ name: 'to_sequence_sub', type: 'int', default: 0 })
  sequenceSub!: number;

  @Column({ name: 'to_contract_no', nullable: true })
  contractNo?: string | null;

  @Column({ name: 'to_new_old', nullable: true })
  newOld?: string | null;

  @Column({ name: 'to_commission_month', nullable: true })
  commissionMonth?: string | null;

  @Column({ name: 'to_commission_dollar', nullable: true })
  commissionDollar?: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'us_id' })
  managerUser?: User | null;

  @Column({ name: 'to_order_date', type: 'date', nullable: true })
  orderDate?: Date | null;

  @Column({ name: 'to_shipping_line', nullable: true })
  shippingLine?: string | null;

  @Column({ name: 'to_shipping_line_name', nullable: true })
  shippingLineName?: string | null;

  @Column({ name: 'to_quantity', type: 'numeric', precision: 14, scale: 4, nullable: true })
  quantity?: string | null;

  @Column({ name: 'to_grade', nullable: true })
  grade?: string | null;

  @Column({ name: 'to_bk', nullable: true })
  bk?: string | null;

  @Column({ name: 'to_bl', nullable: true })
  bl?: string | null;

  @Column({ name: 'to_invoice_number', nullable: true })
  invoiceNumber?: string | null;

  @Column({ name: 'to_invoice_date', type: 'date', nullable: true })
  invoiceDate?: Date | null;

  @Column({ name: 'to_invoice_currency', length: 8, nullable: true })
  invoiceCurrency?: string | null;

  @Column({ name: 'to_invoice_amount', type: 'numeric', precision: 14, scale: 4, nullable: true })
  invoiceAmount?: string | null;

  @Column({ name: 'to_invoice_weight', type: 'numeric', precision: 14, scale: 4, nullable: true })
  invoiceWeight?: string | null;

  @Column({ name: 'to_invoice_file_path', nullable: true })
  invoiceFilePath?: string | null;

  @Column({ name: 'to_invoice_file_name', nullable: true })
  invoiceFileName?: string | null;

  @Column({ name: 'to_invoice_google_drive_file_id', nullable: true })
  invoiceGoogleDriveFileId?: string | null;

  @Column({ name: 'to_product_images_folder_id', nullable: true })
  productImagesFolderId?: string | null;

  @Column({ name: 'to_product_images_folder_name', nullable: true })
  productImagesFolderName?: string | null;

  @Column({ name: 'to_currency_name', nullable: true })
  currencyName?: string | null;

  @Column({ name: 'to_invoice_currency_name', nullable: true })
  invoiceCurrencyName?: string | null;

  @Column({ name: 'to_total_amount', type: 'numeric', precision: 14, scale: 4, nullable: true })
  totalAmount?: string | null;

  @Column({ name: 'to_export_country_name', nullable: true })
  exportCountryName?: string | null;

  @Column({ name: 'to_product_name_label', nullable: true })
  productNameLabel?: string | null;

  @Column({ name: 'to_exporter_name', nullable: true })
  exporterName?: string | null;

  @Column({ name: 'to_packing_type', nullable: true })
  packingType?: string | null;

  @Column({ name: 'to_currency', nullable: true })
  currency?: string | null;

  @Column({ name: 'to_unit_price', type: 'numeric', precision: 14, scale: 4, nullable: true })
  unitPrice?: string | null;

  @Column({ name: 'to_destination', nullable: true })
  destination?: string | null;

  @Column({ name: 'to_final_destination', nullable: true })
  finalDestination?: string | null;

  @Column({ name: 'to_final_destination_arrival_date', type: 'date', nullable: true })
  finalDestinationArrivalDate?: Date | null;

  @Column({ name: 'to_etd_text', length: 10, nullable: true })
  etdText?: string | null;

  @Column({ name: 'to_etd_date', type: 'date', nullable: true })
  etdDate?: Date | null;

  @Column({ name: 'to_etd_api_date', type: 'date', nullable: true })
  etdApiDate?: Date | null;

  @Column({ name: 'to_eta_date', type: 'date', nullable: true })
  etaDate?: Date | null;

  @Column({ name: 'to_notes', type: 'text', nullable: true })
  notes?: string | null;

  /** 영업 비고 (입고 확정 등, 무역 비고 to_notes와 별도) */
  @Column({ name: 'to_sales_notes', type: 'text', nullable: true })
  salesNotes?: string | null;

  @Column({ name: 'to_dm', type: 'varchar', length: 64, nullable: true })
  dm?: string | null;

  @Column({ name: 'to_dt', type: 'varchar', length: 64, nullable: true })
  dt?: string | null;

  @Column({ name: 'to_cb', type: 'varchar', length: 64, nullable: true })
  cb?: string | null;

  @Column({ name: 'to_quarantine_date', type: 'date', nullable: true })
  quarantineDate?: Date | null;

  @Column({ name: 'to_customs_date', type: 'date', nullable: true })
  customsDate?: Date | null;

  @Column({ name: 'to_customs_scheduled_date', type: 'date', nullable: true })
  customsScheduledDate?: Date | null;

  @Column({ name: 'to_certificate_request', nullable: true })
  certificateRequest?: string | null;

  @Column({ name: 'to_certificate_number', nullable: true })
  certificateNumber?: string | null;

  @Column({ name: 'to_claim', nullable: true })
  claim?: string | null;

  @Column({ name: 'to_bank_pickup', type: 'date', nullable: true })
  bankPickup?: Date | null;

  @Column({ name: 'to_sto', nullable: true })
  sto?: string | null;

  @Column({ name: 'to_original_shipment_yn', nullable: true })
  hasOriginalShipment?: string | null;

  @Column({ name: 'to_original_shipment', nullable: true })
  originalShipment?: string | null;

  @Column({ name: 'to_spot', nullable: true })
  spot?: string | null;

  @Column({ name: 'to_quota', nullable: true })
  quota?: string | null;

  @Column({ name: 'to_raw_result', type: 'text', nullable: true })
  rawResult?: string | null;

  @Column({ name: 'to_do_google_drive_file_id', nullable: true })
  doGoogleDriveFileId?: string | null;

  @Column({ name: 'to_do_file_name', nullable: true })
  doFileName?: string | null;

  @Column({ name: 'to_customs_certificate_google_drive_file_id', nullable: true })
  customsCertificateGoogleDriveFileId?: string | null;

  @Column({ name: 'to_customs_certificate_file_name', nullable: true })
  customsCertificateFileName?: string | null;

  @Column({ name: 'to_customs_certificate_google_drive_file_id_2', nullable: true })
  customsCertificateGoogleDriveFileId2?: string | null;

  @Column({ name: 'to_customs_certificate_file_name_2', nullable: true })
  customsCertificateFileName2?: string | null;

  @Column({ name: 'to_status', type: 'varchar', length: 20, nullable: true, default: 'BOOKING' })
  status?: 'BOOKING' | 'DOCUMENTS' | 'DO' | 'ARRIVED' | 'QUARANTINE' | 'CUSTOMS' | 'COMPLETED' | null;

  @Column({ name: 'to_trade_status', type: 'varchar', length: 20, nullable: true, default: 'BOOKING' })
  tradeStatus?: 'BOOKING' | 'DOCUMENTS' | 'DO' | 'ARRIVED' | 'QUARANTINE' | 'CUSTOMS' | 'COMPLETED' | null;

  @Column({ name: 'to_sales_status', type: 'varchar', length: 20, nullable: true })
  salesStatus?: 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | null;

  @Column({ name: 'to_inbound_status', type: 'varchar', length: 20, nullable: true })
  inboundStatus?: 'INBOUND_PENDING' | 'INBOUND_SCHEDULED' | 'INBOUND_CONFIRMED' | null;

  @Column({ name: 'to_finance_status', type: 'varchar', length: 20, nullable: true })
  financeStatus?: 'PAYMENT_PENDING' | 'PAYMENT_PROCESSING' | 'PAYMENT_COMPLETED' | null;

  /** true면 물류관리 목록에서 제외 (삭제 아님, 제외 해제로 복구 가능) */
  @Column({ name: 'to_exclude_from_logistics_yn', type: 'boolean', nullable: true, default: false })
  excludeFromLogistics?: boolean;

  /** true면 전체 쉽백(반송). 입고대기/입고예정/결재관리 목록에서 제외 */
  @Column({ name: 'to_ship_back_yn', type: 'boolean', nullable: true, default: false })
  shipBack?: boolean;

  /** 실제 결제(REGULAR) 가중 평균 환율. 결제 입력/수정 시 계산해 저장, 최종원가 계산 시 사용 */
  @Column({ name: 'to_final_weighted_exchange_rate', type: 'numeric', precision: 18, scale: 6, nullable: true })
  finalWeightedExchangeRate?: string | null;

  /** 부킹 단계 임시 중량(MT), 서류 확정 전 참고 */
  @Column({ name: 'to_booking_temp_weight_mt', type: 'numeric', precision: 14, scale: 4, nullable: true })
  bookingTempWeightMt?: string | null;

  /** 부킹 단계 임시 송장금액(참고) */
  @Column({ name: 'to_booking_temp_invoice_amount', type: 'numeric', precision: 16, scale: 2, nullable: true })
  bookingTempInvoiceAmount?: string | null;

  /** 물리 삭제 대신 소프트 삭제 시각 (NULL이면 활성) */
  @DeleteDateColumn({ name: 'to_deleted_at' })
  deletedAt?: Date | null;

  /** 부킹 삭제 처리한 사용자 */
  @Column({ name: 'to_deleted_by_us_id', type: 'int', nullable: true })
  deletedByUserId?: number | null;

  @CreateDateColumn({ name: 'to_created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'to_updated_at' })
  updatedAt!: Date;

  @OneToMany(() => TradeOrderPayment, (payment) => payment.order, {
    cascade: false,
  })
  payments?: TradeOrderPayment[];

  @OneToMany(() => TradeOrderBookingTempPayment, (p) => p.order, {
    cascade: false,
  })
  bookingTempPayments?: TradeOrderBookingTempPayment[];

  @OneToMany(() => TradeContainer, (container) => container.order, {
    cascade: false,
  })
  containers?: TradeContainer[];

  @OneToMany(() => TradeOrderInbound, (inbound) => inbound.order, {
    cascade: false,
  })
  inbounds?: TradeOrderInbound[];
}


