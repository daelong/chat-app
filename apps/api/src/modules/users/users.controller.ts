import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { MemberGuard } from '../auth/auth.guards';
import type { MemberRequest } from '../auth/session';

@Controller('users')
@UseGuards(MemberGuard)
export class UsersController {
  @Get('me')
  me(@Req() request: MemberRequest) {
    const { user, csrfToken } = request.memberAuth;
    return { user, csrfToken };
  }
}
