import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { GetRolesDto } from './dto/get-roles.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private rolesRepository: Repository<Role>,
  ) {}

  async create(createRoleDto: CreateRoleDto): Promise<Role> {
    // 코드 중복 확인
    const existingRole = await this.rolesRepository.findOne({
      where: [{ code: createRoleDto.code }, { name: createRoleDto.name }],
    });

    if (existingRole) {
      throw new ConflictException('이미 존재하는 역할 코드 또는 이름입니다.');
    }

    const role = this.rolesRepository.create(createRoleDto);
    return this.rolesRepository.save(role);
  }

  async findWithPagination(dto: GetRolesDto): Promise<{
    data: Role[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 10, search, status = 'all', sortBy = 'createdAt', sortOrder = 'desc' } = dto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.rolesRepository.createQueryBuilder('role');

    // 상태 필터
    if (status === 'active') {
      queryBuilder.andWhere('role.isActive = :isActive', { isActive: true });
    } else if (status === 'inactive') {
      queryBuilder.andWhere('role.isActive = :isActive', { isActive: false });
    }

    // 검색 필터
    if (search) {
      queryBuilder.andWhere(
        '(LOWER(role.name) LIKE LOWER(:search) OR LOWER(role.code) LIKE LOWER(:search) OR LOWER(role.description) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    // 정렬 (허용된 컬럼만)
    const allowedSortColumns = ['code', 'name', 'createdAt', 'isActive'];
    const sortColumn = allowedSortColumns.includes(sortBy) ? `role.${sortBy}` : 'role.createdAt';
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

  async findAll(): Promise<Role[]> {
    return this.rolesRepository.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Role> {
    const role = await this.rolesRepository.findOne({
      where: { id },
      relations: ['users'],
    });

    if (!role) {
      throw new NotFoundException('역할을 찾을 수 없습니다.');
    }

    return role;
  }

  async update(id: number, updateRoleDto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOne(id);

    // 코드/이름 중복 확인 (자신 제외)
    if (updateRoleDto.code || updateRoleDto.name) {
      const existingRole = await this.rolesRepository.findOne({
        where: [
          updateRoleDto.code ? { code: updateRoleDto.code } : {},
          updateRoleDto.name ? { name: updateRoleDto.name } : {},
        ],
      });

      if (existingRole && existingRole.id !== id) {
        throw new ConflictException('이미 존재하는 역할 코드 또는 이름입니다.');
      }
    }

    Object.assign(role, updateRoleDto);
    return this.rolesRepository.save(role);
  }

  async remove(id: number): Promise<void> {
    const role = await this.findOne(id);
    await this.rolesRepository.remove(role);
  }
}

