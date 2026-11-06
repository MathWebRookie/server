import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import {
  AccessMenu,
  AccessRole,
  AccessRoleMenu,
  AccessUserRole,
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
    @InjectRepository(AccessRole) private readonly roles: Repository<AccessRole>,
    @InjectRepository(AccessMenu) private readonly accessMenus: Repository<AccessMenu>,
    @InjectRepository(AccessRoleMenu) private readonly roleMenus: Repository<AccessRoleMenu>,
    @InjectRepository(AccessUserRole) private readonly userRoles: Repository<AccessUserRole>,
  ) {}

  async onModuleInit() {
    const count = await this.users.count();
    if (count === 0) {
      await this.seedContent();
    }
    await this.seedAccess();
    await this.ensureBuiltinAdmin();
  }

  private async ensureBuiltinAdmin() {
    const role = await this.roles.findOne({ where: { code: 'admin' } });
    const user = await this.users.findOne({ where: { username: 'admin' } });
    if (!role || !user) return;
    if (user.enabled === false) {
      user.enabled = true;
      await this.users.save(user);
    }
    const link = await this.userRoles.findOne({ where: { userId: user.id, roleId: role.id } });
    if (link) return;
    await this.userRoles.save(this.userRoles.create({ userId: user.id, roleId: role.id }));
    this.logger.log('已恢复 admin 账号的管理员权限');
  }

  private async seedContent() {
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

  private async seedAccess() {
    if ((await this.roles.count()) > 0) return;
    this.logger.log('写入角色和路由权限');
    const roleRows = {
      admin: await this.roles.save(this.roles.create({ code: 'admin', name: '管理员' })),
      editor: await this.roles.save(this.roles.create({ code: 'editor', name: '编辑' })),
      viewer: await this.roles.save(this.roles.create({ code: 'viewer', name: '查看' })),
    };
    const buckets: Record<AccessRoleCode, number[]> = { admin: [], editor: [], viewer: [] };
    const walk = async (nodes: AccessSeedNode[], parentId: number | null) => {
      for (const [index, node] of nodes.entries()) {
        const saved = await this.accessMenus.save(
          this.accessMenus.create({
            parentId,
            type: node.type,
            title: node.title,
            path: node.path ?? null,
            component: node.component ?? null,
            icon: node.icon ?? null,
            permission: node.permission ?? null,
            sort: index,
            visible: true,
          }),
        );
        for (const role of node.roles) buckets[role].push(saved.id);
        if (node.children?.length) await walk(node.children, saved.id);
      }
    };
    await walk(accessSeed, null);
    for (const code of ['admin', 'editor', 'viewer'] as const) {
      await this.roleMenus.save(
        buckets[code].map((menuId) => this.roleMenus.create({ roleId: roleRows[code].id, menuId })),
      );
    }
    const adminUser =
      (await this.users.findOne({ where: { username: 'admin' } })) ??
      (await this.users.find({ order: { id: 'ASC' }, take: 1 }))[0];
    if (adminUser) {
      await this.userRoles.save(
        this.userRoles.create({ userId: adminUser.id, roleId: roleRows.admin.id }),
      );
    }
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

type AccessRoleCode = 'admin' | 'editor' | 'viewer';
type AccessSeedNode = {
  type: 'catalog' | 'page' | 'button';
  title: string;
  path?: string;
  component?: string;
  icon?: string;
  permission?: string;
  roles: AccessRoleCode[];
  children?: AccessSeedNode[];
};

const contentRoles: AccessRoleCode[] = ['admin', 'editor', 'viewer'];
const writeRoles: AccessRoleCode[] = ['admin', 'editor'];

function page(
  title: string,
  path: string,
  component: string,
  permission: string,
  icon?: string,
  extra: AccessSeedNode[] = [],
): AccessSeedNode {
  return {
    type: 'page',
    title,
    path,
    component,
    icon,
    permission,
    roles: contentRoles,
    children: [
      ...['view', 'create', 'update', 'delete'].map((action) => {
        const actionNames: Record<string, string> = {
          view: '查看',
          create: '新增',
          update: '修改',
          delete: '删除',
        };
        return {
          type: 'button' as const,
          title: actionNames[action],
          permission: `${permission.split(':')[0]}:${action}`,
          roles: writeRoles,
        };
      }),
      ...extra,
    ],
  };
}

const accessSeed: AccessSeedNode[] = [
  page('首页', '/Home', 'Home/index', 'home:view', 'HomeOutlined'),
  {
    type: 'catalog',
    title: '博客管理',
    path: '/SystemMange',
    icon: 'AppstoreOutlined',
    roles: contentRoles,
    children: [
      page('博客管理', '/SystemMange/Blog', 'Blog/index', 'blog:view'),
      page('树洞', '/SystemMange/TreeHole', 'TreeHole/index', 'treehole:view'),
      page('时间轴', '/SystemMange/TimeLine', 'TimeLine/index', 'timeline:view'),
      page('关于作者', '/SystemMange/shongren', 'shongren/index', 'about:view'),
      page('相册', '/SystemMange/photos', 'photos/index', 'photos:view'),
      page('朋友圈', '/SystemMange/Moments', 'Moments/index', 'moments:view'),
      {
        type: 'catalog',
        title: '博客管理2',
        path: '/SystemMangecs2',
        roles: contentRoles,
        children: [page('博客管理3', '/SystemMange/SystemMangecs2/SystemMangecs3', 'Home/index', 'blog3:view')],
      },
    ],
  },
  page('分析页', '/Analysis', 'Analysis/index', 'analysis:view', 'BarChartOutlined'),
  page('表单模块', '/complexFroms', 'complexFroms/index', 'forms:view', 'HddOutlined'),
  {
    type: 'catalog',
    title: '大屏模块',
    path: '/Largescreen',
    icon: 'DesktopOutlined',
    roles: contentRoles,
    children: [page('指挥信息平台', '/Largescreen/fusion', 'Largescreen/fusion/index', 'fusion:view')],
  },
  {
    type: 'page',
    title: '路由维护',
    path: '/Access',
    component: 'Access/index',
    icon: 'SettingOutlined',
    permission: 'access:view',
    roles: ['admin'],
    children: [
      { type: 'button', title: '维护路由', permission: 'access:route', roles: ['admin'] },
      { type: 'button', title: '分配权限', permission: 'access:assign', roles: ['admin'] },
    ],
  },
];
