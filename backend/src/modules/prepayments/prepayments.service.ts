import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerPrepayment } from '../sales/entities/customer-prepayment.entity';
import { GetPrepaymentsDto } from './dto/get-prepayments.dto';
import { ConfirmPrepaymentDto } from './dto/confirm-prepayment.dto';
import { UpdatePrepaymentDto } from './dto/update-prepayment.dto';

export interface PrepaymentListItem {
  id: string;
  customerId: string;
  customerName: string | null;
  salesId: string;
  salesDate: string | null;
  reservationDate: string | null;
  prepaymentAmount: number;
  actualAmount: number | null;
  differenceAmount: number | null;
  status: string; // DEPRECATED: 하위 호환성 유지
  paymentStatus: string;
  deductionStatus: string;
  requestedDate: string | null;
  confirmedDate: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  notes: string | null;
  createdAt: string;
}

export interface GetPrepaymentsResponse {
  data: PrepaymentListItem[];
  total: number;
  page: number;
  limit: number;
  lastPage: number;
}

export interface PrepaymentDetail {
  id: string;
  customerId: string;
  customerName: string | null;
  salesId: string;
  salesDate: string | null;
  reservationDate: string | null;
  prepaymentAmount: number;
  actualAmount: number | null;
  differenceAmount: number | null;
  status: string; // DEPRECATED: 하위 호환성 유지
  paymentStatus: string;
  deductionStatus: string;
  requestedDate: string | null;
  confirmedDate: string | null;
  deductedDate: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PrepaymentsService {
  constructor(
    @InjectRepository(CustomerPrepayment)
    private readonly prepaymentRepository: Repository<CustomerPrepayment>,
  ) {}

  /**
   * 날짜를 YYYY-MM-DD 형식의 문자열로 변환하는 헬퍼 함수
   */
  private formatDate(date: any): string | null {
    if (!date) return null;
    
    // 이미 문자열인 경우 (YYYY-MM-DD 형식)
    if (typeof date === 'string') {
      // ISO 형식인 경우
      if (date.includes('T')) {
        return date.split('T')[0];
      }
      // YYYY-MM-DD 형식인 경우 그대로 반환
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date;
      }
    }
    
    // Date 객체인 경우
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }
    
