import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'] as string | undefined;

    const expectedKey = this.configService.get<string>('EXTERNAL_API_KEY');

    if (!expectedKey || expectedKey.trim() === '') {
      throw new UnauthorizedException(
        'External API is not configured. Set EXTERNAL_API_KEY in environment.',
      );
    }

    if (!apiKey || apiKey.trim() === '') {
      throw new UnauthorizedException('X-API-Key header is required.');
    }

    if (apiKey.trim() !== expectedKey.trim()) {
      throw new UnauthorizedException('Invalid API key.');
    }

    return true;
  }
}
