import { TradeContract } from './entities/trade-contract.entity';
import { TradeOrder } from './entities/trade-order.entity';

function normScalar(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : v.toISOString().slice(0, 10);
  }
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return v;
}

const CONTRACT_AUDIT_KEYS = [
  'id',
  'contractNo',
  'exportCountry',
  'exporter',
  'productName',
  'newOld',
  'commissionMonth',
  'commissionDollar',
  'orderDate',
  'totalOrderCount',
  'quantity',
  'grade',
  'packingType',
  'currency',
  'unitPrice',
  'destination',
  'notes',
  'quota',
  'fumigation',
  'customsDuty',
  'contractGoogleDriveFileId',
  'contractFileName',
  'status',
  'monthlyOrderPlan',
  'shippingLine',
] as const;

const ORDER_AUDIT_KEYS = [
  'id',
  'contractNo',
  'bk',
  'bl',
  'sequence',
  'sequenceSub',
  'destination',
  'etdText',
  'etdDate',
  'etdApiDate',
  'etaDate',
  'shippingLine',
  'tradeStatus',
  'status',
  'salesStatus',
  'inboundStatus',
  'financeStatus',
  'excludeFromLogistics',
  'shipBack',
  'invoiceNumber',
  'invoiceDate',
  'invoiceCurrency',
  'invoiceAmount',
  'invoiceWeight',
  'invoiceGoogleDriveFileId',
  'invoiceFileName',
  'certificateNumber',
  'hasOriginalShipment',
  'originalShipment',
  'notes',
  'salesNotes',
  'doGoogleDriveFileId',
  'doFileName',
  'customsCertificateGoogleDriveFileId',
  'customsCertificateFileName',
  'customsCertificateGoogleDriveFileId2',
  'customsCertificateFileName2',
  'customsDate',
  'quarantineDate',
  'customsScheduledDate',
  'spot',
  'quota',
  'commissionMonth',
  'commissionDollar',
  'bookingTempWeightMt',
  'bookingTempInvoiceAmount',
  'finalWeightedExchangeRate',
] as const;

export function snapshotTradeContractAudit(c: TradeContract): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of CONTRACT_AUDIT_KEYS) {
    o[k] = normScalar((c as unknown as Record<string, unknown>)[k]);
  }
  return o;
}

export function snapshotTradeOrderAudit(o: TradeOrder): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ORDER_AUDIT_KEYS) {
    out[k] = normScalar((o as unknown as Record<string, unknown>)[k]);
  }
  return out;
}

/** contract.* / order.* 평탄 키 */
export function mergeTradeAuditSnapshots(
  contract: Record<string, unknown> | null,
  order: Record<string, unknown> | null,
): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (contract) {
    for (const [k, v] of Object.entries(contract)) {
      m[`contract.${k}`] = v;
    }
  }
  if (order) {
    for (const [k, v] of Object.entries(order)) {
      m[`order.${k}`] = v;
    }
  }
  return m;
}

export function diffTradeAuditSnapshots(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): {
  changedFields: Record<string, { old: unknown; new: unknown }>;
  oldData: Record<string, unknown>;
  newData: Record<string, unknown>;
} {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changedFields: Record<string, { old: unknown; new: unknown }> = {};
  const oldData: Record<string, unknown> = {};
  const newData: Record<string, unknown> = {};

  for (const key of keys) {
    const ob = before[key];
    const oa = after[key];
    if (JSON.stringify(ob) !== JSON.stringify(oa)) {
      changedFields[key] = { old: ob ?? null, new: oa ?? null };
      oldData[key] = ob ?? null;
      newData[key] = oa ?? null;
    }
  }

  return { changedFields, oldData, newData };
}
