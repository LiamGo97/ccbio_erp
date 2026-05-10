import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Code } from './entities/code.entity';
import { CreateCodeDto } from './dto/create-code.dto';
import { UpdateCodeDto } from './dto/update-code.dto';
import { GetCodesDto } from './dto/get-codes.dto';

@Injectable()
export class CodesService {
  constructor(
    @InjectRepository(Code)
    private codesRepository: Repository<Code>,
  ) {}

  private sanitizeAliases(raw?: string | null): string | null {
    if (!raw) {
      return null;
    }
    const normalized = raw
      .split(/[\n,;]/)
      .map((alias) => alias.trim())
      .filter((alias) => alias.length > 0);
    if (!normalized.length) {
      return null;
    }
    return Array.from(new Set(normalized)).join(', ');
  }

  async create(createCodeDto: CreateCodeDto): Promise<Code> {
    // 같은 그룹 내에서 같은 이름 중복 확인 (부모가 같은 경우)
    const existingCode = await this.codesRepository.findOne({
      where: {
        group: createCodeDto.group,
        name: createCodeDto.name,
        parentId: createCodeDto.parentId ?? null,
      },
    });

    if (existingCode) {
      throw new ConflictException('이미 존재하는 코드입니다.');
    }

    const code = this.codesRepository.create({
      ...createCodeDto,
      aliases: this.sanitizeAliases(createCodeDto.aliases ?? null),
      order: createCodeDto.order ?? 0,
    });
    return this.codesRepository.save(code);
  }

  async findWithPagination(dto: GetCodesDto): Promise<{
    data: Code[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 10, group, parentId, search, sortBy = 'order', sortOrder = 'asc' } = dto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.codesRepository.createQueryBuilder('code');

    // 그룹 필터
    if (group) {
      queryBuilder.andWhere('code.group = :group', { group });
    }

    // 부모 ID 필터
    if (parentId !== undefined) {
      queryBuilder.andWhere('code.parentId = :parentId', { parentId });
    } else if (parentId === null) {
      queryBuilder.andWhere('code.parentId IS NULL');
    }

    // 검색 필터
    if (search) {
      const searchClause = `
        (
          LOWER(code.name) LIKE LOWER(:search)
          OR LOWER(code.value) LIKE LOWER(:search)
          OR LOWER(code.aliases) LIKE LOWER(:search)
        )
      `.replace(/\s+/g, ' ');
      queryBuilder.andWhere(searchClause, { search: `%${search}%` });
    }

    // 정렬 (허용된 컬럼만)
    const allowedSortColumns = ['group', 'name', 'order', 'createdAt', 'aliases'];
    const sortColumn = allowedSortColumns.includes(sortBy) ? `code.${sortBy}` : 'code.order';
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

  async findByGroup(groupCode: string, parentId?: number | null): Promise<Code[]> {
    const where: any = { group: groupCode };
    if (parentId !== undefined && parentId !== null) {
      where.parentId = parentId;
    } else if (parentId === null) {
      where.parentId = null;
    }
    return this.codesRepository.find({
      where,
      order: { order: 'ASC', name: 'ASC' },
    });
  }

  async findByCategory(categoryCode: string): Promise<Code[]> {
    // 호환성을 위해 group으로 조회
    return this.findByGroup(categoryCode);
  }

  async findAll(): Promise<Code[]> {
    return this.codesRepository.find({
      order: { group: 'ASC', order: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Code> {
    const code = await this.codesRepository.findOne({
      where: { id },
      relations: ['parent'],
    });

    if (!code) {
      throw new NotFoundException('코드를 찾을 수 없습니다.');
    }

    return code;
  }

  async update(id: number, updateCodeDto: UpdateCodeDto): Promise<Code> {
    const code = await this.findOne(id);

    // 같은 그룹 내에서 이름 중복 확인 (자신 제외)
    if (updateCodeDto.name && (updateCodeDto.group ?? code.group)) {
      const existingCode = await this.codesRepository.findOne({
        where: {
          group: updateCodeDto.group ?? code.group,
          name: updateCodeDto.name,
          parentId: updateCodeDto.parentId !== undefined ? updateCodeDto.parentId : code.parentId ?? null,
        },
      });

      if (existingCode && existingCode.id !== id) {
        throw new ConflictException('이미 존재하는 코드입니다.');
      }
    }

    const updated: UpdateCodeDto = {
      ...updateCodeDto,
    };

    if (updated.aliases !== undefined) {
      (updated as any).aliases = this.sanitizeAliases(updated.aliases);
    }

    Object.assign(code, updated);
    return this.codesRepository.save(code);
  }

  async remove(id: number): Promise<void> {
    const code = await this.findOne(id);
    await this.codesRepository.remove(code);
  }
}
    