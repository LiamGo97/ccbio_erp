import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DispatchUserService } from './dispatch-user.service';
import { DispatchUserController } from './dispatch-user.controller';
import { DispatchUser } from './entities/dispatch-user.entity';
import { User } from '../users/entities/user.entity';
import { DispatchCompany } from '../dispatch-company/entities/dispatch-company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DispatchUser, User, DispatchCompany])],
  controllers: [DispatchUserController],
  providers: [DispatchUserService],
  exports: [DispatchUserService],
})
export class DispatchUserModule {}

