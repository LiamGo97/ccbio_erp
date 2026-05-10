import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Brackets } from 'typeorm';
import { promises as fs } from 'fs';
import * as XLSX from 'xlsx';
import { OrganicCertification } from './entities/organic-certification.entity';
import { CreateOrganicCertificationDto } from './dto/create-organic-certification.dto';
import { UpdateOrganicCertificationDto } from './dto/update-organic-certification.dto';
import { GetOrganicCertificationsDto } from './dto/get-organic-certifications.dto';

@Injectable()
export class OrganicCertificationService {
  private readonly logger = new Logger(OrganicCertificationService.name);

  constructor(
    @InjectRepository(OrganicCertification)
    private organicCertificationRepository: Repository<OrganicCertification>,
  ) {}

  // 전화번호 정규화 (숫자만 추출)
  private normalizePhone(phone?: string | null): string | null {
    if (!phone) {
      return null;
    }
    const digits = phone.replace(/[^0-9]/g, '');
    return digits.length > 0 ? digits : null;
  }

  // 날짜 범위 파싱 (예: "2025.03.29 ~ 2026.03.28")
  private parseDateRange(dateRange: string): { startDate: Date | null; endDate: Date | null } {
    if (!dateRange || typeof dateRange !== 'string') {
      return { startDate: null, endDate: null };
    }

    const parts = dateRange.split('~').map((s) => s.trim());
    if (parts.length !== 2) {
      return { startDate: null, endDate: null };
    }

    const parseDate = (dateStr: string): Date | null => {
      // "2025.03.29" 형식을 "2025-03-29"로 변환
      const normalized = dateStr.replace(/\./g, '-');
      const date = new Date(normalized);
      return isNaN(date.getTime()) ? null : date;
    };

    return {
      startDate: parseDate(parts[0]),
      endDate: parseDate(parts[1]),
    };
  }

