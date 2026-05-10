import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuotationSheetRow } from './entities/quotation-sheet-row.entity';
import { UpsertQuotationSheetRowDto } from './dto/upsert-quotation-sheet-row.dto';

function emptyToNull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === '' ? null : t;
}

function isQuotationRowEmpty(p: {
  bl?: string | null;
  eta?: string | null;
  currency?: string | null;
  unitPrice?: string | null;
  exportCountry?: string | null;
  product?: string | null;
  grade?: string | null;
  packing?: string | null;
  remarks?: string | null;
  fxCalc?: string | null;
  cost?: string | null;
  margin?: string | null;
  sellingPrice?: string | null;
}): boolean {
  return (
    !p.bl?.trim() &&
    !p.eta?.trim() &&
    !p.currency?.trim() &&
    !p.unitPrice?.trim() &&
    !p.exportCountry?.trim() &&
    !p.product?.trim() &&
    !p.grade?.trim() &&
    !p.packing?.trim() &&
    !p.remarks?.trim() &&
    !p.fxCalc?.trim() &&
    !p.cost?.trim() &&
    !p.margin?.trim() &&
    !p.sellingPrice?.trim()
  );
}

export type UpsertQuotationRowResult =
  | QuotationSheetRow
  | { deleted: true; rowIndex: number };

@Injectable()
export class QuotationSheetService {
  constructor(
    @InjectRepository(QuotationSheetRow)
    private readonly repo: Repository<QuotationSheetRow>,
  ) {}

  async findAll(sheetId: string) {
    const id = sheetId.trim() || 'sales-quotation-sheet';
    return this.repo.find({
      where: { sheetId: id },
      order: { rowIndex: 'ASC' },
    });
  }

  async upsertRow(
    sheetId: string,
    rowIndex: number,
    dto: UpsertQuotationSheetRowDto,
    userId: number | null,
  ): Promise<UpsertQuotationRowResult> {
    const sid = sheetId.trim() || 'sales-quotation-sheet';

    const payload: Partial<QuotationSheetRow> & {
      sheetId: string;
      rowIndex: number;
    } = {
      sheetId: sid,
      rowIndex,
      bl: emptyToNull(dto.bl),
      eta: emptyToNull(dto.eta),
      currency: emptyToNull(dto.currency),
      unitPrice: emptyToNull(dto.unitPrice),
      exportCountry: emptyToNull(dto.exportCountry),
      product: emptyToNull(dto.product),
      grade: emptyToNull(dto.grade),
      packing: emptyToNull(dto.packing),
      remarks: emptyToNull(dto.remarks),
      fxCalc: emptyToNull(dto.fxCalc),
      cost: emptyToNull(dto.cost),
      margin: emptyToNull(dto.margin),
      sellingPrice: emptyToNull(dto.sellingPrice),
      userId: userId ?? null,
    };

    const dataOnly = {
      bl: payload.bl,
      eta: payload.eta,
      currency: payload.currency,
      unitPrice: payload.unitPrice,
      exportCountry: payload.exportCountry,
      product: payload.product,
      grade: payload.grade,
      packing: payload.packing,
      remarks: payload.remarks,
      fxCalc: payload.fxCalc,
      cost: payload.cost,
      margin: payload.margin,
      sellingPrice: payload.sellingPrice,
    };

    if (isQuotationRowEmpty(dataOnly)) {
      const existing = await this.repo.findOne({
        where: { sheetId: sid, rowIndex },
      });
      if (existing) {
        await this.repo.delete({ sheetId: sid, rowIndex });
      }
      return { deleted: true, rowIndex };
    }

    await this.repo.upsert(payload, {
      conflictPaths: ['sheetId', 'rowIndex'],
      skipUpdateIfNoValuesChanged: false,
    });

    return this.repo.findOneOrFail({
      where: { sheetId: sid, rowIndex },
    });
  }
}
