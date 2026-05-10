import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  @Get()
  async checkHealth() {
    const checks: Record<string, any> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };

    // 데이터베이스 연결 상태 체크
    try {
      const startTime = Date.now();
      await this.connection.query('SELECT 1');
      const queryTime = Date.now() - startTime;

      const pool: any = (this.connection.driver as any).pool;
      const poolStats = {
        total: pool?.totalCount || 0,
        idle: pool?.idleCount || 0,
        waiting: pool?.waitingCount || 0,
      };

      checks.database = {
        status: 'connected',
        queryTime: `${queryTime}ms`,
        pool: poolStats,
        driver: this.connection.driver.options.type,
      };

      // 연결 풀 경고 체크
      if (poolStats.waiting > 0) {
        checks.warnings = checks.warnings || [];
        checks.warnings.push('연결 풀에 대기 중인 요청이 있습니다.');
      }

      if (queryTime > 1000) {
        checks.warnings = checks.warnings || [];
        checks.warnings.push(`데이터베이스 응답이 느립니다: ${queryTime}ms`);
      }
    } catch (error: any) {
      checks.database = {
        status: 'error',
        error: error.message,
        code: error.code,
      };
      checks.status = 'error';
    }

    return checks;
  }

  @Get('ip-check')
  async checkOutboundIp() {
    try {
      const res = await fetch('https://api.ipify.org');
      const ip = await res.text();
      return { outboundIp: ip.trim() };
    } catch (error: any) {
      return { outboundIp: null, error: error.message };
    }
  }

  @Get('db')
  async checkDatabase() {
    try {
      const startTime = Date.now();
      await this.connection.query('SELECT 1');
      const queryTime = Date.now() - startTime;

      const pool: any = (this.connection.driver as any).pool;
      const poolStats = {
        total: pool?.totalCount || 0,
        idle: pool?.idleCount || 0,
        waiting: pool?.waitingCount || 0,
        max: (this.connection.options as any).extra?.max || 'unknown',
        min: (this.connection.options as any).extra?.min || 'unknown',
      };

      return {
        status: 'ok',
        connected: true,
        queryTime: `${queryTime}ms`,
        pool: poolStats,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        status: 'error',
        connected: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

