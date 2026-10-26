import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        if (
          data &&
          typeof data === 'object' &&
          'code' in data &&
          'data' in data
        ) {
          return data;
        }
        return { code: 200, data, msg: 'ok' };
      }),
    );
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let msg = '服务器错误';
    if (exception instanceof HttpException) {
      const raw = exception.getResponse();
      if (typeof raw === 'string') {
        msg = raw;
      } else if (raw && typeof raw === 'object' && 'message' in raw) {
        const message = (raw as { message: string | string[] }).message;
        msg = Array.isArray(message) ? message.join('; ') : message;
      } else {
        msg = exception.message;
      }
    } else if (exception instanceof Error) {
      msg = exception.message;
    }

    response.status(status).json({ code: status, data: null, msg });
  }
}
