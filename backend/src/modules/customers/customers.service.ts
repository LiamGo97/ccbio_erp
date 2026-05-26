import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import type { Code } from '../codes/entities/code.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, In, EntityManager } from 'typeorm';
import * as XLSX from 'xlsx';
import { Customer } from './entities/customer.entity';
import { CustomerOperation } from './entities/customer-operation.entity';
import { CustomerStatementName } from './entities/customer-statement-name.entity';
import { CustomerDeliveryAddress } from './entities/customer-delivery-address.entity';
import { CustomerContact } from './entities/customer-contact.entity';
import { CustomerContactItemDto } from './dto/customer-contact-item.dto';
import { CreateCustomerContactDto } from './dto/create-customer-contact.dto';
import { UpdateCustomerContactDto } from './dto/update-customer-contact.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ExternalCustomerSyncDto } from './dto/external-customer-sync.dto';
import { CreateStatementNameDto } from './dto/create-statement-name.dto';
import { UpdateStatementNameDto } from './dto/update-statement-name.dto';
import { CreateCustomerDeliveryAddressDto } from './dto/create-customer-delivery-address.dto';
import { UpdateCustomerDeliveryAddressDto } from './dto/update-customer-delivery-address.dto';
import { GetCustomersDto } from './dto/get-customers.dto';
import { CodesService } from '../codes/codes.service';
import { RegionsService } from '../regions/regions.service';
import { CitiesService } from '../cities/cities.service';
import { LegalAdminMaster } from '../legal-admin-master/entities/legal-admin-master.entity';
import { KakaoLocalAddressService } from './kakao-local-address.service';
import { inferStoredAddressKind } from './customer-address-utils';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,
    @InjectRepository(CustomerOperation)
    private readonly customerOperationRepository: Repository<CustomerOperation>,
    @InjectRepository(CustomerStatementName)
    private readonly statementNameRepository: Repository<CustomerStatementName>,
    @InjectRepository(CustomerDeliveryAddress)
    private readonly deliveryAddressRepository: Repository<CustomerDeliveryAddress>,
    @InjectRepository(CustomerContact)
    private readonly contactRepository: Repository<CustomerContact>,
    @InjectRepository(LegalAdminMaster)
    private readonly legalAdminMasterRepository: Repository<LegalAdminMaster>,
    private readonly codesService: CodesService,
    private readonly regionsService: RegionsService,
    private readonly citiesService: CitiesService,
    private readonly kakaoLocalAddressService: KakaoLocalAddressService,
  ) {}

  /**
   * 고객 목록 검색 — 전화번호는 저장 형식(하이픈 유무)과 관계없이 숫자만으로도 매칭
   */
  private applyCustomerSearchFilter(
    queryBuilder: ReturnType<Repository<Customer>['createQueryBuilder']>,
    search: string,
    mode: 'list' | 'export' = 'list',
  ): void {
    const trimmed = search.trim();
    if (!trimmed) return;

    const like = `%${trimmed}%`;
    const searchDigits = trimmed.replace(/\D/g, '');
    const phoneDigitsLike = searchDigits.length >= 4 ? `%${searchDigits}%` : null;

    queryBuilder.andWhere(
      new Brackets((qb) => {
        qb.where('LOWER(COALESCE(customer.companyName, \'\')) LIKE LOWER(:customerSearchLike)', {
          customerSearchLike: like,
        })
          .orWhere('LOWER(COALESCE(customer.ceo, \'\')) LIKE LOWER(:customerSearchLike)', {
            customerSearchLike: like,
          })
          .orWhere('LOWER(COALESCE(customer.phone, \'\')) LIKE LOWER(:customerSearchLike)', {
            customerSearchLike: like,
          })
          .orWhere('LOWER(COALESCE(customer.address, \'\')) LIKE LOWER(:customerSearchLike)', {
            customerSearchLike: like,
          })
          .orWhere('LOWER(COALESCE(customer.addressDetail, \'\')) LIKE LOWER(:customerSearchLike)', {
            customerSearchLike: like,
          })
          .orWhere(
            'LOWER(COALESCE(customer.businessRegistrationNumber, \'\')) LIKE LOWER(:customerSearchLike)',
            { customerSearchLike: like },
          )
          .orWhere('LOWER(COALESCE(customer.remarks, \'\')) LIKE LOWER(:customerSearchLike)', {
            customerSearchLike: like,
          });

        if (phoneDigitsLike) {
          qb.orWhere(
            "regexp_replace(COALESCE(customer.phone, ''), '[^0-9]', '', 'g') LIKE :customerPhoneDigitsLike",
            { customerPhoneDigitsLike: phoneDigitsLike },
          );
        }

        if (mode === 'list') {
          qb.orWhere(
            'LOWER(COALESCE(customer.residentRegistrationNumber, \'\')) LIKE LOWER(:customerSearchLike)',
            { customerSearchLike: like },
          )
            .orWhere('LOWER(COALESCE(customer.refundBankName, \'\')) LIKE LOWER(:customerSearchLike)', {
              customerSearchLike: like,
            })
            .orWhere('LOWER(COALESCE(customer.refundAccountNumber, \'\')) LIKE LOWER(:customerSearchLike)', {
              customerSearchLike: like,
            })
            .orWhere('LOWER(COALESCE(customer.refundDepositor, \'\')) LIKE LOWER(:customerSearchLike)', {
              customerSearchLike: like,
            })
            .orWhere(
              'LOWER(COALESCE(customer.farmManagementCertFileName, \'\')) LIKE LOWER(:customerSearchLike)',
              { customerSearchLike: like },
            );
        }
      }),
    );
  }

  async create(createCustomerDto: CreateCustomerDto): Promise<Customer> {
    // ca_name을 ca_value로 변환
    const transformedDto = await this.transformNameToValue(createCustomerDto);

    const gradeTrim = String((transformedDto as CreateCustomerDto).customerGrade ?? '').trim();
    if (!gradeTrim) {
      (transformedDto as CreateCustomerDto).customerGrade = 'GENERAL';
    }

    // operations·contacts 분리
    const { operations, contacts, ...customerData } = transformedDto as CreateCustomerDto;

    const customer = this.customersRepository.create(customerData);
    const saved = await this.customersRepository.save(customer);

    // operations 저장
    if (operations && operations.length > 0) {
      const operationEntities = operations.map((op) =>
        this.customerOperationRepository.create({
          customerId: saved.id,
          operation: op.operation,
          operationSub: op.operationSub || null,
          herdSize: op.herdSize || null,
        }),
      );
      await this.customerOperationRepository.save(operationEntities);
    }

    // 발행용 이름 기본 1개 생성
    const companyName = customerData.companyName?.trim() || null;
    const displayName = customerData.companyName?.trim() || customerData.ceo?.trim() || '(미입력)';
    const firstStatement = this.statementNameRepository.create({
      customerId: saved.id,
      companyName,
      displayName,
      contactPhone: customerData.phone?.trim() || null,
      isDefault: true,
    });
    await this.statementNameRepository.save(firstStatement);

    if (contacts !== undefined) {
      await this.syncCustomerContacts(saved.id, contacts);
    }

    const full = await this.reloadCustomerWithRelations(saved.id);
    const transformedData = await this.transformCodeValues([full]);
    return transformedData[0];
  }

  /**
   * tb_consultation을 고객 ID(cu_id) 기준으로 집계해 안전한 상담건수 맵을 만든다.
   * (operations 조인 등으로 raw row가 늘어나는 경우 index 매핑 오염 방지)
   */
  private async getConsultationCountMapByCustomerIds(
    customerIds: string[],
  ): Promise<Map<string, number>> {
    const ids = Array.from(
      new Set(
        (customerIds ?? [])
          .map((id) => (id ?? '').trim())
          .filter((id) => id.length > 0),
      ),
    );
    const map = new Map<string, number>();
    if (ids.length === 0) return map;

    const rows = await this.customersRepository.query(
      `
      SELECT cu_id, COUNT(1)::int AS consultation_count
      FROM tb_consultation
      WHERE cu_id = ANY($1)
      GROUP BY cu_id
      `,
      [ids],
    );

    for (const row of rows ?? []) {
      const customerId = String(row?.cu_id ?? '').trim();
      if (!customerId) continue;
      map.set(customerId, Number(row?.consultation_count ?? 0));
    }
    return map;
  }

  async findWithPagination(
    dto: GetCustomersDto,
  ): Promise<{
    data: Customer[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 10,
      search,
      region,
      chamchamStatus,
      species,
      operation,
      operationSub,
      customerType,
      customerGrade,
      eventSmsResponded,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = dto;

    const skip = (page - 1) * limit;
    const queryBuilder = this.customersRepository.createQueryBuilder('customer');
    queryBuilder.leftJoinAndSelect('customer.regionEntity', 'region');
    queryBuilder.leftJoinAndSelect('customer.cityEntity', 'city');
    queryBuilder.leftJoinAndSelect('customer.salesManagerUser', 'salesManagerUser');
    queryBuilder.leftJoinAndSelect('customer.operations', 'operations');
    queryBuilder.addSelect(
      '(SELECT COUNT(1) FROM tb_consultation consultation WHERE consultation.cu_id = customer.cu_id)',
      'consultation_count',
    );

      // 필터링: region은 FK로, 나머지는 ca_name을 ca_value로 변환
      if (region) {
        const regionEntity = await this.regionsService.findByName(region);
        if (regionEntity) {
          queryBuilder.andWhere('customer.cu_region_id = :regionId', { regionId: regionEntity.id });
        }
      }

    if (customerType) {
      queryBuilder.andWhere('customer.cu_customer_type = :customerType', { customerType });
    }

    if (customerGrade) {
      const gradeCodes = await this.codesService.findByCategory('CUSTOMER_GRADE');
      const gradeCode = gradeCodes.find(
        (code) => code.name === customerGrade || code.value === customerGrade,
      );
      const gradeValue = gradeCode?.value?.trim() || customerGrade.trim();
      if (gradeValue) {
        queryBuilder.andWhere('customer.customerGrade = :customerGrade', {
          customerGrade: gradeValue,
        });
      }
    }

    if (eventSmsResponded !== undefined && eventSmsResponded !== null) {
      queryBuilder.andWhere('customer.eventSmsResponded = :eventSmsResponded', {
        eventSmsResponded,
      });
    }

    if (chamchamStatus || species || operation) {
      const [speciesCodes, operationCodes, chamchamCodes] = await Promise.all([
        species ? this.codesService.findByCategory('SPECIES') : Promise.resolve([]),
        operation ? this.codesService.findByCategory('OPERATION_TYPE') : Promise.resolve([]),
        chamchamStatus ? this.codesService.findByCategory('CHAMCHAM_STATUS') : Promise.resolve([]),
      ]);

      // 프론트엔드에서 code.value 또는 code.name을 보낼 수 있으므로 둘 다 비교
      const speciesCode = speciesCodes.find(
        (code) => code.name === species || code.value === species,
      );
      const operationCode = operationCodes.find(
        (code) => code.name === operation || code.value === operation,
      );
      const chamchamStatusCode = chamchamCodes.find(
        (code) => code.name === chamchamStatus || code.value === chamchamStatus,
      );

      if (chamchamStatusCode) {
        queryBuilder.andWhere('customer.chamchamStatus = :chamchamStatus', {
          chamchamStatus: chamchamStatusCode.value,
        });
      }

      if (speciesCode) {
        queryBuilder.andWhere('customer.species = :species', { species: speciesCode.value });
      }

      if (operationCode) {
        queryBuilder.andWhere('operations.operation = :operation', {
          operation: operationCode.value,
        });
      }
    }

    if (operationSub) {
      const operationSubCodes = await this.codesService.findByCategory('OPERATION_SUBTYPE');
      // 프론트엔드에서 code.value 또는 code.name을 보낼 수 있으므로 둘 다 비교
      const operationSubCode = operationSubCodes.find(
        (code) => code.name === operationSub || code.value === operationSub,
      );
      if (operationSubCode) {
        queryBuilder.andWhere('operations.operationSub = :operationSub', {
          operationSub: operationSubCode.value,
        });
      }
    }

    if (search) {
      this.applyCustomerSearchFilter(queryBuilder, search, 'list');
    }

    const total = await queryBuilder.getCount();

    const allowedSortColumns: Record<string, string> = {
      companyName: 'customer.companyName',
      ceo: 'customer.ceo',
      phone: 'customer.phone',
      postalCode: 'customer.postalCode',
      address: 'customer.address',
      addressDetail: 'customer.addressDetail',
      city: 'city.name',
      region: 'region.name',
      species: 'customer.species',
      operation: 'operations.operation',
      herdSize: 'customer.herdSize',
      feeding: 'customer.feeding',
      chamchamStatus: 'customer.chamchamStatus',
      customerType: 'customer.cu_customer_type',
      eventSmsResponded: 'customer.eventSmsResponded',
      createdAt: 'customer.createdAt',
      updatedAt: 'customer.updatedAt',
    };

    const sortColumn = allowedSortColumns[sortBy] ?? allowedSortColumns.createdAt;
    
    // 상담건수는 연관 테이블 집계로 정렬
    if (sortBy === 'consultationCount') {
      queryBuilder.orderBy('consultation_count', sortOrder.toUpperCase() as 'ASC' | 'DESC');
    // 사육두수는 숫자로 정렬
    } else if (sortBy === 'herdSize') {
      // PostgreSQL에서 안전하게 숫자로 변환
      // 정규표현식으로 숫자만 추출하고, 빈 문자열이면 NULL 처리
      // TypeORM의 orderBy에 Raw SQL 표현식을 문자열로 직접 전달
      const numericExpr = `(
        CASE 
          WHEN customer.herdSize IS NULL OR customer.herdSize = '' THEN NULL
          WHEN customer.herdSize ~ '^[0-9]+$' THEN CAST(customer.herdSize AS INTEGER)
          WHEN customer.herdSize ~ '^[0-9]+' THEN 
            CAST(SUBSTRING(customer.herdSize FROM '^([0-9]+)') AS INTEGER)
          ELSE NULL
        END
      )`;
      
      // orderBy에 SQL 표현식을 직접 전달 (TypeORM이 이를 처리함)
      queryBuilder.addOrderBy(numericExpr, sortOrder.toUpperCase() as 'ASC' | 'DESC');
    } else {
      queryBuilder.orderBy(sortColumn, sortOrder.toUpperCase() as 'ASC' | 'DESC');
    }

    queryBuilder.skip(skip).take(limit);
    const { entities } = await queryBuilder.getRawAndEntities();
    const consultationCountMap = await this.getConsultationCountMapByCustomerIds(
      entities.map((entity) => entity.id),
    );
    const data = entities.map((entity) => {
      (entity as any).consultationCount =
        consultationCountMap.get(entity.id) ?? 0;
      return entity;
    });

    // 코드 값을 ca_name으로 변환
    const transformedData = await this.transformCodeValues(data);

    return {
      data: transformedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.customersRepository.findOne({
      where: { id },
      relations: [
        'regionEntity',
        'cityEntity',
        'operations',
        'statementNames',
        'deliveryAddresses',
        'contacts',
        'salesManagerUser',
      ],
    });
    if (!customer) {
      throw new NotFoundException('고객 정보를 찾을 수 없습니다.');
    }
    await this.fillRoadJibunIfMissing(customer);
    const transformedData = await this.transformCodeValues([customer]);
    return transformedData[0];
  }

  async update(id: string, updateCustomerDto: UpdateCustomerDto): Promise<Customer> {
    const customer = await this.customersRepository.findOne({ 
      where: { id },
      relations: ['operations'],
    });
    if (!customer) {
      throw new NotFoundException('고객 정보를 찾을 수 없습니다.');
    }
    // ca_name을 ca_value로 변환 (기존 customer 정보 전달)
    const transformedDto = await this.transformNameToValue(updateCustomerDto, customer);
    
    // operations·contacts 분리
    const { operations, contacts, ...customerData } = transformedDto as UpdateCustomerDto;

    // 주소 필드들을 명시적으로 업데이트
    if (updateCustomerDto.postalCode !== undefined) {
      customer.postalCode = updateCustomerDto.postalCode || null;
    }
    if (updateCustomerDto.address !== undefined) {
      customer.address = updateCustomerDto.address || null;
    }
    if (updateCustomerDto.addressDetail !== undefined) {
      customer.addressDetail = updateCustomerDto.addressDetail || null;
    }
    if (updateCustomerDto.addressRoad !== undefined) {
      customer.addressRoad = updateCustomerDto.addressRoad || null;
    }
    if (updateCustomerDto.addressJibun !== undefined) {
      customer.addressJibun = updateCustomerDto.addressJibun || null;
    }
    if (updateCustomerDto.addressDefaultType !== undefined) {
      customer.addressDefaultType = updateCustomerDto.addressDefaultType || null;
    }

    Object.assign(customer, customerData);
    const updated = await this.customersRepository.save(customer);
    
    // operations 업데이트 (기존 삭제 후 새로 생성)
    if (operations !== undefined) {
      // 기존 operations 삭제
      if (customer.operations && customer.operations.length > 0) {
        await this.customerOperationRepository.remove(customer.operations);
      }
      
      // 새로운 operations 저장
      if (operations && operations.length > 0) {
        const operationEntities = operations.map((op) =>
          this.customerOperationRepository.create({
            customerId: updated.id,
            operation: op.operation,
            operationSub: op.operationSub || null,
            herdSize: op.herdSize || null,
          }),
        );
        await this.customerOperationRepository.save(operationEntities);
      }
    }

    if (updateCustomerDto.contacts !== undefined) {
      await this.syncCustomerContacts(updated.id, contacts);
    }

    const full = await this.reloadCustomerWithRelations(updated.id);
    const transformedData = await this.transformCodeValues([full]);
    return transformedData[0];
  }

  /**
   * 이커머스 몰 회원가입 동기화.
   * 매칭 우선순위: cu_mall_user_id → 사업자번호(숫자) → 휴대전화(숫자)
   */
  async syncExternalMallCustomer(body: ExternalCustomerSyncDto): Promise<{ customerId: string }> {
    const mallUserIdStr = String(Math.trunc(Number(body.mallUserId)));
    if (!mallUserIdStr || mallUserIdStr === 'NaN') {
      throw new BadRequestException('mallUserId is invalid');
    }

    const existing = await this.resolveExistingCustomerForMallSync(body, mallUserIdStr);
    const payload = await this.buildCreateCustomerDtoFromMallSync(body, mallUserIdStr);

    if (existing) {
      await this.update(existing.id, payload as UpdateCustomerDto);
      this.logger.log(`[mall-sync] updated customerId=${existing.id} mallUserId=${mallUserIdStr}`);
      return { customerId: existing.id };
    }

    const created = await this.create(payload);
    this.logger.log(`[mall-sync] created customerId=${created.id} mallUserId=${mallUserIdStr}`);
    return { customerId: created.id };
  }

  private async buildCreateCustomerDtoFromMallSync(
    body: ExternalCustomerSyncDto,
    mallUserIdStr: string,
  ): Promise<CreateCustomerDto> {
    const farm = body.farm;
    const biz = body.business;
    const def = (body.addressDefaultType ?? '').trim().toUpperCase();
    const mainLine =
      def === 'JIBUN'
        ? (body.addressJibun?.trim() || body.addressRoad?.trim() || '')
        : (body.addressRoad?.trim() || body.addressJibun?.trim() || '');

    let addressDetail = body.addressDetail?.trim() || undefined;
    const dong = body.dongName?.trim();
    if (dong) {
      addressDetail = [addressDetail, dong].filter(Boolean).join(' ').trim() || undefined;
    }

    const dto: CreateCustomerDto = {
      ceo: body.name.trim(),
      companyName: biz?.companyName?.trim() || undefined,
      phone: body.phone?.trim() || undefined,
      postalCode: body.postalCode?.trim() || undefined,
      addressRoad: body.addressRoad?.trim() || undefined,
      addressJibun: body.addressJibun?.trim() || undefined,
      addressDetail,
      address: mainLine || undefined,
      addressDefaultType: body.addressDefaultType?.trim() || undefined,
      region: body.regionName?.trim() || undefined,
      city: body.cityName?.trim() || undefined,
      memberType: body.memberType?.trim() || undefined,
      businessRegistrationNumber: biz?.businessRegistrationNumber?.trim() || undefined,
      mallUserId: mallUserIdStr,
      customerType: '농가',
      customerGrade: 'GENERAL',
    };

    const lbRaw = (body.legalBCode ?? '').trim().replace(/\s/g, '');
    if (lbRaw) {
      dto.legalBCode = this.normalizeDeliveryLegalBCode(lbRaw)!;
    }

    if (farm) {
      dto.livestockTypes = farm.livestockTypes;
      dto.operationMethod = farm.operationMethod;
      dto.feedingMethod = farm.feedingMethod;
      dto.livestockCount = farm.livestockCount;
    }

    const cms = body.chamcharmMemberStatus?.trim();
    if (cms) {
      dto.chamcharmMemberStatus = cms;
    } else {
      dto.chamcharmMemberStatus = await this.resolveMallSyncDefaultChamcharmMemberStatusLabel();
    }

    return dto;
  }

  /**
   * 몰 동기화 시 chamcharmMemberStatus 미전달 → CHAMCHARM_MEMBER_STATUS에서 기본 참참회원 라벨 결정.
   * EXTERNAL_MALL_DEFAULT_CHAMCHARM_MEMBER_CD_VALUE(또는 _STATUS)로 cd_name/cd_value 지정 가능.
   */
  private async resolveMallSyncDefaultChamcharmMemberStatusLabel(): Promise<string> {
    const codes = await this.codesService.findByCategory('CHAMCHARM_MEMBER_STATUS');
    if (!codes?.length) {
      throw new BadRequestException(
        'ERP 코드 그룹 CHAMCHARM_MEMBER_STATUS에 등록된 코드가 없습니다. 코드 관리에서 등록한 뒤 다시 호출하세요.',
      );
    }

    const envPick =
      process.env.EXTERNAL_MALL_DEFAULT_CHAMCHARM_MEMBER_CD_VALUE?.trim() ||
      process.env.EXTERNAL_MALL_DEFAULT_CHAMCHARM_MEMBER_STATUS?.trim();
    if (envPick) {
      const found = codes.find((c) => c.name === envPick || String(c.value ?? '') === envPick);
      if (found?.value != null && String(found.value).trim() !== '') {
        return envPick;
      }
      throw new BadRequestException(
        `환경변수로 지정한 신규 참참회원 기본 코드를 CHAMCHARM_MEMBER_STATUS에서 찾을 수 없습니다: ${envPick}`,
      );
    }

    const isNonMember = (c: Code) => {
      const n = (c.name ?? '').toLowerCase();
      const v = String(c.value ?? '').toLowerCase();
      return v === 'non_member' || n.includes('비회원');
    };

    const candidateKeys = ['CHAMCHARM_MEMBER', 'NEW_MALL_MEMBER', '참참회원', '신규몰 참참회원'];
    for (const key of candidateKeys) {
      const found = codes.find((c) => c.name === key || String(c.value ?? '') === key);
      if (found && !isNonMember(found) && String(found.value ?? '').trim() !== '') {
        return key;
      }
    }

    const positives = codes.filter((c) => !isNonMember(c) && String(c.value ?? '').trim() !== '');
    if (positives.length === 0) {
      throw new BadRequestException(
        'CHAMCHARM_MEMBER_STATUS에 비회원만 있어 몰 동기화 기본 참참회원 코드를 정할 수 없습니다.',
      );
    }
    return positives[0].name;
  }

  private async resolveExistingCustomerForMallSync(
    body: ExternalCustomerSyncDto,
    mallUserIdStr: string,
  ): Promise<Customer | null> {
    const byMall = await this.customersRepository.findOne({
      where: { mallUserId: mallUserIdStr },
    });
    if (byMall) return byMall;

    const bizDigits = this.normalizeBusinessDigits(body.business?.businessRegistrationNumber);
    if (bizDigits.length >= 10) {
      const row = await this.findLatestCustomerByBusinessDigits(bizDigits);
      if (row) return row;
    }

    const phoneNorm = this.eventSmsNormalizePhoneKey(body.phone?.trim() ?? '');
    if (phoneNorm.length >= 8) {
      const row = await this.findLatestCustomerByPhoneNorm(phoneNorm);
      if (row) return row;
    }

    return null;
  }

  private normalizeBusinessDigits(raw: string | undefined | null): string {
    return (raw ?? '').replace(/\D/g, '');
  }

  private async findLatestCustomerByBusinessDigits(digits: string): Promise<Customer | null> {
    return this.customersRepository
      .createQueryBuilder('c')
      .where(
        "regexp_replace(COALESCE(c.cu_business_registration_number, ''), '[^0-9]', '', 'g') = :d",
        { d: digits },
      )
      .orderBy('c.cu_updated_at', 'DESC')
      .take(1)
      .getOne();
  }

  private async findLatestCustomerByPhoneNorm(norm: string): Promise<Customer | null> {
    const variants = this.eventSmsPhoneMatchVariants(norm);
    const list = await this.findCustomersByPhoneVariants(variants);
    if (list.length === 0) return null;
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list[0];
  }

  async remove(id: string): Promise<void> {
    const customer = await this.customersRepository.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException('고객 정보를 찾을 수 없습니다.');
    }
    await this.customersRepository.remove(customer);
  }

  /**
   * 연락처·관계 전체 동기화 (요청 목록 = 최종 상태, 이름 있는 행만 저장)
   */
  private async syncCustomerContacts(
    customerId: string,
    items: CustomerContactItemDto[] | undefined,
  ): Promise<void> {
    if (items === undefined) return;

    const valid = items
      .map((item) => ({
        id: item.id?.trim() || undefined,
        name: (item.name ?? '').trim(),
        phone: item.phone?.trim() || null,
        relationship: item.relationship?.trim() || null,
      }))
      .filter((item) => item.name.length > 0);

    const existing = await this.contactRepository.find({
      where: { customerId },
      order: { createdAt: 'ASC' },
    });

    const keepIds = new Set(
      valid
        .map((v) => v.id)
        .filter((id): id is string => !!id && /^\d+$/.test(id)),
    );

    for (const row of existing) {
      if (!keepIds.has(row.id)) {
        await this.contactRepository.remove(row);
      }
    }

    for (const item of valid) {
      if (item.id && keepIds.has(item.id)) {
        const row = existing.find((e) => e.id === item.id);
        if (row) {
          row.name = item.name;
          row.phone = item.phone;
          row.relationship = item.relationship;
          await this.contactRepository.save(row);
        }
        continue;
      }
      await this.contactRepository.save(
        this.contactRepository.create({
          customerId,
          name: item.name,
          phone: item.phone,
          relationship: item.relationship,
        }),
      );
    }
  }

  /** 연락처·관계 추가 */
  async addContact(customerId: string, dto: CreateCustomerContactDto): Promise<CustomerContact> {
    const customer = await this.customersRepository.findOne({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException('고객 정보를 찾을 수 없습니다.');
    }
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException('이름을 입력해주세요.');
    }
    const entity = this.contactRepository.create({
      customerId,
      name,
      phone: dto.phone?.trim() || null,
      relationship: dto.relationship?.trim() || null,
    });
    return this.contactRepository.save(entity);
  }

  /** 연락처·관계 수정 */
  async updateContact(
    customerId: string,
    contactId: string,
    dto: UpdateCustomerContactDto,
  ): Promise<CustomerContact> {
    const existing = await this.contactRepository.findOne({
      where: { id: contactId, customerId },
    });
    if (!existing) {
      throw new NotFoundException('연락처를 찾을 수 없습니다.');
    }
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException('이름을 입력해주세요.');
      }
      existing.name = name;
    }
    if (dto.phone !== undefined) {
      existing.phone = dto.phone?.trim() || null;
    }
    if (dto.relationship !== undefined) {
      existing.relationship = dto.relationship?.trim() || null;
    }
    return this.contactRepository.save(existing);
  }

  /** 연락처·관계 삭제 */
  async removeContact(customerId: string, contactId: string): Promise<void> {
    const existing = await this.contactRepository.findOne({
      where: { id: contactId, customerId },
    });
    if (!existing) {
      throw new NotFoundException('연락처를 찾을 수 없습니다.');
    }
    await this.contactRepository.remove(existing);
  }

  /** 발행용 이름 추가 */
  async addStatementName(customerId: string, dto: CreateStatementNameDto): Promise<CustomerStatementName> {
    const customer = await this.customersRepository.findOne({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException('고객 정보를 찾을 수 없습니다.');
    }
    if (dto.isDefault) {
      await this.statementNameRepository.update(
        { customerId },
        { isDefault: false },
      );
    }
    const entity = this.statementNameRepository.create({
      customerId,
      companyName: dto.companyName?.trim() || null,
      displayName: dto.displayName.trim(),
      contactPhone: dto.contactPhone?.trim() || null,
      isDefault: dto.isDefault ?? false,
    });
    return this.statementNameRepository.save(entity);
  }

  /** 발행용 이름 수정 */
  async updateStatementName(
    customerId: string,
    statementNameId: string,
    dto: UpdateStatementNameDto,
  ): Promise<CustomerStatementName> {
    const existing = await this.statementNameRepository.findOne({
      where: { id: statementNameId, customerId },
    });
    if (!existing) {
      throw new NotFoundException('발행용 이름을 찾을 수 없습니다.');
    }
    if (dto.isDefault === true) {
      await this.statementNameRepository.update(
        { customerId },
        { isDefault: false },
      );
    }
    if (dto.companyName !== undefined) {
      existing.companyName = dto.companyName?.trim() || null;
    }
    if (dto.displayName !== undefined) {
      existing.displayName = dto.displayName.trim();
    }
    if (dto.contactPhone !== undefined) {
      existing.contactPhone = dto.contactPhone?.trim() || null;
    }
    if (dto.isDefault !== undefined) {
      existing.isDefault = dto.isDefault;
    }
    return this.statementNameRepository.save(existing);
  }

  /** 발행용 이름 삭제 */
  async removeStatementName(customerId: string, statementNameId: string): Promise<void> {
    const existing = await this.statementNameRepository.findOne({
      where: { id: statementNameId, customerId },
    });
    if (!existing) {
      throw new NotFoundException('발행용 이름을 찾을 수 없습니다.');
    }
    const count = await this.statementNameRepository.count({ where: { customerId } });
    if (count <= 1) {
      throw new BadRequestException('발행용 이름은 최소 1개 이상 있어야 합니다. 마지막 항목은 삭제할 수 없습니다.');
    }
    const wasDefault = existing.isDefault;
    await this.statementNameRepository.remove(existing);
    if (wasDefault) {
      const remaining = await this.statementNameRepository.findOne({
        where: { customerId },
      });
      if (remaining) {
        remaining.isDefault = true;
        await this.statementNameRepository.save(remaining);
      }
    }
  }

  private normalizeDeliveryLegalBCode(raw?: string | null): string | null {
    const t = (raw ?? '').trim().replace(/\s/g, '');
    if (t.length === 0) return null;
    if (t.length !== 10 || !/^\d{10}$/.test(t)) {
      throw new BadRequestException('법정동코드는 숫자 10자리여야 합니다.');
    }
    return t;
  }

  /**
   * 판매 저장 후: 기본(isDefault) 배송지 한 건만 고객 카드(대표) 주소와 맞춤.
   * exceptDeliveryAddressId: 하차지 DTO로 이미 갱신한 행은 건너뜀(이중 덮어쓰기 방지).
   */
  async syncDefaultDeliveryAddressWithCustomerProfile(
    customerId: string,
    manager?: EntityManager,
    opts?: { exceptDeliveryAddressId?: string },
  ): Promise<void> {
    const customerRepo = manager?.getRepository(Customer) ?? this.customersRepository;
    const deliveryRepo = manager?.getRepository(CustomerDeliveryAddress) ?? this.deliveryAddressRepository;

    const customer = await customerRepo.findOne({ where: { id: customerId } });
    if (!customer) {
      return;
    }

    const rows = await deliveryRepo.find({
      where: { customerId, isActive: true, isDefault: true },
    });
    if (rows.length === 0) {
      return;
    }

    const postal = customer.postalCode?.trim() || null;
    const road = customer.addressRoad?.trim() || null;
    const jibun = customer.addressJibun?.trim() || null;
    const detail = customer.addressDetail?.trim() || null;
    const defType = (customer.addressDefaultType?.trim() || 'ROAD').slice(0, 50);
    let legal: string | null = null;
    try {
      legal = this.normalizeDeliveryLegalBCode(customer.legalBCode ?? null);
    } catch {
      legal = null;
    }

    const except = opts?.exceptDeliveryAddressId?.trim();
    for (const row of rows) {
      if (except && row.id === except) {
        continue;
      }
      row.postalCode = postal;
      row.addressRoad = road;
      row.addressJibun = jibun;
      row.addressDetail = detail;
      row.addressDefaultType = defType;
      row.legalBCode = legal;
    }
    await deliveryRepo.save(rows);
  }

  /** 로그용 문자열 축약 (전체 주소 노출 최소화) */
  private logAddrSnippet(value: string | undefined | null, maxLen: number): string {
    const t = (value ?? '').trim().replace(/\s+/g, ' ');
    if (!t) return '(없음)';
    return t.length <= maxLen ? t : `${t.slice(0, maxLen)}…`;
  }

  /** 판매 하차지(DTO unloading*)를 특정 배송지 행에 반영 (고객 소유 검증) */
  async applySalesUnloadingToDeliveryAddress(
    customerId: string,
    deliveryAddressId: string,
    dto: {
      unloadingPostalCode?: string;
      unloadingAddress?: string;
      unloadingAddressRoad?: string;
      unloadingAddressJibun?: string;
      unloadingLegalBCode?: string;
      unloadingAddressDetail?: string;
      unloadingAddressDefaultType?: string;
    },
    manager?: EntityManager,
  ): Promise<void> {
    const deliveryRepo = manager?.getRepository(CustomerDeliveryAddress) ?? this.deliveryAddressRepository;
    const row = await deliveryRepo.findOne({
      where: { id: deliveryAddressId, customerId, isActive: true },
    });
    if (!row) {
      this.logger.warn(
        `[배송지행-실패] 고객 소유·활성 배송지 없음 customerId=${customerId} deliveryAddressId=${deliveryAddressId} ` +
          `(DTO 우편=${this.logAddrSnippet(dto.unloadingPostalCode, 12)})`,
      );
      return;
    }

    this.logger.debug(
      `[배송지행] 시작 customerId=${customerId} deliveryAddressId=${deliveryAddressId} ` +
        `우편=${this.logAddrSnippet(dto.unloadingPostalCode, 12)}`,
    );

    const road = dto.unloadingAddressRoad?.trim() || null;
    const jibun = dto.unloadingAddressJibun?.trim() || null;
    const udt = (dto.unloadingAddressDefaultType?.trim() || 'ROAD').slice(0, 50);

    row.postalCode = dto.unloadingPostalCode?.trim() || null;
    row.addressRoad = road;
    row.addressJibun = jibun;
    row.addressDetail = dto.unloadingAddressDetail?.trim() || null;
    row.addressDefaultType = udt;
    let legal: string | null = null;
    try {
      legal = this.normalizeDeliveryLegalBCode(dto.unloadingLegalBCode ?? null);
    } catch {
      legal = null;
    }
    row.legalBCode = legal;
    await deliveryRepo.save(row);
    this.logger.debug(`[배송지행] 완료 deliveryAddressId=${deliveryAddressId}`);
  }

  /** 배송지 추가 */
  async addDeliveryAddress(
    customerId: string,
    dto: CreateCustomerDeliveryAddressDto,
  ): Promise<CustomerDeliveryAddress> {
    const customer = await this.customersRepository.findOne({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException('고객 정보를 찾을 수 없습니다.');
    }
    const isDefault = dto.isDefault === true;
    if (isDefault) {
      await this.deliveryAddressRepository.update(
        { customerId, isActive: true },
        { isDefault: false },
      );
    }
    const mallId = dto.mallDeliveryAddressId?.trim();
    const entity = this.deliveryAddressRepository.create({
      customerId,
      label: dto.label?.trim() || null,
      recipientName: dto.recipientName?.trim() || null,
      recipientPhone: dto.recipientPhone?.trim() || null,
      postalCode: dto.postalCode?.trim() || null,
      addressRoad: dto.addressRoad?.trim() || null,
      addressJibun: dto.addressJibun?.trim() || null,
      addressDefaultType: (dto.addressDefaultType?.trim() || 'ROAD').slice(0, 50),
      addressDetail: dto.addressDetail?.trim() || null,
      legalBCode: this.normalizeDeliveryLegalBCode(dto.legalBCode ?? null),
      isDefault,
      isActive: true,
      mallDeliveryAddressId: mallId && mallId !== '' ? mallId : null,
    });
    return this.deliveryAddressRepository.save(entity);
  }

  /** 배송지 수정 */
  async updateDeliveryAddress(
    customerId: string,
    addressId: string,
    dto: UpdateCustomerDeliveryAddressDto,
  ): Promise<CustomerDeliveryAddress> {
    const existing = await this.deliveryAddressRepository.findOne({
      where: { id: addressId, customerId },
    });
    if (!existing) {
      throw new NotFoundException('배송지를 찾을 수 없습니다.');
    }
    if (dto.isDefault === true) {
      await this.deliveryAddressRepository.update(
        { customerId, isActive: true },
        { isDefault: false },
      );
    }
    if (dto.label !== undefined) existing.label = dto.label?.trim() || null;
    if (dto.recipientName !== undefined) existing.recipientName = dto.recipientName?.trim() || null;
    if (dto.recipientPhone !== undefined) existing.recipientPhone = dto.recipientPhone?.trim() || null;
    if (dto.postalCode !== undefined) existing.postalCode = dto.postalCode?.trim() || null;
    if (dto.addressRoad !== undefined) existing.addressRoad = dto.addressRoad?.trim() || null;
    if (dto.addressJibun !== undefined) existing.addressJibun = dto.addressJibun?.trim() || null;
    if (dto.addressDefaultType !== undefined) {
      existing.addressDefaultType = (dto.addressDefaultType?.trim() || 'ROAD').slice(0, 50);
    }
    if (dto.addressDetail !== undefined) existing.addressDetail = dto.addressDetail?.trim() || null;
    if (dto.legalBCode !== undefined) {
      existing.legalBCode = this.normalizeDeliveryLegalBCode(dto.legalBCode);
    }
    if (dto.isDefault !== undefined) existing.isDefault = dto.isDefault;
    if (dto.isActive !== undefined) {
      existing.isActive = dto.isActive;
      if (!dto.isActive) existing.isDefault = false;
    }
    if (dto.mallDeliveryAddressId !== undefined) {
      const m = dto.mallDeliveryAddressId?.trim();
      existing.mallDeliveryAddressId = m && m !== '' ? m : null;
    }
    return this.deliveryAddressRepository.save(existing);
  }

  /** 배송지 비활성(논리 삭제) */
  async removeDeliveryAddress(customerId: string, addressId: string): Promise<void> {
    const existing = await this.deliveryAddressRepository.findOne({
      where: { id: addressId, customerId },
    });
    if (!existing) {
      throw new NotFoundException('배송지를 찾을 수 없습니다.');
    }
    existing.isActive = false;
    existing.isDefault = false;
    await this.deliveryAddressRepository.save(existing);
  }

  /**
   * 고객의 활성 배송지만 조회 (판매 등록 등에서 목록 선택용).
   * findOne과 동일한 필드 형태로 반환합니다.
   */
  async listDeliveryAddresses(customerId: string) {
    const customer = await this.customersRepository.findOne({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException('고객 정보를 찾을 수 없습니다.');
    }
    const rows = await this.deliveryAddressRepository.find({
      where: { customerId, isActive: true },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
    return rows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      label: row.label,
      recipientName: row.recipientName,
      recipientPhone: row.recipientPhone,
      postalCode: row.postalCode,
      addressRoad: row.addressRoad,
      addressJibun: row.addressJibun,
      addressDefaultType: row.addressDefaultType,
      addressDetail: row.addressDetail,
      legalBCode: row.legalBCode,
      isDefault: row.isDefault,
      isActive: row.isActive,
      mallDeliveryAddressId: row.mallDeliveryAddressId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async getStats(): Promise<{
    total: number;
    byChamchamStatus: Array<{ status: string; count: number }>;
    byRegion: Array<{ region: string; count: number }>;
    bySpecies: Array<{ species: string; count: number }>;
    byRegionAndSpecies: Array<{ region: string; species: string; count: number }>;
    byRegionAndBeefSubtype: Array<{ region: string; operationSub: string; count: number }>;
    byRegionAndDairySubtype: Array<{ region: string; operationSub: string; count: number }>;
    byOperationDetails: Array<{ operation: string | null; operationSub: string | null; count: number }>;
  }> {
    const total = await this.customersRepository.count();

    // 참참회원 상태별 통계
    const byChamchamStatus = await this.customersRepository
      .createQueryBuilder('customer')
      .select('customer.chamchamStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('customer.chamchamStatus IS NOT NULL')
      .groupBy('customer.chamchamStatus')
      .getRawMany()
      .then((results) =>
        results.map((r) => ({
          status: r.status || '미지정',
          count: parseInt(r.count, 10),
        })),
      );

    // 지역별 통계
    const byRegion = await this.customersRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.regionEntity', 'region')
      .select('region.name', 'region')
      .addSelect('COUNT(*)', 'count')
      .where('customer.regionId IS NOT NULL')
      .groupBy('region.name')
      .orderBy('count', 'DESC')
      .getRawMany()
      .then((results) =>
        results.map((r) => ({
          region: r.region || '미지정',
          count: parseInt(r.count, 10),
        })),
      );

    // 축종별 통계
    const bySpecies = await this.customersRepository
      .createQueryBuilder('customer')
      .select('customer.species', 'species')
      .addSelect('COUNT(*)', 'count')
      .groupBy('customer.species')
      .orderBy('count', 'DESC')
      .getRawMany()
      .then((results) =>
        results.map((r) => ({
          species: r.species || '미지정',
          count: parseInt(r.count, 10),
        })),
      );

    // 지역별 축종별 통계 (지역별 축종 분포용)
    const byRegionAndSpecies = await this.customersRepository
      .createQueryBuilder('customer')
      .leftJoin('customer.regionEntity', 'region')
      .select('COALESCE(region.name, \'미지정\')', 'region')
      .addSelect('COALESCE(customer.species, \'미지정\')', 'species')
      .addSelect('COUNT(*)', 'count')
      .groupBy('region.name')
      .addGroupBy('customer.species')
      .getRawMany()
      .then((results) =>
        results.map((r) => ({
          region: r.region || '미지정',
          species: r.species || '미지정',
          count: parseInt(r.count, 10),
        })),
      );

    // 지역별 한우 세부 분포 (지역별 한우 세부 분포용)
    const byRegionAndBeefSubtype = await this.customerOperationRepository
      .createQueryBuilder('operation')
      .innerJoin('operation.customer', 'customer')
      .leftJoin('customer.regionEntity', 'region')
      .select('COALESCE(region.name, \'미지정\')', 'region')
      .addSelect('COALESCE(operation.operationSub, \'미지정\')', 'operationSub')
      .addSelect('COUNT(*)', 'count')
      .where('operation.operation = :op', { op: 'BEEF' })
      .groupBy('region.name')
      .addGroupBy('operation.operationSub')
      .getRawMany()
      .then((results) =>
        results.map((r) => ({
          region: r.region || '미지정',
          operationSub: r.operationSub || '미지정',
          count: parseInt(r.count, 10),
        })),
      );

    // 지역별 낙농 세부 분포 (지역별 낙농 세부 분포용)
    const byRegionAndDairySubtype = await this.customerOperationRepository
      .createQueryBuilder('operation')
      .innerJoin('operation.customer', 'customer')
      .leftJoin('customer.regionEntity', 'region')
      .select('COALESCE(region.name, \'미지정\')', 'region')
      .addSelect('COALESCE(operation.operationSub, \'미지정\')', 'operationSub')
      .addSelect('COUNT(*)', 'count')
      .where('operation.operation = :op', { op: 'DAIRY' })
      .groupBy('region.name')
      .addGroupBy('operation.operationSub')
      .getRawMany()
      .then((results) =>
        results.map((r) => ({
          region: r.region || '미지정',
          operationSub: r.operationSub || '미지정',
          count: parseInt(r.count, 10),
        })),
      );

    const byOperationDetails = await this.customerOperationRepository
      .createQueryBuilder('operation')
      .select('operation.operation', 'operation')
      .addSelect('operation.operationSub', 'operationSub')
      .addSelect('COUNT(*)', 'count')
      .groupBy('operation.operation')
      .addGroupBy('operation.operationSub')
      .getRawMany()
      .then((results) =>
        results.map((r) => ({
          operation: r.operation || null,
          operationSub: r.operationSub || null,
          count: parseInt(r.count, 10),
        })),
      );

    return {
      total,
      byChamchamStatus,
      byRegion,
      bySpecies,
      byRegionAndSpecies,
      byRegionAndBeefSubtype,
      byRegionAndDairySubtype,
      byOperationDetails,
    };
  }

  /** 카카오 검색 시드: 도로명 → 지번 → 구 단일주소(cu_address) 순 */
  private pickAddressSearchSeed(customer: Customer): string | null {
    const road = customer.addressRoad?.trim();
    const jibun = customer.addressJibun?.trim();
    const legacy = customer.address?.trim();
    if (road) return road;
    if (jibun) return jibun;
    if (legacy) return legacy;
    return null;
  }

  /**
   * 도로명·지번 중 빈 칸이 있으면 카카오로 1회 보강해 DB에 저장합니다. (검색 시드는 도로명·지번·구주소 순)
   */
  private async fillRoadJibunIfMissing(customer: Customer): Promise<void> {
    const needRoad = !customer.addressRoad?.trim();
    const needJibun = !customer.addressJibun?.trim();
    if (!needRoad && !needJibun) return;
    const seed = this.pickAddressSearchSeed(customer);
    if (!seed) return;
    if (!this.kakaoLocalAddressService.getRestApiKey()) return;

    try {
      const { documents } = await this.kakaoLocalAddressService.searchAddress(seed, 8);
      const first = documents[0];
      const road = first?.road_address?.address_name?.trim() || null;
      const jibun = first?.address?.address_name?.trim() || null;
      const patch: Partial<Pick<Customer, 'addressRoad' | 'addressJibun' | 'addressDefaultType'>> = {};
      if (needRoad && road) patch.addressRoad = road;
      if (needJibun && jibun) patch.addressJibun = jibun;
      const kind = inferStoredAddressKind(customer.address, road, jibun);
      if (kind === 'ROAD' || kind === 'JIBUN') {
        patch.addressDefaultType = kind;
      }
      if (Object.keys(patch).length === 0) return;
      await this.customersRepository.update({ id: customer.id }, patch);
      Object.assign(customer, patch);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`fillRoadJibunIfMissing customerId=${customer.id}: ${msg}`);
    }
  }

  /**
   * 코드 관리 필드의 ca_value를 ca_name으로 변환
   */
  private async transformCodeValues(customers: Customer[]): Promise<Customer[]> {
    if (customers.length === 0) {
      return customers;
    }

    const bCodeSet = new Set<string>();
    for (const c of customers) {
      const b = c.legalBCode?.trim().replace(/\s/g, '') ?? '';
      if (b.length === 10) bCodeSet.add(b);
    }
    const masterByB = new Map<string, LegalAdminMaster>();
    if (bCodeSet.size > 0) {
      const masters = await this.legalAdminMasterRepository.find({
        where: { bCode: In([...bCodeSet]) },
      });
      for (const m of masters) {
        if (m.deletedDateSrc != null) continue;
        const key = String(m.bCode).trim().replace(/\s/g, '');
        if (key.length === 10) masterByB.set(key, m);
      }
    }

    // 필요한 코드 카테고리 목록 가져오기
    const [
      speciesCodes,
      operationCodes,
      feedingCodes,
      chamchamCodes,
      chamcharmMemberCodes,
      customerTypeCodes,
      memberTypeCodes,
      customerGradeCodes,
    ] = await Promise.all([
      this.codesService.findByCategory('SPECIES'),
      this.codesService.findByCategory('OPERATION_TYPE'),
      this.codesService.findByCategory('FEEDING_METHOD'),
      this.codesService.findByCategory('CHAMCHAM_STATUS'),
      this.codesService.findByCategory('CHAMCHARM_MEMBER_STATUS'),
      this.codesService.findByCategory('CUSTOMER_TYPE'),
      this.codesService.findByCategory('MEMBER_TYPE'),
      this.codesService.findByCategory('CUSTOMER_GRADE'),
    ]);

    // 코드 값 → 코드 이름 매핑 생성
    const codeMaps = {
      species: new Map(speciesCodes.map((code) => [code.value, code.name])),
      operation: new Map(operationCodes.map((code) => [code.value, code.name])),
      feeding: new Map(feedingCodes.map((code) => [code.value, code.name])),
      chamchamStatus: new Map(chamchamCodes.map((code) => [code.value, code.name])),
      chamcharmMemberStatus: new Map(chamcharmMemberCodes.map((code) => [code.value, code.name])),
      customerType: new Map(customerTypeCodes.map((code) => [code.value, code.name])),
      memberType: new Map(memberTypeCodes.map((code) => [code.value, code.name])),
      customerGrade: new Map(customerGradeCodes.map((code) => [code.value, code.name])),
    };

    // OPERATION_SUBTYPE 코드도 가져오기
    const operationSubCodes = await this.codesService.findByCategory('OPERATION_SUBTYPE');
    const operationSubMap = new Map(operationSubCodes.map((code) => [code.value, code.name]));

    // 고객 데이터 변환
    return customers.map((customer) => {
      const bKey = customer.legalBCode?.trim().replace(/\s/g, '') ?? '';
      const lam = bKey.length === 10 ? masterByB.get(bKey) : undefined;

      const transformed: any = {
        ...customer,
        consultationCount: Number((customer as any).consultationCount ?? 0),
        // 주소 필드들을 명시적으로 포함
        postalCode: customer.postalCode,
        address: customer.address,
        addressDetail: customer.addressDetail,
        addressRoad: customer.addressRoad?.trim() || null,
        addressJibun: customer.addressJibun?.trim() || null,
        addressDefaultType: customer.addressDefaultType?.trim() || null,
        legalBCode: customer.legalBCode?.trim().replace(/\s/g, '') || null,
        legalSidoName: lam?.sidoName?.trim() || null,
        legalSigunguName: lam?.sigunguName?.trim() || null,
        legalEupmyeondongName: lam?.eupmyeondongName?.trim() || null,
        legalRiName: lam?.riName?.trim() || null,
      };

      // operations 변환 (코드 값을 이름으로)
      if (customer.operations && customer.operations.length > 0) {
        transformed.operations = customer.operations.map((op) => ({
          ...op,
          operation: codeMaps.operation.get(op.operation) || op.operation,
          operationSub: op.operationSub 
            ? (operationSubMap.get(op.operationSub) || op.operationSub)
            : null,
        }));
      }

      // region 변환 (FK에서 이름으로)
      if (customer.regionEntity) {
        transformed.region = customer.regionEntity.name;
      } else {
        transformed.region = null;
      }

      // city 변환 (FK에서 이름으로)
      if (customer.cityEntity) {
        transformed.city = customer.cityEntity.name;
      } else {
        transformed.city = null;
      }

      // species 변환
      if (customer.species && codeMaps.species.has(customer.species)) {
        transformed.species = codeMaps.species.get(customer.species)!;
      }

      // feeding 변환
      if (customer.feeding && codeMaps.feeding.has(customer.feeding)) {
        transformed.feeding = codeMaps.feeding.get(customer.feeding)!;
      }

      // chamchamStatus 변환
      if (customer.chamchamStatus && codeMaps.chamchamStatus.has(customer.chamchamStatus)) {
        transformed.chamchamStatus = codeMaps.chamchamStatus.get(customer.chamchamStatus)!;
      }

      if (
        customer.chamcharmMemberStatus &&
        codeMaps.chamcharmMemberStatus.has(customer.chamcharmMemberStatus)
      ) {
        transformed.chamcharmMemberStatus = codeMaps.chamcharmMemberStatus.get(
          customer.chamcharmMemberStatus,
        )!;
      }

      // customerType 변환 (값 → 한글명)
      if (customer.customerType && codeMaps.customerType.has(customer.customerType)) {
        transformed.customerType = codeMaps.customerType.get(customer.customerType)!;
      }

      // memberType 변환 (값 → 한글명)
      if (customer.memberType && codeMaps.memberType.has(customer.memberType)) {
        transformed.memberType = codeMaps.memberType.get(customer.memberType)!;
      }

      if (customer.customerGrade && codeMaps.customerGrade.has(customer.customerGrade)) {
        transformed.customerGrade = codeMaps.customerGrade.get(customer.customerGrade)!;
      }

      transformed.salesManagerUserId = customer.salesManagerUserId ?? null;
      if (customer.salesManagerUser) {
        const u = customer.salesManagerUser;
        transformed.salesManagerName = (u.name?.trim() || null) as string | null;
        transformed.salesManagerEmail = (u.email || null) as string | null;
      } else {
        transformed.salesManagerName = null;
        transformed.salesManagerEmail = null;
      }
      delete transformed.salesManagerUser;

      // statementNames 그대로 전달 (변환 불필요)
      if (customer.statementNames && customer.statementNames.length > 0) {
        transformed.statementNames = customer.statementNames.map((sn) => ({
          id: sn.id,
          customerId: sn.customerId,
          companyName: sn.companyName,
          displayName: sn.displayName,
          contactPhone: sn.contactPhone,
          isDefault: sn.isDefault,
          createdAt: sn.createdAt,
          updatedAt: sn.updatedAt,
        }));
      } else {
        transformed.statementNames = [];
      }

      const daRows = customer.deliveryAddresses ?? [];
      const daSorted = [...daRows].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
      const contactRows = customer.contacts ?? [];
      const contactsSorted = [...contactRows].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      transformed.contacts = contactsSorted.map((row) => ({
        id: row.id,
        customerId: row.customerId,
        name: row.name,
        phone: row.phone,
        relationship: row.relationship,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));

      transformed.deliveryAddresses = daSorted.map((row) => ({
        id: row.id,
        customerId: row.customerId,
        label: row.label,
        recipientName: row.recipientName,
        recipientPhone: row.recipientPhone,
        postalCode: row.postalCode,
        addressRoad: row.addressRoad,
        addressJibun: row.addressJibun,
        addressDefaultType: row.addressDefaultType,
        addressDetail: row.addressDetail,
        legalBCode: row.legalBCode,
        isDefault: row.isDefault,
        isActive: row.isActive,
        mallDeliveryAddressId: row.mallDeliveryAddressId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));

      return transformed;
    });
  }

  /**
   * 코드 관리 필드의 ca_name을 ca_value로 변환 (생성/수정 시 사용)
   */
  private async transformNameToValue(
    dto: CreateCustomerDto | UpdateCustomerDto,
    existingCustomer?: Customer | null,
  ): Promise<CreateCustomerDto | UpdateCustomerDto> {
    const transformed = { ...dto };

    // region을 FK로 변환
    if (dto.region) {
      const region = await this.regionsService.findByName(dto.region);
      if (region) {
        (transformed as any).regionId = region.id;
      }
    } else if (existingCustomer && dto.region === undefined) {
      // region이 undefined가 아니고 명시적으로 전달되지 않은 경우, 기존 값 유지
      (transformed as any).regionId = existingCustomer.regionId;
    }

    // city를 FK로 변환
    if (dto.city) {
      // regionId가 있으면 해당 지역의 city만 검색, 없으면 전체 검색
      let city = null;
      const regionId = (transformed as any).regionId || existingCustomer?.regionId;
      if (regionId) {
        const cities = await this.citiesService.findByRegionId(regionId);
        city = cities.find((c) => c.name === dto.city) || null;
      }
      if (!city) {
        city = await this.citiesService.findByName(dto.city);
      }
      if (city) {
        (transformed as any).cityId = city.id;
      }
    } else if (existingCustomer && dto.city === undefined) {
      // city가 undefined가 아니고 명시적으로 전달되지 않은 경우, 기존 값 유지
      (transformed as any).cityId = existingCustomer.cityId;
    }

    // 필요한 코드 카테고리만 가져오기
    const codePromises: Promise<any>[] = [];
    const categories: string[] = [];

    if (dto.species) {
      codePromises.push(this.codesService.findByCategory('SPECIES'));
      categories.push('SPECIES');
    }
    if (dto.operation) {
      codePromises.push(this.codesService.findByCategory('OPERATION_TYPE'));
      categories.push('OPERATION_TYPE');
    }
    if (dto.feeding) {
      codePromises.push(this.codesService.findByCategory('FEEDING_METHOD'));
      categories.push('FEEDING_METHOD');
    }
    if (dto.chamchamStatus) {
      codePromises.push(this.codesService.findByCategory('CHAMCHAM_STATUS'));
      categories.push('CHAMCHAM_STATUS');
    }
    if (dto.chamcharmMemberStatus !== undefined) {
      const ccmsTrim = String(dto.chamcharmMemberStatus ?? '').trim();
      if (ccmsTrim === '') {
        (transformed as any).chamcharmMemberStatus = null;
      } else {
        codePromises.push(this.codesService.findByCategory('CHAMCHARM_MEMBER_STATUS'));
        categories.push('CHAMCHARM_MEMBER_STATUS');
      }
    }
    if (dto.customerType) {
      codePromises.push(this.codesService.findByCategory('CUSTOMER_TYPE'));
      categories.push('CUSTOMER_TYPE');
    }
    const memberTypeRaw = dto.memberType;
    const memberTypeTrim =
      memberTypeRaw !== undefined && memberTypeRaw !== null ? String(memberTypeRaw).trim() : '';
    const memberTypeNeedsCodeLookup =
      memberTypeTrim !== '' && memberTypeTrim !== 'NON_BUSINESS' && memberTypeTrim !== 'BUSINESS';
    if (memberTypeNeedsCodeLookup) {
      codePromises.push(this.codesService.findByCategory('MEMBER_TYPE'));
      categories.push('MEMBER_TYPE');
    }

    if (dto.customerGrade !== undefined) {
      const cgTrim = String(dto.customerGrade ?? '').trim();
      if (cgTrim === '') {
        (transformed as any).customerGrade = null;
      } else {
        codePromises.push(this.codesService.findByCategory('CUSTOMER_GRADE'));
        categories.push('CUSTOMER_GRADE');
      }
    }

    // operations가 있으면 OPERATION_TYPE과 OPERATION_SUBTYPE 코드 가져오기
    if (dto.operations && dto.operations.length > 0) {
      if (!categories.includes('OPERATION_TYPE')) {
        codePromises.push(this.codesService.findByCategory('OPERATION_TYPE'));
        categories.push('OPERATION_TYPE');
      }
      codePromises.push(this.codesService.findByCategory('OPERATION_SUBTYPE'));
      categories.push('OPERATION_SUBTYPE');
    }

    if (dto.memberType !== undefined) {
      if (dto.memberType === null || dto.memberType === '') {
        (transformed as any).memberType = null;
      } else {
        const val = String(dto.memberType).trim();
        if (val === 'NON_BUSINESS' || val === 'BUSINESS') {
          (transformed as any).memberType = val;
        }
      }
    }

    if (dto.businessRegistrationNumber !== undefined) {
      const t = dto.businessRegistrationNumber?.trim() ?? '';
      (transformed as any).businessRegistrationNumber = t === '' ? null : t;
    }

    if ((dto as any).businessCertGoogleDriveFileId !== undefined) {
      const t = String((dto as any).businessCertGoogleDriveFileId ?? '').trim();
      (transformed as any).businessCertGoogleDriveFileId = t === '' ? null : t;
    }

    if ((dto as any).businessCertFileName !== undefined) {
      const t = String((dto as any).businessCertFileName ?? '').trim();
      (transformed as any).businessCertFileName = t === '' ? null : t;
    }

    if (dto.mallUserId !== undefined) {
      const t = String(dto.mallUserId ?? '').trim();
      (transformed as any).mallUserId = t === '' ? null : t;
    }

    if (dto.livestockTypes !== undefined) {
      const t = String(dto.livestockTypes ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
        .join(',');
      (transformed as any).livestockTypes = t === '' ? null : t;
    }

    if (dto.operationMethod !== undefined) {
      const t = String(dto.operationMethod ?? '').trim();
      (transformed as any).operationMethod = t === '' ? null : t;
    }

    if (dto.feedingMethod !== undefined) {
      const t = String(dto.feedingMethod ?? '').trim();
      (transformed as any).feedingMethod = t === '' ? null : t;
    }

    if ((dto as any).livestockCount !== undefined) {
      const raw = (dto as any).livestockCount;
      if (raw === null || raw === '') {
        (transformed as any).livestockCount = null;
      } else {
        const n = Number(raw);
        (transformed as any).livestockCount = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
      }
    }

    if (dto.legalBCode !== undefined) {
      const t = (dto.legalBCode ?? '').trim().replace(/\s/g, '');
      (transformed as any).legalBCode = t === '' ? null : t.slice(0, 10);
    }

    if (dto.remarks !== undefined) {
      const t = dto.remarks?.trim() ?? '';
      (transformed as any).remarks = t === '' ? null : t;
    }

    if (dto.residentRegistrationNumber !== undefined) {
      const raw = String(dto.residentRegistrationNumber ?? '').replace(/[^0-9-]/g, '');
      (transformed as any).residentRegistrationNumber = raw === '' ? null : raw.slice(0, 32);
    }
    if ((dto as any).farmManagementCertGoogleDriveFileId !== undefined) {
      const t = String((dto as any).farmManagementCertGoogleDriveFileId ?? '').trim();
      (transformed as any).farmManagementCertGoogleDriveFileId = t === '' ? null : t.slice(0, 255);
    }
    if ((dto as any).farmManagementCertFileName !== undefined) {
      const t = String((dto as any).farmManagementCertFileName ?? '').trim();
      (transformed as any).farmManagementCertFileName = t === '' ? null : t.slice(0, 255);
    }
    if (dto.refundBankName !== undefined) {
      const t = (dto.refundBankName ?? '').trim();
      (transformed as any).refundBankName = t === '' ? null : t.slice(0, 100);
    }
    if (dto.refundAccountNumber !== undefined) {
      const t = (dto.refundAccountNumber ?? '').trim();
      (transformed as any).refundAccountNumber = t === '' ? null : t.slice(0, 64);
    }
    if (dto.refundDepositor !== undefined) {
      const t = (dto.refundDepositor ?? '').trim();
      (transformed as any).refundDepositor = t === '' ? null : t.slice(0, 100);
    }
    if ((dto as any).salesManagerUserId !== undefined) {
      const raw = (dto as any).salesManagerUserId;
      if (raw === null || raw === '' || raw === '__none__') {
        (transformed as any).salesManagerUserId = null;
      } else {
        const n = Number(raw);
        (transformed as any).salesManagerUserId = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
      }
    }

    if (codePromises.length === 0) {
      this.applyMemberTypeCrossFieldRules(dto, transformed, existingCustomer);
      return transformed;
    }

    const codeResults = await Promise.all(codePromises);
    const codeMaps: Record<string, Map<string, string>> = {};

    categories.forEach((category, index) => {
      const codes = codeResults[index];
      codeMaps[category] = new Map(codes.map((code: any) => [code.name, code.value || '']));
    });

    // species 변환
    if (dto.species && codeMaps['SPECIES']) {
      const value = codeMaps['SPECIES'].get(dto.species);
      if (value) {
        (transformed as any).species = value;
      }
    }

    // operation 변환
    if (dto.operation && codeMaps['OPERATION_TYPE']) {
      const value = codeMaps['OPERATION_TYPE'].get(dto.operation);
      if (value) {
        (transformed as any).operation = value;
      }
    }

    // feeding 변환
    if (dto.feeding && codeMaps['FEEDING_METHOD']) {
      const value = codeMaps['FEEDING_METHOD'].get(dto.feeding);
      if (value) {
        (transformed as any).feeding = value;
      }
    }

    // chamchamStatus 변환
    if (dto.chamchamStatus && codeMaps['CHAMCHAM_STATUS']) {
      const value = codeMaps['CHAMCHAM_STATUS'].get(dto.chamchamStatus);
      if (value) {
        (transformed as any).chamchamStatus = value;
      }
    }

    // chamcharmMemberStatus 변환 (cd_name 또는 cd_value → cd_value)
    if (
      dto.chamcharmMemberStatus !== undefined &&
      String(dto.chamcharmMemberStatus ?? '').trim() !== '' &&
      categories.includes('CHAMCHARM_MEMBER_STATUS')
    ) {
      const raw = String(dto.chamcharmMemberStatus).trim();
      const idx = categories.indexOf('CHAMCHARM_MEMBER_STATUS');
      const codes = codeResults[idx] || [];
      const found = codes.find(
        (c: Code) => c.name === raw || String(c.value ?? '') === raw,
      );
      if (found?.value != null && String(found.value) !== '') {
        (transformed as any).chamcharmMemberStatus = found.value;
      } else {
        delete (transformed as any).chamcharmMemberStatus;
      }
    }

    // customerType 변환 (한글명 → 값). 이미 FARM/DISTRIBUTION이면 그대로 사용
    if (dto.customerType !== undefined && dto.customerType !== null && dto.customerType !== '') {
      const val = dto.customerType.trim();
      if (val === 'FARM' || val === 'DISTRIBUTION') {
        (transformed as any).customerType = val;
      } else if (codeMaps['CUSTOMER_TYPE']) {
        const value = codeMaps['CUSTOMER_TYPE'].get(val);
        if (value) {
          (transformed as any).customerType = value;
        }
      }
    }

    // memberType: 한글명(cd_name) → cd_value (리터럴 NON_BUSINESS/BUSINESS는 위에서 처리)
    if (memberTypeNeedsCodeLookup && codeMaps['MEMBER_TYPE']) {
      const val = memberTypeTrim;
      const value = codeMaps['MEMBER_TYPE'].get(val);
      if (value) {
        (transformed as any).memberType = value;
      }
    }

    if (dto.customerGrade !== undefined && categories.includes('CUSTOMER_GRADE')) {
      const raw = String(dto.customerGrade).trim();
      const idx = categories.indexOf('CUSTOMER_GRADE');
      const codes = codeResults[idx] || [];
      const found = codes.find(
        (c: Code) => c.name === raw || String(c.value ?? '') === raw,
      );
      if (found?.value != null && String(found.value) !== '') {
        (transformed as any).customerGrade = found.value;
      } else if (found && (!found.value || String(found.value) === '')) {
        (transformed as any).customerGrade = found.name;
      }
    }

    // operations 변환 (코드 이름을 값으로)
    if (dto.operations && dto.operations.length > 0 && codeMaps['OPERATION_TYPE'] && codeMaps['OPERATION_SUBTYPE']) {
      (transformed as any).operations = dto.operations.map((op) => {
        const operationValue = codeMaps['OPERATION_TYPE'].get(op.operation) || op.operation;
        const operationSubValue = op.operationSub 
          ? (codeMaps['OPERATION_SUBTYPE'].get(op.operationSub) || op.operationSub)
          : null;
        
        return {
          operation: operationValue,
          operationSub: operationSubValue,
          herdSize: op.herdSize,
        };
      });
    }

    this.applyMemberTypeCrossFieldRules(dto, transformed, existingCustomer);
    return transformed;
  }

  /**
   * 회원 구분이 요청에 포함될 때만, 사업자↔비사업자 전용 필드 정리
   */
  private applyMemberTypeCrossFieldRules(
    dto: CreateCustomerDto | UpdateCustomerDto,
    transformed: any,
    _existingCustomer?: Customer | null,
  ) {
    if (dto.memberType === undefined) {
      return;
    }
    const v = transformed?.memberType as string | null | undefined;
    if (v === 'BUSINESS') {
      transformed.residentRegistrationNumber = null;
    } else if (v === 'NON_BUSINESS') {
      transformed.businessRegistrationNumber = null;
      transformed.businessCertGoogleDriveFileId = null;
      transformed.businessCertFileName = null;
    }
  }

  private async reloadCustomerWithRelations(id: string): Promise<Customer> {
    const c = await this.customersRepository.findOne({
      where: { id },
      relations: [
        'regionEntity',
        'cityEntity',
        'operations',
        'statementNames',
        'deliveryAddresses',
        'contacts',
        'salesManagerUser',
      ],
    });
    if (!c) {
      throw new NotFoundException('고객 정보를 찾을 수 없습니다.');
    }
    return c;
  }

  // --- 이벤트 문자 회신 엑셀(전화번호 매칭) 미리보기·일괄 반영 ---

  /** 고객 엑셀 업로드: 헤더 셀에 쓰일 수 있는 표기(농가정보 회신·통합 양식 등) */
  private static readonly CUSTOMER_IMPORT_HEADER_ALIASES: Record<
    | 'phone'
    | 'feeding'
    | 'livestockCol'
    | 'operationCol'
    | 'herdCount'
    | 'remarks'
    | 'ceo'
    | 'companyName'
    | 'address',
    readonly string[]
  > = {
    phone: [
      '전화번호',
      '연락처',
      '휴대폰',
      '휴대전화',
      'phone',
      'Phone',
      '핸드폰',
      '핸드폰번호',
      '휴대전화번호',
      '전화',
      '연락처(전화)',
      '휴대전화 번호',
      '휴대폰 번호',
    ],
    feeding: ['급여', '급여방식', '급여 방식', '사료급여'],
    /** 헤더가 「축종」·「축정」(표기 오기) 단독 열만 — headerRowMatchesField / eventSmsIsLivestockOnlyHeaderLabel에서 처리 */
    livestockCol: [],
    /** 단일 열 「축종/운영」 또는 「운영방식」 등. 단독 「축종」 열은 livestockCol 전용 */
    operationCol: ['운영방식', '운영', '축종/운영', '사육형태'],
    herdCount: ['두수', '마릿수', '사육두수', '사육 두수'],
    remarks: ['비고', '메모', '특이사항', '기타'],
    ceo: ['이름', '대표자', 'ceo', 'CEO', '대표자명', '성명', '농장주', '대표', '농장주명'],
    companyName: [
      '농장명',
      '농장명(상호)',
      '농장 상호',
      '업체명',
      '상호',
      '사업장명',
      '고객명',
      '농장이름',
      '농가명',
    ],
    address: ['주소', 'address', '소재지', '농장주소', '사업장주소'],
  };

  private normalizeImportHeaderCell(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/\s+/g, ' ').trim().normalize('NFC');
    return s;
  }

  private headerCellMatchesAlias(header: string, alias: string): boolean {
    const raw = this.normalizeImportHeaderCell(header);
    if (!raw) return false;
    const h = raw.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    const a = this.normalizeImportHeaderCell(alias);
    if (!h || !a) return false;
    if (h === a) return true;
    const hCompact = h.replace(/\s/g, '');
    const aCompact = a.replace(/\s/g, '');
    if (hCompact === aCompact) return true;
    if (aCompact.length >= 2 && hCompact.includes(aCompact)) return true;
    if (hCompact.length >= 2 && aCompact.includes(hCompact)) {
      // 헤더가 정확히 「이름」인데 별칭이 「농장이름」처럼 끝만 겹치면 대표자 열을 농장명으로 오인식함
      if (hCompact === '이름' && aCompact !== hCompact) return false;
      return true;
    }
    if (a.length >= 2 && h.includes(a)) return true;
    if (h.length >= 2 && a.includes(h)) return true;
    return false;
  }

  private headerRowMatchesField(headerCell: string, field: keyof typeof CustomersService.CUSTOMER_IMPORT_HEADER_ALIASES): boolean {
    if (field === 'livestockCol') {
      const nk = this.normalizeImportHeaderCell(headerCell)
        .replace(/\([^)]*\)/g, '')
        .replace(/\s+/g, '')
        .trim();
      return nk === '축종' || nk === '축정';
    }
    const aliases = CustomersService.CUSTOMER_IMPORT_HEADER_ALIASES[field];
    return aliases.some((al) => this.headerCellMatchesAlias(headerCell, al));
  }

  private scoreRowAsImportHeader(row: unknown[]): { score: number; hasPhone: boolean } {
    const cells = row.map((c) => this.normalizeImportHeaderCell(c)).filter(Boolean);
    if (cells.length < 2) return { score: 0, hasPhone: false };
    let score = 0;
    let hasPhone = false;
    const fields = Object.keys(
      CustomersService.CUSTOMER_IMPORT_HEADER_ALIASES,
    ) as (keyof typeof CustomersService.CUSTOMER_IMPORT_HEADER_ALIASES)[];
    const hit = new Set<string>();
    for (const cell of cells) {
      for (const f of fields) {
        if (hit.has(f)) continue;
        if (this.headerRowMatchesField(cell, f)) {
          hit.add(f);
          score += f === 'phone' ? 25 : 6;
          if (f === 'phone') hasPhone = true;
        }
      }
    }
    return { score, hasPhone };
  }

  private pickBestHeaderRowAoA(aoa: unknown[][]): { headerRowIdx: number; score: number; hasPhone: boolean } | null {
    const maxScan = Math.min(45, aoa.length);
    let best: { headerRowIdx: number; score: number; hasPhone: boolean } | null = null;
    for (let r = 0; r < maxScan; r++) {
      const row = aoa[r];
      if (!Array.isArray(row)) continue;
      const { score, hasPhone } = this.scoreRowAsImportHeader(row);
      if (score <= 0) continue;
      if (!best || score > best.score || (score === best.score && hasPhone && !best.hasPhone)) {
        best = { headerRowIdx: r, score, hasPhone };
      }
    }
    return best;
  }

  private buildRowRecordFromAoA(
    aoa: unknown[][],
    headerRowIdx: number,
    dataRowIdx: number,
  ): Record<string, unknown> {
    const headerRow = aoa[headerRowIdx] ?? [];
    const dataRow = aoa[dataRowIdx] ?? [];
    const obj: Record<string, unknown> = {};
    const maxJ = Math.max(headerRow.length, dataRow.length);
    for (let j = 0; j < maxJ; j++) {
      const keyRaw = this.normalizeImportHeaderCell(headerRow[j]);
      const key = keyRaw || `_열${j + 1}`;
      obj[key] = j < dataRow.length ? dataRow[j] : null;
    }
    return obj;
  }

  private isEffectivelyEmptyImportRow(obj: Record<string, unknown>): boolean {
    for (const v of Object.values(obj)) {
      if (v === null || v === undefined) continue;
      if (typeof v === 'string' && v.trim() === '') continue;
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      return false;
    }
    return true;
  }

  /** 헤더 표기가 「축종」·「축정」(양식 오기)인 열만 (「축종/운영」 제외) */
  private eventSmsIsLivestockOnlyHeaderLabel(headerCell: string): boolean {
    const nk = this.normalizeImportHeaderCell(headerCell)
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+/g, '')
      .trim();
    return nk === '축종' || nk === '축정';
  }

  private eventSmsPickLivestockSpeciesColumn(row: Record<string, unknown>): unknown {
    for (const rowKey of Object.keys(row)) {
      if (!this.eventSmsIsLivestockOnlyHeaderLabel(rowKey)) continue;
      const v = row[rowKey];
      if (v != null && String(v).trim() !== '') return v;
    }
    return null;
  }

  private eventSmsPickFromAliases(
    row: Record<string, unknown>,
    field: keyof typeof CustomersService.CUSTOMER_IMPORT_HEADER_ALIASES,
  ): unknown {
    if (field === 'livestockCol') {
      return this.eventSmsPickLivestockSpeciesColumn(row);
    }
    const aliases = CustomersService.CUSTOMER_IMPORT_HEADER_ALIASES[field];
    for (const rowKey of Object.keys(row)) {
      const nk = this.normalizeImportHeaderCell(rowKey);
      if (!nk) continue;
      const hit = aliases.some((al) => this.headerCellMatchesAlias(nk, al));
      if (hit) {
        const v = row[rowKey];
        if (v !== null && v !== undefined && String(v).trim() !== '') return v;
      }
    }
    return null;
  }

  /**
   * 업체명(상호): 농장명 계열 열을 먼저 채택. 엑셀에 상호·대표자명이 앞에 있어도 덕인농장 같은 농장명이 우선.
   */
  private eventSmsPickCompanyNameCell(row: Record<string, unknown>): unknown {
    const allAliases = CustomersService.CUSTOMER_IMPORT_HEADER_ALIASES.companyName;
    const farmFirstAliases = [
      '농장명',
      '농장명(상호)',
      '농장 상호',
      '농장이름',
      '농가명',
    ] as const;
    for (const rowKey of Object.keys(row)) {
      const nk = this.normalizeImportHeaderCell(rowKey);
      if (!nk) continue;
      if (!farmFirstAliases.some((al) => this.headerCellMatchesAlias(nk, al))) continue;
      const v = row[rowKey];
      if (v != null && String(v).trim() !== '') return v;
    }
    for (const rowKey of Object.keys(row)) {
      const nk = this.normalizeImportHeaderCell(rowKey);
      if (!nk) continue;
      if (!allAliases.some((al) => this.headerCellMatchesAlias(nk, al))) continue;
      if (farmFirstAliases.some((al) => this.headerCellMatchesAlias(nk, al))) continue;
      const v = row[rowKey];
      if (v != null && String(v).trim() !== '') return v;
    }
    return null;
  }

  private parseEventSmsRowObject(row: Record<string, unknown>, excelRow: number) {
    const phoneVal = this.eventSmsPickFromAliases(row, 'phone');
    const phoneRaw = this.eventSmsCellStr(phoneVal) ?? '';
    const phoneNorm = this.eventSmsNormalizePhoneKey(phoneRaw);
    return {
      excelRow,
      phoneRaw,
      phoneNorm,
      feeding: this.eventSmsCellStr(this.eventSmsPickFromAliases(row, 'feeding')),
      livestockCol: this.eventSmsCellStr(this.eventSmsPickFromAliases(row, 'livestockCol')),
      operationCol: this.eventSmsCellStr(this.eventSmsPickFromAliases(row, 'operationCol')),
      herdCount: this.eventSmsCellInt(this.eventSmsPickFromAliases(row, 'herdCount')),
      remarks: this.eventSmsCellStr(this.eventSmsPickFromAliases(row, 'remarks')),
      ceo: this.eventSmsCellStr(this.eventSmsPickFromAliases(row, 'ceo')),
      companyName: this.eventSmsCellStr(this.eventSmsPickCompanyNameCell(row)),
      address: this.eventSmsCellStr(this.eventSmsPickFromAliases(row, 'address')),
    };
  }

  /**
   * 엑셀 구조만 점검 (DB 미반영). 헤더 행 자동 탐지, 열 인식, 샘플·전화번호 누락 행 요약.
   */
  async inspectCustomerExcelImport(buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const fileSheets = workbook.SheetNames ?? [];
    let best: {
      sheetName: string;
      headerRowIdx: number;
      score: number;
      hasPhone: boolean;
      aoa: unknown[][];
    } | null = null;

    for (const sheetName of fileSheets) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const aoa = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
        raw: false,
      }) as unknown[][];
      const pick = this.pickBestHeaderRowAoA(aoa);
      if (!pick) continue;
      if (!best || pick.score > best.score || (pick.score === best.score && pick.hasPhone && !best.hasPhone)) {
        best = { sheetName, headerRowIdx: pick.headerRowIdx, score: pick.score, hasPhone: pick.hasPhone, aoa };
      }
    }

    if (!best) {
      throw new BadRequestException(
        '엑셀에서 표 헤더를 찾지 못했습니다. "전화번호", "연락처", "휴대폰" 등이 있는 행이 상단(약 45행 이내)에 있는지 확인해 주세요.',
      );
    }

    if (!best.hasPhone) {
      throw new BadRequestException(
        '전화번호(또는 연락처·휴대폰) 열을 인식하지 못했습니다. 헤더 행의 열 이름을 확인해 주세요.',
      );
    }

    const headerRow = (best.aoa[best.headerRowIdx] ?? []) as unknown[];
    const headers = headerRow.map((c) => this.normalizeImportHeaderCell(c));

    const fieldToHeader: Record<string, string | null> = {};
    const fieldKeys = Object.keys(
      CustomersService.CUSTOMER_IMPORT_HEADER_ALIASES,
    ) as (keyof typeof CustomersService.CUSTOMER_IMPORT_HEADER_ALIASES)[];
    for (const f of fieldKeys) {
      fieldToHeader[f] = null;
      for (let j = 0; j < headers.length; j++) {
        const h = headers[j];
        if (!h) continue;
        if (this.headerRowMatchesField(h, f)) {
          fieldToHeader[f] = h;
          break;
        }
      }
    }

    const recognizedHeaderSet = new Set<string>();
    for (const h of headers) {
      if (!h) continue;
      for (const f of fieldKeys) {
        if (fieldToHeader[f] === h) {
          recognizedHeaderSet.add(h);
          break;
        }
      }
    }
    const unrecognizedHeaders = headers.filter((h) => h && !recognizedHeaderSet.has(h));

    const issues: Array<{ excelRow: number; kind: string; message: string; phoneRaw?: string | null }> = [];
    const sampleRows: Array<Record<string, unknown>> = [];
    let dataRowCount = 0;

    for (let i = best.headerRowIdx + 1; i < best.aoa.length; i++) {
      const rowObj = this.buildRowRecordFromAoA(best.aoa, best.headerRowIdx, i);
      if (this.isEffectivelyEmptyImportRow(rowObj)) continue;
      dataRowCount += 1;
      const excelRowNum = i + 1;
      const r = this.parseEventSmsRowObject(rowObj, excelRowNum);

      if (sampleRows.length < 8) {
        sampleRows.push({
          excelRow: excelRowNum,
          phone: r.phoneRaw || null,
          companyName: r.companyName,
          ceo: r.ceo,
          feeding: r.feeding,
          livestock: r.livestockCol,
          operation: r.operationCol,
          herdCount: r.herdCount,
          address: r.address,
          remarks: r.remarks,
        });
      }

      if (!r.phoneNorm || r.phoneNorm.length < 8) {
        issues.push({
          excelRow: excelRowNum,
          kind: 'no_phone',
          message: '유효한 전화번호가 없습니다.',
          phoneRaw: r.phoneRaw || null,
        });
      }
    }

    return {
      fileSheets,
      usedSheet: best.sheetName,
      headerRow: best.headerRowIdx + 1,
      headerScore: best.score,
      headers,
      fieldToHeader,
      unrecognizedHeaders,
      dataRowCount,
      sampleRows,
      issues: issues.slice(0, 300),
      issueSummary: {
        noPhone: issues.filter((x) => x.kind === 'no_phone').length,
        totalIssueRows: issues.length,
      },
      hint:
        '다음 단계에서 동일 파일로「미리보기」를 실행하면 DB 매칭(신규/수정) 결과를 볼 수 있습니다. 미리보기·반영은 첫 시트가 아닌 경우에도, 점수가 가장 높은 시트를 사용합니다.',
    };
  }

  private eventSmsCellStr(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' && Number.isFinite(v)) {
      return String(Math.trunc(v));
    }
    const s = String(v).trim();
    return s === '' ? null : s;
  }

  private eventSmsCellInt(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' && Number.isFinite(v)) {
      return Math.trunc(v);
    }
    const s = String(v).trim();
    if (!s) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  }

  private eventSmsPick(row: Record<string, unknown>, keys: string[]): unknown {
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(row, k)) {
        const v = row[k];
        if (v !== null && v !== undefined && String(v).trim() !== '') return v;
      }
    }
    return null;
  }

  private eventSmsNormalizePhoneKey(raw: string): string {
    let d = raw.replace(/\D/g, '');
    if (d.startsWith('82') && d.length >= 10) {
      d = `0${d.slice(2)}`;
    }
    return d;
  }

  private eventSmsPhoneMatchVariants(norm: string): string[] {
    const set = new Set<string>();
    if (!norm) return [];
    set.add(norm);
    if (norm.startsWith('0')) set.add(norm.slice(1));
    else set.add(`0${norm}`);
    return [...set];
  }

  /**
   * FEEDING_METHOD cd_value → 화면/몰 급여방식 코드 (직접급여·자가배합(배합기)·TMF).
   * 배합기(MIXER)·자가배합(SELF_MIX)는 SELF_MIX로, TMR은 TMF로 통일.
   */
  private eventSmsFeedingMallCodeFromCodeRow(c: Code): 'DIRECT' | 'SELF_MIX' | 'TMF' | null {
    const v = String(c.value ?? '')
      .trim()
      .toUpperCase();
    if (v === 'DIRECT') return 'DIRECT';
    if (v === 'SELF_MIX' || v === 'MIXER') return 'SELF_MIX';
    if (v === 'TMF' || v === 'TMR') return 'TMF';
    return null;
  }

  /**
   * 엑셀 급여 원문 → 레거시 cu_feeding 변환용 코드명(cd_name) + cu_feeding_method(몰: DIRECT|SELF_MIX|TMF).
   * 엑셀 「직접」→ 직접급여/DIRECT, 「배합기」→ 자가배합(배합기)/SELF_MIX (구 코드 MIXER와 구분).
   */
  private resolveEventSmsFeedingImport(
    raw: string | null,
    codes: Code[],
  ): { feedingName: string; feedingMethod: string } | null {
    if (!raw) return null;
    const t = raw.trim();
    if (!t) return null;

    const byName = codes.find((c) => c.name === t);
    const byVal = codes.find((c) => String(c.value ?? '').toUpperCase() === t.toUpperCase());
    let matched: Code | undefined = byName ?? byVal;
    if (!matched) {
      for (const c of codes) {
        const als = String(c.aliases ?? '')
          .split(/[,;\n]/)
          .map((a) => a.trim())
          .filter(Boolean);
        if (als.includes(t)) {
          matched = c;
          break;
        }
      }
    }

    let mall: 'DIRECT' | 'SELF_MIX' | 'TMF' | null = null;
    if (matched) {
      mall = this.eventSmsFeedingMallCodeFromCodeRow(matched);
    }
    if (!mall) {
      const compact = t.replace(/\s+/g, '');
      if (compact === '직접' || t.includes('직접급여')) {
        mall = 'DIRECT';
      } else if (
        compact === '배합기' ||
        compact === '배합' ||
        t.includes('자가배합') ||
        t.includes('배합기')
      ) {
        mall = 'SELF_MIX';
      } else if (/^(TMF|TMR)$/i.test(compact) || /\bTMR\b/i.test(t) || /\bTMF\b/i.test(t)) {
        mall = 'TMF';
      }
    }
    if (!mall) return null;

    const nameForValue = (value: string): string | undefined =>
      codes.find((c) => String(c.value ?? '').toUpperCase() === value.toUpperCase())?.name;

    if (mall === 'DIRECT') {
      const feedingName = nameForValue('DIRECT') ?? codes.find((c) => c.name === '직접급여')?.name ?? '직접급여';
      return { feedingName, feedingMethod: 'DIRECT' };
    }
    if (mall === 'SELF_MIX') {
      const feedingName =
        nameForValue('SELF_MIX') ??
        codes.find((c) => c.name?.includes('자가배합'))?.name ??
        '자가배합';
      return { feedingName, feedingMethod: 'SELF_MIX' };
    }
    const tmfName = nameForValue('TMF') ?? nameForValue('TMR') ?? 'TMR';
    return { feedingName: tmfName, feedingMethod: 'TMF' };
  }

  /** 엑셀 한 줄 주소 → 카카오로 도로명·지번 보강 (키 없으면 기본주소만). */
  private async eventSmsResolveAddressFields(
    rawAddress: string | null | undefined,
  ): Promise<Partial<Pick<UpdateCustomerDto, 'address' | 'addressRoad' | 'addressJibun' | 'addressDefaultType'>>> {
    const line = rawAddress?.trim();
    if (!line) return {};
    const key = this.kakaoLocalAddressService.getRestApiKey();
    if (!key) {
      return { address: line };
    }
    try {
      const { documents } = await this.kakaoLocalAddressService.searchAddress(line, 8);
      const first = documents[0];
      const road = first?.road_address?.address_name?.trim() || null;
      const jibun = first?.address?.address_name?.trim() || null;
      if (!road && !jibun) {
        return { address: line };
      }
      const main = road || jibun || line;
      const kind = inferStoredAddressKind(main, road, jibun);
      const addressDefaultType =
        kind === 'ROAD' || kind === 'JIBUN' ? kind : road ? 'ROAD' : jibun ? 'JIBUN' : 'ROAD';
      const out: Partial<
        Pick<UpdateCustomerDto, 'address' | 'addressRoad' | 'addressJibun' | 'addressDefaultType'>
      > = { address: main, addressDefaultType };
      if (road) out.addressRoad = road;
      if (jibun) out.addressJibun = jibun;
      return out;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`eventSmsResolveAddressFields: ${msg}`);
      return { address: line };
    }
  }

  /** 고객 수정 화면 「농장/축산 정보」의 운영방식 체크박스 값 (tb_code OPERATION_SUBTYPE의 cd_value와 대응, 일괄만 INTEGRATED→BATCH) */
  private eventSmsSubtypeValueToMallOperationMethod(cdValue: string | null | undefined): string | null {
    const v = String(cdValue ?? '')
      .trim()
      .toUpperCase();
    if (!v) return null;
    if (v === 'INTEGRATED') return 'BATCH';
    if (v === 'DRY_MILKING') return 'MILKING';
    if (['BREEDING', 'FATTENING', 'RAISING', 'MILKING'].includes(v)) return v;
    return null;
  }

  private splitEventSmsOperationColTokens(raw: string): string[] {
    return raw
      .split(/[,，、;/|]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /** 엑셀 업체(상호): 농장명이 있으면 그 값, 없으면 대표자명으로 채움(둘 다 비면 미설정). */
  private eventSmsResolveCompanyName(
    farmNameRaw: string | null | undefined,
    ceoRaw: string | null | undefined,
  ): string | undefined {
    const farm = farmNameRaw?.trim();
    const ceo = ceoRaw?.trim();
    if (farm) return farm;
    if (ceo) return ceo;
    return undefined;
  }

  private findCodeByNameValueOrAliases(token: string, codes: Code[]): Code | undefined {
    const t = token.trim();
    if (!t) return undefined;
    const byName = codes.find((c) => c.name === t);
    if (byName) return byName;
    const byVal = codes.find((c) => String(c.value ?? '').toUpperCase() === t.toUpperCase());
    if (byVal) return byVal;
    for (const c of codes) {
      const als = String(c.aliases ?? '')
        .split(/[,;\n]/)
        .map((a) => a.trim())
        .filter(Boolean);
      if (als.includes(t)) return c;
    }
    return undefined;
  }

  /** OPERATION_SUBTYPE → 쇼핑몰/폼 운영방식 코드 (BREEDING, BATCH, …) */
  private resolveEventSmsOperationSubtypeToken(token: string, subCodes: Code[]): string | null {
    const c = this.findCodeByNameValueOrAliases(token, subCodes);
    if (c) return this.eventSmsSubtypeValueToMallOperationMethod(c.value ?? '');
    const t = token.trim();
    const ko: Record<string, string> = {
      번식: 'BREEDING',
      비육: 'FATTENING',
      육성: 'RAISING',
      일괄: 'BATCH',
      착유: 'MILKING',
    };
    const mall = ko[t];
    return mall ?? null;
  }

  /** OPERATION_TYPE → 농장/축산 「축종」 체크박스 값 (HANWOO, NAKWOO, …) */
  private resolveEventSmsOperationTypeTokenToLivestockMall(token: string, typeCodes: Code[]): string | null {
    const t = token.trim();
    if (t === '낙우' || t === '낙농') return 'NAKWOO';
    if (t === '한우') return 'HANWOO';
    if (t === '육우') return 'YUKWOO';
    if (t === '기타') return 'ETC';

    const c = this.findCodeByNameValueOrAliases(t, typeCodes);
    if (!c) return null;
    const v = String(c.value ?? '').toUpperCase();
    if (v === 'BEEF') return 'HANWOO';
    if (v === 'DAIRY') return 'NAKWOO';
    if (v === 'COMPANY') return null;
    if (v === 'HORSE' || v === 'GOAT') return 'ETC';
    return null;
  }

  /**
   * 엑셀 「축종/운영」 열: 축종(OPERATION_TYPE)은 livestockTypes, 운영(OPERATION_SUBTYPE)은 operationMethod에 반영.
   */
  private resolveEventSmsOperationImportColumn(
    raw: string | null | undefined,
    typeCodes: Code[],
    subCodes: Code[],
  ): { mallLivestockTypes: string[]; mallOperationMethods: string[]; unmatchedTokens: string[] } {
    if (!raw) {
      return { mallLivestockTypes: [], mallOperationMethods: [], unmatchedTokens: [] };
    }
    const tokens = this.splitEventSmsOperationColTokens(String(raw));
    const livestockOrder = ['HANWOO', 'NAKWOO', 'YUKWOO', 'ETC'] as const;
    const opOrder = ['BREEDING', 'FATTENING', 'RAISING', 'BATCH', 'MILKING'] as const;
    const livestockSet = new Set<string>();
    const opSet = new Set<string>();
    const unmatched: string[] = [];

    for (const token of tokens) {
      const sub = this.resolveEventSmsOperationSubtypeToken(token, subCodes);
      const live = this.resolveEventSmsOperationTypeTokenToLivestockMall(token, typeCodes);
      if (sub) {
        opSet.add(sub);
        continue;
      }
      if (live) {
        livestockSet.add(live);
        continue;
      }
      unmatched.push(token);
    }

    const mallLivestockTypes = livestockOrder.filter((x) => livestockSet.has(x));
    const mallOperationMethods = opOrder.filter((x) => opSet.has(x));
    return { mallLivestockTypes, mallOperationMethods, unmatchedTokens: unmatched };
  }

  private mergeEventSmsOperationResolutions(
    a: { mallLivestockTypes: string[]; mallOperationMethods: string[]; unmatchedTokens: string[] },
    b: { mallLivestockTypes: string[]; mallOperationMethods: string[]; unmatchedTokens: string[] },
  ): { mallLivestockTypes: string[]; mallOperationMethods: string[]; unmatchedTokens: string[] } {
    const livestockOrder = ['HANWOO', 'NAKWOO', 'YUKWOO', 'ETC'] as const;
    const opOrder = ['BREEDING', 'FATTENING', 'RAISING', 'BATCH', 'MILKING'] as const;
    const ls = new Set<string>([...a.mallLivestockTypes, ...b.mallLivestockTypes]);
    const os = new Set<string>([...a.mallOperationMethods, ...b.mallOperationMethods]);
    return {
      mallLivestockTypes: livestockOrder.filter((x) => ls.has(x)),
      mallOperationMethods: opOrder.filter((x) => os.has(x)),
      unmatchedTokens: [...a.unmatchedTokens, ...b.unmatchedTokens],
    };
  }

  private eventSmsOperationSummary(customer: Customer, opCodes: Code[]): string {
    const opMap = new Map(opCodes.map((c) => [c.value ?? '', c.name]));
    const parts = (customer.operations ?? []).map((op) => {
      const label = opMap.get(op.operation ?? '') ?? op.operation ?? '';
      const hs = op.herdSize != null ? `${op.herdSize}두` : '';
      return hs ? `${label}(${hs})` : label;
    });
    if (parts.length > 0) return parts.join(', ');
    return '-';
  }

  private parseEventSmsExcelRows(buffer: Buffer): {
    sheetName: string;
    rows: Array<{
      excelRow: number;
      phoneRaw: string;
      phoneNorm: string;
      feeding?: string | null;
      livestockCol?: string | null;
      operationCol?: string | null;
      herdCount?: number | null;
      remarks?: string | null;
      ceo?: string | null;
      companyName?: string | null;
      address?: string | null;
    }>;
  } {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const fileSheets = workbook.SheetNames ?? [];
    let best: { sheetName: string; headerRowIdx: number; aoa: unknown[][] } | null = null;
    let bestPick: { score: number; hasPhone: boolean } | null = null;

    for (const sheetName of fileSheets) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const aoa = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
        raw: false,
      }) as unknown[][];
      const pick = this.pickBestHeaderRowAoA(aoa);
      if (!pick) continue;
      if (
        !bestPick ||
        pick.score > bestPick.score ||
        (pick.score === bestPick.score && pick.hasPhone && !bestPick.hasPhone)
      ) {
        best = { sheetName, headerRowIdx: pick.headerRowIdx, aoa };
        bestPick = { score: pick.score, hasPhone: pick.hasPhone };
      }
    }

    if (!best || !bestPick) {
      throw new BadRequestException('시트가 비어 있거나 표 헤더를 찾지 못했습니다.');
    }
    if (!bestPick.hasPhone) {
      throw new BadRequestException(
        '전화번호(연락처·휴대폰) 열을 인식하지 못했습니다. 엑셀 검사(구조 점검)로 헤더를 확인해 주세요.',
      );
    }

    const out: Array<{
      excelRow: number;
      phoneRaw: string;
      phoneNorm: string;
      feeding?: string | null;
      livestockCol?: string | null;
      operationCol?: string | null;
      herdCount?: number | null;
      remarks?: string | null;
      ceo?: string | null;
      companyName?: string | null;
      address?: string | null;
    }> = [];

    for (let i = best.headerRowIdx + 1; i < best.aoa.length; i++) {
      const rowObj = this.buildRowRecordFromAoA(best.aoa, best.headerRowIdx, i);
      if (this.isEffectivelyEmptyImportRow(rowObj)) continue;
      out.push(this.parseEventSmsRowObject(rowObj, i + 1));
    }
    return { sheetName: best.sheetName, rows: out };
  }

  private async findCustomersByPhoneVariants(variants: string[]): Promise<Customer[]> {
    if (variants.length === 0) return [];
    return this.customersRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.operations', 'operations')
      .where(
        "regexp_replace(COALESCE(c.cu_phone, ''), '[^0-9]', '', 'g') IN (:...variants)",
        { variants },
      )
      .getMany();
  }

  async previewEventSmsCustomerImport(buffer: Buffer) {
    const { sheetName, rows } = this.parseEventSmsExcelRows(buffer);
    const [feedingCodes, operationTypeCodes, operationSubCodes] = await Promise.all([
      this.codesService.findByCategory('FEEDING_METHOD'),
      this.codesService.findByCategory('OPERATION_TYPE'),
      this.codesService.findByCategory('OPERATION_SUBTYPE'),
    ]);
    const feedingValToName = new Map(
      feedingCodes.map((c) => [c.value ?? '', c.name] as const),
    );

    const seenPhone = new Set<string>();
    const updates: unknown[] = [];
    const creates: unknown[] = [];
    const skipped: unknown[] = [];

    for (const r of rows) {
      const excelSnapshot = {
        feeding: r.feeding ?? null,
        livestock: r.livestockCol ?? null,
        operation: r.operationCol ?? null,
        herdCount: r.herdCount ?? null,
        remarks: r.remarks ?? null,
        ceo: r.ceo ?? null,
        companyName: r.companyName ?? null,
        address: r.address ?? null,
      };

      if (!r.phoneNorm || r.phoneNorm.length < 8) {
        skipped.push({
          kind: 'no_phone',
          excelRow: r.excelRow,
          phone: r.phoneRaw || null,
          excel: excelSnapshot,
          reason: '유효한 전화번호가 없습니다.',
        });
        continue;
      }

      if (seenPhone.has(r.phoneNorm)) {
        skipped.push({
          kind: 'duplicate_row',
          excelRow: r.excelRow,
          phone: r.phoneRaw,
          excel: excelSnapshot,
          reason: '같은 파일에서 위에 이미 동일 번호가 있습니다. 첫 행만 처리합니다.',
        });
        continue;
      }
      seenPhone.add(r.phoneNorm);

      const variants = this.eventSmsPhoneMatchVariants(r.phoneNorm);
      const matches = await this.findCustomersByPhoneVariants(variants);

      if (matches.length > 1) {
        skipped.push({
          kind: 'ambiguous_db',
          excelRow: r.excelRow,
          phone: r.phoneRaw,
          excel: excelSnapshot,
          reason: '동일 번호로 DB에 여러 고객이 있어 자동 처리하지 않습니다.',
          matches: matches.map((c) => ({
            id: c.id,
            companyName: c.companyName ?? null,
            ceo: c.ceo ?? null,
            phone: c.phone ?? null,
          })),
        });
        continue;
      }

      const feedingImport = r.feeding
        ? this.resolveEventSmsFeedingImport(r.feeding, feedingCodes)
        : null;
      const emptyOp = {
        mallLivestockTypes: [] as string[],
        mallOperationMethods: [] as string[],
        unmatchedTokens: [] as string[],
      };
      const resolvedLivestock = r.livestockCol
        ? this.resolveEventSmsOperationImportColumn(r.livestockCol, operationTypeCodes, operationSubCodes)
        : emptyOp;
      const resolvedOperation = r.operationCol
        ? this.resolveEventSmsOperationImportColumn(r.operationCol, operationTypeCodes, operationSubCodes)
        : emptyOp;
      const operationColResolved = this.mergeEventSmsOperationResolutions(resolvedLivestock, resolvedOperation);
      const operationColRecognized =
        operationColResolved.mallLivestockTypes.length > 0 ||
        operationColResolved.mallOperationMethods.length > 0;

      const warnings: string[] = [];
      if (r.feeding && !feedingImport) {
        warnings.push(
          `급여방식 "${r.feeding}"을(를) 인식하지 못했습니다. (직접/직접급여→직접급여, 배합기→자가배합(배합기), TMR/TMF→TMF) 원문을 급여방식(원문) 필드에 넣습니다.`,
        );
      }
      const opWarnSource = [r.livestockCol, r.operationCol].filter(Boolean).join(',') || undefined;
      if (opWarnSource) {
        const tokens = this.splitEventSmsOperationColTokens(opWarnSource);
        if (tokens.length > 0 && !operationColRecognized) {
          warnings.push(
            `축종·운영 열 "${opWarnSource.slice(0, 120)}${opWarnSource.length > 120 ? '…' : ''}"에서 인식할 토큰을 찾지 못했습니다. 원문을 운영방식(원문)에 넣습니다.`,
          );
        } else if (operationColResolved.unmatchedTokens.length > 0) {
          warnings.push(
            `축종·운영 열 일부만 인식했습니다(미인식: ${operationColResolved.unmatchedTokens.join(', ')}).`,
          );
        }
      }

      if (matches.length === 0) {
        const willApply: Record<string, unknown> = {};
        if (feedingImport) {
          willApply.feeding = feedingImport.feedingName;
          willApply.feedingMethod = feedingImport.feedingMethod;
        } else if (r.feeding) {
          willApply.feedingMethodRaw = r.feeding;
        }
        if (r.herdCount != null) willApply.livestockCount = r.herdCount;
        if (r.remarks) willApply.remarks = r.remarks;
        if (r.ceo?.trim()) willApply.ceo = r.ceo.trim();
        {
          const cn = this.eventSmsResolveCompanyName(r.companyName, r.ceo);
          if (cn) willApply.companyName = cn;
        }
        if (r.address) {
          Object.assign(willApply, await this.eventSmsResolveAddressFields(r.address));
        }
        if (operationColResolved.mallLivestockTypes.length > 0) {
          willApply.livestockTypes = operationColResolved.mallLivestockTypes.join(',');
        }
        if (operationColResolved.mallOperationMethods.length > 0) {
          willApply.operationMethod = operationColResolved.mallOperationMethods.join(',');
        } else if (r.operationCol?.trim() && !operationColRecognized) {
          willApply.operationMethodRaw = r.operationCol.trim();
        }

        creates.push({
          excelRow: r.excelRow,
          phone: r.phoneRaw,
          excel: excelSnapshot,
          willApply,
          warnings,
        });
        continue;
      }

      const customer = matches[0];
      const patch: UpdateCustomerDto = {};
      if (feedingImport) {
        patch.feeding = feedingImport.feedingName;
        (patch as any).feedingMethod = feedingImport.feedingMethod;
      } else if (r.feeding) {
        (patch as any).feedingMethod = r.feeding.trim();
      }
      if (r.herdCount != null) {
        (patch as any).livestockCount = r.herdCount;
      }
      if (r.remarks) {
        patch.remarks = r.remarks;
      }
      if (r.ceo?.trim()) {
        patch.ceo = r.ceo.trim();
      }
      {
        const cn = this.eventSmsResolveCompanyName(r.companyName, r.ceo);
        if (cn) patch.companyName = cn;
      }
      if (r.address) {
        Object.assign(patch, await this.eventSmsResolveAddressFields(r.address));
      }
      if (operationColResolved.mallLivestockTypes.length > 0) {
        (patch as any).livestockTypes = operationColResolved.mallLivestockTypes.join(',');
      }
      if (operationColResolved.mallOperationMethods.length > 0) {
        (patch as any).operationMethod = operationColResolved.mallOperationMethods.join(',');
      } else if (r.operationCol?.trim() && !operationColRecognized) {
        (patch as any).operationMethod = r.operationCol.trim();
      }

      if (Object.keys(patch).length === 0) {
        skipped.push({
          kind: 'no_excel_changes',
          excelRow: r.excelRow,
          phone: r.phoneRaw,
          excel: excelSnapshot,
          reason: '전화번호는 일치하지만 엑셀에 갱신할 값(급여·축종/운영·두수·비고·이름·농장명·주소)이 없습니다.',
        });
        continue;
      }

      const feedingLabel =
        feedingValToName.get(customer.feeding ?? '') ?? customer.feeding ?? null;
      const current = {
        companyName: customer.companyName ?? null,
        ceo: customer.ceo ?? null,
        phone: customer.phone ?? null,
        feeding: feedingLabel,
        operationSummary: this.eventSmsOperationSummary(customer, operationTypeCodes),
        livestockCount: customer.livestockCount ?? null,
        remarks: customer.remarks ?? null,
        address: customer.address ?? null,
      };

      updates.push({
        excelRow: r.excelRow,
        phone: r.phoneRaw,
        customerId: customer.id,
        excel: excelSnapshot,
        current,
        willApply: patch,
        warnings,
      });
    }

    return {
      sheetName,
      totalRows: rows.length,
      summary: {
        updateCount: updates.length,
        createCount: creates.length,
        skippedCount: skipped.length,
      },
      updates,
      creates,
      skipped,
    };
  }

  async applyEventSmsCustomerImport(buffer: Buffer) {
    const preview = await this.previewEventSmsCustomerImport(buffer);
    let updated = 0;
    let created = 0;
    const errors: Array<{ excelRow: number; phone?: string; message: string }> = [];

    for (const item of preview.updates as Array<{
      excelRow: number;
      phone: string;
      customerId: string;
      willApply: UpdateCustomerDto;
    }>) {
      try {
        await this.update(item.customerId, item.willApply);
        updated += 1;
      } catch (e: any) {
        errors.push({
          excelRow: item.excelRow,
          phone: item.phone,
          message: e?.message ?? String(e),
        });
      }
    }

    for (const item of preview.creates as Array<{
      excelRow: number;
      phone: string;
      willApply: Record<string, unknown>;
    }>) {
      try {
        const w = item.willApply;
        const dto: CreateCustomerDto = {
          phone: item.phone,
          customerType: '농가',
          companyName: (w.companyName as string) ?? undefined,
          ceo: (w.ceo as string) ?? undefined,
          address: (w.address as string) ?? undefined,
          addressRoad: (w.addressRoad as string) ?? undefined,
          addressJibun: (w.addressJibun as string) ?? undefined,
          addressDefaultType: (w.addressDefaultType as string) ?? undefined,
          remarks: (w.remarks as string) ?? undefined,
          feeding: (w.feeding as string) ?? undefined,
          feedingMethod: (() => {
            const fm = (w.feedingMethod ?? w.feedingMethodRaw) as string | undefined;
            const t = fm?.trim();
            return t ? t : undefined;
          })(),
          livestockTypes: (w.livestockTypes as string) ?? undefined,
          operationMethod:
            (w.operationMethod as string) ?? (w.operationMethodRaw as string) ?? undefined,
          livestockCount: (w.livestockCount as number) ?? undefined,
          operations: (w.operations as CreateCustomerDto['operations']) ?? undefined,
        };
        await this.create(dto);
        created += 1;
      } catch (e: any) {
        errors.push({
          excelRow: item.excelRow,
          phone: item.phone,
          message: e?.message ?? String(e),
        });
      }
    }

    return {
      ...preview.summary,
      updated,
      created,
      skipped: preview.skipped.length,
      errors,
    };
  }

  /** 고객 화면 「농장/축산 정보」 — 엑셀 다운로드 한글 라벨 (프론트와 동일) */
  private static readonly FARM_LIVESTOCK_TYPE_LABELS: Record<string, string> = {
    HANWOO: '한우',
    NAKWOO: '낙우',
    YUKWOO: '육우',
    ETC: '기타',
  };

  private static readonly FARM_OPERATION_METHOD_LABELS: Record<string, string> = {
    BREEDING: '번식',
    FATTENING: '비육',
    RAISING: '육성',
    BATCH: '일괄',
    MILKING: '착유',
  };

  private static readonly FARM_FEEDING_METHOD_LABELS: Record<string, string> = {
    SELF_MIX: '자가배합(배합기)',
    DIRECT: '직접급여',
    TMF: 'TMF',
  };

  private formatFarmCommaSeparatedCodes(
    raw: string | null | undefined,
    labels: Record<string, string>,
  ): string {
    const s = raw?.trim();
    if (!s) return '-';
    const text = s
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .map((v) => labels[v] || labels[v.toUpperCase()] || v)
      .join(', ');
    return text || '-';
  }

  private formatFarmFeedingMethod(raw: string | null | undefined): string {
    const s = raw?.trim();
    if (!s) return '-';
    const key = s.toUpperCase();
    return CustomersService.FARM_FEEDING_METHOD_LABELS[key] || s;
  }

  private formatFarmLivestockCount(count: number | null | undefined): string {
    if (count === null || count === undefined || !Number.isFinite(count)) return '-';
    return `${new Intl.NumberFormat('ko-KR').format(Math.trunc(count))}두`;
  }

  // 엑셀 파일 생성 및 다운로드
  async exportToExcel(dto: GetCustomersDto): Promise<Buffer> {
    try {
      this.logger.log(`엑셀 다운로드 시작 - 필터: ${JSON.stringify(dto)}`);

      // 필터 조건에 맞는 모든 데이터 조회 (페이지네이션 없이)
      const queryBuilder = this.customersRepository.createQueryBuilder('customer');
    queryBuilder.leftJoinAndSelect('customer.regionEntity', 'region');
    queryBuilder.leftJoinAndSelect('customer.cityEntity', 'city');
    queryBuilder.leftJoinAndSelect('customer.operations', 'operations');
    queryBuilder.loadRelationCountAndMap(
      'customer.consultationCount',
      'customer.consultations',
    );

    // 필터링: region은 FK로, 나머지는 ca_name을 ca_value로 변환
    if (dto.region) {
      const regionEntity = await this.regionsService.findByName(dto.region);
      if (regionEntity) {
        queryBuilder.andWhere('customer.cu_region_id = :regionId', { regionId: regionEntity.id });
      }
    }

    if (dto.chamchamStatus || dto.species || dto.operation) {
      const [speciesCodes, operationCodes, chamchamCodes] = await Promise.all([
        dto.species ? this.codesService.findByCategory('SPECIES') : Promise.resolve([]),
        dto.operation ? this.codesService.findByCategory('OPERATION_TYPE') : Promise.resolve([]),
        dto.chamchamStatus ? this.codesService.findByCategory('CHAMCHAM_STATUS') : Promise.resolve([]),
      ]);

      const speciesCode = speciesCodes.find(
        (code) => code.name === dto.species || code.value === dto.species,
      );
      const operationCode = operationCodes.find(
        (code) => code.name === dto.operation || code.value === dto.operation,
      );
      const chamchamStatusCode = chamchamCodes.find(
        (code) => code.name === dto.chamchamStatus || code.value === dto.chamchamStatus,
      );

      if (chamchamStatusCode) {
        queryBuilder.andWhere('customer.chamchamStatus = :chamchamStatus', {
          chamchamStatus: chamchamStatusCode.value,
        });
      }

      if (speciesCode) {
        queryBuilder.andWhere('customer.species = :species', { species: speciesCode.value });
      }

      if (operationCode) {
        queryBuilder.andWhere('operations.operation = :operation', {
          operation: operationCode.value,
        });
      }
    }

    if (dto.operationSub) {
      const operationSubCodes = await this.codesService.findByCategory('OPERATION_SUBTYPE');
      const operationSubCode = operationSubCodes.find(
        (code) => code.name === dto.operationSub || code.value === dto.operationSub,
      );
      if (operationSubCode) {
        queryBuilder.andWhere('operations.operationSub = :operationSub', {
          operationSub: operationSubCode.value,
        });
      }
    }

    if (dto.search) {
      this.applyCustomerSearchFilter(queryBuilder, dto.search, 'export');
    }

    if (dto.customerType) {
      queryBuilder.andWhere('customer.cu_customer_type = :customerType', {
        customerType: dto.customerType,
      });
    }

    if (dto.customerGrade) {
      const gradeCodes = await this.codesService.findByCategory('CUSTOMER_GRADE');
      const gradeCode = gradeCodes.find(
        (code) => code.name === dto.customerGrade || code.value === dto.customerGrade,
      );
      const gradeValue = gradeCode?.value?.trim() || dto.customerGrade.trim();
      if (gradeValue) {
        queryBuilder.andWhere('customer.customerGrade = :customerGrade', {
          customerGrade: gradeValue,
        });
      }
    }

    if (dto.eventSmsResponded !== undefined && dto.eventSmsResponded !== null) {
      queryBuilder.andWhere('customer.eventSmsResponded = :eventSmsResponded', {
        eventSmsResponded: dto.eventSmsResponded,
      });
    }

    // 정렬
    const sortBy = dto.sortBy || 'createdAt';
    const sortOrder = dto.sortOrder || 'desc';
    const allowedSortColumns: Record<string, string> = {
      companyName: 'customer.companyName',
      ceo: 'customer.ceo',
      phone: 'customer.phone',
      postalCode: 'customer.postalCode',
      address: 'customer.address',
      addressDetail: 'customer.addressDetail',
      city: 'city.name',
      region: 'region.name',
      species: 'customer.species',
      operation: 'operations.operation',
      herdSize: 'customer.herdSize',
      feeding: 'customer.feeding',
      chamchamStatus: 'customer.chamchamStatus',
      customerType: 'customer.cu_customer_type',
      eventSmsResponded: 'customer.eventSmsResponded',
      createdAt: 'customer.createdAt',
      updatedAt: 'customer.updatedAt',
    };

    const sortColumn = allowedSortColumns[sortBy] ?? allowedSortColumns.createdAt;
    if (sortBy === 'consultationCount') {
      const consultationCountExpr =
        '(SELECT COUNT(1) FROM tb_consultation consultation WHERE consultation.cu_id = customer.cu_id)';
      queryBuilder.orderBy(consultationCountExpr, sortOrder.toUpperCase() as 'ASC' | 'DESC');
    } else {
      queryBuilder.orderBy(sortColumn, sortOrder.toUpperCase() as 'ASC' | 'DESC');
    }

    const customers = await queryBuilder.getMany();

    // 코드 값을 이름으로 변환
    const transformedCustomers = await this.transformCodeValues(customers);

    // 전화번호 포맷팅 함수
    const formatPhoneForExcel = (phone?: string | null): string => {
      if (!phone) return '-';
      const digits = phone.replace(/[^0-9]/g, '');
      if (digits.startsWith('02')) {
        if (digits.length <= 5) return digits.replace(/(\d{2})(\d+)/, '$1-$2');
        return digits.replace(/(\d{2})(\d{3,4})(\d{4})/, '$1-$2-$3');
      }
      if (digits.length === 8) return digits.replace(/(\d{4})(\d{4})/, '$1-$2');
      if (digits.length === 9) return digits.replace(/(\d{2,3})(\d{3})(\d{4})/, '$1-$2-$3');
      if (digits.length >= 10) return digits.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
      return digits;
    };

    // 날짜 포맷팅 함수
    const formatDateForExcel = (value?: Date | null): string => {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    };

    const formatDefaultAddressForExcel = (customer: {
      addressRoad?: string | null;
      addressJibun?: string | null;
      addressDefaultType?: string | null;
    }): string => {
      const road = customer.addressRoad?.trim() || '';
      const jibun = customer.addressJibun?.trim() || '';
      const def = (customer.addressDefaultType?.trim() || '').toUpperCase();
      if (def === 'JIBUN' || def === 'J' || def === 'LOT') return jibun || road;
      return road || jibun;
    };

    // 엑셀 데이터 준비
    const excelData = transformedCustomers.map((customer: any) => {
      return {
        '업체명': customer.companyName || '-',
        '대표자': customer.ceo || '-',
        '전화번호': formatPhoneForExcel(customer.phone),
        '우편번호': customer.postalCode || '-',
        '주소': formatDefaultAddressForExcel(customer) || '-',
        '도로명주소': customer.addressRoad?.trim() || '-',
        '지번주소': customer.addressJibun?.trim() || '-',
        '상세주소': customer.addressDetail || '-',
        '축종': this.formatFarmCommaSeparatedCodes(
          customer.livestockTypes,
          CustomersService.FARM_LIVESTOCK_TYPE_LABELS,
        ),
        '운영방식': this.formatFarmCommaSeparatedCodes(
          customer.operationMethod,
          CustomersService.FARM_OPERATION_METHOD_LABELS,
        ),
        '급여방식': this.formatFarmFeedingMethod(customer.feedingMethod),
        '두수': this.formatFarmLivestockCount(customer.livestockCount),
        '참참상태': customer.chamchamStatus || '-',
        '신규몰참참회원': customer.chamcharmMemberStatus || '-',
        '비고': customer.remarks?.trim() || '-',
        '등록일': formatDateForExcel(customer.createdAt),
      };
    });

    // 워크북 생성
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // 컬럼 너비 설정
    const columnWidths = [
      { wch: 20 }, // 업체명
      { wch: 15 }, // 대표자
      { wch: 15 }, // 전화번호
      { wch: 12 }, // 우편번호
      { wch: 40 }, // 주소
      { wch: 40 }, // 도로명주소
      { wch: 40 }, // 지번주소
      { wch: 30 }, // 상세주소
      { wch: 18 }, // 축종
      { wch: 20 }, // 운영방식
      { wch: 18 }, // 급여방식
      { wch: 12 }, // 두수
      { wch: 15 }, // 참참상태
      { wch: 16 }, // 신규몰 참참회원
      { wch: 40 }, // 비고
      { wch: 15 }, // 등록일
    ];
    worksheet['!cols'] = columnWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, '고객 관리');

    // 버퍼로 변환
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    this.logger.log(`엑셀 다운로드 완료 - 총 ${transformedCustomers.length}개 데이터`);

    return buffer;
    } catch (error: any) {
      this.logger.error('엑셀 다운로드 오류:', error);
      throw error;
    }
  }
}


