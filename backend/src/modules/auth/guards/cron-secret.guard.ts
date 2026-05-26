import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Cloud Scheduler 등 내부 호출용 — X-Cron-Secret 헤더가 CRON_SECRET 환경변수와 일치해야 함.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = (request.headers['x-cron-secret'] as string | undefined)?.trim();
    const expected = (this.configService.get<string>('CRON_SECRET') ?? '').trim();

    if (!expected) {
      throw new UnauthorizedException(
        'Cron API is not configured. Set CRON_SECRET in environment.',
      );
    }
    if (!provided) {
      throw new UnauthorizedException('X-Cron-Secret header is required.');
    }
    if (provided !== expected) {
      throw new UnauthorizedException('Invalid cron secret.');
    }
    return true;
  }
}
