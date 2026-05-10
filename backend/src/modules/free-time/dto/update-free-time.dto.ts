import { PartialType } from '@nestjs/mapped-types';
import { CreateFreeTimeDto } from './create-free-time.dto';

export class UpdateFreeTimeDto extends PartialType(CreateFreeTimeDto) {}



