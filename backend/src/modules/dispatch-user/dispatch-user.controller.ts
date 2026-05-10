import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DispatchUserService } from './dispatch-user.service';
import { CreateDispatchUserDto } from './dto/create-dispatch-user.dto';
import { UpdateDispatchUserDto } from './dto/update-dispatch-user.dto';
import { GetDispatchUsersDto } from './dto/get-dispatch-users.dto';

@Controller('dispatch-users')
@UseGuards(JwtAuthGuard)
export class DispatchUserController {
  constructor(private readonly service: DispatchUserService) {}

  /**
   * 현재 로그인한 사용자의 배차 업체 ID 조회
   */
  @Get('me/company-id')
  async getMyDispatchCompanyId(@Request() req) {
    const dispatchCompanyId = await this.service.findDispatchCompanyIdByUserId(req.user.id);
    return { dispatchCompanyId };
  }

  /**
   * 현재 로그인한 사용자의 배차 업체 사용자 정보 조회
   */
  @Get('me')
  async getMyDispatchUserInfo(@Request() req) {
    const dispatchUser = await this.service.findByUserId(req.user.id);
    return dispatchUser;
  }

  @Get()
  async findAll(@Query() query: GetDispatchUsersDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateDispatchUserDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDispatchUserDto,
  ) {
    console.log(`[DISPATCH_USER_CONTROLLER] ========== 배차 업체 직원 수정 요청 ==========`);
    console.log(`[DISPATCH_USER_CONTROLLER] 배차 업체 직원 ID: ${id}`);
    console.log(`[DISPATCH_USER_CONTROLLER] 수정 요청 데이터: ${JSON.stringify(dto, null, 2)}`);
    console.log(`[DISPATCH_USER_CONTROLLER] dispatchCompanyId: ${dto.dispatchCompanyId} (타입: ${typeof dto.dispatchCompanyId})`);
    
    const result = await this.service.update(id, dto);
    
    console.log(`[DISPATCH_USER_CONTROLLER] 수정 완료 - 반환 데이터:`);
    console.log(`[DISPATCH_USER_CONTROLLER]   - ID: ${result.id}`);
    console.log(`[DISPATCH_USER_CONTROLLER]   - userId: ${result.userId}`);
    console.log(`[DISPATCH_USER_CONTROLLER]   - dispatchCompanyId: ${result.dispatchCompanyId}`);
    console.log(`[DISPATCH_USER_CONTROLLER]   - name: ${result.name}`);
    console.log(`[DISPATCH_USER_CONTROLLER] ========== 배차 업체 직원 수정 완료 ==========`);
    
    return result;
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}

