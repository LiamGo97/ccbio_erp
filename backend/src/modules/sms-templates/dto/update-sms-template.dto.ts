import { PartialType } from '@nestjs/mapped-types';
import { CreateSmsTemplateDto } from './create-sms-template.dto';

export class UpdateSmsTemplateDto extends PartialType(CreateSmsTemplateDto) {}
