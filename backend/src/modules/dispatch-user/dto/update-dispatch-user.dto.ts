import { PartialType } from '@nestjs/mapped-types';
import { CreateDispatchUserDto } from './create-dispatch-user.dto';

export class UpdateDispatchUserDto extends PartialType(CreateDispatchUserDto) {}

