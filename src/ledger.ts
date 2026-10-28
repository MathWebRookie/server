import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AuthedRequest, JwtAuthGuard } from './auth';
import {
  ExternalIdentity,
  Ledger,
  LedgerCategory,
  LedgerMember,
  LedgerTransaction,
  SkillAuditLog,
  User,
} from './entities';
import { LedgerSkillAuthGuard } from './ledger-skill-auth.guard';

type Direction = 'income' | 'expense';
type LedgerRole = 'owner' | 'admin' | 'member' | 'viewer';

export class CreateLedgerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @IsIn(['CNY', 'USD', 'EUR', 'JPY'])
  currency?: string;
}

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsIn(['income', 'expense'])
  direction!: Direction;
}

export class CreateTransactionDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsIn(['income', 'expense'])
  direction!: Direction;

  @IsOptional()
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class AddMemberDto {
  @IsInt()
  @Min(1)
  userId!: number;

  @IsIn(['admin', 'member', 'viewer'])
  role!: Exclude<LedgerRole, 'owner'>;
}

export class SkillTransactionDto extends CreateTransactionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  weixinUserId!: string;

  @IsInt()
  @Min(1)
  ledgerId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  messageId!: string;
}

export class SkillWeixinIdentityDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  weixinUserId!: string;
}

export class SkillLedgerQueryDto extends SkillWeixinIdentityDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ledgerId!: number;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsIn(['income', 'expense'])
  direction?: Direction;
}

