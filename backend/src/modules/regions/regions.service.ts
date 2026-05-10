import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Region } from './entities/region.entity';

@Injectable()
export class RegionsService {
  constructor(
    @InjectRepository(Region)
    private regionsRepository: Repository<Region>,
  ) {}

  async findAll(): Promise<Region[]> {
    return this.regionsRepository.find({
      order: { order: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Region | null> {
    return this.regionsRepository.findOne({
      where: { id },
      relations: ['cities'],
    });
  }

  async findByName(name: string): Promise<Region | null> {
    return this.regionsRepository.findOne({
      where: { name },
    });
  }
}

