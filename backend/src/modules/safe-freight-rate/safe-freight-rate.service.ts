import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promises as fs } from 'fs';
import { statSync } from 'fs';
import * as XLSX from 'xlsx';
import { PdfTableExtractor } from './pdf-table-extractor';

// pdf-parse는 CommonJS 모듈이므로 require 사용
const pdfParse = require('pdf-parse');
import { SafeFreightRate } from './entities/safe-freight-rate.entity';
import { Code } from '../codes/entities/code.entity';

interface ParsedRateRow {
  port?: string; // 항구명 (표 제목에서 추출)
  region: string; // 시·도
  city: string; // 시·군·구
  town: string; // 읍·면·동
  distanceKm: number; // 구간거리 (km)
  rates40FT: {
    safeConsignmentRate: number; // 안전위탁운임
    carrierRate: number; // 운수사업자간운임
    safeTransportRate: number; // 안전운송운임
  };
  rates20FT: {
    safeConsignmentRate: number;
    carrierRate: number;
    safeTransportRate: number;
  };
}

@Injectable()
export class SafeFreightRateService {
  private readonly logger = new Logger(SafeFreightRateService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(SafeFreightRate)
    private safeFreightRateRepository: Repository<SafeFreightRate>,
    @InjectRepository(Code)
    private codeRepository: Repository<Code>,
  ) {}

  // 지역명 정규화 (더 이상 사용하지 않음 - DB에 전체 명칭으로 저장됨)
  // private normalizeRegion(region: string): string {
  //   return region
  //     .replace(/특별시$/, '')
  //     .replace(/광역시$/, '')
  //     .replace(/특별자치도$/, '')
  //     .replace(/특별자치시$/, '')
  //     .replace(/도$/, '')
  //     .trim();
  // }

