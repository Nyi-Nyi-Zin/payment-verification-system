import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import configuration from './config/configuration';
import { DatabaseModule } from './database.module';
import { HealthController } from './health/health.controller';
import { ImportModule } from './imports/import.module';
import { StorageModule } from './storage/storage.module';
import { VerificationModule } from './verification/verification.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),
    DatabaseModule,
    AuthModule,
    StorageModule,
    ImportModule,
    VerificationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
