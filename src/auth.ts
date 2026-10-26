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
import { User } from './entities';

export class LoginDto {
  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
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
}