  // 안전운임 요금표 조회
  async findAll(filters?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    regionName?: string;
    cityName?: string;
    townName?: string;
    portCodeId?: number;
    distanceKm?: number;
    effectiveDate?: Date;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;
    const sortBy = filters?.sortBy || 'createdAt';
    const sortOrder = filters?.sortOrder || 'desc';

    const query = this.safeFreightRateRepository
      .createQueryBuilder('sfr')
      .leftJoinAndSelect('sfr.portCode', 'portCode');

    if (filters?.regionName) {
      query.andWhere('sfr.regionName = :regionName', { regionName: filters.regionName });
    }

    if (filters?.cityName) {
      query.andWhere('sfr.cityName = :cityName', { cityName: filters.cityName });
    }

    if (filters?.townName) {
      query.andWhere('sfr.townName = :townName', { townName: filters.townName });
    }

    if (filters?.portCodeId) {
      query.andWhere('sfr.portCodeId = :portCodeId', {
        portCodeId: filters.portCodeId,
      });
    }

    if (filters?.distanceKm !== undefined && filters?.distanceKm !== null) {
      query.andWhere('sfr.distanceKm = :distanceKm', {
        distanceKm: filters.distanceKm,
      });
    }

    if (filters?.effectiveDate) {
      query.andWhere('sfr.effectiveFrom <= :effectiveDate', {
        effectiveDate: filters.effectiveDate,
      });
      query.andWhere(
        '(sfr.effectiveTo IS NULL OR sfr.effectiveTo >= :effectiveDate)',
        { effectiveDate: filters.effectiveDate },
      );
    }

    const orderColumn =
      sortBy === 'region' || sortBy === 'regionName'
        ? 'sfr.regionName'
        : sortBy === 'city' || sortBy === 'cityName'
          ? 'sfr.cityName'
          : sortBy === 'townName'
            ? 'sfr.townName'
            : sortBy === 'portCode'
              ? 'portCode.name'
              : sortBy === 'distanceKm'
                ? 'sfr.distanceKm'
                : sortBy === 'safeTransportRate'
                  ? 'sfr.safeTransportRate'
                  : sortBy === 'effectiveFrom'
                    ? 'sfr.effectiveFrom'
                    : 'sfr.createdAt';
    query.orderBy(orderColumn, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    const countQuery = query.clone();
    const total = await countQuery.getCount();

    const isKoreanTextSort =
      sortBy === 'region' || sortBy === 'regionName' || sortBy === 'city' || sortBy === 'cityName' || sortBy === 'townName' || sortBy === 'portCode';
    const inMemorySortLimit = 5000;

    let data: SafeFreightRate[];
    if (isKoreanTextSort && total > 0 && total <= inMemorySortLimit) {
      const allQuery = query.clone();
      const allData = await allQuery.getMany();
      const collator = new Intl.Collator('ko-KR');
      const getSortKey = (row: SafeFreightRate): string => {
        if (sortBy === 'region' || sortBy === 'regionName') return row.regionName ?? '';
        if (sortBy === 'city' || sortBy === 'cityName') return row.cityName ?? '';
        if (sortBy === 'townName') return row.townName ?? '';
        if (sortBy === 'portCode') return row.portCode?.name ?? '';
        return '';
      };
      allData.sort((a, b) => {
        const cmp = collator.compare(getSortKey(a), getSortKey(b));
        return sortOrder === 'asc' ? cmp : -cmp;
      });
      data = allData.slice(skip, skip + limit);
    } else {
      data = await query.skip(skip).take(limit).getMany();
    }

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // 안전운임 요금표 생성
  async create(data: Partial<SafeFreightRate>) {
    const rate = this.safeFreightRateRepository.create(data);
    return this.safeFreightRateRepository.save(rate);
  }

  // 안전운임 요금표 업데이트
  async update(id: number, data: Partial<SafeFreightRate>) {
    await this.safeFreightRateRepository.update(id, data);
    return this.findOne(id);
  }

  // 안전운임 요금표 조회 (단일)
  async findOne(id: number) {
    return this.safeFreightRateRepository.findOne({
      where: { id },
      relations: ['portCode'],
    });
  }

  // 안전운임 요금표 삭제
  async remove(id: number) {
    await this.safeFreightRateRepository.delete(id);
  }

  // distinct 거리(km) 목록 조회 (필터용)
  async getDistanceKmList(): Promise<number[]> {
    const results = await this.safeFreightRateRepository
      .createQueryBuilder('sfr')
      .select('DISTINCT sfr.distanceKm', 'distanceKm')
      .where('sfr.distanceKm IS NOT NULL')
      .orderBy('sfr.distanceKm', 'ASC')
      .getRawMany();
    return results.map((r) => Number(r.distanceKm)).filter((n) => !Number.isNaN(n));
  }

  // 특정 지역/시군구의 동명 목록 조회 (안전운임 요금표에 있는 동명만). 한글 자모 순 정렬.
  async getTownNames(regionName: string, cityName: string) {
    const results = await this.safeFreightRateRepository
      .createQueryBuilder('sfr')
      .select('DISTINCT sfr.townName', 'townName')
      .where('sfr.regionName = :regionName', { regionName })
      .andWhere('sfr.cityName = :cityName', { cityName })
      .getRawMany();

    const names = results.map((r) => r.townName).filter((n): n is string => n != null);
    names.sort((a, b) => new Intl.Collator('ko-KR').compare(a, b));
    return names;
  }

  // 필터용: 요금표에 등장하는 지역(시·도) 목록. 한글 자모 순.
  async getRegionNames(): Promise<string[]> {
    const results = await this.safeFreightRateRepository
      .createQueryBuilder('sfr')
      .select('DISTINCT sfr.regionName', 'regionName')
      .where('sfr.regionName != :empty', { empty: '' })
      .getRawMany();
    const names = results.map((r) => r.regionName).filter((n): n is string => n != null);
    names.sort((a, b) => new Intl.Collator('ko-KR').compare(a, b));
    return names;
  }

  // 필터용: 특정 지역의 시군구 목록. 한글 자모 순.
  async getCityNames(regionName: string): Promise<string[]> {
    if (!regionName) return [];
    const results = await this.safeFreightRateRepository
      .createQueryBuilder('sfr')
      .select('DISTINCT sfr.cityName', 'cityName')
      .where('sfr.regionName = :regionName', { regionName })
      .andWhere('sfr.cityName != :empty', { empty: '' })
      .getRawMany();
    const names = results.map((r) => r.cityName).filter((n): n is string => n != null);
    names.sort((a, b) => new Intl.Collator('ko-KR').compare(a, b));
    return names;
  }

  // PDF에서 안전운임 요금표 데이터 추출 및 import (라이브러리 기반)
  async importFromPdf(
    pdfPath: string,
    effectiveFrom: Date,
    effectiveTo?: Date | null,
  ): Promise<{ imported: number; skipped: number; errors: number }> {
    this.logger.log(`PDF 파일에서 안전운임 요금표 데이터 추출 시작: ${pdfPath}`);

    // 0. 파일 크기 확인
    const fileStats = statSync(pdfPath);
    const fileSizeMB = fileStats.size / (1024 * 1024);
    this.logger.log(`PDF 파일 크기: ${fileSizeMB.toFixed(2)}MB`);

    // 1. 기존 데이터 모두 삭제
    await this.safeFreightRateRepository.clear();
    this.logger.log('기존 안전운임 요금표 데이터 삭제 완료');

    // 2. PDF 파일 읽기
    this.logger.log('PDF 파일 읽기 시작');
    const pdfBuffer = await fs.readFile(pdfPath);

    // 3. PDF에서 표 추출
    this.logger.log('PDF 표 추출 시작');
    const extractStart = Date.now();
    const tables = await PdfTableExtractor.extractTablesFromPdf(pdfBuffer);
    const extractDuration = Date.now() - extractStart;
    this.logger.log(`표 추출 완료 - 소요 시간: ${extractDuration}ms`);

    if (tables.length === 0) {
      throw new Error('PDF에서 표를 찾을 수 없습니다.');
    }

    // PDF 텍스트를 줄 단위로 분리 (항구명 찾기용)
    const pdfData = await require('pdf-parse')(pdfBuffer);
    const pdfLines = pdfData.text.split('\n').map((line: string) => line.trim()).filter((line: string) => line.length > 0);

    // 4. 각 표를 파싱하여 데이터 추출
    let allParsedRows: ParsedRateRow[] = [];
    
    for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
      const table = tables[tableIndex];
      
      // 표 유형 확인 (거리별 vs 항구별)
      let isDistanceType = false;
      let portName: string | undefined;
      
      // 1) 표 앞의 몇 줄에서 표 유형과 항구명 찾기
      if (table.startLineIndex !== undefined) {
        const startIndex = table.startLineIndex;
        // 표 앞 30줄까지 확인 (범위 확대)
        const searchStart = Math.max(0, startIndex - 30);
        const searchEnd = Math.min(startIndex + 5, pdfLines.length); // 표 시작 후 몇 줄도 확인
        
        this.logger.log(`표 ${tableIndex + 1} 검색 범위: ${searchStart} ~ ${searchEnd} (startLineIndex: ${startIndex})`);
        
        for (let i = searchStart; i < searchEnd; i++) {
          const line = pdfLines[i];
          
          // 거리별 표 확인 (더 넓은 패턴)
          if (line.includes('거리별') || line.includes('구간거리별') || line.includes('거리') && line.includes('별')) {
            isDistanceType = true;
            this.logger.log(`표 ${tableIndex + 1}은 거리별 표로 확인됨 (줄 ${i + 1}: "${line}")`);
            break;
          }
          
          // 항구명 패턴 찾기 (예: "부산신항기점", "부산북항", "인천항" 등)
          const portMatch = line.match(/([가-힣]{2,5}(?:신항|북항|항|항기점))/);
          if (portMatch) {
            let candidate = portMatch[1];
            // "기점" 제거
            candidate = candidate.replace('기점', '');
            // 조항, 할증 등 제외
            if (!candidate.includes('조항') && 
                !candidate.includes('할증') && 
                !candidate.includes('부대') &&
                candidate.length <= 5) {
              portName = candidate;
              this.logger.log(`표 ${tableIndex + 1} 항구명 찾음 (줄 ${i + 1}: "${line}" -> ${portName})`);
              break;
            }
          }
        }
      }
      
      // 2) 표의 첫 몇 행에서 항구명 찾기 (표 데이터에 포함된 경우)
      if (!portName && !isDistanceType) {
        for (let i = 0; i < Math.min(3, table.rows.length); i++) {
          const row = table.rows[i];
          for (const cell of row.cells) {
            // 항구명 패턴 찾기 (예: "부산북항", "인천항" 등)
            const portMatch = cell.match(/([가-힣]{2,5}항)/);
            if (portMatch) {
              const candidate = portMatch[1];
              // 조항, 할증 등 제외
              if (!candidate.includes('조항') && 
                  !candidate.includes('할증') && 
                  !candidate.includes('부대') &&
                  candidate.length <= 5) {
                portName = candidate;
                break;
              }
            }
          }
          if (portName) break;
        }
      }
      
      // 거리별 표가 아니고 항구명이 없으면 업로드 중단
      if (!isDistanceType && !portName) {
        throw new Error(`표 ${tableIndex + 1}에서 항구명을 찾을 수 없습니다. PDF 형식을 확인하거나 항구 코드를 먼저 추가해주세요.`);
      }
      
      if (isDistanceType) {
        this.logger.log(`표 ${tableIndex + 1} 파싱 시작 - 거리별 표`);
      } else {
        this.logger.log(`표 ${tableIndex + 1} 파싱 시작 - 항구: ${portName}`);
      }
      
      // 표 데이터 파싱 (거리별 표인 경우 portName을 undefined로 전달)
      const parsedRows = PdfTableExtractor.parseSafeFreightRateTable(table, isDistanceType ? undefined : portName);
      
      // 파싱된 행을 ParsedRateRow 형식으로 변환
      for (const parsedRow of parsedRows) {
        const cells = parsedRow.cells;
        const numbers = parsedRow.numbers;
        
        // 셀에서 요금 정보 추출
        // numbers 배열은 주소 필드 이후의 숫자들: [거리, 40FT 안전위탁, 40FT 운수사업자간, 40FT 안전운송, 20FT 안전위탁, 20FT 운수사업자간, 20FT 안전운송]
        if (numbers.length >= 7) {
          // 40FT와 20FT 모두 있는 경우
          const row: ParsedRateRow = {
            port: portName,
            region: parsedRow.region,
            city: parsedRow.city,
            town: parsedRow.town,
            distanceKm: parsedRow.distanceKm || numbers[0],
            rates40FT: {
              safeConsignmentRate: numbers[1] || 0,
              carrierRate: numbers[2] || 0,
              safeTransportRate: numbers[3] || 0,
            },
            rates20FT: {
              safeConsignmentRate: numbers[4] || 0,
              carrierRate: numbers[5] || 0,
              safeTransportRate: numbers[6] || 0,
            },
          };
          allParsedRows.push(row);
        } else if (numbers.length >= 4) {
          // 40FT만 있는 경우
          const row: ParsedRateRow = {
            port: portName,
            region: parsedRow.region,
            city: parsedRow.city,
            town: parsedRow.town,
            distanceKm: parsedRow.distanceKm || numbers[0],
            rates40FT: {
              safeConsignmentRate: numbers[1] || 0,
              carrierRate: numbers[2] || 0,
              safeTransportRate: numbers[3] || 0,
            },
            rates20FT: {
              safeConsignmentRate: 0,
              carrierRate: 0,
              safeTransportRate: 0,
            },
          };
          allParsedRows.push(row);
        }
      }
      
      this.logger.log(`표 ${tableIndex + 1} 파싱 완료 - ${parsedRows.length}개 행 추출`);
    }

    this.logger.log(`전체 파싱된 행 수: ${allParsedRows.length}개`);

    if (allParsedRows.length === 0) {
      throw new Error('PDF에서 데이터를 추출할 수 없습니다. PDF 형식을 확인해주세요.');
    }

    // 5. 항구 코드 맵 생성
    const portCodeMap = new Map<string, number>();
    const foundPorts = new Set<string>();
    
    for (const row of allParsedRows) {
      if (row.port) {
        foundPorts.add(row.port);
      }
    }
    
    this.logger.log(`발견된 항구: ${Array.from(foundPorts).join(', ')}`);
    
    // 항구 코드 조회 (DESTINATION_PORT 그룹에서 찾기)
    const missingPorts: string[] = [];
    
    for (const portName of foundPorts) {
      const portNameWithSuffix = portName.endsWith('항') ? portName : `${portName}항`;
      const portNameWithoutSuffix = portName.replace('항', '');
      
      let portCode = await this.codeRepository.findOne({
        where: { group: 'DESTINATION_PORT', name: portNameWithSuffix },
      });
      
      if (!portCode) {
        portCode = await this.codeRepository.findOne({
          where: { group: 'DESTINATION_PORT', name: portNameWithoutSuffix },
        });
      }
      
      if (!portCode) {
        portCode = await this.codeRepository
          .createQueryBuilder('code')
          .where('code.group = :group', { group: 'DESTINATION_PORT' })
          .andWhere('(code.name LIKE :name OR code.aliases LIKE :name)', {
            name: `%${portNameWithoutSuffix}%`,
          })
          .getOne();
      }
      
      if (portCode) {
        portCodeMap.set(portName, portCode.id);
        this.logger.log(`항구 코드 찾음: ${portName} -> ${portCode.id} (${portCode.name})`);
      } else {
        missingPorts.push(portName);
      }
    }
    
    // 항구 코드를 찾지 못한 항구가 있으면 업로드 중단
    if (missingPorts.length > 0) {
      throw new Error(
        `다음 항구의 코드를 찾을 수 없습니다: ${missingPorts.join(', ')}\n` +
        `항구 코드를 먼저 추가해주세요. (DESTINATION_PORT 그룹)`
      );
    }

    // 6. DB에 import
    const parsedRows = allParsedRows;

    // 7. DB에 import (GPT 파싱 결과 사용)
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of parsedRows) {
      try {
        if (!row.region?.trim() || !row.city?.trim() || !row.town?.trim()) {
          skipped++;
          continue;
        }

        // 항구 코드 찾기 (항구별 표인 경우에만 필수)
        let portCodeId: number | null = null;
        const isPortType = row.port && portCodeMap.has(row.port);
        if (isPortType) {
          portCodeId = portCodeMap.get(row.port)!;
        } else if (row.port) {
          this.logger.warn(`항구 코드를 찾을 수 없음: ${row.port} (${row.region} ${row.city} ${row.town})`);
          skipped++;
          continue;
        }

        if (row.rates40FT?.safeTransportRate) {
          const rate = this.safeFreightRateRepository.create({
            effectiveFrom,
            effectiveTo: effectiveTo || null,
            portCodeId,
            regionName: row.region.trim(),
            cityName: row.city.trim(),
            townName: row.town.trim(),
            distanceKm: row.distanceKm ?? null,
            containerSize: '40FT' as const,
            safeTransportRate: row.rates40FT.safeTransportRate,
          });
          await this.safeFreightRateRepository.save(rate);
          imported++;
        }
      } catch (error) {
        this.logger.error(
          `오류 발생: ${row.region} ${row.city} ${row.town}`,
          error,
        );
        errors++;
      }
    }

    this.logger.log(`Import 완료: 성공 ${imported}개, 건너뜀 ${skipped}개, 오류 ${errors}개`);

    // 임시 파일 삭제
    try {
      await fs.unlink(pdfPath);
      this.logger.log(`임시 파일 삭제 완료: ${pdfPath}`);
    } catch (error) {
      this.logger.warn(`임시 파일 삭제 실패: ${pdfPath}`, error);
    }

    return { imported, skipped, errors };
  }

