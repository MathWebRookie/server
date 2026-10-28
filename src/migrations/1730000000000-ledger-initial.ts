import { MigrationInterface, QueryRunner } from 'typeorm';

export class LedgerInitial1730000000000 implements MigrationInterface {
  name = 'LedgerInitial1730000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "external_identities" (
        "id" SERIAL NOT NULL,
        "provider" character varying NOT NULL,
        "providerUserId" character varying NOT NULL,
        "userId" integer NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_external_identities_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_external_identities_provider_user" UNIQUE ("provider", "providerUserId"),
        CONSTRAINT "FK_external_identities_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ledgers" (
        "id" SERIAL NOT NULL,
        "name" character varying NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'CNY',
        "ownerUserId" integer NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ledgers_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ledgers_owner" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ledger_members" (
        "id" SERIAL NOT NULL,
        "ledgerId" integer NOT NULL,
        "userId" integer NOT NULL,
        "role" character varying NOT NULL DEFAULT 'member',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ledger_members_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ledger_members_ledger_user" UNIQUE ("ledgerId", "userId"),
        CONSTRAINT "FK_ledger_members_ledger" FOREIGN KEY ("ledgerId") REFERENCES "ledgers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ledger_members_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ledger_categories" (
        "id" SERIAL NOT NULL,
        "ledgerId" integer NOT NULL,
        "name" character varying NOT NULL,
        "direction" character varying NOT NULL DEFAULT 'expense',
        "isSystem" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_ledger_categories_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ledger_categories_ledger_name" UNIQUE ("ledgerId", "name"),
        CONSTRAINT "FK_ledger_categories_ledger" FOREIGN KEY ("ledgerId") REFERENCES "ledgers"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ledger_transactions" (
        "id" SERIAL NOT NULL,
        "ledgerId" integer NOT NULL,
        "createdByUserId" integer NOT NULL,
        "categoryId" integer,
        "amountMinor" bigint NOT NULL,
        "direction" character varying NOT NULL,
        "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "note" text,
        "source" character varying NOT NULL DEFAULT 'web',
        "idempotencyKey" character varying,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ledger_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ledger_transactions_ledger" FOREIGN KEY ("ledgerId") REFERENCES "ledgers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ledger_transactions_creator" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_ledger_transactions_category" FOREIGN KEY ("categoryId") REFERENCES "ledger_categories"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ledger_transactions_source_idempotency" ON "ledger_transactions" ("source", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ledger_transactions_ledger_occurred" ON "ledger_transactions" ("ledgerId", "occurredAt")`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "skill_audit_logs" (
        "id" SERIAL NOT NULL,
        "skill" character varying NOT NULL,
        "operation" character varying NOT NULL,
        "externalIdentityId" integer,
        "ledgerId" integer,
        "result" character varying NOT NULL DEFAULT 'success',
        "correlationId" character varying,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_skill_audit_logs_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_skill_audit_logs_skill_created" ON "skill_audit_logs" ("skill", "createdAt")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "skill_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ledger_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ledger_categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ledger_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ledgers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "external_identities"`);
  }
}
