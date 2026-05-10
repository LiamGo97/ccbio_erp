import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyInfo } from './entities/company-info.entity';
import { UpdateCompanyInfoDto } from './dto/update-company-info.dto';

@Injectable()
export class CompanyInfoService {
  private readonly logger = new Logger(CompanyInfoService.name);

  constructor(
    @InjectRepository(CompanyInfo)
    private companyInfoRepository: Repository<CompanyInfo>,
  ) {}

  /**
   * 회사 정보 조회 (단일 레코드)
   */
  async findOne(): Promise<CompanyInfo | null> {
    const results = await this.companyInfoRepository.find({
      order: { id: 'DESC' },
      take: 1,
    });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * 회사 정보 생성 또는 업데이트 (Upsert)
   * 단일 레코드만 유지
   */
  async upsert(dto: UpdateCompanyInfoDto): Promise<CompanyInfo> {
    const existing = await this.findOne();

    if (existing) {
      // 기존 레코드 업데이트
      existing.businessRegistrationNumber = dto.businessRegistrationNumber.trim();
      existing.representativeName = dto.representativeName.trim();
      existing.companyName = dto.companyName.trim();
      existing.address = dto.address.trim();
      existing.tel = dto.tel.trim();
      return this.companyInfoRepository.save(existing);
    } else {
      // 새 레코드 생성
      const companyInfo = this.companyInfoRepository.create({
        businessRegistrationNumber: dto.businessRegistrationNumber.trim(),
        representativeName: dto.representativeName.trim(),
        companyName: dto.companyName.trim(),
        address: dto.address.trim(),
        tel: dto.tel.trim(),
      });
      return this.companyInfoRepository.save(companyInfo);
    }
  }
}

