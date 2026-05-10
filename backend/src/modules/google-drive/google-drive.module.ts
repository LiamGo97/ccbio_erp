import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { GoogleDriveService } from './google-drive.service';
import { GoogleDriveController } from './google-drive.controller';
import { UsersModule } from '../users/users.module';
import { CustomersModule } from '../customers/customers.module';
import { WarehouseModule } from '../warehouse/warehouse.module';

@Module({
  imports: [
    UsersModule,
    CustomersModule,
    WarehouseModule,
    MulterModule.register({
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
      },
    }),
  ],
  controllers: [GoogleDriveController],
  providers: [GoogleDriveService],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}

