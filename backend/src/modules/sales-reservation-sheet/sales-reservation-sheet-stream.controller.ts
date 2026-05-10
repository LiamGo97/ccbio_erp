import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { UsersService } from '../users/users.service';
import { SalesReservationSheetSseService } from './sales-reservation-sheet-sse.service';

/**
 * EventSource는 Authorization 헤더를 붙이기 어려워 query `token` 으로 JWT 전달.
 * 같은 origin + 쿠키만 쓰는 경우 추후 개선 가능.
 */
@Controller('sales-reservation-sheet')
export class SalesReservationSheetStreamController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly sse: SalesReservationSheetSseService,
  ) {}

  @Get('stream')
  async stream(
    @Query('sheetId') sheetId: string | undefined,
    @Query('token') token: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const t = (token ?? '').trim();
    if (!t) {
      throw new UnauthorizedException();
    }

    let payload: { sub: number | string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: number | string }>(t);
    } catch {
      throw new UnauthorizedException();
    }
    const uid = Number(payload.sub);
    if (!Number.isFinite(uid)) {
      throw new UnauthorizedException();
    }
    const user = await this.usersService.findById(uid);
    if (!user) {
      throw new UnauthorizedException();
    }

    const sid = (sheetId ?? '').trim() || 'product-reservations-sheet';

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const send = (chunk: string) => {
      if (!res.writableEnded) {
        res.write(chunk);
      }
    };

    send(
      `data: ${JSON.stringify({ type: 'connected', sheetId: sid })}\n\n`,
    );

    const unsub = this.sse.subscribe(sid, send);

    const ping = setInterval(() => {
      send(`: ping\n\n`);
    }, 25_000);

    const cleanup = () => {
      clearInterval(ping);
      unsub();
      if (!res.writableEnded) {
        res.end();
      }
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);
  }
}