    // Date 객체로 변환 시도
    try {
      const dateObj = new Date(date);
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toISOString().split('T')[0];
      }
    } catch (error) {
      // 변환 실패 시 null 반환
    }
    
    return null;
  }

  async findAll(dto: GetPrepaymentsDto): Promise<GetPrepaymentsResponse> {
    const page = Math.max(1, parseInt(String(dto.page), 10) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(String(dto.limit), 10) || 20));
    const { customerId, status } = dto;

    const qb = this.prepaymentRepository
      .createQueryBuilder('cp')
      .leftJoinAndSelect('cp.customer', 'customer')
      .leftJoinAndSelect('cp.sales', 'sales');

    if (customerId) {
      qb.andWhere('cp.customerId = :customerId', { customerId });
    }
    // 하위 호환성: status 필터는 paymentStatus로 매핑
    if (status) {
      qb.andWhere('cp.paymentStatus = :status', { status });
    }

    qb.orderBy('cp.requestedDate', 'DESC').addOrderBy('cp.id', 'DESC');

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data: PrepaymentListItem[] = items.map((cp) => ({
      id: cp.id,
      customerId: cp.customerId,
      customerName: cp.customer?.companyName ?? null,
      salesId: cp.salesId,
      salesDate: this.formatDate(cp.sales?.salesDate),
      reservationDate: this.formatDate(cp.sales?.reservationDate),
      prepaymentAmount: Number(cp.prepaymentAmount),
      actualAmount: cp.actualAmount ? Number(cp.actualAmount) : null,
      differenceAmount: cp.differenceAmount ? Number(cp.differenceAmount) : null,
      status: cp.status, // DEPRECATED: 하위 호환성 유지
      paymentStatus: cp.paymentStatus,
      deductionStatus: cp.deductionStatus,
      requestedDate: this.formatDate(cp.requestedDate),
      confirmedDate: this.formatDate(cp.confirmedDate),
      paymentMethod: cp.paymentMethod,
      paymentReference: cp.paymentReference,
      notes: cp.notes,
      createdAt: cp.createdAt instanceof Date ? cp.createdAt.toISOString() : String(cp.createdAt),
    }));

    return {
      data,
      total,
      page,
      limit,
      lastPage: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<PrepaymentDetail | null> {
    const prepayment = await this.prepaymentRepository.findOne({
      where: { id },
      relations: ['customer', 'sales'],
    });

    if (!prepayment) {
      return null;
    }

    return {
      id: prepayment.id,
      customerId: prepayment.customerId,
      customerName: prepayment.customer?.companyName ?? null,
      salesId: prepayment.salesId,
      salesDate: this.formatDate(prepayment.sales?.salesDate),
      reservationDate: this.formatDate(prepayment.sales?.reservationDate),
      prepaymentAmount: Number(prepayment.prepaymentAmount),
      actualAmount: prepayment.actualAmount ? Number(prepayment.actualAmount) : null,
      differenceAmount: prepayment.differenceAmount ? Number(prepayment.differenceAmount) : null,
      status: prepayment.status, // DEPRECATED: 하위 호환성 유지
      paymentStatus: prepayment.paymentStatus,
      deductionStatus: prepayment.deductionStatus,
      requestedDate: this.formatDate(prepayment.requestedDate),
      confirmedDate: this.formatDate(prepayment.confirmedDate),
      deductedDate: this.formatDate(prepayment.deductedDate),
      paymentMethod: prepayment.paymentMethod,
      paymentReference: prepayment.paymentReference,
      notes: prepayment.notes,
      createdAt: prepayment.createdAt instanceof Date ? prepayment.createdAt.toISOString() : String(prepayment.createdAt),
      updatedAt: prepayment.updatedAt instanceof Date ? prepayment.updatedAt.toISOString() : String(prepayment.updatedAt),
    };
  }

  async confirm(id: string, dto: ConfirmPrepaymentDto): Promise<PrepaymentDetail> {
    const prepayment = await this.prepaymentRepository.findOne({
      where: { id },
      relations: ['customer', 'sales'],
    });

    if (!prepayment) {
      throw new NotFoundException('선입금을 찾을 수 없습니다.');
    }

    if (prepayment.paymentStatus !== 'REQUESTED') {
      throw new BadRequestException('입금 확인은 REQUESTED 상태의 선입금만 가능합니다.');
    }

    const actualAmount = dto.actualAmount;
    const prepaymentAmount = Number(prepayment.prepaymentAmount);
    const differenceAmount = actualAmount - prepaymentAmount;

    prepayment.actualAmount = actualAmount.toString();
    prepayment.differenceAmount = differenceAmount.toString();
    prepayment.paymentStatus = 'CONFIRMED';
    prepayment.status = 'CONFIRMED'; // DEPRECATED: 하위 호환성 유지
    prepayment.confirmedDate = dto.confirmedDate ? new Date(dto.confirmedDate) : new Date();
    prepayment.paymentMethod = dto.paymentMethod ?? null;
    prepayment.paymentReference = dto.paymentReference ?? null;
    prepayment.notes = dto.notes ?? null;

    await this.prepaymentRepository.save(prepayment);

    const updated = await this.findOne(id);
    if (!updated) {
      throw new NotFoundException('선입금을 찾을 수 없습니다.');
    }

    return updated;
  }

  async cancel(id: string): Promise<PrepaymentDetail> {
    const prepayment = await this.prepaymentRepository.findOne({
      where: { id },
      relations: ['customer', 'sales'],
    });

    if (!prepayment) {
      throw new NotFoundException('선입금을 찾을 수 없습니다.');
    }

    if (prepayment.deductionStatus === 'DEDUCTED') {
      throw new BadRequestException('이미 차감된 선입금은 취소할 수 없습니다.');
    }

    prepayment.paymentStatus = 'CANCELLED';
    prepayment.status = 'CANCELLED'; // DEPRECATED: 하위 호환성 유지
    await this.prepaymentRepository.save(prepayment);

    const updated = await this.findOne(id);
    if (!updated) {
      throw new NotFoundException('선입금을 찾을 수 없습니다.');
    }

    return updated;
  }

  async update(id: string, dto: UpdatePrepaymentDto): Promise<PrepaymentDetail> {
    const prepayment = await this.prepaymentRepository.findOne({
      where: { id },
      relations: ['customer', 'sales'],
    });

    if (!prepayment) {
      throw new NotFoundException('선입금을 찾을 수 없습니다.');
    }

    // CONFIRMED 상태일 때만 수정 가능
    if (prepayment.paymentStatus !== 'CONFIRMED') {
      throw new BadRequestException('입금 확인된 선입금만 수정할 수 있습니다.');
    }

    const actualAmount = dto.actualAmount;
    const prepaymentAmount = Number(prepayment.prepaymentAmount);
    const differenceAmount = actualAmount - prepaymentAmount;

    prepayment.actualAmount = actualAmount.toString();
    prepayment.differenceAmount = differenceAmount.toString();
    
    if (dto.confirmedDate) {
      prepayment.confirmedDate = new Date(dto.confirmedDate);
    }
    
    prepayment.paymentMethod = dto.paymentMethod ?? prepayment.paymentMethod;
    prepayment.paymentReference = dto.paymentReference ?? prepayment.paymentReference;
    prepayment.notes = dto.notes ?? prepayment.notes;

    await this.prepaymentRepository.save(prepayment);

    const updated = await this.findOne(id);
    if (!updated) {
      throw new NotFoundException('선입금을 찾을 수 없습니다.');
    }

    return updated;
  }
}