  // Excel 시트 목록 조회 (업로드 후 시트 선택용)
  getExcelSheetNames(excelPath: string): string[] {
    const workbook = XLSX.readFile(excelPath, { type: 'file' });
    return workbook.SheetNames || [];
  }

  // Excel에서 안전운임 요금표 import (특정 시트(항구)만 - 기존 해당 항구 데이터 삭제 후 신규 import)
  async importFromExcel(
    excelPath: string,
    sheetName: string,
    effectiveFrom: Date,
    effectiveTo?: Date | null,
  ): Promise<{ imported: number; skipped: number; errors: number }> {
    this.logger.log(
      `Excel 파일에서 안전운임 요금표 추출 시작: ${excelPath}, 시트: ${sheetName}`,
    );

    // 1. 항구 코드 조회 (시트명 = 항구명)
    const portCodeMap = await this.resolvePortCode(sheetName);
    if (!portCodeMap) {
      throw new Error(
        `항구 코드를 찾을 수 없습니다: ${sheetName}\n` +
          `코드 관리에서 DESTINATION_PORT 그룹에 해당 항구를 추가해주세요.`,
      );
    }

    // 2. 해당 항구의 기존 데이터 삭제
    const deleted = await this.safeFreightRateRepository
      .createQueryBuilder()
      .delete()
      .where('sfr_port_code_id = :portCodeId', { portCodeId: portCodeMap })
      .execute();
    this.logger.log(
      `해당 항구(${sheetName}) 기존 데이터 ${deleted.affected || 0}건 삭제 완료`,
    );

    // 3. Excel 시트 읽기
    const workbook = XLSX.readFile(excelPath, { type: 'file', cellDates: false });
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`시트를 찾을 수 없습니다: ${sheetName}`);
    }

    // 4. 행 단위로 파싱 (헤더 1~2행, 데이터 3행부터)
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (let r = 2; r <= range.e.r; r++) {
      try {
        const cellA = worksheet[XLSX.utils.encode_cell({ r, c: 0 })];
        const cellB = worksheet[XLSX.utils.encode_cell({ r, c: 1 })];
        const cellC = worksheet[XLSX.utils.encode_cell({ r, c: 2 })];
        const cellD = worksheet[XLSX.utils.encode_cell({ r, c: 3 })]; // 구간거리(km)
        const cellG = worksheet[XLSX.utils.encode_cell({ r, c: 6 })]; // 40FT 안전운송운임

        const regionName = this.cellValue(cellA);
        const cityName = this.cellValue(cellB);
        const town = this.cellValue(cellC);

        if (!regionName || !cityName || !town) {
          skipped++;
          continue;
        }

        const safe40 = this.parseNumber(cellG);
        if (!safe40) {
          skipped++;
          continue;
        }

        const effectiveToVal = effectiveTo || null;
        const distanceKm = this.parseInt(cellD);

        const rate = this.safeFreightRateRepository.create({
          effectiveFrom,
          effectiveTo: effectiveToVal,
          portCodeId: portCodeMap,
          regionName: regionName.trim(),
          cityName: cityName.trim(),
          townName: town.trim(),
          distanceKm: distanceKm ?? null,
          containerSize: '40FT' as const,
          safeTransportRate: safe40,
        });
        await this.safeFreightRateRepository.save(rate);
        imported++;
      } catch (error) {
        this.logger.error(`행 ${r + 1} 처리 중 오류`, error);
        errors++;
      }
    }

    try {
      await fs.unlink(excelPath);
    } catch (e) {
      this.logger.warn(`임시 파일 삭제 실패: ${excelPath}`, e);
    }

    this.logger.log(
      `Excel import 완료: 성공 ${imported}건, 건너뜀 ${skipped}건, 오류 ${errors}건`,
    );
    return { imported, skipped, errors };
  }

  private cellValue(cell: { v?: unknown } | undefined): string {
    if (!cell || cell.v == null) return '';
    return String(cell.v).trim();
  }

  private parseNumber(cell: { v?: unknown } | undefined): number | null {
    if (!cell || cell.v == null) return null;
    const v = cell.v;
    if (typeof v === 'number' && !Number.isNaN(v)) return Math.round(v);
    if (typeof v === 'string') {
      const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
      return Number.isNaN(n) ? null : n;
    }
    return null;
  }

  private parseInt(cell: { v?: unknown } | undefined): number | null {
    if (!cell || cell.v == null) return null;
    const v = cell.v;
    if (typeof v === 'number' && !Number.isNaN(v)) return Math.round(v);
    if (typeof v === 'string') {
      const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
      return Number.isNaN(n) ? null : n;
    }
    return null;
  }

  private async resolvePortCode(sheetName: string): Promise<number | null> {
    const name1 = sheetName.endsWith('항') ? sheetName : `${sheetName}항`;
    const name2 = sheetName.replace(/항$/, '');
    let code = await this.codeRepository.findOne({
      where: { group: 'DESTINATION_PORT', name: name1 },
    });
    if (!code) {
      code = await this.codeRepository.findOne({
        where: { group: 'DESTINATION_PORT', name: name2 },
      });
    }
    if (!code) {
      code = await this.codeRepository
        .createQueryBuilder('code')
        .where('code.group = :group', { group: 'DESTINATION_PORT' })
        .andWhere('(code.name LIKE :n1 OR code.name LIKE :n2)', {
          n1: `%${name2}%`,
          n2: `%${sheetName}%`,
        })
        .getOne();
    }
    return code?.id ?? null;
  }

  // GPT 프롬프트 생성
  private buildSafeFreightRateExtractionPrompt(): string {
    return `안전운임 요금표 PDF에서 표 데이터를 추출해주세요.

표 구조:
- 각 행은 하나의 행선지(목적지)에 대한 요금 정보를 포함합니다.
- 표의 열은 다음과 같습니다:
  1. 시·도 (예: 서울특별시, 경기도, 부산광역시 등)
  2. 시·군·구 (예: 용산구, 노원구, 고양시 덕양구 등)
  3. 읍·면·동 (예: 용산2가동, 하계1동, 태장동 등)
  4. 구간거리 (km) - 숫자, 1자리부터 4자리까지 가능
  5. 40FT 컨테이너 안전위탁운임 (원)
  6. 40FT 컨테이너 운수사업자간운임 (원)
  7. 40FT 컨테이너 안전운송운임 (원)
  8. 20FT 컨테이너 안전위탁운임 (원)
  9. 20FT 컨테이너 운수사업자간운임 (원)
  10. 20FT 컨테이너 안전운송운임 (원)

각 표는 특정 항구(예: 부산북항, 부산신항, 인천항, 광양항 등)를 기준으로 구성되어 있습니다.
표 제목이나 헤더에서 항구 정보를 확인하고, 각 행의 데이터에 항구 정보를 포함해주세요.

반환 형식 (JSON):
{
  "rows": [
    {
      "port": "부산북항",  // 항구명 (표 제목에서 추출)
      "region": "서울특별시",  // 시·도
      "city": "용산구",  // 시·군·구 (특별시/광역시는 시/군 없이 구만 올 수 있음)
      "town": "용산2가동",  // 읍·면·동
      "distanceKm": 404,  // 구간거리 (km)
      "rates40FT": {
        "safeConsignmentRate": 882900,  // 안전위탁운임 (원, 쉼표 제거)
        "carrierRate": 924900,  // 운수사업자간운임 (원, 쉼표 제거)
        "safeTransportRate": 995700  // 안전운송운임 (원, 쉼표 제거)
      },
      "rates20FT": {
        "safeConsignmentRate": 775300,
        "carrierRate": 810800,
        "safeTransportRate": 870200
      }
    }
  ]
}

주의사항:
1. 숫자는 쉼표(천 단위 구분자)를 제거하고 정수로 변환해주세요.
2. 거리는 km 단위의 숫자입니다 (1자리부터 4자리까지 가능).
3. 모든 행의 데이터를 추출해주세요.
4. 표 제목에서 항구 정보를 추출하여 각 행에 포함해주세요.
5. 시·도, 시·군·구, 읍·면·동은 정확히 구분해주세요.`;
  }
}

