import {
  Body,
  Controller,
  Get,
  Injectable,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { IsString, MinLength } from 'class-validator';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import bcrypt from 'bcryptjs';
import { ExternalIdentity, User } from './entities';

export class LoginDto {
  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class BindExternalIdentityDto {
  @IsString()
  @MinLength(1)
  provider!: string;

  @IsString()
  @MinLength(1)
  providerUserId!: string;
}

export type JwtPayload = { sub: number; username: string };

export type AuthedRequest = Request & { user: { id: number; username: string; nickname: string } };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'dev-secret-change-me',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('登录已失效');
    }
    return { id: user.id, username: user.username, nickname: user.nickname };
  }
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(ExternalIdentity)
    private readonly externalIdentities: Repository<ExternalIdentity>,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { username: dto.username } });
    const matched =
      user && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !matched) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const token = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
    });
    return { token, username: user.username, nickname: user.nickname };
  }

  async bindExternalIdentity(userId: number, dto: BindExternalIdentityDto) {
    const provider = dto.provider.trim().toLowerCase();
    const providerUserId = dto.providerUserId.trim();
    const existing = await this.externalIdentities.findOne({ where: { provider, providerUserId } });
    if (existing && existing.userId !== userId) {
      throw new UnauthorizedException('该外部身份已绑定到其他账号');
    }
    if (existing) return existing;
    return this.externalIdentities.save(
      this.externalIdentities.create({ provider, providerUserId, userId }),
    );
  }
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('logout')
  logout() {
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  profile(@Req() req: AuthedRequest) {
    return {
      username: req.user.username,
      nickname: req.user.nickname,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('external-identities')
  bindExternalIdentity(@Req() req: AuthedRequest, @Body() dto: BindExternalIdentityDto) {
    return this.auth.bindExternalIdentity(req.user.id, dto);
  }
}
