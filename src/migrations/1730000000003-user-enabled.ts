import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserEnabled1730000000003 implements MigrationInterface {
  name = 'UserEnabled1730000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "enabled" boolean NOT NULL DEFAULT true`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "enabled"`);
  }
}
