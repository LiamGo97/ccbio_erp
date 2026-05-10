import { PartialType } from '@nestjs/mapped-types';
import { CreateSalesReservationDto } from './create-sales-reservation.dto';

export class UpdateSalesReservationDto extends PartialType(CreateSalesReservationDto) {}
