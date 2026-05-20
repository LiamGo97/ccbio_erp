import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { Consultation } from './entities/consultation.entity';
import { ConsultationProduct } from './entities/consultation-product.entity';
import { Customer } from '../customers/entities/customer.entity';
import { CustomerOperation } from '../customers/entities/customer-operation.entity';
import { GetConsultationsDto } from './dto/get-consultations.dto';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import {
  ConsultationCustomerOperation,
  ConsultationCustomerQuickSearchResult,
  ConsultationListResponse,
  ConsultationLookupResponse,
  ConsultationResponse,
} from './dto/consultation-response.dto';
import { User } from '../users/entities/user.entity';
import { CodesService } from '../codes/codes.service';
import { RegionsService } from '../regions/regions.service';
import { Region } from '../regions/entities/region.entity';
import { CitiesService } from '../cities/cities.service';
import { City } from '../cities/entities/city.entity';

const CONSULTATION_REPLY_STATUS_GROUP = 'CONSULTATION_REPLY_STATUS';

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  private normalizeRegionName(input?: string | null): string | null {
    if (!input) {
      return null;
    }
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }
    const replacements: Record<string, string> = {
      서울특별시: '서울',
      부산광역시: '부산',
      대구광역시: '대구',
      인천광역시: '인천',
      광주광역시: '광주',
      대전광역시: '대전',
      울산광역시: '울산',
      세종특별자치시: '세종',
      경기도: '경기',
      강원도: '강원',
      강원특별자치도: '강원',
      충청북도: '충북',
      충청남도: '충남',
      전라북도: '전북',
      전라남도: '전남',
      경상북도: '경북',
      경상남도: '경남',
      제주특별자치도: '제주',
    };
    if (replacements[trimmed]) {
      return replacements[trimmed];
    }
    return trimmed.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, '');
  }

  constructor(
    @InjectRepository(Consultation)
    private readonly consultationRepository: Repository<Consultation>,
    @InjectRepository(ConsultationProduct)
    private readonly consultationProductRepository: Repository<ConsultationProduct>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerOperation)
    private readonly customerOperationRepository: Repository<CustomerOperation>,
    private readonly codesService: CodesService,
    private readonly regionsService: RegionsService,
    private readonly citiesService: CitiesService,
  ) {}

  private normalizePhone(phone?: string | null): string | null {
    if (!phone) {
      return null;
    }
    const digits = phone.replace(/[^0-9]/g, '');
    return digits.length > 0 ? digits : null;
  }

  private sanitize(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /** tb_code CONSULTATION_REPLY_STATUS — cd_value 또는 cd_name(표시명)으로 입력 허용, 저장은 cd_value */
  private async normalizeReplyStatusInput(raw?: string | null): Promise<string | null> {
    const v = this.sanitize(typeof raw === 'string' ? raw : raw != null ? String(raw) : null);
    if (!v) {
      return null;
    }
    const codes = await this.codesService.findByCategory(CONSULTATION_REPLY_STATUS_GROUP);
    for (const c of codes) {
      const val = (c.value ?? '').trim();
      const name = (c.name ?? '').trim();
      if (val && v === val) {
        return val;
      }
      if (name && v === name && val) {
        return val;
      }
    }
    throw new BadRequestException('유효하지 않은 답변 진행상태입니다.');
  }

  private parseReplyAssigneeId(raw?: number | null): number | null {
    if (raw === undefined || raw === null) {
      return null;
    }
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }

  private parseDate(value?: string | null): Date | null {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private parseDateTime(value?: string | null): Date | null {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // month/day 파생 로직 제거 (단일 날짜 필드만 사용)

  private async findCustomerByPhone(phone: string): Promise<Customer | null> {
    const normalized = this.normalizePhone(phone);
    if (!normalized) {
      return null;
    }

    return this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.regionEntity', 'region')
      .leftJoinAndSelect('customer.cityEntity', 'city')
      .leftJoinAndSelect('customer.operations', 'operations')
      .where("regexp_replace(customer.cu_phone, '[^0-9]', '', 'g') = :normalized", { normalized })
      .getOne();
  }

  private async upsertCustomerFromDto(
    dto: CreateConsultationDto | UpdateConsultationDto,
    existingCustomer?: Customer | null,
  ): Promise<Customer> {
    if (!dto.phone && !existingCustomer) {
      throw new BadRequestException('전화번호가 필요합니다.');
    }

    let customer = existingCustomer;

    if (!customer) {
      customer = dto.phone ? await this.findCustomerByPhone(dto.phone) : null;
    }

    if (!customer) {
      customer = this.customerRepository.create();
    }

    if (dto.phone !== undefined && dto.phone !== null) {
      customer.phone = this.sanitize(dto.phone) ?? this.normalizePhone(dto.phone);
    }

    if (dto.companyName !== undefined) {
      customer.companyName = this.sanitize(dto.companyName);
    }

    if (dto.ceo !== undefined) {
      customer.ceo = this.sanitize(dto.ceo);
    }

    if (dto.region !== undefined) {
      const rawRegion = this.sanitize(dto.region);
      const normalizedRegion = this.normalizeRegionName(rawRegion);
      const candidates = Array.from(new Set([normalizedRegion, rawRegion].filter((v): v is string => !!v)));
      let region: Region | null = null;
      for (const candidate of candidates) {
        region = await this.regionsService.findByName(candidate);
        if (region) break;
      }
      if (region) {
        customer.regionId = region.id;
        customer.regionEntity = region;
      } else {
        customer.regionId = null;
        customer.regionEntity = null;
      }
    }

    if (dto.customerPostalCode !== undefined) {
      customer.postalCode = this.sanitize(dto.customerPostalCode);
    }

    if (dto.customerAddress !== undefined) {
      customer.address = this.sanitize(dto.customerAddress);
    }

    if (dto.customerCity !== undefined) {
      const cityName = this.sanitize(dto.customerCity);
      if (cityName) {
        let city: City | null = null;
        if (customer.regionId) {
          city = await this.citiesService.findByName(cityName, customer.regionId);
        }
        if (!city) {
          city = await this.citiesService.findByName(cityName);
        }
        if (city) {
          customer.cityId = city.id;
          customer.cityEntity = city;
        }
      } else {
        customer.cityId = null;
        customer.cityEntity = null;
      }
    }

    if (dto.addressDetail !== undefined) {
      customer.addressDetail = this.sanitize(dto.addressDetail);
    }

    if (dto.species !== undefined) {
      customer.species = this.sanitize(dto.species);
    }

    if (dto.feeding !== undefined) {
      customer.feeding = this.sanitize(dto.feeding);
    }

    if (dto.chamchamStatus !== undefined) {
      customer.chamchamStatus = this.sanitize(dto.chamchamStatus);
    }

    const savedCustomer = await this.customerRepository.save(customer);

    if (dto.operations !== undefined) {
      await this.customerOperationRepository.delete({ customerId: savedCustomer.id });

      if (dto.operations && dto.operations.length > 0) {
        const operationEntities = dto.operations.map((op) =>
          this.customerOperationRepository.create({
            customerId: savedCustomer.id,
            operation: op.operation,
            operationSub: op.operationSub ?? null,
            herdSize: op.herdSize ?? null,
          }),
        );
        await this.customerOperationRepository.save(operationEntities);
        savedCustomer.operations = operationEntities;
      } else {
        savedCustomer.operations = [];
      }
    }

    return savedCustomer;
  }

  private async mapConsultation(consultation: Consultation): Promise<ConsultationResponse> {
    const toYmd = (d: unknown): string | null => {
      if (!d) return null;
      if (typeof d === 'string') {
        // assume already yyyy-MM-dd or ISO yyyy-MM-ddTHH:mm:ssZ
        const str = d.includes('T') ? d.split('T')[0] : d;
        return str || null;
      }
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
      return null;
    };
    const customer = consultation.customer;
    const manager = consultation.manager;
    const replyAssignee = consultation.replyAssignee;

    // deliveryRegion과 deliveryCity FK에서 이름으로 변환
    const deliveryRegion = consultation.deliveryRegionEntity
      ? consultation.deliveryRegionEntity.name
      : consultation.deliveryRegion || null;
    const deliveryCity = consultation.deliveryCityEntity
      ? consultation.deliveryCityEntity.name
      : consultation.deliveryCity || null;

    // customer region과 city FK에서 이름으로 변환
    const customerRegion = customer?.regionEntity ? customer.regionEntity.name : null;
    const customerCity = customer?.cityEntity ? customer.cityEntity.name : null;

    const customerOperations: ConsultationCustomerOperation[] | undefined =
      customer?.operations && customer.operations.length > 0
        ? customer.operations.map((op) => ({
            operation: op.operation,
            operationSub: op.operationSub ?? null,
            herdSize: op.herdSize ?? null,
          }))
        : undefined;

    return {
      id: consultation.id,
      customerId: customer?.id ?? null,
      phone: customer?.phone ?? null,
      companyName: customer?.companyName ?? null,
      ceo: customer?.ceo ?? null,
      region: customerRegion,
      customerPostalCode: customer?.postalCode ?? null,
      customerAddress: customer?.address ?? null,
      customerCity: customerCity,
      addressDetail: customer?.addressDetail ?? null,
      species: customer?.species ?? null,
      operation: null,
      herdSize: null,
      feeding: customer?.feeding ?? null,
      chamchamStatus: customer?.chamchamStatus ?? null,
      operations: customerOperations,
      inquiryProduct: null, // 고객 테이블에서 inquiryProduct 컬럼 제거됨
      consultationDate: toYmd(consultation.consultationDate),
      startedAt: consultation.startedAt ? consultation.startedAt.toISOString() : null,
      endedAt: consultation.endedAt ? consultation.endedAt.toISOString() : null,
      type: consultation.type ?? null,
      source: consultation.source ?? null,
      inOut: consultation.inOut ?? null,
      productName: consultation.productName ?? null,
      grade: consultation.grade ?? null,
      requestedWeight: consultation.requestedWeight ?? null,
      deliveryRegion,
      deliveryPostalCode: consultation.deliveryPostalCode ?? null,
      deliveryAddress: consultation.deliveryAddress ?? null,
      deliveryAddressDetail: consultation.deliveryAddressDetail ?? null,
      deliveryCity,
      proposedPrice: consultation.proposedPrice ?? null,
      hasUnloading: consultation.hasUnloading ?? false,
      hasHandling: consultation.hasHandling ?? false,
      notes: consultation.notes ?? null,
      managerId: manager?.id ?? null,
      managerName: manager?.name ?? null,
      replyStatus: consultation.replyStatus ?? null,
      replyAssigneeId: replyAssignee?.id ?? null,
      replyAssigneeName: replyAssignee?.name ?? null,
      mainProduct: consultation.mainProduct ?? null,
      arrivalPrice: consultation.arrivalPrice ?? null,
      products: consultation.products
        ? consultation.products
            .sort((a, b) => a.order - b.order)
            .map((p) => ({
              id: p.id,
              productCategoryId: p.productCategoryId ?? null,
              productName: p.productName ?? null,
              grade: p.grade ?? null,
              packingType: p.packingType ?? null,
              requestedWeight: p.requestedWeight ?? null,
              requestedVehicle: p.requestedVehicle ?? null,
              order: p.order,
            }))
        : undefined,
      createdAt: consultation.createdAt.toISOString(),
      updatedAt: consultation.updatedAt.toISOString(),
    };
  }

  async findAll(query: GetConsultationsDto): Promise<ConsultationListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const sortBy = query.sortBy ?? 'consultationDate';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const sortColumnMap: Record<string, string> = {
      consultationDate: 'consultation.consultationDate',
      companyName: 'customer.companyName',
      createdAt: 'consultation.createdAt',
    };
    const primarySortColumn = sortColumnMap[sortBy] ?? sortColumnMap.consultationDate;
    const primarySortDirection: 'ASC' | 'DESC' = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // 1) 공통 필터를 적용하는 헬퍼
    const applyCommonFilters = (qb: ReturnType<typeof this.consultationRepository.createQueryBuilder>) => {
      if (query.search) {
        const search = `%${query.search.trim().toLowerCase()}%`;
        qb.andWhere(
          new Brackets((where) => {
            // 업체명 검색: 같은 업체명을 가진 모든 고객의 상담을 찾기 위해 서브쿼리 사용
            // 같은 업체명이 여러 customer 레코드에 있을 수 있으므로, 모든 customer ID를 찾아서 그들의 상담을 모두 조회
            where
              .where(
                'consultation.cu_id IN (SELECT cu_id FROM tb_customer WHERE LOWER(COALESCE(cu_company_name, \'\')) LIKE :search)',
                { search }
              )
              .orWhere('LOWER(COALESCE(customer.cu_company_name, \'\')) LIKE :search', { search })
              .orWhere('LOWER(COALESCE(customer.cu_ceo, \'\')) LIKE :search', { search })
              .orWhere('LOWER(COALESCE(consultation.co_notes, \'\')) LIKE :search', { search });
            // region은 region 테이블과 조인해서 검색 (cu_region 컬럼은 제거됨)
            const hasRegionJoin = qb.expressionMap.joinAttributes.some((join) => join.alias.name === 'region');
            if (hasRegionJoin) {
              where.orWhere('LOWER(COALESCE(region.re_name, \'\')) LIKE :search', { search });
            }
          }),
        );
      }

      if (query.customerId) {
        qb.andWhere('consultation.cu_id = :customerId', { customerId: query.customerId });
      } else if (query.phone) {
        const normalized = this.normalizePhone(query.phone);
        if (normalized) {
          qb.andWhere(
            "regexp_replace(customer.cu_phone, '[^0-9]', '', 'g') LIKE :phone",
            { phone: `%${normalized}%` },
          );
        }
      }

      if (query.inOut) {
        qb.andWhere('consultation.co_in_out = :inOut', { inOut: query.inOut });
      }

      if (query.type) {
        qb.andWhere('consultation.co_type = :type', { type: query.type });
      }

      if (query.source) {
        qb.andWhere('consultation.co_source = :source', { source: query.source });
      }

      if (query.replyStatus) {
        qb.andWhere('consultation.co_reply_status = :replyStatus', { replyStatus: query.replyStatus });
      }

      if (query.managerId) {
        qb.andWhere('consultation.us_id = :managerId', { managerId: query.managerId });
      }

      if (query.startDate) {
        qb.andWhere('consultation.co_consultation_date >= :startDate', {
          startDate: query.startDate,
        });
      }

      if (query.endDate) {
        qb.andWhere('consultation.co_consultation_date <= :endDate', {
          endDate: query.endDate,
        });
      }

      return qb;
    };

    // 2) 전체 카운트
    const countQb = applyCommonFilters(
      this.consultationRepository
        .createQueryBuilder('consultation')
        .leftJoin('consultation.customer', 'customer')
        .leftJoin('customer.regionEntity', 'region'),
    );
    const total = await countQb.getCount();

    if (total === 0) {
      return {
        data: [],
        total: 0,
        page,
        pageSize: limit,
      };
    }

    // 3) 페이지 아이디 목록만 먼저 조회 (정렬 포함)
    // leftJoinAndSelect를 사용하여 조인된 테이블의 메타데이터가 완전히 로드되도록 함
    const skip = (page - 1) * limit;
    
    // leftJoinAndSelect를 사용하여 skip/take가 제대로 적용되도록 함
    const idsQuery = this.consultationRepository
      .createQueryBuilder('consultation')
      .leftJoinAndSelect('consultation.customer', 'customer')
      .leftJoinAndSelect('customer.regionEntity', 'region');

    // 필터 적용
    applyCommonFilters(idsQuery);

    // orderBy, skip, take 적용
    idsQuery
      .orderBy(primarySortColumn, primarySortDirection)
      .addOrderBy('consultation.createdAt', 'DESC')
      .addOrderBy('consultation.id', 'DESC')
      .skip(skip)
      .take(limit);
    
    // getMany()로 전체 엔티티 조회 (skip/take가 제대로 적용됨)
    const consultations = await idsQuery.getMany();
    const ids = consultations.map((c) => c.id);

    if (ids.length === 0) {
      return {
        data: [],
        total,
        page,
        pageSize: limit,
      };
    }

    // 4) 실제 엔티티 로드 (관계 포함)
    const items = await this.consultationRepository.find({
      where: { id: In(ids) },
      relations: [
        'customer',
        'customer.regionEntity',
        'customer.cityEntity',
        'customer.operations',
        'manager',
        'replyAssignee',
        'deliveryRegionEntity',
        'deliveryCityEntity',
        'products',
        'products.productCategory',
      ],
    });

    // 5) 정렬 일치 보장 (조회한 ID 순서를 그대로 유지)
    const orderMap = new Map(ids.map((id, index) => [id, index]));
    items.sort((a, b) => {
      const ai = orderMap.get(a.id) ?? 0;
      const bi = orderMap.get(b.id) ?? 0;
      return ai - bi;
    });

    const mappedData = await Promise.all(items.map((item) => this.mapConsultation(item)));

    return {
      data: mappedData,
      total,
      page,
      pageSize: limit,
    };
  }

  async findOne(id: string): Promise<ConsultationResponse> {
    const consultation = await this.consultationRepository.findOne({
      where: { id },
      relations: [
        'customer',
        'customer.regionEntity',
        'customer.cityEntity',
        'customer.operations',
        'manager',
        'replyAssignee',
        'deliveryRegionEntity',
        'deliveryCityEntity',
        'products',
        'products.productCategory',
      ],
    });

    if (!consultation) {
      throw new NotFoundException('상담을 찾을 수 없습니다.');
    }

    return await this.mapConsultation(consultation);
  }

  async lookupByPhone(phone: string): Promise<ConsultationLookupResponse> {
    if (!phone) {
      throw new BadRequestException('전화번호를 입력해주세요.');
    }
    const customer = await this.findCustomerByPhone(phone);

    if (!customer) {
      return {
        customer: null,
        consultations: [],
      };
    }

    const consultations = await this.consultationRepository.find({
      where: { customer: { id: customer.id } },
      relations: [
        'customer',
        'customer.regionEntity',
        'customer.cityEntity',
        'customer.operations',
        'manager',
        'replyAssignee',
        'products',
        'products.productCategory',
      ],
      order: { consultationDate: 'DESC', createdAt: 'DESC' },
      take: 20,
    });

    // operations 코드 값을 이름으로 변환
    let transformedOperations = null;
    if (customer.operations && customer.operations.length > 0) {
      const [operationCodes, operationSubCodes] = await Promise.all([
        this.codesService.findByCategory('OPERATION_TYPE'),
        this.codesService.findByCategory('OPERATION_SUBTYPE'),
      ]);

      const operationMap = new Map(operationCodes.map((code) => [code.value, code.name]));
      const operationSubMap = new Map(operationSubCodes.map((code) => [code.value, code.name]));

      transformedOperations = customer.operations.map((op) => ({
        operation: operationMap.get(op.operation) || op.operation,
        operationSub: op.operationSub ? (operationSubMap.get(op.operationSub) || op.operationSub) : null,
        herdSize: op.herdSize || null,
      }));
    }

    const response: ConsultationLookupResponse = {
      customer: {
        id: customer.id,
        companyName: customer.companyName,
        ceo: customer.ceo,
        region: customer.regionEntity?.name || null,
        customerPostalCode: customer.postalCode ?? null,
        customerAddress: customer.address ?? null,
        customerAddressRoad: customer.addressRoad ?? null,
        customerAddressJibun: customer.addressJibun ?? null,
        customerLegalBCode: customer.legalBCode ?? null,
        customerAddressDefaultType: customer.addressDefaultType ?? null,
        customerCity: customer.cityEntity?.name ?? null,
        addressDetail: customer.addressDetail,
        species: customer.species,
        operation: null,
        herdSize: null,
        feeding: customer.feeding,
        chamchamStatus: customer.chamchamStatus,
        inquiryProduct: null, // 고객 테이블에서 inquiryProduct 컬럼 제거됨
        phone: customer.phone,
        operations: transformedOperations || undefined,
      },
      consultations: await Promise.all(consultations.map((item) => this.mapConsultation(item))),
    };

    return response;
  }

  async searchCustomersByKeyword(keyword: string): Promise<ConsultationCustomerQuickSearchResult[]> {
    const trimmed = (keyword ?? '').trim();
    if (trimmed.length < 2) {
      throw new BadRequestException('검색어를 두 글자 이상 입력해주세요.');
    }
    const normalized = trimmed.toLowerCase();

    const customers = await this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.regionEntity', 'region')
      .leftJoinAndSelect('customer.cityEntity', 'city')
      .leftJoinAndSelect('customer.operations', 'operations')
      .where("LOWER(COALESCE(customer.cu_company_name, '')) LIKE :keyword", { keyword: `%${normalized}%` })
      .orWhere("LOWER(COALESCE(customer.cu_ceo, '')) LIKE :keyword", { keyword: `%${normalized}%` })
      .orderBy('customer.companyName', 'ASC')
      .addOrderBy('customer.ceo', 'ASC')
      .addOrderBy('customer.id', 'DESC')
      .limit(20)
      .getMany();

    return customers.map((customer) => ({
      id: customer.id,
      phone: customer.phone ?? null,
      companyName: customer.companyName ?? null,
      ceo: customer.ceo ?? null,
      region: customer.regionEntity?.name ?? null,
      customerPostalCode: customer.postalCode ?? null,
      customerAddress: customer.address ?? null,
      customerAddressRoad: customer.addressRoad ?? null,
      customerAddressJibun: customer.addressJibun ?? null,
      customerLegalBCode: customer.legalBCode ?? null,
      customerAddressDefaultType: customer.addressDefaultType ?? null,
      customerCity: customer.cityEntity?.name ?? null,
      addressDetail: customer.addressDetail ?? null,
      species: customer.species ?? null,
      feeding: customer.feeding ?? null,
      chamchamStatus: customer.chamchamStatus ?? null,
      operations:
        customer.operations && customer.operations.length > 0
          ? customer.operations.map((op) => ({
              operation: op.operation,
              operationSub: op.operationSub ?? null,
              herdSize: op.herdSize ?? null,
            }))
          : undefined,
    }));
  }

  async searchCustomersByPhone(phone: string): Promise<ConsultationCustomerQuickSearchResult[]> {
    const trimmed = (phone ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('전화번호를 입력해주세요.');
    }
    // 전화번호에서 숫자만 추출
    const phoneDigits = trimmed.replace(/\D/g, '');
    if (phoneDigits.length < 3) {
      throw new BadRequestException('전화번호를 3자리 이상 입력해주세요.');
    }

    const customers = await this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.regionEntity', 'region')
      .leftJoinAndSelect('customer.cityEntity', 'city')
      .leftJoinAndSelect('customer.operations', 'operations')
      .where("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(customer.cu_phone, '-', ''), ' ', ''), '(', ''), ')', ''), '.', '') LIKE :phone", { phone: `%${phoneDigits}%` })
      .orderBy('customer.companyName', 'ASC')
      .addOrderBy('customer.ceo', 'ASC')
      .addOrderBy('customer.id', 'DESC')
      .limit(20)
      .getMany();

    return customers.map((customer) => ({
      id: customer.id,
      phone: customer.phone ?? null,
      companyName: customer.companyName ?? null,
      ceo: customer.ceo ?? null,
      region: customer.regionEntity?.name ?? null,
      customerPostalCode: customer.postalCode ?? null,
      customerAddress: customer.address ?? null,
      customerAddressRoad: customer.addressRoad ?? null,
      customerAddressJibun: customer.addressJibun ?? null,
      customerLegalBCode: customer.legalBCode ?? null,
      customerAddressDefaultType: customer.addressDefaultType ?? null,
      customerCity: customer.cityEntity?.name ?? null,
      addressDetail: customer.addressDetail ?? null,
      species: customer.species ?? null,
      feeding: customer.feeding ?? null,
      chamchamStatus: customer.chamchamStatus ?? null,
      operations:
        customer.operations && customer.operations.length > 0
          ? customer.operations.map((op) => ({
              operation: op.operation,
              operationSub: op.operationSub ?? null,
              herdSize: op.herdSize ?? null,
            }))
          : undefined,
    }));
  }

  async create(dto: CreateConsultationDto): Promise<ConsultationResponse> {
    const customer = await this.upsertCustomerFromDto(dto);
    const consultationDate = this.parseDate(dto.consultationDate);
    const startedAt = this.parseDateTime(dto.startedAt);
    const endedAt = this.parseDateTime(dto.endedAt);

    // deliveryRegion과 deliveryCity를 FK로 변환
    let deliveryRegionId = null;
    let deliveryCityId = null;
    let deliveryRegionName = null;
    let deliveryCityName = null;

    if (dto.deliveryRegion) {
      const region = await this.regionsService.findByName(dto.deliveryRegion);
      if (region) {
        deliveryRegionId = region.id;
        deliveryRegionName = region.name;
      }
    }

    if (dto.deliveryCity) {
      // regionId가 있으면 해당 지역의 city만 검색
      let city = null;
      if (deliveryRegionId) {
        const cities = await this.citiesService.findByRegionId(deliveryRegionId);
        city = cities.find((c) => c.name === dto.deliveryCity) || null;
      }
      if (!city) {
        city = await this.citiesService.findByName(dto.deliveryCity);
      }
      if (city) {
        deliveryCityId = city.id;
        deliveryCityName = city.name;
      }
    }

    const firstRequestedVehicle =
      dto.products
        ?.map((product) => this.sanitize(product.requestedVehicle))
        .find((value): value is string => !!value) ?? null;

    const requestedVehicleValue =
      dto.requestedWeight !== undefined ? this.sanitize(dto.requestedWeight) : firstRequestedVehicle;

    const replyStatus = await this.normalizeReplyStatusInput(dto.replyStatus ?? null);
    const replyAssigneeId = this.parseReplyAssigneeId(dto.replyAssigneeId ?? null);

    const consultation = this.consultationRepository.create({
      customer,
      manager: dto.managerId ? ({ id: dto.managerId } as User) : undefined,
      replyStatus,
      replyAssignee: replyAssigneeId ? ({ id: replyAssigneeId } as User) : null,
      consultationDate,
      type: this.sanitize(dto.type),
      source: this.sanitize(dto.source),
      inOut: this.sanitize(dto.inOut),
      productName: this.sanitize(dto.productName),
      grade: this.sanitize(dto.grade),
      requestedWeight: requestedVehicleValue ?? null,
      deliveryRegionId,
      deliveryRegion: deliveryRegionName, // 호환성을 위해 유지
      deliveryPostalCode: dto.deliveryPostalCode ? this.sanitize(dto.deliveryPostalCode) : null,
      deliveryAddress: dto.deliveryAddress ? this.sanitize(dto.deliveryAddress) : null,
      deliveryAddressDetail: dto.deliveryAddressDetail ? this.sanitize(dto.deliveryAddressDetail) : null,
      deliveryCityId,
      deliveryCity: deliveryCityName, // 호환성을 위해 유지
      proposedPrice: this.sanitize(dto.proposedPrice),
      hasUnloading: dto.hasUnloading ?? false,
      hasHandling: dto.hasHandling ?? false,
      notes: dto.notes ?? null,
      mainProduct: this.sanitize(dto.mainProduct),
      arrivalPrice: this.sanitize(dto.arrivalPrice),
      startedAt,
      endedAt,
    });

    const saved = await this.consultationRepository.save(consultation);

    // 제품 정보 저장
    if (dto.products && dto.products.length > 0) {
      const products = dto.products.map((productDto, index) => {
        const product = this.consultationProductRepository.create({
          consultation: saved,
          consultationId: saved.id,
          productCategoryId: productDto.productCategoryId ?? null,
          productName: productDto.productName ? this.sanitize(productDto.productName) : null,
          grade: productDto.grade ? this.sanitize(productDto.grade) : null,
          packingType: productDto.packingType ? this.sanitize(productDto.packingType) : null,
          requestedWeight: productDto.requestedWeight ? this.sanitize(productDto.requestedWeight) : null,
          requestedVehicle: productDto.requestedVehicle ? this.sanitize(productDto.requestedVehicle) : null,
          order: productDto.order ?? index,
        });
        return product;
      });
      await this.consultationProductRepository.save(products);
    } else if (dto.productName) {
      // 호환성: 기존 productName, grade가 있으면 첫 번째 제품으로 저장
      const product = this.consultationProductRepository.create({
        consultation: saved,
        consultationId: saved.id,
        productCategoryId: null,
        productName: this.sanitize(dto.productName),
        grade: dto.grade ? this.sanitize(dto.grade) : null,
        packingType: null,
        order: 0,
      });
      await this.consultationProductRepository.save(product);
    }

    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateConsultationDto): Promise<ConsultationResponse> {
    const consultation = await this.consultationRepository.findOne({
      where: { id },
      relations: ['customer', 'customer.regionEntity', 'customer.cityEntity', 'customer.operations', 'deliveryRegionEntity', 'deliveryCityEntity'],
    });

    if (!consultation) {
      throw new NotFoundException('상담을 찾을 수 없습니다.');
    }

    const customer = await this.upsertCustomerFromDto(dto, consultation.customer);
    consultation.customer = customer;

    if (dto.managerId !== undefined) {
      consultation.manager = dto.managerId ? ({ id: dto.managerId } as User) : null;
    }

    if (dto.replyStatus !== undefined) {
      consultation.replyStatus = await this.normalizeReplyStatusInput(dto.replyStatus ?? null);
    }
    if (dto.replyAssigneeId !== undefined) {
      const rid = this.parseReplyAssigneeId(dto.replyAssigneeId);
      consultation.replyAssignee = rid ? ({ id: rid } as User) : null;
    }

    const consultationDate =
      dto.consultationDate !== undefined ? this.parseDate(dto.consultationDate) : consultation.consultationDate;

    if (dto.consultationDate !== undefined) {
      consultation.consultationDate = consultationDate;
    }

    if (dto.type !== undefined) {
      consultation.type = this.sanitize(dto.type);
    }
    if (dto.source !== undefined) {
      consultation.source = this.sanitize(dto.source);
    }
    if (dto.inOut !== undefined) {
      consultation.inOut = this.sanitize(dto.inOut);
    }
    if (dto.productName !== undefined) {
      consultation.productName = this.sanitize(dto.productName);
    }
    if (dto.grade !== undefined) {
      consultation.grade = this.sanitize(dto.grade);
    }
    if (dto.requestedWeight !== undefined) {
      consultation.requestedWeight = this.sanitize(dto.requestedWeight);
    } else if (dto.products && dto.products.length > 0) {
      const firstRequestedVehicle =
        dto.products
          .map((product) => this.sanitize(product.requestedVehicle))
          .find((value): value is string => !!value) ?? null;
      if (firstRequestedVehicle !== null) {
        consultation.requestedWeight = firstRequestedVehicle;
      }
    }
    if (dto.deliveryRegion !== undefined) {
      if (dto.deliveryRegion) {
        const region = await this.regionsService.findByName(dto.deliveryRegion);
        if (region) {
          consultation.deliveryRegionId = region.id;
          consultation.deliveryRegion = region.name; // 호환성을 위해 유지
        } else {
          consultation.deliveryRegionId = null;
          consultation.deliveryRegion = null;
        }
      } else {
        consultation.deliveryRegionId = null;
        consultation.deliveryRegion = null;
      }
    }
    if (dto.deliveryPostalCode !== undefined) {
      consultation.deliveryPostalCode = dto.deliveryPostalCode ? this.sanitize(dto.deliveryPostalCode) : null;
    }
    if (dto.deliveryAddress !== undefined) {
      consultation.deliveryAddress = dto.deliveryAddress ? this.sanitize(dto.deliveryAddress) : null;
    }
    if (dto.deliveryAddressDetail !== undefined) {
      consultation.deliveryAddressDetail = dto.deliveryAddressDetail ? this.sanitize(dto.deliveryAddressDetail) : null;
    }
    if (dto.deliveryCity !== undefined) {
      if (dto.deliveryCity) {
        // deliveryRegionId가 있으면 해당 지역의 city만 검색
        let city = null;
        const regionId = consultation.deliveryRegionId || (dto.deliveryRegion ? (await this.regionsService.findByName(dto.deliveryRegion))?.id : null);
        if (regionId) {
          const cities = await this.citiesService.findByRegionId(regionId);
          city = cities.find((c) => c.name === dto.deliveryCity) || null;
        }
        if (!city) {
          city = await this.citiesService.findByName(dto.deliveryCity);
        }
        if (city) {
          consultation.deliveryCityId = city.id;
          consultation.deliveryCity = city.name; // 호환성을 위해 유지
        } else {
          consultation.deliveryCityId = null;
          consultation.deliveryCity = null;
        }
      } else {
        consultation.deliveryCityId = null;
        consultation.deliveryCity = null;
      }
    }
    if (dto.proposedPrice !== undefined) {
      consultation.proposedPrice = this.sanitize(dto.proposedPrice);
    }
    if (dto.hasUnloading !== undefined) {
      consultation.hasUnloading = dto.hasUnloading;
    }
    if (dto.hasHandling !== undefined) {
      consultation.hasHandling = dto.hasHandling;
    }
    if (dto.notes !== undefined) {
      consultation.notes = dto.notes ?? null;
    }
    if (dto.mainProduct !== undefined) {
      consultation.mainProduct = this.sanitize(dto.mainProduct);
    }
    if (dto.arrivalPrice !== undefined) {
      consultation.arrivalPrice = this.sanitize(dto.arrivalPrice);
    }
    if (dto.startedAt !== undefined) {
      consultation.startedAt = this.parseDateTime(dto.startedAt);
    }
    if (dto.endedAt !== undefined) {
      consultation.endedAt = this.parseDateTime(dto.endedAt);
    }

    // consultation을 먼저 저장 (제품 정보 제외)
    await this.consultationRepository.save(consultation);

    // 제품 정보 업데이트 (consultation 저장 후 처리)
    if (dto.products !== undefined) {
      // 기존 제품 정보 삭제
      const existingProducts = await this.consultationProductRepository.find({
        where: { consultationId: consultation.id },
      });
      if (existingProducts.length > 0) {
        await this.consultationProductRepository.remove(existingProducts);
      }

      // 새로운 제품 정보 저장
      if (dto.products.length > 0) {
        const newProducts = dto.products.map((productDto, index) => {
          const product = this.consultationProductRepository.create({
            consultationId: consultation.id,
            productCategoryId: productDto.productCategoryId ?? null,
            productName: productDto.productName ? this.sanitize(productDto.productName) : null,
            grade: productDto.grade ? this.sanitize(productDto.grade) : null,
            packingType: productDto.packingType ? this.sanitize(productDto.packingType) : null,
            requestedWeight: productDto.requestedWeight ? this.sanitize(productDto.requestedWeight) : null,
            requestedVehicle: productDto.requestedVehicle ? this.sanitize(productDto.requestedVehicle) : null,
            order: productDto.order ?? index,
          });
          return product;
        });
        await this.consultationProductRepository.save(newProducts);
      }
    } else if (dto.productName !== undefined) {
      // 호환성: productName이 변경되면 기존 제품 정보 업데이트 또는 생성
      const existingProducts = await this.consultationProductRepository.find({
        where: { consultationId: consultation.id },
      });
      if (existingProducts.length > 0) {
        const firstProduct = existingProducts[0];
        firstProduct.productName = dto.productName ? this.sanitize(dto.productName) : null;
        if (dto.grade !== undefined) {
          firstProduct.grade = dto.grade ? this.sanitize(dto.grade) : null;
        }
        await this.consultationProductRepository.save(firstProduct);
      } else if (dto.productName) {
        const product = this.consultationProductRepository.create({
          consultationId: consultation.id,
          productCategoryId: null,
          productName: this.sanitize(dto.productName),
          grade: dto.grade ? this.sanitize(dto.grade) : null,
          packingType: null,
          order: 0,
        });
        await this.consultationProductRepository.save(product);
      }
    }
    return this.findOne(id);
  }

  async remove(id: string) {
    const result = await this.consultationRepository.delete(id);
    if (!result.affected) {
      throw new NotFoundException('상담을 찾을 수 없습니다.');
    }
    return { success: true };
  }

  /**
   * 일별 상담 통계 조회
   * @param year 연도
   * @param month 월 (1-12)
   * @returns 일별 상담 수 배열
   */
  async getDailyStats({
    year,
    month,
    startDate: startDateParam,
    endDate: endDateParam,
    managerId,
  }: {
    year?: number;
    month?: number;
    startDate?: string;
    endDate?: string;
    managerId?: number;
  }): Promise<Array<{ date: string; count: number }>> {
    let startDateStr: string | undefined = startDateParam;
    let endDateStr: string | undefined = endDateParam;

    if ((!startDateStr || !endDateStr) && (!year || !month)) {
      throw new BadRequestException('연도/월 또는 시작/종료 날짜를 입력해주세요.');
    }

    if (!startDateStr || !endDateStr) {
      if (!year || !month || month < 1 || month > 12) {
        throw new BadRequestException('올바른 연도와 월을 입력해주세요.');
      }
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      startDateStr = startDate.toISOString().split('T')[0];
      endDateStr = endDate.toISOString().split('T')[0];
    }

    if (!startDateStr || !endDateStr) {
      throw new BadRequestException('조회 기간을 계산할 수 없습니다.');
    }


    const qb = this.consultationRepository
      .createQueryBuilder('consultation')
      .select("TO_CHAR(consultation.co_consultation_date, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)::int', 'count')
      .where('consultation.co_consultation_date >= :startDate', {
        startDate: startDateStr,
      })
      .andWhere('consultation.co_consultation_date <= :endDate', {
        endDate: endDateStr,
      })
      .andWhere('consultation.co_consultation_date IS NOT NULL')
      .groupBy("TO_CHAR(consultation.co_consultation_date, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC');

    if (managerId) {
      qb.andWhere('consultation.us_id = :managerId', { managerId });
    }

    const results = await qb.getRawMany();

    const stats = results.map((r) => {
      const dateValue = String(r.date);
      const count = typeof r.count === 'number' ? r.count : parseInt(String(r.count || '0'), 10);
      return { date: dateValue, count };
    });

    return stats;
  }

  async getSpeciesDistribution({
    startDate,
    endDate,
    managerId,
  }: {
    startDate: string;
    endDate: string;
    managerId?: number;
  }): Promise<Array<{ species: string; count: number }>> {
    if (!startDate || !endDate) {
      throw new BadRequestException('시작일과 종료일을 모두 입력해주세요.');
    }

    const qb = this.consultationRepository
      .createQueryBuilder('consultation')
      .leftJoin('consultation.customer', 'customer')
      .select("COALESCE(NULLIF(customer.cu_species, ''), 'UNKNOWN')", 'species')
      .addSelect('COUNT(*)::int', 'count')
      .where('consultation.co_consultation_date >= :startDate', { startDate })
      .andWhere('consultation.co_consultation_date <= :endDate', { endDate })
      .andWhere('consultation.co_consultation_date IS NOT NULL')
      .groupBy("COALESCE(NULLIF(customer.cu_species, ''), 'UNKNOWN')")
      .orderBy('count', 'DESC');

    if (managerId) {
      qb.andWhere('consultation.us_id = :managerId', { managerId });
    }

    const results = await qb.getRawMany();

    return results.map((item) => ({
      species: item.species ?? 'UNKNOWN',
      count: typeof item.count === 'number' ? item.count : parseInt(String(item.count || '0'), 10),
    }));
  }

  async getRegionDistribution({
    startDate,
    endDate,
    managerId,
  }: {
    startDate: string;
    endDate: string;
    managerId?: number;
  }): Promise<Array<{ region: string; count: number }>> {
    if (!startDate || !endDate) {
      throw new BadRequestException('시작일과 종료일을 모두 입력해주세요.');
    }

    const qb = this.consultationRepository
      .createQueryBuilder('consultation')
      .leftJoin('consultation.customer', 'customer')
      .leftJoin('customer.regionEntity', 'customerRegion')
      .select(
        "COALESCE(NULLIF(consultation.co_delivery_region, ''), NULLIF(customerRegion.re_name, ''), 'UNKNOWN')",
        'region',
      )
      .addSelect('COUNT(*)::int', 'count')
      .where('consultation.co_consultation_date >= :startDate', { startDate })
      .andWhere('consultation.co_consultation_date <= :endDate', { endDate })
      .andWhere('consultation.co_consultation_date IS NOT NULL')
      .groupBy(
        "COALESCE(NULLIF(consultation.co_delivery_region, ''), NULLIF(customerRegion.re_name, ''), 'UNKNOWN')",
      )
      .orderBy('count', 'DESC');

    if (managerId) {
      qb.andWhere('consultation.us_id = :managerId', { managerId });
    }

    const results = await qb.getRawMany();

    return results.map((item) => ({
      region: item.region ?? 'UNKNOWN',
      count: typeof item.count === 'number' ? item.count : parseInt(String(item.count || '0'), 10),
    }));
  }

  async getOperationSubtypeDistribution({
    startDate,
    endDate,
    managerId,
    operationType,
  }: {
    startDate: string;
    endDate: string;
    managerId?: number;
    operationType: 'BEEF' | 'DAIRY';
  }): Promise<Array<{ operationSub: string; count: number }>> {
    if (!startDate || !endDate) {
      throw new BadRequestException('시작일과 종료일을 모두 입력해주세요.');
    }

    // 상담별로 해당 운영방식 타입의 세부 분류를 집계
    const qb = this.consultationRepository
      .createQueryBuilder('consultation')
      .leftJoin('consultation.customer', 'customer')
      .leftJoin('customer.operations', 'operation')
      .select(
        "COALESCE(NULLIF(operation.co_operation_sub, ''), 'UNKNOWN')",
        'operationSub',
      )
      .addSelect('COUNT(*)::int', 'count')
      .where('consultation.co_consultation_date >= :startDate', { startDate })
      .andWhere('consultation.co_consultation_date <= :endDate', { endDate })
      .andWhere('consultation.co_consultation_date IS NOT NULL')
      .andWhere('operation.co_operation = :operationType', { operationType })
      .groupBy("COALESCE(NULLIF(operation.co_operation_sub, ''), 'UNKNOWN')")
      .orderBy('count', 'DESC');

    if (managerId) {
      qb.andWhere('consultation.us_id = :managerId', { managerId });
    }

    const results = await qb.getRawMany();

    return results.map((item) => ({
      operationSub: item.operationSub ?? 'UNKNOWN',
      count: typeof item.count === 'number' ? item.count : parseInt(String(item.count || '0'), 10),
    }));
  }

  /** 상담유형(co_type)별 건수 */
  async getConsultationTypeDistribution({
    startDate,
    endDate,
    managerId,
  }: {
    startDate: string;
    endDate: string;
    managerId?: number;
  }): Promise<Array<{ type: string; count: number }>> {
    if (!startDate || !endDate) {
      throw new BadRequestException('시작일과 종료일을 모두 입력해주세요.');
    }

    const qb = this.consultationRepository
      .createQueryBuilder('consultation')
      .select("COALESCE(NULLIF(consultation.co_type, ''), 'UNKNOWN')", 'type')
      .addSelect('COUNT(*)::int', 'count')
      .where('consultation.co_consultation_date >= :startDate', { startDate })
      .andWhere('consultation.co_consultation_date <= :endDate', { endDate })
      .andWhere('consultation.co_consultation_date IS NOT NULL')
      .groupBy("COALESCE(NULLIF(consultation.co_type, ''), 'UNKNOWN')")
      .orderBy('count', 'DESC');

    if (managerId) {
      qb.andWhere('consultation.us_id = :managerId', { managerId });
    }

    const results = await qb.getRawMany();

    return results.map((item) => ({
      type: item.type ?? 'UNKNOWN',
      count: typeof item.count === 'number' ? item.count : parseInt(String(item.count || '0'), 10),
    }));
  }
}

