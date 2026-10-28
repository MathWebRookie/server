import { Column, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  username!: string;

  @Column()
  passwordHash!: string;

  @Column({ default: '大帅逼' })
  nickname!: string;
}

@Entity('articles')
export class Article {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  imgurl!: string;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  describe!: string;
}

@Entity('notices')
export class Notice {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;
}

@Entity('treeholes')
export class TreeHole {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  nickname!: string;

  @Column()
  avatar!: string;

  @Column({ type: 'text' })
  content!: string;
}

@Entity('timeline_posts')
export class TimelinePost {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  year!: string;

  @Column()
  articleCover!: string;

  @Column()
  articleTitle!: string;

  @Column({ type: 'text' })
  articleContent!: string;

  @Column()
  createTime!: string;
}

@Entity('photos')
export class Photo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  url!: string;
}

@Entity('moments')
export class Moment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  img!: string;

  @Column()
  name!: string;

  @Column()
  content!: string;
}

@Entity('home_images')
export class HomeImage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  url!: string;

  @Column({ default: 0 })
  sort!: number;
}

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt!: Date;
}

@Entity('chart_points')
export class ChartPoint {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  xdata!: string;

  @Column({ type: 'int' })
  ydata!: number;

  @Column({ default: 0 })
  sort!: number;
}

@Entity('site_documents')
export class SiteDocument {
  @PrimaryColumn()
  key!: string;

  @Column({ type: 'jsonb' })
  payload!: object;
}

@Entity('external_identities')
@Index(['provider', 'providerUserId'], { unique: true })
export class ExternalIdentity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  provider!: string;

  @Column()
  providerUserId!: string;

  @Column()
  userId!: number;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt!: Date;
}

@Entity('ledgers')
export class Ledger {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ default: 'CNY' })
  currency!: string;

  @Column()
  ownerUserId!: number;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt!: Date;
}

@Entity('ledger_members')
@Index(['ledgerId', 'userId'], { unique: true })
export class LedgerMember {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  ledgerId!: number;

  @Column()
  userId!: number;

  @Column({ default: 'member' })
  role!: 'owner' | 'admin' | 'member' | 'viewer';

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt!: Date;
}

@Entity('ledger_categories')
@Index(['ledgerId', 'name'], { unique: true })
export class LedgerCategory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  ledgerId!: number;

  @Column()
  name!: string;

  @Column({ default: 'expense' })
  direction!: 'income' | 'expense';

  @Column({ default: false })
  isSystem!: boolean;
}

@Entity('ledger_transactions')
@Index(['ledgerId', 'occurredAt'])
@Index(['source', 'idempotencyKey'], { unique: true, where: '"idempotencyKey" IS NOT NULL' })
export class LedgerTransaction {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  ledgerId!: number;

  @Column()
  createdByUserId!: number;

  @Column({ type: 'int', nullable: true })
  categoryId!: number | null;

  @Column({ type: 'bigint' })
  amountMinor!: string;

  @Column()
  direction!: 'income' | 'expense';

  @Column({ type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ default: 'web' })
  source!: string;

  @Column({ type: 'varchar', nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt!: Date;
}

@Entity('skill_audit_logs')
@Index(['skill', 'createdAt'])
export class SkillAuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  skill!: string;

  @Column()
  operation!: string;

  @Column({ type: 'int', nullable: true })
  externalIdentityId!: number | null;

  @Column({ type: 'int', nullable: true })
  ledgerId!: number | null;

  @Column({ default: 'success' })
  result!: 'success' | 'denied' | 'error';

  @Column({ type: 'varchar', nullable: true })
  correlationId!: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  createdAt!: Date;
}
