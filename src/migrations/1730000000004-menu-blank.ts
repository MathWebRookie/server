import { MigrationInterface, QueryRunner } from 'typeorm';

export class MenuBlank1730000000004 implements MigrationInterface {
  name = 'MenuBlank1730000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "access_menus" ADD COLUMN IF NOT EXISTS "blank" boolean NOT NULL DEFAULT false`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "access_menus" DROP COLUMN IF EXISTS "blank"`);
  }
}
