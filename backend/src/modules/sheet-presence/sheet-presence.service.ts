import { ConflictException, Injectable } from '@nestjs/common';

const LOCK_TTL_MS = 45_000;

interface LockEntry {
  userId: number;
  userName: string;
  expiresAt: number;
}

function uid(n: number | string): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : NaN;
}

@Injectable()
export class SheetPresenceService {
  /** key: `${sheetId}|${row}|${col}` */
  private readonly locks = new Map<string, LockEntry>();

  constructor() {
    setInterval(() => this.pruneExpired(), 30_000);
  }

  private makeKey(sheetId: string, row: number, col: number): string {
    return `${sheetId}|${row}|${col}`;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.locks) {
      if (v.expiresAt <= now) {
        this.locks.delete(k);
      }
    }
  }

  acquire(
    sheetId: string,
    row: number,
    col: number,
    userId: number,
    userName: string,
  ): void {
    const me = uid(userId);
    this.pruneExpired();
    const key = this.makeKey(sheetId, row, col);
    const now = Date.now();
    const existing = this.locks.get(key);
    if (
      existing &&
      existing.expiresAt > now &&
      existing.userId !== me
    ) {
      throw new ConflictException({
        lockedBy: existing.userName,
        message: '다른 사용자가 이 셀을 편집 중입니다.',
      });
    }
    this.locks.set(key, {
      userId: me,
      userName,
      expiresAt: now + LOCK_TTL_MS,
    });
  }

  heartbeat(
    sheetId: string,
    row: number,
    col: number,
    userId: number,
    userName: string,
  ): void {
    const me = uid(userId);
    this.pruneExpired();
    const key = this.makeKey(sheetId, row, col);
    const existing = this.locks.get(key);
    const now = Date.now();
    if (!existing || existing.userId !== me) {
      this.locks.set(key, {
        userId: me,
        userName,
        expiresAt: now + LOCK_TTL_MS,
      });
      return;
    }
    existing.expiresAt = now + LOCK_TTL_MS;
  }

  release(sheetId: string, row: number, col: number, userId: number): void {
    const me = uid(userId);
    const key = this.makeKey(sheetId, row, col);
    const existing = this.locks.get(key);
    if (existing && existing.userId === me) {
      this.locks.delete(key);
    }
  }

  getLocks(
    sheetId: string,
  ): Record<string, { userId: number; userName: string }> {
    this.pruneExpired();
    const prefix = `${sheetId}|`;
    const out: Record<string, { userId: number; userName: string }> = {};
    for (const [k, v] of this.locks) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      const parts = rest.split('|');
      if (parts.length !== 2) continue;
      const r = parts[0];
      const c = parts[1];
      out[`${r},${c}`] = { userId: v.userId, userName: v.userName };
    }
    return out;
  }
}
