import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { GetUsersDto } from './dto/get-users.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '../roles/entities/role.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Role)
    private rolesRepository: Repository<Role>,
  ) {}

  async findByEmail(email: string, includePassword = false): Promise<User | null> {
    const user = await this.usersRepository.findOne({ where: { email } });
    if (!user || !includePassword) {
      return user;
    }
    // 비밀번호가 필요한 경우 다시 조회
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { googleId } });
  }

  async createInternal(userData: {
    email: string;
    name?: string;
    picture?: string;
    googleId?: string;
    googleAccessToken?: string;
    googleRefreshToken?: string;
    password?: string;
  }): Promise<User> {
    // 비밀번호가 있으면 해싱
    if (userData.password) {
      const salt = await bcrypt.genSalt(10);
      userData.password = await bcrypt.hash(userData.password, salt);
    }

    const user = this.usersRepository.create(userData);
    return this.usersRepository.save(user);
  }

  async findOrCreate(userData: {
    email: string;
    name?: string;
    picture?: string;
    googleId?: string;
    googleAccessToken?: string;
    googleRefreshToken?: string;
  }): Promise<User> {
    let user = await this.findByEmail(userData.email);

    if (!user && userData.googleId) {
      user = await this.findByGoogleId(userData.googleId);
    }

    if (!user) {
      // 새 사용자 생성 (처음 로그인)
      user = await this.createInternal(userData);
      if (userData.googleRefreshToken) {
        console.log(`[findOrCreate] 새 사용자 생성 - refresh token 저장됨 - userId: ${user.id}, email: ${user.email}`);
      } else {
        console.warn(`[findOrCreate] ⚠️ 새 사용자 생성 - refresh token 없음 - userId: ${user.id}, email: ${user.email} (처음 로그인 시 refresh token이 와야 함)`);
      }
    } else {
      // 기존 사용자 정보 업데이트
      if (userData.name) user.name = userData.name;
      if (userData.picture) user.picture = userData.picture;
      if (userData.googleId) user.googleId = userData.googleId;
      // 구글 토큰 업데이트
      // Google OAuth는 처음 로그인할 때만 refresh token을 제공하고,
      // 이후 로그인에서는 refresh token이 오지 않으므로 기존 refresh token을 유지해야 함
      if (userData.googleAccessToken) {
        user = await this.usersRepository
          .createQueryBuilder('user')
          .addSelect('user.googleAccessToken')
          .addSelect('user.googleRefreshToken')
          .where('user.id = :id', { id: user.id })
          .getOne();
        
        if (!user) {
          throw new Error('사용자를 찾을 수 없습니다.');
        }
        
        // 액세스 토큰은 항상 업데이트
        const hadRefreshToken = !!user.googleRefreshToken;
        user.googleAccessToken = userData.googleAccessToken;
        
        // refresh token은 새로 받은 경우에만 업데이트
        // Google OAuth 특성:
        // - 처음 로그인할 때: refresh token 제공
        // - 이후 로그인: refresh token 제공 안 함 (기존 refresh token 유지)
        // - 재승인 시 (앱 권한 취소 후 다시 승인): refresh token 다시 제공
        if (userData.googleRefreshToken) {
          user.googleRefreshToken = userData.googleRefreshToken;
          console.log(`[findOrCreate] refresh token 업데이트됨 - userId: ${user.id}, email: ${user.email}`);
        } else {
          if (hadRefreshToken) {
            console.log(`[findOrCreate] refresh token 유지됨 (기존 값 사용) - userId: ${user.id}, email: ${user.email}`);
          } else {
            console.warn(`[findOrCreate] ⚠️ refresh token 없음 - userId: ${user.id}, email: ${user.email} (처음 로그인 시 refresh token이 와야 함)`);
          }
        }
      }
      await this.usersRepository.save(user);
    }

    return user;
  }

  async findById(id: number): Promise<User | null> {
    return this.usersRepository.findOne({ 
      where: { id },
      relations: ['roles'],
    });
  }

  async findByIdWithTokens(id: number): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.googleAccessToken')
      .addSelect('user.googleRefreshToken')
      .where('user.id = :id', { id })
      .getOne();
  }

  async updateGoogleTokens(
    id: number,
    tokens: { accessToken?: string; refreshToken?: string },
  ): Promise<void> {
    const user = await this.findByIdWithTokens(id);
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    if (tokens.accessToken) {
      user.googleAccessToken = tokens.accessToken;
    }
    if (tokens.refreshToken) {
      user.googleRefreshToken = tokens.refreshToken;
    }

    await this.usersRepository.save(user);
  }

  async validatePassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  async createWithPassword(userData: {
    email: string;
    password: string;
    name?: string;
  }): Promise<User> {
    // 이메일 중복 확인
    const existingUser = await this.findByEmail(userData.email);
    if (existingUser) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    return this.createInternal({
      email: userData.email,
      password: userData.password,
      name: userData.name,
    });
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findWithPagination(dto: GetUsersDto): Promise<{
    data: User[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 10,
      search,
      status = 'all',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      roleCode,
    } = dto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.usersRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'roles');

    if (roleCode) {
      queryBuilder.andWhere('roles.code = :roleCode', { roleCode });
    }

    // 상태 필터
    if (status === 'active') {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive: true });
    } else if (status === 'inactive') {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive: false });
    }

    // 검색 필터
    if (search) {
      queryBuilder.andWhere(
        '(LOWER(user.email) LIKE LOWER(:search) OR LOWER(user.name) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    // 정렬 (허용된 컬럼만)
    const allowedSortColumns = ['email', 'name', 'createdAt', 'isActive'];
    const sortColumn = allowedSortColumns.includes(sortBy) ? `user.${sortBy}` : 'user.createdAt';
    queryBuilder.orderBy(sortColumn, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    // 전체 개수 조회
    const total = await queryBuilder.getCount();

    // 페이지네이션 적용
    queryBuilder.skip(skip).take(limit);

    // 데이터 조회
    const data = await queryBuilder.getMany();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    // 이메일 중복 확인
    const existingUser = await this.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    // 비밀번호 해싱
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

    // 역할 조회
    let roles: Role[] = [];
    if (createUserDto.roleIds && createUserDto.roleIds.length > 0) {
      roles = await this.rolesRepository.find({
        where: { id: In(createUserDto.roleIds) },
      });
    }

    // 사용자 생성
    const user = this.usersRepository.create({
      email: createUserDto.email,
      password: hashedPassword,
      name: createUserDto.name,
      phone: createUserDto.phone || null,
      isActive: createUserDto.isActive !== undefined ? createUserDto.isActive : true,
      warehouseId: createUserDto.warehouseId || null,
      roles,
    });

    return this.usersRepository.save(user);
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    console.log(`[USERS_SERVICE] ========== 사용자 수정 시작 ==========`);
    console.log(`[USERS_SERVICE] 사용자 ID: ${id}`);
    console.log(`[USERS_SERVICE] 수정 요청 데이터:`, JSON.stringify(updateUserDto, null, 2));
    console.log(`[USERS_SERVICE] roleIds: ${JSON.stringify(updateUserDto.roleIds)}`);
    console.log(`[USERS_SERVICE] warehouseId: ${updateUserDto.warehouseId} (타입: ${typeof updateUserDto.warehouseId})`);
    
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['roles'],
    });

    if (!user) {
      console.log(`[USERS_SERVICE] 사용자를 찾을 수 없음 - ID: ${id}`);
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
    
    console.log(`[USERS_SERVICE] 기존 사용자 데이터:`);
    console.log(`[USERS_SERVICE]   - ID: ${user.id}`);
    console.log(`[USERS_SERVICE]   - email: ${user.email}`);
    console.log(`[USERS_SERVICE]   - name: ${user.name}`);
    console.log(`[USERS_SERVICE]   - phone: ${user.phone}`);
    console.log(`[USERS_SERVICE]   - isActive: ${user.isActive}`);
    console.log(`[USERS_SERVICE]   - warehouseId: ${user.warehouseId}`);
    console.log(`[USERS_SERVICE]   - roles: ${JSON.stringify(user.roles?.map(r => ({ id: r.id, name: r.name, code: r.code })))}`);

    // 비밀번호 업데이트
    if (updateUserDto.password) {
      console.log(`[USERS_SERVICE] 비밀번호 업데이트 시도`);
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(updateUserDto.password, salt);
      console.log(`[USERS_SERVICE] 비밀번호 업데이트 완료`);
    }

    // 이름 업데이트
    if (updateUserDto.name !== undefined) {
      console.log(`[USERS_SERVICE] 이름 변경: ${user.name} -> ${updateUserDto.name}`);
      user.name = updateUserDto.name;
    }

    // 전화번호 업데이트
    if (updateUserDto.phone !== undefined) {
      console.log(`[USERS_SERVICE] 전화번호 변경: ${user.phone} -> ${updateUserDto.phone}`);
      user.phone = updateUserDto.phone || null;
    }

    // 상태 업데이트
    if (updateUserDto.isActive !== undefined) {
      console.log(`[USERS_SERVICE] 상태 변경: ${user.isActive} -> ${updateUserDto.isActive}`);
      user.isActive = updateUserDto.isActive;
    }

    // 창고 ID 업데이트
    if (updateUserDto.warehouseId !== undefined) {
      console.log(`[USERS_SERVICE] 창고 ID 변경: ${user.warehouseId} -> ${updateUserDto.warehouseId}`);
      user.warehouseId = updateUserDto.warehouseId || null;
    }

    // 역할 업데이트
    if (updateUserDto.roleIds !== undefined) {
      console.log(`[USERS_SERVICE] 역할 업데이트 시도 - 요청된 roleIds: ${JSON.stringify(updateUserDto.roleIds)}`);
      if (updateUserDto.roleIds.length > 0) {
        const roles = await this.rolesRepository.find({
          where: { id: In(updateUserDto.roleIds) },
        });
        console.log(`[USERS_SERVICE] 조회된 역할: ${JSON.stringify(roles.map(r => ({ id: r.id, name: r.name, code: r.code })))}`);
        user.roles = roles;
        console.log(`[USERS_SERVICE] 역할 업데이트 완료 - 역할 수: ${roles.length}`);
      } else {
        user.roles = [];
        console.log(`[USERS_SERVICE] 모든 역할 제거`);
      }
    }

    console.log(`[USERS_SERVICE] 저장 전 최종 데이터:`);
    console.log(`[USERS_SERVICE]   - name: ${user.name}`);
    console.log(`[USERS_SERVICE]   - phone: ${user.phone}`);
    console.log(`[USERS_SERVICE]   - isActive: ${user.isActive}`);
    console.log(`[USERS_SERVICE]   - warehouseId: ${user.warehouseId}`);
    console.log(`[USERS_SERVICE]   - roles: ${JSON.stringify(user.roles?.map(r => ({ id: r.id, name: r.name, code: r.code })))}`);

    const saved = await this.usersRepository.save(user);
    
    console.log(`[USERS_SERVICE] 저장 완료 - 저장된 데이터:`);
    console.log(`[USERS_SERVICE]   - ID: ${saved.id}`);
    console.log(`[USERS_SERVICE]   - email: ${saved.email}`);
    console.log(`[USERS_SERVICE]   - name: ${saved.name}`);
    console.log(`[USERS_SERVICE]   - phone: ${saved.phone}`);
    console.log(`[USERS_SERVICE]   - isActive: ${saved.isActive}`);
    console.log(`[USERS_SERVICE]   - warehouseId: ${saved.warehouseId}`);
    console.log(`[USERS_SERVICE]   - roles: ${JSON.stringify(saved.roles?.map(r => ({ id: r.id, name: r.name, code: r.code })))}`);
    console.log(`[USERS_SERVICE] ========== 사용자 수정 완료 ==========`);
    
    return saved;
  }

  async remove(id: number): Promise<void> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
    await this.usersRepository.remove(user);
  }

  async updateRoles(userId: number, roleIds: number[]): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    if (roleIds.length > 0) {
      const roles = await this.rolesRepository.find({
        where: { id: In(roleIds) },
      });
      user.roles = roles;
    } else {
      user.roles = [];
    }

    return this.usersRepository.save(user);
  }
}

