import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { City } from './entities/city.entity';

@Injectable()
export class CitiesService {
  constructor(
    @InjectRepository(City)
    private citiesRepository: Repository<City>,
  ) {}

  async findAll(): Promise<City[]> {
    return this.citiesRepository.find({
      order: { order: 'ASC', name: 'ASC' },
      relations: ['region'],
    });
  }

  async findByRegionId(regionId: number): Promise<City[]> {
    return this.citiesRepository.find({
      where: { regionId },
      order: { order: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: number): Promise<City | null> {
    return this.citiesRepository.findOne({
      where: { id },
      relations: ['region'],
    });
  }

  async findByName(name: string, regionId?: number): Promise<City | null> {
    const where: any = { name };
    if (regionId) {
      where.regionId = regionId;
    }
    return this.citiesRepository.findOne({
      where,
      relations: ['region'],
    });
  }
}

