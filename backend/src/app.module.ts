import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { CodesModule } from './modules/codes/codes.module';
import { FreeTimeModule } from './modules/free-time/free-time.module';
import { TradeContractsModule } from './modules/trade-contracts/trade-contracts.module';
import { CustomersModule } from './modules/customers/customers.module';
import { GoogleDriveModule } from './modules/google-drive/google-drive.module';
import { ConsultationsModule } from './modules/consultations/consultations.module';
import { RegionsModule } from './modules/regions/regions.module';
import { CitiesModule } from './modules/cities/cities.module';
import { ExchangeRateModule } from './modules/exchange-rate/exchange-rate.module';
import { WarehouseIgobiModule } from './modules/warehouse-igobi/warehouse-igobi.module';
import { SafeFreightRateModule } from './modules/safe-freight-rate/safe-freight-rate.module';
import { OrganicCertificationModule } from './modules/organic-certification/organic-certification.module';
import { VehicleDispatchModule } from './modules/vehicle-dispatch/vehicle-dispatch.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { DispatchCompanyModule } from './modules/dispatch-company/dispatch-company.module';
import { DispatchUserModule } from './modules/dispatch-user/dispatch-user.module';
import { UnloadingCompanyModule } from './modules/unloading-company/unloading-company.module';
import { AligoModule } from './modules/aligo/aligo.module';
import { StorageModule } from './modules/storage/storage.module';
import { HealthModule } from './modules/health/health.module';
import { SalesModule } from './modules/sales/sales.module';
import { SalesVehicleDispatchModule } from './modules/sales-vehicle-dispatch/sales-vehicle-dispatch.module';
import { SalesDeliveryModule } from './modules/sales-delivery/sales-delivery.module';
import { EcountModule } from './modules/ecount/ecount.module';
import { CompanyInfoModule } from './modules/company-info/company-info.module';
import { SmsTemplatesModule } from './modules/sms-templates/sms-templates.module';
import { SmsHistoryModule } from './modules/sms-history/sms-history.module';
import { SmsSenderModule } from './modules/sms-sender/sms-sender.module';
import { ReceivablesModule } from './modules/receivables/receivables.module';
import { PrepaymentsModule } from './modules/prepayments/prepayments.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { MallDailyStatModule } from './modules/mall-daily-stat/mall-daily-stat.module';
import { FeatureAuditLogModule } from './modules/feature-audit-log/feature-audit-log.module';
import { InboundDefaultsModule } from './modules/inbound-defaults/inbound-defaults.module';
import { ExternalApiModule } from './modules/external-api/external-api.module';
import { DataChatModule } from './modules/data-chat/data-chat.module';
import { SalesReservationModule } from './modules/sales-reservation/sales-reservation.module';
import { SheetPresenceModule } from './modules/sheet-presence/sheet-presence.module';
import { SalesReservationSheetModule } from './modules/sales-reservation-sheet/sales-reservation-sheet.module';
import { QuotationSheetModule } from './modules/quotation-sheet/quotation-sheet.module';
import { LegalAdminMasterModule } from './modules/legal-admin-master/legal-admin-master.module';
import { InternalCronModule } from './modules/internal-cron/internal-cron.module';

@Module({
  imports: [
    // 환경 변수 설정
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        process.env.NODE_ENV === 'production' ? '.env.production' : null,
        process.env.NODE_ENV === 'development' ? '.env.development' : null,
        '.env.local',
        '.env', // 기본 .env 파일도 읽도록 추가
      ].filter(Boolean) as string[],
    }),
    // 데이터베이스 설정
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: process.env.SYNC_DB === 'true', // 환경 변수로 제어 (Cloud SQL 초기 설정용)
      logging: false, // 쿼리 로그 비활성화
      // 연결 풀 설정 (연결 끊김 방지)
      extra: {
        max: process.env.NODE_ENV === 'production' ? 20 : 5, // g1-small 권장값: 20 (최대 100 연결 중 안전한 값)
        min: process.env.NODE_ENV === 'production' ? 2 : 1, // 개발 환경에서는 최소 연결 수 줄임
        idleTimeoutMillis: process.env.NODE_ENV === 'production' ? 30000 : 30000, // 개발 환경에서도 30초로 증가 (연결 끊김 방지)
        connectionTimeoutMillis: 20000, // 연결 타임아웃 (20초) - 빠른 실패를 위해 줄임
        // TCP keep-alive 설정 (연결 끊김 방지)
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000, // 10초마다 keep-alive 패킷 전송
      },
      // 연결 재시도 설정
      retryAttempts: 3,
      retryDelay: 3000, // 3초 후 재시도
      // 연결 끊김 감지 및 재연결
      keepConnectionAlive: true,
    }),
    // 모듈
    AuthModule.forRoot(),
    UsersModule,
    RolesModule,
    CodesModule,
    FreeTimeModule,
    TradeContractsModule,
    CustomersModule,
    GoogleDriveModule,
    ConsultationsModule,
    RegionsModule,
    CitiesModule,
    ExchangeRateModule,
    WarehouseIgobiModule,
    SafeFreightRateModule,
    OrganicCertificationModule,
    VehicleDispatchModule,
    WarehouseModule,
    DispatchCompanyModule,
    DispatchUserModule,
    UnloadingCompanyModule,
    AligoModule,
    StorageModule,
    HealthModule,
    SalesDeliveryModule, // SalesModule보다 먼저 등록하여 /sales/delivery 경로가 우선 매칭되도록 함
    SalesModule,
    SalesVehicleDispatchModule,
    EcountModule,
    CompanyInfoModule,
    SmsTemplatesModule,
    SmsHistoryModule,
    SmsSenderModule,
    ReceivablesModule,
    PrepaymentsModule,
    SuppliersModule,
    MallDailyStatModule,
    FeatureAuditLogModule,
    InboundDefaultsModule,
    ExternalApiModule,
    DataChatModule,
    SalesReservationModule,
    SalesReservationSheetModule,
    QuotationSheetModule,
    LegalAdminMasterModule,
    SheetPresenceModule,
    InternalCronModule,
  ],
})
export class AppModule {}