  // 숫자 문자열 파싱 (쉼표 제거)
  private parseNumber(value: string | null | undefined): number | null {
    if (!value || typeof value !== 'string') {
      return null;
    }
    const cleaned = value.replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  // 정수 파싱
  private parseInt(value: string | null | undefined): number | null {
    if (!value || typeof value !== 'string') {
      return null;
    }
    const cleaned = value.replace(/,/g, '').trim();
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
  }

  async findAll(dto: GetOrganicCertificationsDto) {
    const page = dto.page || 1;
    const limit = dto.limit || 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.organicCertificationRepository.createQueryBuilder('oc');

    // 검색 필터
    if (dto.search) {
      const search = `%${dto.search.trim()}%`;
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('oc.certificationAgency LIKE :search', { search })
            .orWhere('oc.certificationNumber LIKE :search', { search })
            .orWhere('oc.companyName LIKE :search', { search })
            .orWhere('oc.producer LIKE :search', { search })
            .orWhere('oc.phone LIKE :search', { search })
            .orWhere('oc.address LIKE :search', { search })
            .orWhere('oc.mainProduct LIKE :search', { search });
        }),
      );
    }

    if (dto.certificationAgency) {
      queryBuilder.andWhere('oc.certificationAgency LIKE :agency', {
        agency: `%${dto.certificationAgency}%`,
      });
    }

    if (dto.certificationType) {
      queryBuilder.andWhere('oc.certificationType = :type', {
        type: dto.certificationType,
      });
    }

    if (dto.producer) {
      queryBuilder.andWhere('oc.producer LIKE :producer', {
        producer: `%${dto.producer}%`,
      });
    }

    if (dto.mainProduct) {
      queryBuilder.andWhere('oc.mainProduct LIKE :mainProduct', {
        mainProduct: `%${dto.mainProduct}%`,
      });
    }

    if (dto.region) {
      // 지역 필터: 지역명 매핑을 사용하여 검색 (다양한 지역명 변형 지원)
      const regionMap: Record<string, string[]> = {
        '서울특별시': ['서울특별시', '서울'],
        '부산광역시': ['부산광역시', '부산'],
        '대구광역시': ['대구광역시', '대구'],
        '인천광역시': ['인천광역시', '인천'],
        '광주광역시': ['광주광역시', '광주'],
        '대전광역시': ['대전광역시', '대전'],
        '울산광역시': ['울산광역시', '울산'],
        '세종특별자치시': ['세종특별자치시', '세종'],
        '경기도': ['경기도', '경기'],
        '강원특별자치도': ['강원특별자치도', '강원도', '강원'],
        '충청북도': ['충청북도', '충북'],
        '충청남도': ['충청남도', '충남'],
        '전라북도': ['전북특별자치도', '전라북도', '전북'], // 전북특별자치도도 전라북도로 검색
        '전라남도': ['전라남도', '전남'],
        '경상북도': ['경상북도', '경북'],
        '경상남도': ['경상남도', '경남'],
        '제주특별자치도': ['제주특별자치도', '제주도', '제주'],
      };

      const searchTerms = regionMap[dto.region] || [dto.region];

      queryBuilder.andWhere(
        new Brackets((qb) => {
          searchTerms.forEach((term, index) => {
            if (index === 0) {
              qb.where(`oc.address LIKE :region${index}`, { [`region${index}`]: `%${term}%` });
            } else {
              qb.orWhere(`oc.address LIKE :region${index}`, { [`region${index}`]: `%${term}%` });
            }
          });
        }),
      );
    }

    // 정렬
    const sortBy = dto.sortBy || 'createdAt';
    const sortOrder = dto.sortOrder || 'desc';
    const allowedSortColumns = [
      'createdAt',
      'certificationNumber',
      'companyName',
      'producer',
      'mainProduct',
      'certificationType',
      'deliveryDestination',
      'address',
      'certificationStartDate',
      'livestockCount',
      'cultivationAreaM2',
      'annualProductionTarget',
    ];
    if (allowedSortColumns.includes(sortBy)) {
      queryBuilder.orderBy(`oc.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');
    } else {
      queryBuilder.orderBy('oc.createdAt', 'DESC');
    }

    // 전체 개수
    const total = await queryBuilder.getCount();

    // 페이지네이션
    queryBuilder.skip(skip).take(limit);

    const data = await queryBuilder.getMany();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number) {
    const certification = await this.organicCertificationRepository.findOne({
      where: { id },
    });

    if (!certification) {
      throw new NotFoundException(`유기축산 인증 정보를 찾을 수 없습니다. (ID: ${id})`);
    }

    return certification;
  }

  async create(dto: CreateOrganicCertificationDto) {
    const certification = this.organicCertificationRepository.create({
      certificationAgency: dto.certificationAgency?.trim() || null,
      certificationNumber: dto.certificationNumber?.trim() || null,
      mainProduct: dto.mainProduct?.trim() || null,
      certificationType: dto.certificationType?.trim() || null,
      companyName: dto.companyName?.trim() || null,
      producer: dto.producer?.trim() || null,
      phone: this.normalizePhone(dto.phone),
      farmCount: dto.farmCount || 1,
      address: dto.address?.trim() || null,
      certificationStartDate: dto.certificationStartDate ? new Date(dto.certificationStartDate) : null,
      certificationEndDate: dto.certificationEndDate ? new Date(dto.certificationEndDate) : null,
      cultivationAreaM2: dto.cultivationAreaM2 || null,
      annualProductionTarget: dto.annualProductionTarget || null,
      livestockCount: dto.livestockCount || null,
      deliveryDestination: dto.deliveryDestination?.trim() || null,
      detailProducts: dto.detailProducts && dto.detailProducts.length > 0 ? dto.detailProducts : null,
    });

    return await this.organicCertificationRepository.save(certification);
  }

  async update(id: number, dto: UpdateOrganicCertificationDto) {
    const certification = await this.findOne(id);

    Object.assign(certification, {
      ...(dto.certificationAgency && { certificationAgency: dto.certificationAgency.trim() }),
      ...(dto.certificationNumber && { certificationNumber: dto.certificationNumber.trim() }),
      ...(dto.mainProduct !== undefined && { mainProduct: dto.mainProduct?.trim() || null }),
      ...(dto.certificationType !== undefined && { certificationType: dto.certificationType?.trim() || null }),
      ...(dto.companyName !== undefined && { companyName: dto.companyName?.trim() || null }),
      ...(dto.producer !== undefined && { producer: dto.producer?.trim() || null }),
      ...(dto.phone !== undefined && { phone: this.normalizePhone(dto.phone) }),
      ...(dto.farmCount !== undefined && { farmCount: dto.farmCount }),
      ...(dto.address !== undefined && { address: dto.address?.trim() || null }),
      ...(dto.certificationStartDate && {
        certificationStartDate: new Date(dto.certificationStartDate),
      }),
      ...(dto.certificationEndDate && {
        certificationEndDate: new Date(dto.certificationEndDate),
      }),
      ...(dto.cultivationAreaM2 !== undefined && { cultivationAreaM2: dto.cultivationAreaM2 }),
      ...(dto.annualProductionTarget !== undefined && {
        annualProductionTarget: dto.annualProductionTarget,
      }),
      ...(dto.livestockCount !== undefined && { livestockCount: dto.livestockCount }),
      ...(dto.deliveryDestination !== undefined && {
        deliveryDestination: dto.deliveryDestination?.trim() || null,
      }),
      ...(dto.detailProducts !== undefined && {
        detailProducts: dto.detailProducts && dto.detailProducts.length > 0 ? dto.detailProducts : null,
      }),
    });

    return await this.organicCertificationRepository.save(certification);
  }

  async remove(id: number) {
    const certification = await this.findOne(id);
    await this.organicCertificationRepository.remove(certification);
    return { success: true };
  }

  // Excel 파일에서 데이터 import
  async importFromExcel(excelPath: string): Promise<{ imported: number; skipped: number; errors: number }> {
    this.logger.log(`Excel 파일에서 유기축산 인증 데이터 추출 시작: ${excelPath}`);

    const workbook = XLSX.readFile(excelPath);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false });

    this.logger.log(`총 ${rows.length}개의 행을 찾았습니다.`);

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows as any[]) {
      try {
        // 필수 필드 확인 (생산자, 대표품목, 주소)
        if (!row['생산자'] || !row['대표품목'] || !row['주소']) {
          this.logger.warn(`필수 필드가 없어 건너뜀: ${JSON.stringify(row)}`);
          skipped++;
          continue;
        }

        // 날짜 범위 파싱
        const dateRange = this.parseDateRange(row['인증기간'] || '');

        // 숫자 필드 파싱
        const farmCount = 1; // 기본값 1 (Excel에 농가수 필드 없음)
        const cultivationAreaM2 = this.parseNumber(row['재배면적(㎡)']);
        const annualProductionTarget = this.parseNumber(row['연간 생산 목표 (유량)']);
        const livestockCount = this.parseInt(row['사육두수']);

        // 기존 데이터 확인 (생산자+주소+대표품목 조합으로)
        const producer = String(row['생산자']).trim();
        const address = String(row['주소']).trim();
        const mainProduct = String(row['대표품목']).trim();

        const existing = await this.organicCertificationRepository.findOne({
          where: {
            producer,
            address,
            mainProduct,
          },
        });

        const certificationData = {
          certificationAgency: null, // Excel에 없음
          certificationNumber: null, // Excel에 없음
          mainProduct,
          certificationType: row['인증분류'] ? String(row['인증분류']).trim() : null,
          producer,
          farmCount,
          address,
          certificationStartDate: dateRange.startDate,
          certificationEndDate: dateRange.endDate,
          cultivationAreaM2,
          annualProductionTarget,
          livestockCount,
        };

        if (existing) {
          // 업데이트
          Object.assign(existing, certificationData);
          await this.organicCertificationRepository.save(existing);
          this.logger.log(`업데이트: ${producer} - ${mainProduct}`);
        } else {
          // 새로 생성
          const certification = this.organicCertificationRepository.create(certificationData);
          await this.organicCertificationRepository.save(certification);
          imported++;
          this.logger.log(`생성: ${producer} - ${mainProduct}`);
        }
      } catch (error) {
        this.logger.error(`오류 발생: ${JSON.stringify(row)}`, error);
        errors++;
      }
    }

    this.logger.log(`Import 완료: 성공 ${imported}개, 업데이트 ${skipped}개, 오류 ${errors}개`);

    // 임시 파일 삭제
    try {
      await fs.unlink(excelPath);
      this.logger.log(`임시 파일 삭제 완료: ${excelPath}`);
    } catch (error) {
      this.logger.warn(`임시 파일 삭제 실패: ${excelPath}`, error);
    }

    return { imported, skipped, errors };
  }

  // 주소에서 지역(시/도) 추출
  private extractRegion(address: string | null | undefined): string | null {
    if (!address || typeof address !== 'string') {
      return null;
    }

    // 한국 시/도 목록 (표준명)
    const standardRegions = [
      '서울특별시',
      '부산광역시',
      '대구광역시',
      '인천광역시',
      '광주광역시',
      '대전광역시',
      '울산광역시',
      '세종특별자치시',
      '경기도',
      '강원특별자치도',
      '충청북도',
      '충청남도',
      '전라북도',
      '전라남도',
      '경상북도',
      '경상남도',
      '제주특별자치도',
    ];

    // 실제 주소에 사용되는 다양한 지역명 매핑 (표준명으로 변환)
    const regionVariants: Record<string, string> = {
      // 표준명
      '서울특별시': '서울특별시',
      '부산광역시': '부산광역시',
      '대구광역시': '대구광역시',
      '인천광역시': '인천광역시',
      '광주광역시': '광주광역시',
      '대전광역시': '대전광역시',
      '울산광역시': '울산광역시',
      '세종특별자치시': '세종특별자치시',
      '경기도': '경기도',
      '강원특별자치도': '강원특별자치도',
      '충청북도': '충청북도',
      '충청남도': '충청남도',
      '전북특별자치도': '전라북도', // 전북특별자치도 -> 전라북도로 매핑
      '전라북도': '전라북도',
      '전라남도': '전라남도',
      '경상북도': '경상북도',
      '경상남도': '경상남도',
      '제주특별자치도': '제주특별자치도',
      // 약칭
      서울: '서울특별시',
      부산: '부산광역시',
      대구: '대구광역시',
      인천: '인천광역시',
      광주: '광주광역시',
      대전: '대전광역시',
      울산: '울산광역시',
      세종: '세종특별자치시',
      경기: '경기도',
      강원: '강원특별자치도',
      충북: '충청북도',
      충남: '충청남도',
      전북: '전라북도',
      전남: '전라남도',
      경북: '경상북도',
      경남: '경상남도',
      제주: '제주특별자치도',
    };

    // 주소에서 지역명 찾기 (긴 이름부터 매칭)
    const sortedVariants = Object.keys(regionVariants).sort((a, b) => b.length - a.length);
    for (const variant of sortedVariants) {
      if (address.includes(variant)) {
        return regionVariants[variant];
      }
    }

    return null;
  }

  // 대표품목에서 품목 타입 추출 (젖소/한우)
  private extractProductType(mainProduct: string | null | undefined): '젖소' | '한우' | null {
    if (!mainProduct) return null;
    const product = mainProduct.toLowerCase();
    if (product.includes('젖소') || product.includes('시유')) return '젖소';
    if (product.includes('한우') || product.includes('식육')) return '한우';
    return null;
  }

  // 통계 조회
  async getStats() {
    const allCertifications = await this.organicCertificationRepository.find({
      select: ['farmCount', 'livestockCount', 'address', 'mainProduct'],
    });

    // 대표품목 목록 추출 (중복 제거, 정렬)
    const mainProducts = Array.from(
      new Set(
        allCertifications
          .map((cert) => cert.mainProduct)
          .filter((product): product is string => !!product),
      ),
    ).sort();

    // 전체 농가수 합계
    const totalFarmCount = allCertifications.reduce((sum, cert) => {
      return sum + (cert.farmCount || 0);
    }, 0);

    // 전체 사육두수 합계
    const totalLivestockCount = allCertifications.reduce((sum, cert) => {
      return sum + (cert.livestockCount || 0);
    }, 0);

    // 품목별 농가수 통계
    const farmCountByProduct = {
      전체: totalFarmCount,
      젖소: 0,
      한우: 0,
    };

    // 품목별 사육두수 통계
    const livestockCountByProduct = {
      전체: totalLivestockCount,
      젖소: 0,
      한우: 0,
    };

    for (const cert of allCertifications) {
      const productType = this.extractProductType(cert.mainProduct);
      if (productType === '젖소') {
        farmCountByProduct.젖소 += cert.farmCount || 0;
        livestockCountByProduct.젖소 += cert.livestockCount || 0;
      } else if (productType === '한우') {
        farmCountByProduct.한우 += cert.farmCount || 0;
        livestockCountByProduct.한우 += cert.livestockCount || 0;
      }
    }

    // 지역별 통계 (품목별 포함)
    const regionStatsMap = new Map<
      string,
      {
        farmCount: number;
        livestockCount: number;
        byProduct: {
          젖소: { farmCount: number; livestockCount: number };
          한우: { farmCount: number; livestockCount: number };
        };
      }
    >();

    for (const cert of allCertifications) {
      const region = this.extractRegion(cert.address) || '미지정';
      const productType = this.extractProductType(cert.mainProduct);
      const current = regionStatsMap.get(region) || {
        farmCount: 0,
        livestockCount: 0,
        byProduct: {
          젖소: { farmCount: 0, livestockCount: 0 },
          한우: { farmCount: 0, livestockCount: 0 },
        },
      };

      current.farmCount += cert.farmCount || 0;
      current.livestockCount += cert.livestockCount || 0;

      if (productType === '젖소') {
        current.byProduct.젖소.farmCount += cert.farmCount || 0;
        current.byProduct.젖소.livestockCount += cert.livestockCount || 0;
      } else if (productType === '한우') {
        current.byProduct.한우.farmCount += cert.farmCount || 0;
        current.byProduct.한우.livestockCount += cert.livestockCount || 0;
      }

      regionStatsMap.set(region, current);
    }

    // 지역별 통계를 배열로 변환
    const byRegion = Array.from(regionStatsMap.entries())
      .map(([region, stats]) => ({
        region,
        farmCount: stats.farmCount,
        livestockCount: stats.livestockCount,
        byProduct: stats.byProduct,
      }))
      .sort((a, b) => b.farmCount - a.farmCount); // 농가수 기준 내림차순 정렬

    return {
      totalFarmCount,
      totalLivestockCount,
      farmCountByProduct,
      livestockCountByProduct,
      byRegion,
      mainProducts, // 대표품목 목록 추가
    };
  }

  // 엑셀 파일 생성 및 다운로드
  async exportToExcel(dto: GetOrganicCertificationsDto): Promise<Buffer> {
    this.logger.log(`엑셀 다운로드 시작 - 필터: ${JSON.stringify(dto)}`);

    // 필터 조건에 맞는 모든 데이터 조회 (페이지네이션 없이)
    const queryBuilder = this.organicCertificationRepository.createQueryBuilder('oc');

    // 검색 필터
    if (dto.search) {
      const search = `%${dto.search.trim()}%`;
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('oc.certificationAgency LIKE :search', { search })
            .orWhere('oc.certificationNumber LIKE :search', { search })
            .orWhere('oc.companyName LIKE :search', { search })
            .orWhere('oc.producer LIKE :search', { search })
            .orWhere('oc.phone LIKE :search', { search })
            .orWhere('oc.address LIKE :search', { search })
            .orWhere('oc.mainProduct LIKE :search', { search });
        }),
      );
    }

    if (dto.certificationAgency) {
      queryBuilder.andWhere('oc.certificationAgency LIKE :agency', {
        agency: `%${dto.certificationAgency}%`,
      });
    }

    if (dto.certificationType) {
      queryBuilder.andWhere('oc.certificationType = :type', {
        type: dto.certificationType,
      });
    }

    if (dto.producer) {
      queryBuilder.andWhere('oc.producer LIKE :producer', {
        producer: `%${dto.producer}%`,
      });
    }

    if (dto.mainProduct) {
      queryBuilder.andWhere('oc.mainProduct LIKE :mainProduct', {
        mainProduct: `%${dto.mainProduct}%`,
      });
    }

    if (dto.region) {
      const regionMap: Record<string, string[]> = {
        '서울특별시': ['서울특별시', '서울'],
        '부산광역시': ['부산광역시', '부산'],
        '대구광역시': ['대구광역시', '대구'],
        '인천광역시': ['인천광역시', '인천'],
        '광주광역시': ['광주광역시', '광주'],
        '대전광역시': ['대전광역시', '대전'],
        '울산광역시': ['울산광역시', '울산'],
        '세종특별자치시': ['세종특별자치시', '세종'],
        '경기도': ['경기도', '경기'],
        '강원특별자치도': ['강원특별자치도', '강원도', '강원'],
        '충청북도': ['충청북도', '충북'],
        '충청남도': ['충청남도', '충남'],
        '전라북도': ['전북특별자치도', '전라북도', '전북'],
        '전라남도': ['전라남도', '전남'],
        '경상북도': ['경상북도', '경북'],
        '경상남도': ['경상남도', '경남'],
        '제주특별자치도': ['제주특별자치도', '제주도', '제주'],
      };

      const searchTerms = regionMap[dto.region] || [dto.region];

      queryBuilder.andWhere(
        new Brackets((qb) => {
          searchTerms.forEach((term, index) => {
            if (index === 0) {
              qb.where(`oc.address LIKE :region${index}`, { [`region${index}`]: `%${term}%` });
            } else {
              qb.orWhere(`oc.address LIKE :region${index}`, { [`region${index}`]: `%${term}%` });
            }
          });
        }),
      );
    }

    // 정렬
    const sortBy = dto.sortBy || 'createdAt';
    const sortOrder = dto.sortOrder || 'desc';
    const allowedSortColumns = [
      'createdAt',
      'certificationNumber',
      'companyName',
      'producer',
      'mainProduct',
      'certificationType',
      'deliveryDestination',
      'address',
      'certificationStartDate',
      'livestockCount',
      'cultivationAreaM2',
      'annualProductionTarget',
    ];
    if (allowedSortColumns.includes(sortBy)) {
      queryBuilder.orderBy(`oc.${sortBy}`, sortOrder.toUpperCase() as 'ASC' | 'DESC');
    } else {
      queryBuilder.orderBy('oc.createdAt', 'DESC');
    }

    const certifications = await queryBuilder.getMany();

    // 전화번호 포맷팅 함수 (목록 화면과 동일)
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

    // 날짜 포맷팅 함수 (목록 화면과 동일)
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

    // 숫자 포맷팅 함수 (목록 화면과 동일)
    const formatNumberForExcel = (value?: number | null): string => {
      if (value === null || value === undefined) return '-';
      return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(value);
    };

    // 엑셀 데이터 준비 (목록 화면 순서와 동일)
    const excelData = certifications.map((cert) => {
      const startDate = formatDateForExcel(cert.certificationStartDate);
      const endDate = formatDateForExcel(cert.certificationEndDate);
      const certificationPeriod = 
        startDate === '-' && endDate === '-' 
          ? '-' 
          : `${startDate} ~ ${endDate}`;

      return {
        '업체명': cert.companyName || '-',
        '대표자': cert.producer || '-',
        '전화번호': formatPhoneForExcel(cert.phone),
        '대표품목': cert.mainProduct || '-',
        '인증분류': cert.certificationType || '-',
        '주소': cert.address || '-',
        '인증기간': certificationPeriod,
        '사육두수': formatNumberForExcel(cert.livestockCount),
        '재배면적(㎡)': formatNumberForExcel(cert.cultivationAreaM2),
        '연간 생산 목표': formatNumberForExcel(cert.annualProductionTarget),
      };
    });

    // 워크북 생성
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // 컬럼 너비 설정 (목록 화면 순서와 동일)
    const columnWidths = [
      { wch: 20 }, // 업체명
      { wch: 15 }, // 대표자
      { wch: 15 }, // 전화번호
      { wch: 15 }, // 대표품목
      { wch: 12 }, // 인증분류
      { wch: 40 }, // 주소
      { wch: 25 }, // 인증기간
      { wch: 12 }, // 사육두수
      { wch: 15 }, // 재배면적(㎡)
      { wch: 20 }, // 연간 생산 목표
    ];
    worksheet['!cols'] = columnWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, '유기축산 인증');

    // 버퍼로 변환
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    this.logger.log(`엑셀 다운로드 완료 - 총 ${certifications.length}개 데이터`);

    return buffer;
  }
}

