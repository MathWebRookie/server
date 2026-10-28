import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController, AuthService, JwtStrategy } from './auth';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import {
  Article,
  ChartPoint,
  ExternalIdentity,
  HomeImage,
  Ledger,
  LedgerCategory,
  LedgerMember,
  LedgerTransaction,
  Message,
  Moment,
  Notice,
  Photo,
  SiteDocument,
  SkillAuditLog,
  TimelinePost,
  TreeHole,
  User,
} from './entities';
import { LedgerController, LedgerInternalController, LedgerService } from './ledger';
import { LedgerSkillAuthGuard } from './ledger-skill-auth.guard';
import { LedgerInitial1730000000000 } from './migrations/1730000000000-ledger-initial';
import { SeedService } from './seed.service';

const entities = [
  User,
  Article,
  Notice,
  TreeHole,
  TimelinePost,
  Photo,
  Moment,
  HomeImage,
  Message,
  ChartPoint,
  SiteDocument,
  ExternalIdentity,
  Ledger,
  LedgerMember,
  LedgerCategory,
  LedgerTransaction,
  SkillAuditLog,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities,
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        migrations: [LedgerInitial1730000000000],
        migrationsRun: config.get<string>('NODE_ENV') === 'production',
        retryAttempts: 10,
        retryDelay: 3000,
      }),
    }),
    TypeOrmModule.forFeature(entities),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-secret-change-me',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController, ContentController, LedgerController, LedgerInternalController],
  providers: [
    AuthService,
    JwtStrategy,
    ContentService,
    SeedService,
    LedgerService,
    LedgerSkillAuthGuard,
  ],
})
export class AppModule {}
