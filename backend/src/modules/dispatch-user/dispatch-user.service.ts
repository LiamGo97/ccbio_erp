import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DispatchUser } from './entities/dispatch-user.entity';
import { CreateDispatchUserDto } from './dto/create-dispatch-user.dto';
import { UpdateDispatchUserDto } from './dto/update-dispatch-user.dto';
import { GetDispatchUsersDto } from './dto/get-dispatch-users.dto';
import { User } from '../users/entities/user.entity';
import { DispatchCompany } from '../dispatch-company/entities/dispatch-company.entity';

@Injectable()
export class DispatchUserService {
  private readonly logger = new Logger(DispatchUserService.name);

  constructor(
    @InjectRepository(DispatchUser)
    private dispatchUserRepository: Repository<DispatchUser>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(DispatchCompany)
    private dispatchCompanyRepository: Repository<DispatchCompany>,
  ) {}

  /**
   * 사용자 ID로 배차 업체 ID 조회
   * 배차 업체가 할당되지 않은 경우 null 반환
   */
  async findDispatchCompanyIdByUserId(userId: number): Promise<number | null> {
    const dispatchUser = await this.dispatchUserRepository.findOne({
      where: { userId, status: true },
      relations: ['dispatchCompany'],
    });

    return dispatchUser?.dispatchCompanyId || null;
  }

  /**
   * 사용자 ID로 배차 업체 사용자 정보 조회
   */
  async findByUserId(userId: number): Promise<DispatchUser | null> {
    this.logger.log(`[FIND_BY_USER_ID] 사용자 ID로 배차 업체 직원 조회 시작 - userId: ${userId}`);
    const dispatchUser = await this.dispatchUserRepository.findOne({
      where: { userId },
      relations: ['dispatchCompany', 'user'],
    });
    if (dispatchUser) {
      this.logger.log(`[FIND_BY_USER_ID] 배차 업체 직원 조회 완료:`);
      this.logger.log(`[FIND_BY_USER_ID]   - ID: ${dispatchUser.id}`);
      this.logger.log(`[FIND_BY_USER_ID]   - userId: ${dispatchUser.userId}`);
      this.logger.log(`[FIND_BY_USER_ID]   - dispatchCompanyId: ${dispatchUser.dispatchCompanyId}`);
      this.logger.log(`[FIND_BY_USER_ID]   - name: ${dispatchUser.name}`);
      this.logger.log(`[FIND_BY_USER_ID]   - dispatchCompany: ${dispatchUser.dispatchCompany ? JSON.stringify({ id: dispatchUser.dispatchCompany.id, name: dispatchUser.dispatchCompany.name }) : 'null'}`);
    } else {
      this.logger.log(`[FIND_BY_USER_ID] 배차 업체 직원을 찾을 수 없음 - userId: ${userId}`);
    }
    return dispatchUser;
  }

  async findAll(query: GetDispatchUsersDto = {}) {
    this.logger.log(`[FIND_ALL] 배차 업체 직원 목록 조회 시작`);
    this.logger.log(`[FIND_ALL] 조회 조건: ${JSON.stringify(query, null, 2)}`);
    
    const qb = this.dispatchUserRepository.createQueryBuilder('dispatchUser')
      .leftJoinAndSelect('dispatchUser.user', 'user')
      .leftJoinAndSelect('dispatchUser.dispatchCompany', 'dispatchCompany');

    if (query.dispatchCompanyId !== undefined) {
      qb.andWhere('dispatchUser.dispatchCompanyId = :dispatchCompanyId', {
        dispatchCompanyId: query.dispatchCompanyId,
      });
      this.logger.log(`[FIND_ALL] 배차 업체 ID 필터 적용: ${query.dispatchCompanyId}`);
    }

    if (query.userId !== undefined) {
      qb.andWhere('dispatchUser.userId = :userId', {
        userId: query.userId,
      });
      this.logger.log(`[FIND_ALL] 사용자 ID 필터 적용: ${query.userId}`);
    }

    if (query.status !== undefined) {
      qb.andWhere('dispatchUser.status = :status', { status: query.status });
      this.logger.log(`[FIND_ALL] 상태 필터 적용: ${query.status}`);
    }

    if (query.search) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere(
        '(dispatchUser.name LIKE :search OR user.email LIKE :search OR dispatchCompany.name LIKE :search)',
        { search },
      );
      this.logger.log(`[FIND_ALL] 검색어 필터 적용: ${query.search}`);
    }

