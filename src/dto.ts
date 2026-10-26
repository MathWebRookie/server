import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ArticleDto {
  @IsString()
  @MinLength(1)
  imgurl!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  describe!: string;
}

export class NoticeDto {
  @IsString()
  @MinLength(1)
  title!: string;
}

export class TreeHoleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content!: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}

export class TimelineDto {
  @IsString()
  year!: string;

  @IsString()
  articleCover!: string;

  @IsString()
  articleTitle!: string;

  @IsString()
  articleContent!: string;

  @IsString()
  createTime!: string;
}

export class PhotoDto {
  @IsString()
  @MinLength(1)
  url!: string;
}

export class MomentDto {
  @IsString()
  img!: string;

  @IsString()
  name!: string;

  @IsString()
  content!: string;
}

export class MessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content!: string;
}
