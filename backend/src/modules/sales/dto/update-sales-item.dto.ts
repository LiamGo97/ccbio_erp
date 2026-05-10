import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

// null/undefined/빈문자열은 null로, 그 외만 숫자로 변환 (Number(null) === 0 이 되는 것 방지)
const toNumberOrNull = ({ value }: { value: unknown }) =>
  value === null || value === undefined || value === '' ? null : Number(value);

export class UpdateSalesItemDto {
  // 재고 입고(INVENTORY_INBOUND)는 음수로 저장되므로 음수 허용 (Min -999999)
  @IsOptional()
  @ValidateIf((o) => o.cargoBales !== null && o.cargoBales !== undefined)
  @IsNumber()
  @Transform(toNumberOrNull)
  @Min(-999999)
  cargoBales?: number | null;

  // 재고 입고(INVENTORY_INBOUND)는 음수로 저장되므로 음수 허용 (Min -999999)
  @IsOptional()
  @ValidateIf((o) => o.cargoWeight !== null && o.cargoWeight !== undefined)
  @IsNumber()
  @Transform(toNumberOrNull)
  @Min(-999999)
  cargoWeight?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
