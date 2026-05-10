import { Injectable } from '@nestjs/common';
import { SalesReservationSheetRow } from './entities/sales-reservation-sheet-row.entity';

export type SheetRowSsePayload = {
  id: string;
  sheetId: string;
  rowIndex: number;
  productCode: string | null;
  salesGrade: string | null;
  bl: string | null;
  companyName: string | null;
  contact: string | null;
  requestedQty: string | null;
  vehicleCode: string | null;
  loadingSchedule: string | null;
  arrivalSchedule: string | null;
  remarks: string | null;
  unitPrice: string | null;
  reference: string | null;
  status: string | null;
  userId: number | null;
  updatedAt: string;
};

@Injectable()
export class SalesReservationSheetSseService {
  /** sheetId → 전송 함수 집합 */
  private readonly subscribers = new Map<string, Set<(chunk: string) => void>>();

  static serializeRow(row: SalesReservationSheetRow): SheetRowSsePayload {
    return {
      id: String(row.id),
      sheetId: row.sheetId,
      rowIndex: row.rowIndex,
      productCode: row.productCode ?? null,
      salesGrade: row.salesGrade ?? null,
      bl: row.bl ?? null,
      companyName: row.companyName ?? null,
      contact: row.contact ?? null,
      requestedQty: row.requestedQty ?? null,
      vehicleCode: row.vehicleCode ?? null,
      loadingSchedule: row.loadingSchedule ?? null,
      arrivalSchedule: row.arrivalSchedule ?? null,
      remarks: row.remarks ?? null,
      unitPrice: row.unitPrice ?? null,
      reference: row.reference ?? null,
      status: row.status ?? null,
      userId: row.userId ?? null,
      updatedAt: row.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }

  subscribe(sheetId: string, send: (chunk: string) => void): () => void {
    const sid = sheetId.trim() || 'product-reservations-sheet';
    if (!this.subscribers.has(sid)) {
      this.subscribers.set(sid, new Set());
    }
    this.subscribers.get(sid)!.add(send);
    return () => {
      this.subscribers.get(sid)?.delete(send);
      if (this.subscribers.get(sid)?.size === 0) {
        this.subscribers.delete(sid);
      }
    };
  }

  broadcastRowUpdated(sheetId: string, row: SalesReservationSheetRow): void {
    const sid = sheetId.trim() || 'product-reservations-sheet';
    const payload = {
      type: 'row-updated' as const,
      sheetId: sid,
      row: SalesReservationSheetSseService.serializeRow(row),
    };
    const chunk = `data: ${JSON.stringify(payload)}\n\n`;
    const set = this.subscribers.get(sid);
    if (!set?.size) return;
    for (const send of set) {
      try {
        send(chunk);
      } catch {
        // 연결 끊김 등 — 무시
      }
    }
  }

  /** 행 전체가 비워져 DB에서 삭제된 경우 */
  broadcastRowDeleted(sheetId: string, rowIndex: number): void {
    const sid = sheetId.trim() || 'product-reservations-sheet';
    const payload = {
      type: 'row-deleted' as const,
      sheetId: sid,
      rowIndex,
    };
    const chunk = `data: ${JSON.stringify(payload)}\n\n`;
    const set = this.subscribers.get(sid);
    if (!set?.size) return;
    for (const send of set) {
      try {
        send(chunk);
      } catch {
        // 연결 끊김 등 — 무시
      }
    }
  }
}
