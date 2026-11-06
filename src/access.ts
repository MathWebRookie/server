import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { In, Repository } from 'typeorm';
import bcrypt from 'bcryptjs';
import { AuthedRequest, JwtAuthGuard } from './auth';
import {
  AccessMenu,
  AccessMenuType,
  AccessRole,
  AccessRoleMenu,
  AccessUserRole,
  User,
} from './entities';

const LEGACY_COMPONENT = /^[A-Za-z0-9][A-Za-z0-9_./-]*$/;
const VIEW_FILE = /^src\/views\/[A-Za-z0-9][A-Za-z0-9_./-]*\.vue$/;

export function normalizeComponent(input: string) {
  let value = input.trim().replace(/\\/g, '/');
  value = value.replace(/^@\//, 'src/').replace(/^\.\//, '');
  if (value.startsWith('views/')) value = `src/${value}`;
  if (value.startsWith('src/views/') && !value.endsWith('.vue')) value = `${value}.vue`;
  if (value.includes('..')) throw new BadRequestException('组件路径不能包含 ..');
  if (value.startsWith('src/')) {
    if (!VIEW_FILE.test(value)) throw new BadRequestException('组件路径需要是 src/views 下的 .vue 文件');
    return value;
  }
  if (!LEGACY_COMPONENT.test(value)) {
    throw new BadRequestException('组件路径需要是 src/views 下的 .vue 文件');
  }
  return value;
}

const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);

export class SaveMenuDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentId?: number | null;

  @IsIn(['catalog', 'page', 'button'])
  type!: AccessMenuType;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  path?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  component?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  icon?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  permission?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class SaveRoleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;
}

export class UpdateRoleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;
}

export class MenuIdsDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  menuIds!: number[];
}

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  username!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  nickname?: string;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  roleIds?: number[];
}

export class UpdateUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  nickname!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password!: string;
}

export class RoleIdsDto {
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  roleIds!: number[];
}

type MenuNode = AccessMenu & { children: MenuNode[] };

