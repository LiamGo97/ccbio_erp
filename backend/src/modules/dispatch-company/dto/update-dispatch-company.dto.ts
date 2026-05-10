import { PartialType } from '@nestjs/mapped-types';
import { CreateDispatchCompanyDto } from './create-dispatch-company.dto';

export class UpdateDispatchCompanyDto extends PartialType(CreateDispatchCompanyDto) {}

