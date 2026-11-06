import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccessControl1730000000002 implements MigrationInterface {
  name = 'AccessControl1730000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "access_roles" (
        "id" SERIAL NOT NULL,
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        CONSTRAINT "PK_access_roles_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_access_roles_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "access_menus" (
        "id" SERIAL NOT NULL,
        "parentId" integer,
        "type" character varying NOT NULL,
        "title" character varying NOT NULL,
        "path" character varying,
        "component" character varying,
        "icon" character varying,
        "permission" character varying,
        "sort" integer NOT NULL DEFAULT 0,
        "visible" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_access_menus_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "access_role_menus" (
        "id" SERIAL NOT NULL,
        "roleId" integer NOT NULL,
        "menuId" integer NOT NULL,
        CONSTRAINT "PK_access_role_menus_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_access_role_menus_role_menu" UNIQUE ("roleId", "menuId"),
        CONSTRAINT "FK_access_role_menus_role" FOREIGN KEY ("roleId") REFERENCES "access_roles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_access_role_menus_menu" FOREIGN KEY ("menuId") REFERENCES "access_menus"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "access_user_roles" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "roleId" integer NOT NULL,
        CONSTRAINT "PK_access_user_roles_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_access_user_roles_user_role" UNIQUE ("userId", "roleId"),
        CONSTRAINT "FK_access_user_roles_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_access_user_roles_role" FOREIGN KEY ("roleId") REFERENCES "access_roles"("id") ON DELETE CASCADE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "access_user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "access_role_menus"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "access_menus"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "access_roles"`);
  }
}
