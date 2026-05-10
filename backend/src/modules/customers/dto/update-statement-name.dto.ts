import { PartialType } from '@nestjs/mapped-types';
import { CreateStatementNameDto } from './create-statement-name.dto';

export class UpdateStatementNameDto extends PartialType(CreateStatementNameDto) {}
