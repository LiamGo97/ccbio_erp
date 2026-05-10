import { IsArray, IsOptional, IsString, ArrayMinSize, IsObject } from 'class-validator';

export class BatchEtaUpdateDto {
  /** ETA 갱신 대상 주문 ID 목록 */
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1, { message: '최소 1개 이상의 주문 ID가 필요합니다.' })
  orderIds!: string[];

  /** 실행 시 적용된 필터 조건 (이력 표시용) */
  @IsOptional()
  @IsObject()
  filterParams?: Record<string, unknown>;
}
