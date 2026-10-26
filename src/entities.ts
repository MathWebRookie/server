import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

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
