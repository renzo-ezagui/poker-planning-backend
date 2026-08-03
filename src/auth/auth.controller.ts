import {
  Body,
  Controller,
  HttpCode,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';

class LoginDto {
  username: string;
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() body: LoginDto) {
    return this.authService.register(body.username, body.password);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.validateLogin(
      body.username,
      body.password,
    );
    if (!result) throw new UnauthorizedException('invalid credentials');
    const token = this.authService.signToken(result.adminId);
    res.cookie('admin_jwt', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 2 * 60 * 60 * 1000,
    });
    return { ok: true };
  }
}
