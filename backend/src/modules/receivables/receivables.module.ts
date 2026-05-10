import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsReceivable } from './entities/accounts-receivable.entity';
import { ReceivableCollection } from './entities/receivable-collection.entity';
import { ReceivableWarningConfig } from './entities/receivable-warning-config.entity';
import { ReceivableSmsBatch } from './entities/receivable-sms-batch.entity';
import { Invoice } from '../sales/entities/invoice.entity';
import { Customer } from '../customers/entities/customer.entity';
import { CustomerStatementName } from '../customers/entities/customer-statement-name.entity';
import { CustomerPrepayment } from '../sales/entities/customer-prepayment.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { ReceivablesService } from './receivables.service';
import { ReceivablesController } from './receivables.controller';
import { TransactionNumberGenerator } from './utils/transaction-number-generator';
import { AligoModule } from '../aligo/aligo.module';
import { SmsSenderModule } from '../sms-sender/sms-sender.module';
import { SmsTemplatesModule } from '../sms-templates/sms-templates.module';

@Module({
  imports: [
    AligoModule,
    SmsSenderModule,
    SmsTemplatesModule,
    TypeOrmModule.forFeature([
      AccountsReceivable,
      ReceivableCollection,
      ReceivableWarningConfig,
      ReceivableSmsBatch,
      Invoice,
      Customer,
      CustomerStatementName,
      CustomerPrepayment,
      Supplier,
    ]),
  ],
  controllers: [ReceivablesController],
  providers: [ReceivablesService, TransactionNumberGenerator],
  exports: [ReceivablesService, TransactionNumberGenerator],
})
export class ReceivablesModule {}
