import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/** 실패 원인 분류 코드 */
export type EtaUpdateBatchErrorCode =
  | 'NETWORK'              // 네트워크 오류 (fetch 실패)
  | 'API_LIMIT'            // API 호출 제한
  | 'UNIQUE_SHIPMENT_LIMIT' // 고유 선적 수량 부족 (API 응답에서 확인)
  | 'POSSIBLE_QUOTA'       // 고유 선적 잔여 0으로 추정 (수량 부족 가능성)
  | 'API_KEY_EXPIRED'      // API 키 만료
  | 'API_ERROR'            // 기타 API 오류
  | 'UNKNOWN';             // 알 수 없음

/** eub_results 내 한 건: 성공 시 changed, before, after / 실패 시 error */
export interface EtaUpdateBatchResultItem {
  orderId: string;
  /** 계약번호, 화면 표시용 */
  contractNo?: string | null;
  /** 주문 BK(부킹번호), 화면 표시용 */
  bk?: string | null;
  success: boolean;
  changed?: boolean;
  before?: { eta?: string | null; etd?: string | null; shippingLine?: string | null; containers?: Array<{ containerNo?: string | null; weight?: number | null }> };
  after?: { eta?: string | null; etd?: string | null; shippingLine?: string | null; containers?: Array<{ containerNo?: string | null; weight?: number | null }> };
  /** 실패 시 에러 메시지 */
  error?: string;
  /** 실패 원인 분류 (화면에서 안내 표시용) */
  errorCode?: EtaUpdateBatchErrorCode | null;
  /** 추가 안내 (예: 고유 선적 잔여 0 등) */
  errorDetail?: string | null;
}

@Entity({ name: 'tb_eta_update_batch' })
export class EtaUpdateBatch {
  @PrimaryGeneratedColumn({ type: 'int', name: 'eub_id' })
  id: number;

  @Column({ name: 'eub_created_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'eub_created_by', type: 'int', nullable: true })
  createdById: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'eub_created_by', referencedColumnName: 'id' })
  createdBy?: User | null;

  @Column({ name: 'eub_trigger', length: 20, default: 'MANUAL' })
  trigger: string;

  @Column({ name: 'eub_filter_params', type: 'jsonb', nullable: true })
  filterParams: Record<string, unknown> | null;

  @Column({ name: 'eub_order_ids', type: 'jsonb' })
  orderIds: string[];

  @Column({ name: 'eub_total', type: 'int' })
  total: number;

  @Column({ name: 'eub_success', type: 'int', default: 0 })
  success: number;

  @Column({ name: 'eub_failed', type: 'int', default: 0 })
  failed: number;

  @Column({ name: 'eub_results', type: 'jsonb' })
  results: EtaUpdateBatchResultItem[];

  /** 갱신 완료 시점 SeaRates API 사용량 (마지막 API 호출 응답) */
  @Column({ name: 'eub_api_usage_after', type: 'jsonb', nullable: true })
  apiUsageAfter?: {
    apiCalls?: { used?: number; total?: number; remaining?: number } | null;
    uniqueShipments?: { used?: number; total?: number; remaining?: number } | null;
  } | null;
}
