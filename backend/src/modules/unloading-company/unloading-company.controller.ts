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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UnloadingCompanyService } from './unloading-company.service';
import { CreateUnloadingCompanyDto } from './dto/create-unloading-company.dto';
import { UpdateUnloadingCompanyDto } from './dto/update-unloading-company.dto';
import { GetUnloadingCompaniesDto } from './dto/get-unloading-companies.dto';

@Controller('unloading-companies')
@UseGuards(JwtAuthGuard)
export class UnloadingCompanyController {
  constructor(private readonly service: UnloadingCompanyService) {}

  @Get()
  async findAll(@Query() query: GetUnloadingCompaniesDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateUnloadingCompanyDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUnloadingCompanyDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}

