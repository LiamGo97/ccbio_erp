import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateReceivableNotesDto {
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  notes?: string | null;
}
