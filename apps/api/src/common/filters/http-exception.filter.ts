import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    response.status(status).json({
      error: {
        code: `HTTP_${status}`,
        message: status >= 500 ? '서버에서 요청을 처리하지 못했습니다.' : '요청을 확인하세요.',
        ...(status < 500 && typeof body === 'object' ? body : {}),
      },
    });
  }
}
