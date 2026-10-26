import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Article,
  ChartPoint,
  HomeImage,
  Message,
  Moment,
  Notice,
  Photo,
  SiteDocument,
  TimelinePost,
  TreeHole,
} from './entities';
import {
  ArticleDto,
  MessageDto,
  MomentDto,
  NoticeDto,
  PhotoDto,
  TimelineDto,
  TreeHoleDto,
} from './dto';

const DEFAULT_AVATAR =
  'https://image.kuailemao.xyz/blog/user/avatar/默认头像.svg';

@Injectable()
export class ContentService {
  constructor(
    @InjectRepository(Article) private readonly articlesRepo: Repository<Article>,
    @InjectRepository(Notice) private readonly noticesRepo: Repository<Notice>,
    @InjectRepository(TreeHole) private readonly treeholesRepo: Repository<TreeHole>,
    @InjectRepository(TimelinePost) private readonly timelineRepo: Repository<TimelinePost>,
    @InjectRepository(Photo) private readonly photosRepo: Repository<Photo>,
    @InjectRepository(Moment) private readonly momentsRepo: Repository<Moment>,
    @InjectRepository(HomeImage) private readonly homeRepo: Repository<HomeImage>,
    @InjectRepository(Message) private readonly messagesRepo: Repository<Message>,
    @InjectRepository(ChartPoint) private readonly chartsRepo: Repository<ChartPoint>,
    @InjectRepository(SiteDocument) private readonly docsRepo: Repository<SiteDocument>,
  ) {}

  async articles(page: number, pageSize: number) {
    const size = Math.min(Math.max(pageSize, 1), 50);
    const current = Math.max(page, 1);
    const [list, total] = await this.articlesRepo.findAndCount({
      order: { id: 'ASC' },
      skip: (current - 1) * size,
      take: size,
    });
    const settings = await this.doc<SettingsPayload>('settings');
    return {
      list,
      total,
      page: current,
      pageSize: size,
      stats: {
        articleCount: total,
        visits: settings?.visits ?? 0,
        visitors: settings?.visitors ?? 0,
        siteDays: settings?.siteDays ?? 0,
      },
    };
  }

  createArticle(dto: ArticleDto) {
    return this.articlesRepo.save(this.articlesRepo.create(dto));
  }

  notices() {
    return this.noticesRepo.find({ order: { id: 'ASC' } });
  }

  createNotice(dto: NoticeDto) {
    return this.noticesRepo.save(this.noticesRepo.create(dto));
  }

  treeholes() {
    return this.treeholesRepo.find({ order: { id: 'ASC' } });
  }

  async createTreehole(dto: TreeHoleDto, nickname?: string) {
    return this.treeholesRepo.save(
      this.treeholesRepo.create({
        content: dto.content,
        nickname: dto.nickname || nickname || 'Admin',
        avatar: dto.avatar || DEFAULT_AVATAR,
      }),
    );
  }

  async timeline() {
    const rows = await this.timelineRepo.find({ order: { id: 'ASC' } });
    const grouped = new Map<string, TimelinePost[]>();
    for (const row of rows) {
      const bucket = grouped.get(row.year) ?? [];
      bucket.push(row);
      grouped.set(row.year, bucket);
    }
    return [...grouped.entries()].map(([year, data]) => ({
      year,
      data: data.map((item) => ({
        id: item.id,
        articleCover: item.articleCover,
        articleTitle: item.articleTitle,
        articleContent: item.articleContent,
        createTime: item.createTime,
      })),
    }));
  }

  createTimeline(dto: TimelineDto) {
    return this.timelineRepo.save(this.timelineRepo.create(dto));
  }

  async photos() {
    const rows = await this.photosRepo.find({ order: { id: 'ASC' } });
    return rows.map((row) => row.url);
  }

  createPhoto(dto: PhotoDto) {
    return this.photosRepo.save(this.photosRepo.create(dto));
  }

  moments() {
    return this.momentsRepo.find({ order: { id: 'ASC' } });
  }

  createMoment(dto: MomentDto) {
    return this.momentsRepo.save(this.momentsRepo.create(dto));
  }

  async home() {
    const rows = await this.homeRepo.find({ order: { sort: 'ASC', id: 'ASC' } });
    return rows.map((row) => row.url);
  }

  async analysis() {
    const rows = await this.chartsRepo.find({ order: { sort: 'ASC', id: 'ASC' } });
    return rows.map((row) => ({ xdata: row.xdata, ydata: row.ydata }));
  }

  about() {
    return this.doc<AboutPayload>('about');
  }

  createMessage(dto: MessageDto) {
    return this.messagesRepo.save(this.messagesRepo.create({ content: dto.content }));
  }

  showcase() {
    return this.doc<ShowcasePayload>('showcase');
  }

  async menus(scene?: string) {
    if (scene !== 'sider' && scene !== 'screen') {
      throw new BadRequestException('scene 只能是 sider 或 screen');
    }
    return (await this.doc<unknown[]>('menu:' + scene)) ?? [];
  }

  subjects() {
    return this.doc<string[]>('subjects');
  }

  private async doc<T>(key: string): Promise<T | null> {
    const row = await this.docsRepo.findOne({ where: { key } });
    return (row?.payload as T) ?? null;
  }
}

type SettingsPayload = { visits: number; visitors: number; siteDays: number };
type AboutPayload = { shadowName: string; bio: string };
type ShowcasePayload = { captions: string[]; images: string[] };
