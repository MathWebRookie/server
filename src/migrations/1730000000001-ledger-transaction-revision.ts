import { MigrationInterface, QueryRunner } from 'typeorm';

export class LedgerTransactionRevision1730000000001 implements MigrationInterface {
  name = 'LedgerTransactionRevision1730000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ledger_transactions" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "skill_audit_logs" ADD COLUMN IF NOT EXISTS "detail" text`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "skill_audit_logs" DROP COLUMN IF EXISTS "detail"`);
    await queryRunner.query(`ALTER TABLE "ledger_transactions" DROP COLUMN IF EXISTS "deletedAt"`);
  }
}
