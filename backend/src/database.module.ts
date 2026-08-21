import { Global, Module } from '@nestjs/common';
import { PrismaService } from './database.prisma';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
