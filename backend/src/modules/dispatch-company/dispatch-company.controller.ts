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
import { DispatchCompanyService } from './dispatch-company.service';
import { CreateDispatchCompanyDto } from './dto/create-dispatch-company.dto';
import { UpdateDispatchCompanyDto } from './dto/update-dispatch-company.dto';
import { GetDispatchCompaniesDto } from './dto/get-dispatch-companies.dto';

@Controller('dispatch-companies')
@UseGuards(JwtAuthGuard)
export class DispatchCompanyController {
  constructor(private readonly service: DispatchCompanyService) {}

  @Get()
  async findAll(@Query() query: GetDispatchCompaniesDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateDispatchCompanyDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDispatchCompanyDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}

