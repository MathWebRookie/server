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
  HomeImage,
  Message,
  Moment,
  Notice,
  Photo,
  SiteDocument,
  TimelinePost,
  TreeHole,
  User,
} from './entities';
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
        synchronize: true,
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
  controllers: [AuthController, ContentController],
  providers: [AuthService, JwtStrategy, ContentService, SeedService],
})
export class AppModule {}
