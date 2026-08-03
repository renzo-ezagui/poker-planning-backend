import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';

interface RequestWithCookies {
  cookies?: Record<string, string>;
}

function cookieExtractor(req: RequestWithCookies): string | null {
  return req.cookies?.admin_jwt ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    super({
      jwtFromRequest: cookieExtractor,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  validate(payload: { sub: string }): { adminId: string } {
    return { adminId: payload.sub };
  }
}