@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(Ledger) private readonly ledgers: Repository<Ledger>,
    @InjectRepository(LedgerMember) private readonly members: Repository<LedgerMember>,
    @InjectRepository(LedgerCategory) private readonly categories: Repository<LedgerCategory>,
    @InjectRepository(LedgerTransaction) private readonly transactions: Repository<LedgerTransaction>,
    @InjectRepository(ExternalIdentity) private readonly identities: Repository<ExternalIdentity>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(SkillAuditLog) private readonly auditLogs: Repository<SkillAuditLog>,
  ) {}

  async listLedgers(userId: number) {
    const memberships = await this.members.find({ where: { userId }, order: { ledgerId: 'ASC' } });
    if (!memberships.length) return [];
    const ledgers = await this.ledgers.findByIds(memberships.map(({ ledgerId }) => ledgerId));
    return ledgers.map((ledger) => ({
      ...ledger,
      role: memberships.find((member) => member.ledgerId === ledger.id)?.role,
    }));
  }

  async createLedger(userId: number, dto: CreateLedgerDto) {
    const ledger = await this.ledgers.save(
      this.ledgers.create({
        name: dto.name.trim(),
        currency: dto.currency ?? 'CNY',
        ownerUserId: userId,
      }),
    );
    await this.members.save(this.members.create({ ledgerId: ledger.id, userId, role: 'owner' }));
    return ledger;
  }

  async addMember(actorId: number, ledgerId: number, dto: AddMemberDto) {
    await this.requireRole(actorId, ledgerId, ['owner', 'admin']);
    const target = await this.users.findOne({ where: { id: dto.userId } });
    if (!target) throw new NotFoundException('用户不存在');
    const existing = await this.members.findOne({ where: { ledgerId, userId: dto.userId } });
    if (existing) {
      existing.role = dto.role;
      return this.members.save(existing);
    }
    return this.members.save(
      this.members.create({ ledgerId, userId: dto.userId, role: dto.role }),
    );
  }

  async createCategory(actorId: number, ledgerId: number, dto: CreateCategoryDto) {
    await this.requireRole(actorId, ledgerId, ['owner', 'admin', 'member']);
    return this.categories.save(
      this.categories.create({ ledgerId, name: dto.name.trim(), direction: dto.direction }),
    );
  }

  async listCategories(actorId: number, ledgerId: number) {
    await this.requireRole(actorId, ledgerId, ['owner', 'admin', 'member', 'viewer']);
    return this.categories.find({ where: { ledgerId }, order: { name: 'ASC' } });
  }

  async createTransaction(
    actorId: number,
    ledgerId: number,
    dto: CreateTransactionDto,
    source = 'web',
  ) {
    await this.requireRole(actorId, ledgerId, ['owner', 'admin', 'member']);
    if (dto.categoryId) {
      const category = await this.categories.findOne({ where: { id: dto.categoryId, ledgerId } });
      if (!category) throw new NotFoundException('分类不存在或不属于该账本');
      if (category.direction !== dto.direction) {
        throw new ForbiddenException('收支方向与分类不一致');
      }
    }
    if (dto.idempotencyKey) {
      const existing = await this.transactions.findOne({
        where: { source, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return existing;
    }
    return this.transactions.save(
      this.transactions.create({
        ledgerId,
        createdByUserId: actorId,
        categoryId: dto.categoryId ?? null,
        amountMinor: String(dto.amountMinor),
        direction: dto.direction,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        note: dto.note?.trim() || null,
        source,
        idempotencyKey: dto.idempotencyKey ?? null,
      }),
    );
  }

  async listTransactions(
    actorId: number,
    ledgerId: number,
    options: { limit?: number; from?: string; to?: string; direction?: Direction } = {},
  ) {
    await this.requireRole(actorId, ledgerId, ['owner', 'admin', 'member', 'viewer']);
    const query = this.transactions
      .createQueryBuilder('transaction')
      .leftJoin(
        LedgerCategory,
        'category',
        'category.id = transaction.categoryId AND category.ledgerId = transaction.ledgerId',
      )
      .select('transaction.id', 'id')
      .addSelect('transaction.ledgerId', 'ledgerId')
      .addSelect('transaction.amountMinor', 'amountMinor')
      .addSelect('transaction.direction', 'direction')
      .addSelect('transaction.occurredAt', 'occurredAt')
      .addSelect('transaction.note', 'note')
      .addSelect('transaction.categoryId', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .where('transaction.ledgerId = :ledgerId', { ledgerId })
      .orderBy('transaction.occurredAt', 'DESC')
      .addOrderBy('transaction.id', 'DESC')
      .limit(Math.min(Math.max(options.limit ?? 50, 1), 100));
    this.applyTransactionRange(query, options);
    return query.getRawMany();
  }

  async summary(
    actorId: number,
    ledgerId: number,
    options: { from?: string; to?: string } = {},
  ) {
    await this.requireRole(actorId, ledgerId, ['owner', 'admin', 'member', 'viewer']);
    const totalsQuery = this.transactions
      .createQueryBuilder('transaction')
      .select('transaction.direction', 'direction')
      .addSelect('COALESCE(SUM(transaction.amountMinor), 0)', 'amountMinor')
      .where('transaction.ledgerId = :ledgerId', { ledgerId })
      .groupBy('transaction.direction');
    this.applyTransactionRange(totalsQuery, options);
    const totals = await totalsQuery.getRawMany<{ direction: Direction; amountMinor: string }>();
    const categoriesQuery = this.transactions
      .createQueryBuilder('transaction')
      .leftJoin(
        LedgerCategory,
        'category',
        'category.id = transaction.categoryId AND category.ledgerId = transaction.ledgerId',
      )
      .select('transaction.categoryId', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('transaction.direction', 'direction')
      .addSelect('COALESCE(SUM(transaction.amountMinor), 0)', 'amountMinor')
      .where('transaction.ledgerId = :ledgerId', { ledgerId })
      .groupBy('transaction.categoryId')
      .addGroupBy('category.name')
      .addGroupBy('transaction.direction')
      .orderBy('SUM(transaction.amountMinor)', 'DESC');
    this.applyTransactionRange(categoriesQuery, options);
    const categories = await categoriesQuery.getRawMany();
    return totals.reduce(
      (result, row) => ({ ...result, [row.direction]: row.amountMinor }),
      { income: '0', expense: '0', categories },
    );
  }

  async resolveWeixinUser(weixinUserId: string) {
    const identity = await this.identities.findOne({
      where: { provider: 'weixin', providerUserId: weixinUserId },
    });
    if (!identity) throw new NotFoundException('微信身份尚未绑定');
    return identity;
  }

  async recordSkillAudit(
    operation: string,
    result: 'success' | 'denied' | 'error',
    externalIdentityId: number | null,
    ledgerId: number | null,
    correlationId: string | null,
  ) {
    await this.auditLogs.save(
      this.auditLogs.create({
        skill: 'ledger',
        operation,
        result,
        externalIdentityId,
        ledgerId,
        correlationId,
      }),
    );
  }

  private applyTransactionRange(
    query: SelectQueryBuilder<LedgerTransaction>,
    options: { from?: string; to?: string; direction?: Direction },
  ) {
    if (options.from) query.andWhere('transaction.occurredAt >= :from', { from: new Date(options.from) });
    if (options.to) query.andWhere('transaction.occurredAt < :to', { to: new Date(options.to) });
    if (options.direction) query.andWhere('transaction.direction = :direction', { direction: options.direction });
  }

  private async requireRole(userId: number, ledgerId: number, roles: LedgerRole[]) {
    const membership = await this.members.findOne({ where: { userId, ledgerId } });
    if (!membership || !roles.includes(membership.role)) {
      throw new ForbiddenException('无权访问该账本');
    }
    return membership;
  }
}

@UseGuards(JwtAuthGuard)
@Controller('ledgers')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.ledger.listLedgers(req.user.id);
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateLedgerDto) {
    return this.ledger.createLedger(req.user.id, dto);
  }

  @Post(':ledgerId/members')
  addMember(
    @Req() req: AuthedRequest,
    @Param('ledgerId', ParseIntPipe) ledgerId: number,
    @Body() dto: AddMemberDto,
  ) {
    return this.ledger.addMember(req.user.id, ledgerId, dto);
  }

  @Get(':ledgerId/categories')
  categories(@Req() req: AuthedRequest, @Param('ledgerId', ParseIntPipe) ledgerId: number) {
    return this.ledger.listCategories(req.user.id, ledgerId);
  }

  @Post(':ledgerId/categories')
  createCategory(
    @Req() req: AuthedRequest,
    @Param('ledgerId', ParseIntPipe) ledgerId: number,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.ledger.createCategory(req.user.id, ledgerId, dto);
  }

  @Get(':ledgerId/transactions')
  transactions(
    @Req() req: AuthedRequest,
    @Param('ledgerId', ParseIntPipe) ledgerId: number,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('direction') direction?: Direction,
  ) {
    return this.ledger.listTransactions(req.user.id, ledgerId, {
      limit: Number(limit) || 50,
      from,
      to,
      direction,
    });
  }

  @Post(':ledgerId/transactions')
  createTransaction(
    @Req() req: AuthedRequest,
    @Param('ledgerId', ParseIntPipe) ledgerId: number,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.ledger.createTransaction(req.user.id, ledgerId, dto);
  }

  @Get(':ledgerId/summary')
  summary(
    @Req() req: AuthedRequest,
    @Param('ledgerId', ParseIntPipe) ledgerId: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.ledger.summary(req.user.id, ledgerId, { from, to });
  }
}

@UseGuards(LedgerSkillAuthGuard)
@Controller('internal/skills/ledger')
export class LedgerInternalController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('ledgers')
  async listLedgers(@Query() query: SkillWeixinIdentityDto) {
    let identity: ExternalIdentity | null = null;
    try {
      identity = await this.ledger.resolveWeixinUser(query.weixinUserId);
      const ledgers = await this.ledger.listLedgers(identity.userId);
      await this.ledger.recordSkillAudit('list_ledgers', 'success', identity.id, null, null);
      return ledgers;
    } catch (error) {
      await this.ledger.recordSkillAudit(
        'list_ledgers',
        error instanceof ForbiddenException ? 'denied' : 'error',
        identity?.id ?? null,
        null,
        null,
      );
      throw error;
    }
  }

  @Get('categories')
  async listCategories(@Query() query: SkillLedgerQueryDto) {
    return this.withSkillIdentity('list_categories', query.weixinUserId, query.ledgerId, (userId) =>
      this.ledger.listCategories(userId, query.ledgerId),
    );
  }

  @Get('transactions')
  async listTransactions(@Query() query: SkillLedgerQueryDto) {
    return this.withSkillIdentity('list_transactions', query.weixinUserId, query.ledgerId, (userId) =>
      this.ledger.listTransactions(userId, query.ledgerId, query),
    );
  }

  @Get('summary')
  async summary(@Query() query: SkillLedgerQueryDto) {
    return this.withSkillIdentity('summary', query.weixinUserId, query.ledgerId, (userId) =>
      this.ledger.summary(userId, query.ledgerId, query),
    );
  }

  @Post('transactions')
  async createTransaction(@Body() dto: SkillTransactionDto) {
    let identity: ExternalIdentity | null = null;
    try {
      identity = await this.ledger.resolveWeixinUser(dto.weixinUserId);
      const transaction = await this.ledger.createTransaction(identity.userId, dto.ledgerId, {
        ...dto,
        idempotencyKey: `weixin:${dto.messageId}`,
      }, 'weixin');
      await this.ledger.recordSkillAudit(
        'create_transaction',
        'success',
        identity.id,
        dto.ledgerId,
        dto.messageId,
      );
      return transaction;
    } catch (error) {
      await this.ledger.recordSkillAudit(
        'create_transaction',
        error instanceof ForbiddenException ? 'denied' : 'error',
        identity?.id ?? null,
        dto.ledgerId,
        dto.messageId,
      );
      throw error;
    }
  }

  private async withSkillIdentity<T>(
    operation: string,
    weixinUserId: string,
    ledgerId: number,
    action: (userId: number) => Promise<T>,
  ) {
    let identity: ExternalIdentity | null = null;
    try {
      identity = await this.ledger.resolveWeixinUser(weixinUserId);
      const result = await action(identity.userId);
      await this.ledger.recordSkillAudit(operation, 'success', identity.id, ledgerId, null);
      return result;
    } catch (error) {
      await this.ledger.recordSkillAudit(
        operation,
        error instanceof ForbiddenException ? 'denied' : 'error',
        identity?.id ?? null,
        ledgerId,
        null,
      );
      throw error;
    }
  }
}