    qb.orderBy('dispatchUser.createdAt', 'DESC');

    const results = await qb.getMany();
    this.logger.log(`[FIND_ALL] 조회 결과 개수: ${results.length}`);
    results.forEach((result, index) => {
      this.logger.log(`[FIND_ALL] 결과 ${index + 1}:`);
      this.logger.log(`[FIND_ALL]   - ID: ${result.id}`);
      this.logger.log(`[FIND_ALL]   - userId: ${result.userId}`);
      this.logger.log(`[FIND_ALL]   - dispatchCompanyId: ${result.dispatchCompanyId}`);
      this.logger.log(`[FIND_ALL]   - name: ${result.name}`);
      this.logger.log(`[FIND_ALL]   - dispatchCompany: ${result.dispatchCompany ? JSON.stringify({ id: result.dispatchCompany.id, name: result.dispatchCompany.name }) : 'null'}`);
    });
    this.logger.log(`[FIND_ALL] 배차 업체 직원 목록 조회 완료`);
    
    return results;
  }

  async findOne(id: number) {
    this.logger.log(`[FIND_ONE] 배차 업체 직원 조회 시작 - ID: ${id}`);
    const dispatchUser = await this.dispatchUserRepository.findOne({
      where: { id },
      relations: ['user', 'dispatchCompany'],
    });
    if (!dispatchUser) {
      this.logger.error(`[FIND_ONE] 배차 업체 직원을 찾을 수 없음 - ID: ${id}`);
      throw new NotFoundException('배차 업체 직원을 찾을 수 없습니다.');
    }
    this.logger.log(`[FIND_ONE] 배차 업체 직원 조회 완료:`);
    this.logger.log(`[FIND_ONE]   - ID: ${dispatchUser.id}`);
    this.logger.log(`[FIND_ONE]   - userId: ${dispatchUser.userId}`);
    this.logger.log(`[FIND_ONE]   - dispatchCompanyId: ${dispatchUser.dispatchCompanyId}`);
    this.logger.log(`[FIND_ONE]   - name: ${dispatchUser.name}`);
    this.logger.log(`[FIND_ONE]   - dispatchCompany: ${dispatchUser.dispatchCompany ? JSON.stringify({ id: dispatchUser.dispatchCompany.id, name: dispatchUser.dispatchCompany.name }) : 'null'}`);
    return dispatchUser;
  }

  async create(dto: CreateDispatchUserDto) {
    // 사용자 존재 확인
    const user = await this.userRepository.findOne({ where: { id: dto.userId } });
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    // 배차 업체 존재 확인
    const dispatchCompany = await this.dispatchCompanyRepository.findOne({
      where: { id: dto.dispatchCompanyId },
    });
    if (!dispatchCompany) {
      throw new NotFoundException('배차 업체를 찾을 수 없습니다.');
    }

    // 이미 배차 업체에 연결된 사용자인지 확인
    const existingDispatchUser = await this.dispatchUserRepository.findOne({
      where: { userId: dto.userId },
    });
    if (existingDispatchUser) {
      throw new ConflictException('이미 배차 업체에 연결된 사용자입니다.');
    }

    // 사용자 정보에서 이름 가져오기 (없으면 이메일 사용)
    const userName = user.name || user.email || '';

    const dispatchUser = this.dispatchUserRepository.create({
      userId: dto.userId,
      dispatchCompanyId: dto.dispatchCompanyId,
      name: dto.name?.trim() || userName,
      phone: dto.phone?.trim() || null,
      position: dto.position?.trim() || null,
      status: dto.status !== undefined ? dto.status : true,
    });

    return this.dispatchUserRepository.save(dispatchUser);
  }

  async update(id: number, dto: UpdateDispatchUserDto) {
    this.logger.log(`[UPDATE] ========== 배차 업체 직원 수정 시작 ==========`);
    this.logger.log(`[UPDATE] 배차 업체 직원 ID: ${id}`);
    this.logger.log(`[UPDATE] 수정 요청 데이터: ${JSON.stringify(dto, null, 2)}`);
    this.logger.log(`[UPDATE] dispatchCompanyId 타입: ${typeof dto.dispatchCompanyId}, 값: ${dto.dispatchCompanyId}`);
    this.logger.log(`[UPDATE] dispatchCompanyId === undefined: ${dto.dispatchCompanyId === undefined}`);
    this.logger.log(`[UPDATE] dispatchCompanyId === null: ${dto.dispatchCompanyId === null}`);
    
    const dispatchUser = await this.findOne(id);
    this.logger.log(`[UPDATE] 기존 배차 업체 직원 데이터:`);
    this.logger.log(`[UPDATE]   - ID: ${dispatchUser.id}`);
    this.logger.log(`[UPDATE]   - userId: ${dispatchUser.userId}`);
    this.logger.log(`[UPDATE]   - dispatchCompanyId: ${dispatchUser.dispatchCompanyId}`);
    this.logger.log(`[UPDATE]   - name: ${dispatchUser.name}`);
    this.logger.log(`[UPDATE]   - status: ${dispatchUser.status}`);

    if (dto.dispatchCompanyId !== undefined) {
      this.logger.log(`[UPDATE] 배차 업체 ID 업데이트 시도 - 요청된 ID: ${dto.dispatchCompanyId}`);
      this.logger.log(`[UPDATE] 기존 배차 업체 ID: ${dispatchUser.dispatchCompanyId}`);
      this.logger.log(`[UPDATE] 변경 여부: ${dispatchUser.dispatchCompanyId !== dto.dispatchCompanyId}`);
      
      const dispatchCompany = await this.dispatchCompanyRepository.findOne({
        where: { id: dto.dispatchCompanyId },
      });
      
      if (!dispatchCompany) {
        this.logger.error(`[UPDATE] 배차 업체를 찾을 수 없음 - ID: ${dto.dispatchCompanyId}`);
        throw new NotFoundException('배차 업체를 찾을 수 없습니다.');
      }
      
      this.logger.log(`[UPDATE] 배차 업체 조회 성공:`);
      this.logger.log(`[UPDATE]   - ID: ${dispatchCompany.id}`);
      this.logger.log(`[UPDATE]   - 이름: ${dispatchCompany.name}`);
      this.logger.log(`[UPDATE]   - 상태: ${dispatchCompany.status}`);
      
      this.logger.log(`[UPDATE] 배차 업체 ID 변경: ${dispatchUser.dispatchCompanyId} -> ${dto.dispatchCompanyId}`);
      dispatchUser.dispatchCompanyId = dto.dispatchCompanyId;
    } else {
      this.logger.log(`[UPDATE] 배차 업체 ID는 undefined이므로 업데이트하지 않음`);
    }

    if (dto.name !== undefined) {
      this.logger.log(`[UPDATE] 이름 변경: ${dispatchUser.name} -> ${dto.name}`);
      dispatchUser.name = dto.name.trim();
    }

    if (dto.phone !== undefined) {
      this.logger.log(`[UPDATE] 전화번호 변경: ${dispatchUser.phone} -> ${dto.phone}`);
      dispatchUser.phone = dto.phone?.trim() || null;
    }

    if (dto.position !== undefined) {
      this.logger.log(`[UPDATE] 직책 변경: ${dispatchUser.position} -> ${dto.position}`);
      dispatchUser.position = dto.position?.trim() || null;
    }

    if (dto.status !== undefined) {
      this.logger.log(`[UPDATE] 상태 변경: ${dispatchUser.status} -> ${dto.status}`);
      dispatchUser.status = dto.status;
    }

    this.logger.log(`[UPDATE] 저장 전 최종 데이터:`);
    this.logger.log(`[UPDATE]   - dispatchCompanyId: ${dispatchUser.dispatchCompanyId}`);
    this.logger.log(`[UPDATE]   - name: ${dispatchUser.name}`);
    this.logger.log(`[UPDATE]   - phone: ${dispatchUser.phone}`);
    this.logger.log(`[UPDATE]   - position: ${dispatchUser.position}`);
    this.logger.log(`[UPDATE]   - status: ${dispatchUser.status}`);

    // TypeORM의 엔티티 캐싱 문제를 피하기 위해 QueryBuilder를 사용하여 직접 업데이트
    const updateData: any = {};
    if (dto.dispatchCompanyId !== undefined) {
      updateData.dispatchCompanyId = dto.dispatchCompanyId;
      this.logger.log(`[UPDATE] QueryBuilder로 dispatchCompanyId 업데이트: ${dto.dispatchCompanyId}`);
    }
    if (dto.name !== undefined) {
      updateData.name = dto.name.trim();
      this.logger.log(`[UPDATE] QueryBuilder로 name 업데이트: ${dto.name.trim()}`);
    }
    if (dto.phone !== undefined) {
      updateData.phone = dto.phone?.trim() || null;
      this.logger.log(`[UPDATE] QueryBuilder로 phone 업데이트: ${dto.phone?.trim() || null}`);
    }
    if (dto.position !== undefined) {
      updateData.position = dto.position?.trim() || null;
      this.logger.log(`[UPDATE] QueryBuilder로 position 업데이트: ${dto.position?.trim() || null}`);
    }
    if (dto.status !== undefined) {
      updateData.status = dto.status;
      this.logger.log(`[UPDATE] QueryBuilder로 status 업데이트: ${dto.status}`);
    }

    // QueryBuilder를 사용하여 직접 DB에 업데이트
    if (Object.keys(updateData).length > 0) {
      this.logger.log(`[UPDATE] QueryBuilder 업데이트 실행 - 업데이트 데이터: ${JSON.stringify(updateData)}`);
      await this.dispatchUserRepository
        .createQueryBuilder()
        .update()
        .set(updateData)
        .where('id = :id', { id })
        .execute();
      this.logger.log(`[UPDATE] QueryBuilder 업데이트 완료`);
    }

    // 업데이트 후 관계를 포함하여 다시 조회
    this.logger.log(`[UPDATE] 업데이트 후 다시 조회 시작 - ID: ${id}`);
    const reloaded = await this.dispatchUserRepository.findOne({
      where: { id },
      relations: ['user', 'dispatchCompany'],
    });
    
    if (!reloaded) {
      this.logger.error(`[UPDATE] 업데이트 후 다시 조회 실패 - ID: ${id}`);
      throw new NotFoundException('배차 업체 직원을 찾을 수 없습니다.');
    }
    
    this.logger.log(`[UPDATE] 업데이트 후 다시 조회 완료 - 조회된 데이터:`);
    this.logger.log(`[UPDATE]   - ID: ${reloaded.id}`);
    this.logger.log(`[UPDATE]   - userId: ${reloaded.userId}`);
    this.logger.log(`[UPDATE]   - dispatchCompanyId: ${reloaded.dispatchCompanyId}`);
    this.logger.log(`[UPDATE]   - name: ${reloaded.name}`);
    this.logger.log(`[UPDATE]   - phone: ${reloaded.phone}`);
    this.logger.log(`[UPDATE]   - position: ${reloaded.position}`);
    this.logger.log(`[UPDATE]   - status: ${reloaded.status}`);
    this.logger.log(`[UPDATE]   - dispatchCompany: ${reloaded.dispatchCompany ? JSON.stringify({ id: reloaded.dispatchCompany.id, name: reloaded.dispatchCompany.name }) : 'null'}`);
    this.logger.log(`[UPDATE] ========== 배차 업체 직원 수정 완료 ==========`);
    
    return reloaded;
  }

  async remove(id: number) {
    const dispatchUser = await this.findOne(id);
    await this.dispatchUserRepository.remove(dispatchUser);
    return { success: true };
  }
}

