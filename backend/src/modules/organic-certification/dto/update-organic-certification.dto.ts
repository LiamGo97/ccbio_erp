import { PartialType } from '@nestjs/mapped-types';
import { CreateOrganicCertificationDto } from './create-organic-certification.dto';

export class UpdateOrganicCertificationDto extends PartialType(CreateOrganicCertificationDto) {}

