import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import {
  Article,
  ChartPoint,
  HomeImage,
  Moment,
  Notice,
  Photo,
  SiteDocument,
  TimelinePost,
  TreeHole,
  User,
} from './entities';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Article) private readonly articles: Repository<Article>,
    @InjectRepository(Notice) private readonly notices: Repository<Notice>,
    @InjectRepository(TreeHole) private readonly treeholes: Repository<TreeHole>,
    @InjectRepository(TimelinePost) private readonly timeline: Repository<TimelinePost>,
    @InjectRepository(Photo) private readonly photos: Repository<Photo>,
    @InjectRepository(Moment) private readonly moments: Repository<Moment>,
    @InjectRepository(HomeImage) private readonly home: Repository<HomeImage>,
    @InjectRepository(ChartPoint) private readonly charts: Repository<ChartPoint>,
    @InjectRepository(SiteDocument) private readonly docs: Repository<SiteDocument>,
  ) {}

  async onModuleInit() {
    const count = await this.users.count();
    if (count > 0) {
      return;
    }
    this.logger.log('写入初始数据');
    await this.users.save(
      this.users.create({
        username: 'admin',
        nickname: '大帅逼',
        passwordHash: await bcrypt.hash('123456', 10),
      }),
    );

    const articles = this.read<Array<{ imgurl: string; title: string; describe: string }>>('articles.json');
    await this.articles.save(articles.map((item) => this.articles.create(item)));

    const notices = this.read<Array<{ title: string }>>('notices.json');
    await this.notices.save(notices.map((item) => this.notices.create(item)));

    const treeholes = this.read<Array<{ nickname: string; avatar: string; content: string }>>('treeholes.json');
    await this.treeholes.save(treeholes.map((item) => this.treeholes.create(item)));

    const timeline = this.read<Array<{ year: string; data: Array<Omit<TimelinePost, 'id' | 'year'>> }>>('timeline.json');
    const posts: TimelinePost[] = [];
    for (const year of timeline) {
      for (const item of year.data) {
        posts.push(
          this.timeline.create({
            year: year.year,
            articleCover: item.articleCover,
            articleTitle: item.articleTitle,
            articleContent: item.articleContent,
            createTime: item.createTime,
          }),
        );
      }
    }
    await this.timeline.save(posts);

    const photos = this.read<string[]>('photos.json');
    await this.photos.save(photos.map((url) => this.photos.create({ url })));

    const moments = this.read<Array<{ img: string; name: string; content: string }>>('moments.json');
    await this.moments.save(moments.map((item) => this.moments.create(item)));

    const home = this.read<string[]>('home.json');
    await this.home.save(home.map((url, sort) => this.home.create({ url, sort })));

    const analysis = this.read<Array<{ xdata: string; ydata: number }>>('analysis.json');
    await this.charts.save(
      analysis.map((item, sort) => this.charts.create({ ...item, sort })),
    );

    const documents: Array<{ key: string; file: string }> = [
      { key: 'menu:sider', file: 'menus-sider.json' },
      { key: 'menu:screen', file: 'menus-screen.json' },
      { key: 'about', file: 'about.json' },
      { key: 'showcase', file: 'showcase.json' },
      { key: 'subjects', file: 'subjects.json' },
      { key: 'settings', file: 'settings.json' },
    ];
    await this.docs.save(
      documents.map((item) =>
        this.docs.create({ key: item.key, payload: this.read<object>(item.file) }),
      ),
    );
  }

  private read<T>(name: string): T {
    const candidates = [
      path.join(__dirname, 'data', name),
      path.join(process.cwd(), 'src/seed/data', name),
      path.join(process.cwd(), 'dist/seed/data', name),
    ];
    const file = candidates.find((item) => fs.existsSync(item));
    if (!file) {
      throw new Error('找不到种子文件 ' + name);
    }
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  }
}
