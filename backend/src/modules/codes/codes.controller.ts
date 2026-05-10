import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { CodesService } from './codes.service';
import { CreateCodeDto } from './dto/create-code.dto';
import { UpdateCodeDto } from './dto/update-code.dto';
import { GetCodesDto } from './dto/get-codes.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('codes')
@UseGuards(JwtAuthGuard)
export class CodesController {
  constructor(private readonly codesService: CodesService) {}

  @Post()
  create(@Body() createCodeDto: CreateCodeDto) {
    return this.codesService.create(createCodeDto);
  }

  @Get()
  findAll(@Query() query: GetCodesDto) {
    // code 파라미터를 group으로 변환 (호환성)
    const group = query.group || query.code;
    
    // 그룹 코드로 필터링하는 경우 (페이지네이션 없이)
    if (group && !query.page && !query.limit) {
      // parentId가 문자열로 올 수 있으므로 변환
      const parentId = query.parentId !== undefined ? (typeof query.parentId === 'string' ? parseInt(query.parentId, 10) : query.parentId) : undefined;
      return this.codesService.findByGroup(group, parentId);
    }
    
    // 페이지네이션이나 검색이 있는 경우
    if (query.page || query.limit || query.search || group) {
      // code를 group으로 변환하여 전달
      const paginationQuery = { ...query, group: group || query.group };
      return this.codesService.findWithPagination(paginationQuery);
    }
    
    // 전체 조회
    return this.codesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.codesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateCodeDto: UpdateCodeDto) {
    return this.codesService.update(id, updateCodeDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.codesService.remove(id);
  }
}


