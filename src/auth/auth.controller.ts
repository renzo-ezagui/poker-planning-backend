import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsNotEmpty, Matches, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}

class RegisterDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'username may only use letters, numbers, dot, dash and underscore' })
  @MinLength(3)
  @MaxLength(40)
  username: string;

  @IsString()
  @MinLength(12)
  @MaxLength(200)
  password: string;
}

class GoogleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  credential: string;
}

const COOKIE_NAME = 'admin_jwt';

function registrationOpen() {
  return process.env.ALLOW_REGISTRATION === 'true';
}

/**
 * COOKIE_SECURE: "true" (default) always sets the Secure flag, "false" never does
 * (plain-http local setups), "auto" follows the request scheme — requires
 * TRUST_PROXY when TLS is terminated by a reverse proxy.
 */
function cookieSecure(req: Request): boolean {
  const mode = process.env.COOKIE_SECURE ?? 'true';
  if (mode === 'auto') return req.secure;
  return mode !== 'false';
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('config')
  config() {
    return {
      registration: registrationOpen(),
      googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() body: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!registrationOpen()) {
      throw new ForbiddenException('registration is disabled');
    }
    const created = await this.authService.register(body.username, body.password);
    this.setSession(req, res, created.id);
    return { ok: true, username: created.username };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('google')
  @HttpCode(200)
  async google(
    @Body() body: GoogleDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginWithGoogle(body.credential, registrationOpen());
    if (!result) throw new UnauthorizedException('Google sign-in failed');
    this.setSession(req, res, result.adminId);
    return { ok: true };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.validateLogin(body.username, body.password);
    if (!result) throw new UnauthorizedException('invalid credentials');
    this.setSession(req, res, result.adminId);
    return { ok: true };
  }

  private setSession(req: Request, res: Response, adminId: string) {
    res.cookie(COOKIE_NAME, this.authService.signToken(adminId), {
      httpOnly: true,
      secure: cookieSecure(req),
      sameSite: 'strict',
      maxAge: 2 * 60 * 60 * 1000,
    });
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: cookieSecure(req), sameSite: 'strict' });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: any) {
    const admin = await this.authService.findById(req.user.adminId);
    if (!admin) throw new UnauthorizedException();
    return { username: admin.username };
  }
}
