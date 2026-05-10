import { PartialType } from '@nestjs/mapped-types';
import { CreateSmsSenderDto } from './create-sms-sender.dto';

export class UpdateSmsSenderDto extends PartialType(CreateSmsSenderDto) {}