@Injectable()
export class AccessService {
  constructor(
    @InjectRepository(AccessRole) private readonly roles: Repository<AccessRole>,
    @InjectRepository(AccessMenu) private readonly menus: Repository<AccessMenu>,
    @InjectRepository(AccessRoleMenu) private readonly roleMenus: Repository<AccessRoleMenu>,
    @InjectRepository(AccessUserRole) private readonly userRoles: Repository<AccessUserRole>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async roleCodes(userId: number) {
    const links = await this.userRoles.find({ where: { userId } });
    if (!links.length) return [];
    const roles = await this.roles.find({ where: { id: In(links.map((item) => item.roleId)) } });
    return roles.map((role) => role.code);
  }

  async permissionCodes(userId: number) {
    const assigned = await this.assignedMenus(userId);
    return [
      ...new Set(
        assigned
          .filter((menu) => menu.type === 'button' && menu.permission)
          .map((menu) => menu.permission as string),
      ),
    ];
  }

  async mine(userId: number) {
    const codes = await this.roleCodes(userId);
    const assigned = await this.assignedMenus(userId);
    const assignedIds = new Set(assigned.map((menu) => menu.id));
    const all = await this.menus.find({ order: { sort: 'ASC', id: 'ASC' } });
    const byId = new Map(all.map((menu) => [menu.id, menu]));
    const include = new Set<number>();
    for (const menu of assigned) {
      if (menu.type === 'button' || !menu.visible) continue;
      include.add(menu.id);
      let parentId = menu.parentId;
      while (parentId) {
        const parent = byId.get(parentId);
        if (!parent || !parent.visible) break;
        include.add(parent.id);
        parentId = parent.parentId;
      }
    }
    const visible = all.filter((menu) => include.has(menu.id) && menu.type !== 'button');
    return {
      roles: codes,
      permissions: await this.permissionCodes(userId),
      menus: this.toTree(visible),
    };
  }

  async listMenus() {
    const all = await this.menus.find({ order: { sort: 'ASC', id: 'ASC' } });
    return { list: all, tree: this.toTree(all) };
  }

  async createMenu(dto: SaveMenuDto) {
    const payload = this.normalize(dto, null);
    return this.menus.save(this.menus.create(payload));
  }

  async updateMenu(id: number, dto: SaveMenuDto) {
    const current = await this.menus.findOne({ where: { id } });
    if (!current) throw new NotFoundException('路由不存在');
    if (current.path === '/Access' && dto.path && dto.path !== '/Access') {
      throw new BadRequestException('路由维护页的地址不能修改');
    }
    const payload = this.normalize(dto, current);
    if (payload.parentId === id) throw new BadRequestException('不能把节点挂到自己下面');
    await this.menus.update(id, payload);
    return this.menus.findOne({ where: { id } });
  }

  async removeMenu(id: number) {
    const current = await this.menus.findOne({ where: { id } });
    if (!current) throw new NotFoundException('路由不存在');
    if (current.path === '/Access' || current.permission === 'access:route' || current.permission === 'access:assign') {
      throw new BadRequestException('路由维护所需的节点不能删除');
    }
    const all = await this.menus.find();
    const ids = this.descendantIds(all, id);
    await this.roleMenus.delete({ menuId: In(ids) });
    await this.menus.delete({ id: In(ids) });
    return { ok: true };
  }

  async listRoles() {
    const roles = await this.roles.find({ order: { id: 'ASC' } });
    const links = await this.roleMenus.find();
    return roles.map((role) => ({
      ...role,
      menuIds: links.filter((link) => link.roleId === role.id).map((link) => link.menuId),
    }));
  }

  async createRole(dto: SaveRoleDto) {
    const code = dto.code.trim();
    const existing = await this.roles.findOne({ where: { code } });
    if (existing) throw new BadRequestException('角色编码已存在');
    return this.roles.save(this.roles.create({ code, name: dto.name.trim() }));
  }

  async updateRole(id: number, dto: UpdateRoleDto) {
    const role = await this.roles.findOne({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
    role.name = dto.name.trim();
    return this.roles.save(role);
  }

  async assignRoleMenus(roleId: number, menuIds: number[]) {
    const role = await this.roles.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException('角色不存在');
    const unique = [...new Set(menuIds)];
    if (unique.length) {
      const found = await this.menus.find({ where: { id: In(unique) } });
      if (found.length !== unique.length) throw new BadRequestException('包含不存在的路由');
    }
    if (role.code === 'admin') {
      const required = await this.menus.find({
        where: [{ path: '/Access' }, { permission: 'access:route' }, { permission: 'access:assign' }],
      });
      const missing = required.some((menu) => !unique.includes(menu.id));
      if (missing) throw new BadRequestException('管理员必须保留路由维护权限');
    }
    await this.roleMenus.delete({ roleId });
    if (unique.length) {
      await this.roleMenus.save(unique.map((menuId) => this.roleMenus.create({ roleId, menuId })));
    }
    return { ok: true };
  }

  async listUsers() {
    const users = await this.users.find({ order: { id: 'ASC' } });
    const links = await this.userRoles.find();
    return users.map((user) => ({
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      enabled: user.enabled !== false,
      roleIds: links.filter((link) => link.userId === user.id).map((link) => link.roleId),
    }));
  }

  async createUser(dto: CreateUserDto) {
    const username = dto.username.trim();
    const existing = await this.users.findOne({ where: { username } });
    if (existing) throw new BadRequestException('用户名已存在');
    const roleIds = [...new Set(dto.roleIds ?? [])];
    if (roleIds.length) {
      const found = await this.roles.find({ where: { id: In(roleIds) } });
      if (found.length !== roleIds.length) throw new BadRequestException('包含不存在的角色');
    }
    const user = await this.users.save(
      this.users.create({
        username,
        nickname: dto.nickname?.trim() || username,
        passwordHash: await bcrypt.hash(dto.password, 10),
        enabled: true,
      }),
    );
    if (roleIds.length) {
      await this.userRoles.save(roleIds.map((roleId) => this.userRoles.create({ userId: user.id, roleId })));
    }
    return { id: user.id, username: user.username, nickname: user.nickname, enabled: true, roleIds };
  }

  async updateUser(actorId: number, userId: number, dto: UpdateUserDto) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('账号不存在');
    if (actorId === userId && dto.enabled === false) {
      throw new BadRequestException('不能停用当前登录账号');
    }
    const links = await this.userRoles.find({ where: { userId } });
    await this.ensureAdminRemains(userId, links.map((link) => link.roleId), dto.enabled);
    user.nickname = dto.nickname.trim();
    user.enabled = dto.enabled;
    await this.users.save(user);
    return { id: user.id, nickname: user.nickname, enabled: user.enabled };
  }

  async resetPassword(userId: number, password: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('账号不存在');
    user.passwordHash = await bcrypt.hash(password, 10);
    await this.users.save(user);
    return { ok: true };
  }

  async assignUserRoles(actorId: number, userId: number, roleIds: number[]) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('账号不存在');
    const unique = [...new Set(roleIds)];
    if (unique.length) {
      const found = await this.roles.find({ where: { id: In(unique) } });
      if (found.length !== unique.length) throw new BadRequestException('包含不存在的角色');
    }
    await this.ensureAdminRemains(userId, unique, user.enabled !== false);
    await this.userRoles.delete({ userId });
    if (unique.length) {
      await this.userRoles.save(unique.map((roleId) => this.userRoles.create({ userId, roleId })));
    }
    return { ok: true, self: actorId === userId };
  }

  private async ensureAdminRemains(userId: number, nextRoleIds: number[], enabled: boolean) {
    const admin = await this.roles.findOne({ where: { code: 'admin' } });
    if (!admin) return;
    const holders = await this.userRoles.find({ where: { roleId: admin.id } });
    const others = holders.filter((link) => link.userId !== userId);
    const otherUsers = others.length
      ? await this.users.find({ where: { id: In(others.map((link) => link.userId)) } })
      : [];
    const otherEnabled = otherUsers.some((item) => item.enabled !== false);
    const keepsAdmin = enabled && nextRoleIds.includes(admin.id);
    if (!otherEnabled && !keepsAdmin) throw new BadRequestException('至少保留一个启用的管理员账号');
  }

  private async assignedMenus(userId: number) {
    const links = await this.userRoles.find({ where: { userId } });
    if (!links.length) return [];
    const roleMenus = await this.roleMenus.find({
      where: { roleId: In(links.map((item) => item.roleId)) },
    });
    if (!roleMenus.length) return [];
    return this.menus.find({ where: { id: In(roleMenus.map((item) => item.menuId)) } });
  }

  private normalize(dto: SaveMenuDto, current: AccessMenu | null) {
    const type = dto.type;
    const title = dto.title.trim();
    const path = dto.path?.trim() || null;
    const component = dto.component?.trim() || null;
    const permission = dto.permission?.trim() || null;
    if (type === 'page') {
      if (!path || !path.startsWith('/')) throw new BadRequestException('页面地址需要以 / 开头');
      if (!component) throw new BadRequestException('页面需要填写组件路径');
      try {
        normalizeComponent(component);
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException('组件路径需要是 src/views 下的 .vue 文件');
      }
    }
    if (type === 'button') {
      if (!permission) throw new BadRequestException('按钮需要权限码');
      if (path || component) throw new BadRequestException('按钮不能设置地址或组件');
    }
    if (type === 'catalog' && component) {
      throw new BadRequestException('目录不能设置页面组件');
    }
    return {
      parentId: dto.parentId === undefined ? (current?.parentId ?? null) : dto.parentId,
      type,
      title,
      path: type === 'button' ? null : path,
      component: type === 'page' && component ? normalizeComponent(component) : null,
      icon: dto.icon?.trim() || null,
      permission,
      sort: dto.sort ?? current?.sort ?? 0,
      visible: dto.visible ?? current?.visible ?? true,
    };
  }

  private descendantIds(all: AccessMenu[], rootId: number) {
    const ids = [rootId];
    const walk = (parentId: number) => {
      for (const menu of all) {
        if (menu.parentId === parentId) {
          ids.push(menu.id);
          walk(menu.id);
        }
      }
    };
    walk(rootId);
    return ids;
  }

  private toTree(menus: AccessMenu[]): MenuNode[] {
    const nodes = new Map<number, MenuNode>(menus.map((menu) => [menu.id, { ...menu, children: [] }]));
    const roots: MenuNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    const sortNodes = (list: MenuNode[]) => {
      list.sort((a, b) => a.sort - b.sort || a.id - b.id);
      list.forEach((item) => sortNodes(item.children));
    };
    sortNodes(roots);
    return roots;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const owned = await this.access.permissionCodes(req.user.id);
    if (!required.some((code) => owned.includes(code))) {
      throw new ForbiddenException('没有权限');
    }
    return true;
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('access')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get('mine')
  mine(@Req() req: AuthedRequest) {
    return this.access.mine(req.user.id);
  }

  @RequirePermissions('access:route', 'access:assign')
  @Get('menus')
  menus() {
    return this.access.listMenus();
  }

  @RequirePermissions('access:route')
  @Post('menus')
  createMenu(@Body() dto: SaveMenuDto) {
    return this.access.createMenu(dto);
  }

  @RequirePermissions('access:route')
  @Patch('menus/:id')
  updateMenu(@Param('id', ParseIntPipe) id: number, @Body() dto: SaveMenuDto) {
    return this.access.updateMenu(id, dto);
  }

  @RequirePermissions('access:route')
  @Delete('menus/:id')
  removeMenu(@Param('id', ParseIntPipe) id: number) {
    return this.access.removeMenu(id);
  }

  @RequirePermissions('access:assign')
  @Get('roles')
  roles() {
    return this.access.listRoles();
  }

  @RequirePermissions('access:assign')
  @Post('roles')
  createRole(@Body() dto: SaveRoleDto) {
    return this.access.createRole(dto);
  }

  @RequirePermissions('access:assign')
  @Patch('roles/:id')
  updateRole(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.access.updateRole(id, dto);
  }

  @RequirePermissions('access:assign')
  @Put('roles/:id/menus')
  assignRoleMenus(@Param('id', ParseIntPipe) id: number, @Body() dto: MenuIdsDto) {
    return this.access.assignRoleMenus(id, dto.menuIds);
  }

  @RequirePermissions('access:assign')
  @Get('users')
  users() {
    return this.access.listUsers();
  }

  @RequirePermissions('access:assign')
  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.access.createUser(dto);
  }

  @RequirePermissions('access:assign')
  @Patch('users/:id')
  updateUser(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.access.updateUser(req.user.id, id, dto);
  }

  @RequirePermissions('access:assign')
  @Put('users/:id/password')
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto) {
    return this.access.resetPassword(id, dto.password);
  }

  @RequirePermissions('access:assign')
  @Put('users/:id/roles')
  assignUserRoles(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RoleIdsDto,
  ) {
    return this.access.assignUserRoles(req.user.id, id, dto.roleIds);
  }
}
