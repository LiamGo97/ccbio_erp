import { ArrayMinSize, IsArray, IsIn, IsString } from 'class-validator';

export class BatchUpdateContainerReturnStatusDto {
  /** 반납여부 일괄 적용 대상 컨테이너 ID 목록 */
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1, { message: '최소 1개 이상의 컨테이너 ID가 필요합니다.' })
  containerIds!: string[];

  /** 적용할 반납여부 (tb_code CONTAINER_RETURN_STATUS) */
  @IsString()
  @IsIn(['NOT_RETURNED', 'RETURNED', 'LEASED', 'LEASED_ENDED'])
  returnStatus!: 'NOT_RETURNED' | 'RETURNED' | 'LEASED' | 'LEASED_ENDED';
}
