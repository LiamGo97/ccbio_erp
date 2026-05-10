import { IsInt, IsOptional, IsString, Length, Min, IsDateString, IsNotEmpty, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLoadingItemDto {
  /** 기존 항목 수정 시 ID 전달, 새 행 추가 시 생략 */
  @IsOptional()
  @IsString()
  id?: string;

  /**
   * 기존 판매행 연결. 하차 시 신규 상차 행만 넣을 때는 비우고 parentSalesItemId만 보냄(백엔드가 먼저 SalesItem 생성 후 연결).
   */
  @ValidateIf((o) => !o.parentSalesItemId || !String(o.parentSalesItemId).trim())
  @IsNotEmpty()
  @IsString()
  salesItemId?: string;

  /** 하차완료 등 신규 상차 행: 복제·생성 기준 원본 판매행 si_id (salesItemId 없을 때 필수) */
  @ValidateIf((o) => !o.salesItemId || !String(o.salesItemId).trim())
  @IsNotEmpty()
  @IsString()
  parentSalesItemId?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  loadingWarehouseId?: number;

  @IsOptional()
  @IsDateString()
  loadingSchedule?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  loadingScheduleTime?: string;

  // 요청 정보 (판매 시점의 요청 정보, 이력 관리용)
  @IsOptional()
  @IsString()
  @Length(0, 100)
  requestBL?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  requestContainer?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  requestContainerType?: 'CONTAINER' | 'CARGO';

  @IsOptional()
  @Type(() => Number)
  requestBales?: number;

  @IsOptional()
  @Type(() => Number)
  requestWeight?: number;

  @IsOptional()
  @IsString()
  requestNotes?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  workBL?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  workContainer?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  workContainerType?: 'CONTAINER' | 'CARGO';

  @IsOptional()
  @Type(() => Number)
  workWeight?: number;

  @IsOptional()
  @Type(() => Number)
  workBales?: number;

  // 실제 정보 (하차완료 확인 시 입력, 작업 정보와 별도 관리)
  @IsOptional()
  @IsString()
  @Length(0, 100)
  actualBL?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  actualContainer?: string;

  /** 실제 확정 컨테이너 ID (동일 containerNo·다른 순번 구분용, 있으면 컨테이너 검색 대신 사용) */
  @IsOptional()
  @IsString()
  actualContainerId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  actualContainerType?: 'CONTAINER' | 'CARGO';

  @IsOptional()
  @Type(() => Number)
  actualBales?: number;

  @IsOptional()
  @Type(() => Number)
  actualWeight?: number;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  status?: 'PENDING' | 'LOADING' | 'LOADED' | 'FAILED' | 'CANCELLED';

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  order?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

