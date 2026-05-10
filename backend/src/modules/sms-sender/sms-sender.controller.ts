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
import { SmsSenderService } from './sms-sender.service';
import { CreateSmsSenderDto } from './dto/create-sms-sender.dto';
import { UpdateSmsSenderDto } from './dto/update-sms-sender.dto';
import { GetSmsSendersDto } from './dto/get-sms-senders.dto';

@Controller('sms-senders')
@UseGuards(JwtAuthGuard)
export class SmsSenderController {
  constructor(private readonly service: SmsSenderService) {}

  @Get()
  async findAll(@Query() query: GetSmsSendersDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateSmsSenderDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSmsSenderDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
