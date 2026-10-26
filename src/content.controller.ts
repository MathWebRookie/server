import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ContentService } from './content.service';
import {
  ArticleDto,
  MessageDto,
  MomentDto,
  NoticeDto,
  PhotoDto,
  TimelineDto,
  TreeHoleDto,
} from './dto';

@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Get('articles')
  articles(@Query('page') page = '1', @Query('pageSize') pageSize = '10') {
    return this.content.articles(Number(page) || 1, Number(pageSize) || 10);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('articles')
  createArticle(@Body() dto: ArticleDto) {
    return this.content.createArticle(dto);
  }

  @Get('notices')
  notices() {
    return this.content.notices();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('notices')
  createNotice(@Body() dto: NoticeDto) {
    return this.content.createNotice(dto);
  }

  @Get('treeholes')
  treeholes() {
    return this.content.treeholes();
  }

  @Post('treeholes')
  createTreehole(@Body() dto: TreeHoleDto, @Req() req: Request & { user?: { nickname?: string } }) {
    return this.content.createTreehole(dto, req.user?.nickname);
  }

  @Get('timeline')
  timeline() {
    return this.content.timeline();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('timeline')
  createTimeline(@Body() dto: TimelineDto) {
    return this.content.createTimeline(dto);
  }

  @Get('photos')
  photos() {
    return this.content.photos();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('photos')
  createPhoto(@Body() dto: PhotoDto) {
    return this.content.createPhoto(dto);
  }

  @Get('moments')
  moments() {
    return this.content.moments();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('moments')
  createMoment(@Body() dto: MomentDto) {
    return this.content.createMoment(dto);
  }

  @Get('home')
  home() {
    return this.content.home();
  }

  @Get('analysis')
  analysis() {
    return this.content.analysis();
  }

  @Get('about')
  about() {
    return this.content.about();
  }

  @Post('messages')
  createMessage(@Body() dto: MessageDto) {
    return this.content.createMessage(dto);
  }

  @Get('showcase')
  showcase() {
    return this.content.showcase();
  }

  @Get('menus')
  menus(@Query('scene') scene?: string) {
    return this.content.menus(scene);
  }

  @Get('largescreen/subjects')
  subjects() {
    return this.content.subjects();
  }
}
