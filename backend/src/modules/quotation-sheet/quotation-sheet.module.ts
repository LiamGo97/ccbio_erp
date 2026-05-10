import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuotationSheetRow } from './entities/quotation-sheet-row.entity';
import { QuotationSheetController } from './quotation-sheet.controller';
import { QuotationSheetService } from './quotation-sheet.service';

@Module({
  imports: [TypeOrmModule.forFeature([QuotationSheetRow])],
  controllers: [QuotationSheetController],
  providers: [QuotationSheetService],
  exports: [QuotationSheetService],
})
export class QuotationSheetModule {}
