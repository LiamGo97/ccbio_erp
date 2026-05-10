import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class DataChatQueryDto {
  @IsString()
  @IsNotEmpty({ message: '질문을 입력해 주세요.' })
  @MaxLength(1000, { message: '질문은 1000자 이내로 입력해 주세요.' })
  question!: string;
}
