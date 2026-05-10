import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';
import { LegalAdminMaster } from './entities/legal-admin-master.entity';

const EXPECTED_HEADERS = [
  '법정동코드',
  '시도명',
  '시군구명',
  '읍면동명',
  '리명',
  '순위',
  '생성일자',
  '삭제일자',
  '과거법정동코드',
] as const;

type RowRecord = Record<string, string>;

@Injectable()
export class LegalAdminMasterService {
  private readonly logger = new Logger(LegalAdminMasterService.name);

  constructor(
    @InjectRepository(LegalAdminMaster)
    private readonly repo: Repository<LegalAdminMaster>,
  ) {}

  async getSidoOptions(): Promise<{ code: string; name: string }[]> {
    const rows = await this.repo.query(
      `SELECT LEFT(lam_b_code::text, 2) AS code, MIN(lam_sido_name) AS name
       FROM tb_legal_admin_master
       WHERE lam_deleted_date_src IS NULL
       GROUP BY 1
       ORDER BY 1`,
    );
    return rows.map((r: { code: string; name: string }) => ({
      code: String(r.code).trim(),
      name: r.name ?? '',
    }));
  }

  async getSigunguOptions(sidoCode: string): Promise<{ code: string; name: string }[]> {
    const sc = sidoCode.replace(/\D/g, '').padStart(2, '0').slice(0, 2);
    const rows = await this.repo.query(
      `SELECT LEFT(lam_b_code::text, 5) AS code, MIN(lam_sigungu_name) AS name
       FROM tb_legal_admin_master
       WHERE lam_deleted_date_src IS NULL
         AND LEFT(lam_b_code::text, 2) = $1
         AND COALESCE(TRIM(lam_sigungu_name), '') <> ''
       GROUP BY 1
       ORDER BY 1`,
      [sc],
    );
    return rows.map((r: { code: string; name: string }) => ({
      code: String(r.code).trim(),
      name: r.name ?? '',
    }));
  }

