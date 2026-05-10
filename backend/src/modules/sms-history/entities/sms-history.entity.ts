import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { SmsTemplate } from '../../sms-templates/entities/sms-template.entity';

@Entity({ name: 'tb_sms_history' })
export class SmsHistory {
  @PrimaryGeneratedColumn({ type: 'int', name: 'sh_id' })
  id: number;

  // 템플릿 정보
  @Column({ name: 'sh_template_id', type: 'int', nullable: true })
  templateId?: number | null;

  @ManyToOne(() => SmsTemplate, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sh_template_id' })
  template?: SmsTemplate | null;

  @Column({ name: 'sh_template_type', length: 50 })
  templateType: string; // 발송 타입/구분 코드 값

  @Column({ name: 'sh_template_content', type: 'text', nullable: true })
  templateContent?: string | null; // 원본 템플릿 내용 (토큰 포함)

  // 발송 대상 정보
  @Column({ name: 'sh_recipient_phone', length: 20 })
  recipientPhone: string;

  @Column({ name: 'sh_recipient_name', length: 100, nullable: true })
  recipientName?: string | null;

  @Column({ name: 'sh_sender_phone', length: 20 })
  senderPhone: string;

  @Column({ name: 'sh_sender_user_id', type: 'int', nullable: true })
  senderUserId?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sh_sender_user_id' })
  senderUser?: User | null;

  // 메시지 정보
  @Column({ name: 'sh_message', type: 'text' })
  message: string; // 실제 발송된 메시지 내용 (토큰 치환 후)

  @Column({ name: 'sh_message_type', length: 10 })
  messageType: string; // SMS, LMS, MMS

  @Column({ name: 'sh_image_url', type: 'text', nullable: true })
  imageUrl?: string | null; // MMS 이미지 URL/경로

  @Column({ name: 'sh_image_path', type: 'text', nullable: true })
  imagePath?: string | null; // 저장된 이미지 파일 경로 (GCS 경로 등)

  @Column({ name: 'sh_image_url_2', type: 'text', nullable: true })
  imageUrl2?: string | null;

  @Column({ name: 'sh_image_path_2', type: 'text', nullable: true })
  imagePath2?: string | null;

  // 연관 정보
  @Column({ name: 'sh_invoice_id', type: 'bigint', nullable: true })
  invoiceId?: number | null; // 연관된 거래명세서 ID

  @Column({ name: 'sh_related_id', type: 'bigint', nullable: true })
  relatedId?: number | null; // 기타 연관 ID

  @Column({ name: 'sh_related_type', length: 50, nullable: true })
  relatedType?: string | null; // 연관 타입 코드 값

  // 발송 결과 (알리고 API 응답)
  @Column({ name: 'sh_aligo_mid', length: 100, nullable: true })
  aligoMid?: string | null; // 알리고 메시지 ID (mid)

  @Column({ name: 'sh_aligo_mdid', length: 100, nullable: true })
  aligoMdid?: string | null; // 알리고 메시지 상세 ID (mdid)

  @Column({ name: 'sh_status', length: 50, nullable: true })
  status?: string | null; // 전송 상태 코드 값

  @Column({ name: 'sh_aligo_status', length: 100, nullable: true })
  aligoStatus?: string | null; // 알리고 API 원본 상태 값 (한글, 보존용)

  @Column({ name: 'sh_result_code', length: 20, nullable: true })
  resultCode?: string | null; // 결과 코드

  @Column({ name: 'sh_result_message', type: 'text', nullable: true })
  resultMessage?: string | null; // 결과 메시지

  @Column({ name: 'sh_sms_count', type: 'int', nullable: true })
  smsCount?: number | null; // SMS 건수

  @Column({ name: 'sh_fail_count', type: 'int', default: 0 })
  failCount: number; // 실패 건수

  // 발송 시간
  @Column({ name: 'sh_sent_at', type: 'timestamp with time zone', nullable: true })
  sentAt?: Date | null; // 실제 발송 시간

  @Column({ name: 'sh_done_at', type: 'timestamp with time zone', nullable: true })
  doneAt?: Date | null; // 완료 시간

  @Column({ name: 'sh_reserved_at', type: 'timestamp with time zone', nullable: true })
  reservedAt?: Date | null; // 예약 시간

  // 재발송 정보
  @Column({ name: 'sh_is_resent', type: 'boolean', default: false })
  isResent: boolean; // 재발송 여부

  @Column({ name: 'sh_original_history_id', type: 'int', nullable: true })
  originalHistoryId?: number | null; // 원본 발송 이력 ID

  @ManyToOne(() => SmsHistory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sh_original_history_id' })
  originalHistory?: SmsHistory | null;

  // 메타 정보
  @CreateDateColumn({ name: 'sh_created_at' })
  createdAt: Date; // 발송 요청 시간

  @UpdateDateColumn({ name: 'sh_updated_at' })
  updatedAt: Date;

  @Column({ name: 'sh_created_by', type: 'int', nullable: true })
  createdById?: number | null; // 발송 요청자 ID

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sh_created_by' })
  createdBy?: User | null;

  // 비고
  @Column({ name: 'sh_notes', type: 'text', nullable: true })
  notes?: string | null;
}
