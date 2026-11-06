import {
  Body,
  Controller,
  Get,
  Injectable,
  Patch,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { In, Repository } from 'typeorm';
import bcrypt from 'bcryptjs';
import { AccessRole, AccessUserRole, ExternalIdentity, User } from './entities';

export class LoginDto {
  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class UpdateProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  nickname!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  oldPassword!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(64)
  newPassword!: string;
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
    if (!user || user.enabled === false) {
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
    @InjectRepository(AccessUserRole)
    private readonly userRoles: Repository<AccessUserRole>,
    @InjectRepository(AccessRole)
    private readonly accessRoles: Repository<AccessRole>,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { username: dto.username } });
    const matched =
      user && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !matched) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    if (user.enabled === false) {
      throw new UnauthorizedException('账号已停用');
    }
    const token = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
    });
    return { token, username: user.username, nickname: user.nickname };
  }

  async roleCodes(userId: number) {
    const links = await this.userRoles.find({ where: { userId } });
    if (!links.length) return [];
    const roles = await this.accessRoles.find({
      where: { id: In(links.map((item) => item.roleId)) },
    });
    return roles.map((role) => role.code);
  }

  async updateProfile(userId: number, nickname: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('登录已失效');
    user.nickname = nickname.trim();
    await this.users.save(user);
    return { username: user.username, nickname: user.nickname };
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('登录已失效');
    const matched = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!matched) throw new UnauthorizedException('原密码不正确');
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.users.save(user);
    return { ok: true };
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
  async profile(@Req() req: AuthedRequest) {
    return {
      username: req.user.username,
      nickname: req.user.nickname,
      roles: await this.auth.roleCodes(req.user.id),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@Req() req: AuthedRequest, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(req.user.id, dto.nickname);
  }

  @UseGuards(JwtAuthGuard)
  @Put('password')
  changePassword(@Req() req: AuthedRequest, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.user.id, dto.oldPassword, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Post('external-identities')
  bindExternalIdentity(@Req() req: AuthedRequest, @Body() dto: BindExternalIdentityDto) {
    return this.auth.bindExternalIdentity(req.user.id, dto);
  }
}