  async findAll(params: {
    page: number;
    limit: number;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    sidoCode?: string;
    sigunguCode?: string;
    q?: string;
  }) {
    const { page, limit, sortOrder } = params;
    const qb = this.repo.createQueryBuilder('m');

    if (params.sidoCode?.trim()) {
      qb.andWhere('LEFT(m.lam_b_code::text, 2) = :sido', {
        sido: params.sidoCode.trim().padStart(2, '0').slice(0, 2),
      });
    }
    if (params.sigunguCode?.trim()) {
      qb.andWhere('LEFT(m.lam_b_code::text, 5) = :sg', {
        sg: params.sigunguCode.replace(/\D/g, '').padStart(5, '0').slice(0, 5),
      });
    }
    if (params.q?.trim()) {
      const kw = `%${params.q.trim()}%`;
      qb.andWhere(
        '(m.lam_b_code::text ILIKE :kw OR m.lam_sido_name ILIKE :kw OR m.lam_sigungu_name ILIKE :kw OR m.lam_eupmyeondong_name ILIKE :kw OR m.lam_ri_name ILIKE :kw)',
        { kw },
      );
    }

    const sortCol =
      params.sortBy === 'sidoName'
        ? 'm.lam_sido_name'
        : params.sortBy === 'sigunguName'
          ? 'm.lam_sigungu_name'
          : params.sortBy === 'eupmyeondongName'
            ? 'm.lam_eupmyeondong_name'
            : params.sortBy === 'updatedAt'
              ? 'm.lam_updated_at'
              : 'm.lam_b_code';

    qb.orderBy(sortCol, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    const [rows, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data = rows.map((r) => {
      const code = String(r.bCode).trim();
      return {
        ...r,
        bCode: code,
        sidoCode: code.slice(0, 2),
        sigunguCode: code.slice(0, 5),
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async importFromFile(
    filePath: string,
    originalName: string,
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const lower = originalName.toLowerCase();
    let records: RowRecord[];

    if (lower.endsWith('.csv')) {
      records = this.normalizeRecords(this.parseCsv(filePath));
    } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      records = this.normalizeRecords(this.parseXlsx(filePath));
    } else {
      throw new BadRequestException('CSV(.csv) 또는 Excel(.xlsx, .xls)만 업로드할 수 있습니다.');
    }

    if (!records.length) {
      throw new BadRequestException('파일에 데이터 행이 없습니다.');
    }
    this.validateHeaders(records[0]);

    const entities: LegalAdminMaster[] = [];
    const errors: string[] = [];
    let skipped = 0;

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const lineNo = i + 2;
      try {
        const ent = this.rowToEntity(row, lineNo);
        if (!ent) {
          skipped++;
          continue;
        }
        entities.push(ent);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (errors.length < 30) {
          errors.push(`${lineNo}행: ${msg}`);
        }
      }
    }

    const chunk = 300;
    for (let i = 0; i < entities.length; i += chunk) {
      const part = entities.slice(i, i + chunk);
      await this.repo.upsert(part, { conflictPaths: ['bCode'] });
    }

    this.logger.log(`법정동 마스터 import 완료: ${entities.length}건 upsert, skipped=${skipped}`);
    return { imported: entities.length, skipped, errors };
  }

  private parseCsv(filePath: string): RowRecord[] {
    const buf = readFileSync(filePath);
    let text = buf.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as RowRecord[];
    return records;
  }

  private parseXlsx(filePath: string): RowRecord[] {
    const wb = XLSX.readFile(filePath, { type: 'file', raw: false });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('Excel에 시트가 없습니다.');
    }
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<RowRecord>(sheet, {
      defval: '',
      raw: false,
    });
    return rows;
  }

  private normalizeRecords(records: RowRecord[]): RowRecord[] {
    return records.map((row) => {
      const out: RowRecord = {};
      for (const [k, v] of Object.entries(row)) {
        const nk = k.replace(/^\uFEFF/, '').trim();
        out[nk] = v === null || v === undefined ? '' : String(v).trim();
      }
      return out;
    });
  }

  private validateHeaders(sample: RowRecord) {
    const keys = Object.keys(sample).map((k) => k.replace(/^\uFEFF/, '').trim());
    const missing = EXPECTED_HEADERS.filter((h) => !keys.includes(h));
    if (missing.length) {
      throw new BadRequestException(
        `필수 컬럼이 없습니다: ${missing.join(', ')}. 국토부「전국 법정동」CSV 형식인지 확인하세요.`,
      );
    }
  }

  private rowToEntity(row: RowRecord, lineNo: number): LegalAdminMaster | null {
    const get = (k: string) => {
      const v = row[k];
      if (v === undefined || v === null) return '';
      return String(v).trim();
    };

    const rawCode = get('법정동코드').replace(/\D/g, '');
    if (!rawCode) {
      return null;
    }
    const bCode = rawCode.padStart(10, '0').slice(0, 10);
    if (bCode.length !== 10) {
      throw new Error(`법정동코드 자릿수 오류: ${get('법정동코드')}`);
    }

    const sidoName = get('시도명');
    if (!sidoName) {
      throw new Error('시도명이 비어 있습니다.');
    }

    const sortStr = get('순위');
    let sortRank: number | null = null;
    if (sortStr !== '') {
      const n = parseInt(sortStr, 10);
      if (!Number.isNaN(n)) {
        sortRank = n;
      }
    }

    const ent = new LegalAdminMaster();
    ent.bCode = bCode;
    ent.sidoName = sidoName;
    ent.sigunguName = get('시군구명');
    ent.eupmyeondongName = get('읍면동명');
    ent.riName = get('리명');
    ent.sortRank = sortRank;
    ent.createdDateSrc = this.parseDateOptional(get('생성일자'));
    ent.deletedDateSrc = this.parseDateOptional(get('삭제일자'));
    const legacy = get('과거법정동코드').replace(/\D/g, '');
    ent.legacyBCode = legacy ? legacy.padStart(10, '0').slice(0, 10) : null;

    return ent;
  }

  private parseDateOptional(s: string): Date | null {
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
      return null;
    }
    return d;
  }

  /**
   * 10자리 법정동코드 → 안전운임 등에서 쓰는 시·도 / 시·군·구 / 읍·면·동(리 포함) 표기.
   * `tb_legal_admin_master`에 없거나 삭제된 행이면 `null`.
   */
  async resolveAddressLabelsByLegalBCode(
    rawCode: string | null | undefined,
  ): Promise<{
    legalBCode: string;
    regionName: string;
    cityName: string;
    townName: string;
  } | null> {
    const digits = String(rawCode ?? '').replace(/\D/g, '');
    if (!digits) return null;
    const bCode = digits.padStart(10, '0').slice(0, 10);

    const pick = async (whereSql: string, params: { bCode: string }) => {
      return this.repo
        .createQueryBuilder('m')
        .where(whereSql, params)
        .andWhere('m.deletedDateSrc IS NULL')
        .orderBy('m.sortRank', 'ASC', 'NULLS LAST')
        .addOrderBy('m.updatedAt', 'DESC')
        .getOne();
    };

    let ent = await pick('m.bCode = :bCode', { bCode });
    if (!ent) {
      ent = await pick('m.legacyBCode = :bCode', { bCode });
    }
    if (!ent) return null;

    const regionName = (ent.sidoName ?? '').trim();
    const cityName = (ent.sigunguName ?? '').trim();
    const emd = (ent.eupmyeondongName ?? '').trim();
    const ri = (ent.riName ?? '').trim();
    const townName = ri ? `${emd} ${ri}`.trim() : emd;

    return {
      legalBCode: bCode,
      regionName,
      cityName,
      townName,
    };
  }
}
