import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  it('throws 401 on invalid credentials and never sets a cookie', async () => {
    const authService = { validateLogin: jest.fn().mockResolvedValue(null) };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    const controller = moduleRef.get(AuthController);
    const res = { cookie: jest.fn() } as any;

    await expect(
      controller.login({ username: 'x', password: 'y' }, {} as any, res),
    ).rejects.toThrow(UnauthorizedException);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('sets the session cookie without a Domain attribute when COOKIE_DOMAIN is unset', async () => {
    delete process.env.COOKIE_DOMAIN;
    const authService = {
      validateLogin: jest.fn().mockResolvedValue({ adminId: 'a1' }),
      signToken: jest.fn().mockReturnValue('token'),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    const controller = moduleRef.get(AuthController);
    const res = { cookie: jest.fn() } as any;

    await controller.login({ username: 'renzo', password: 'x' }, { secure: true } as any, res);

    expect(res.cookie).toHaveBeenCalledWith(
      'admin_jwt',
      'token',
      expect.objectContaining({ domain: undefined }),
    );
  });

  it('sets the session cookie Domain attribute when COOKIE_DOMAIN is set (shares the session across subdomains)', async () => {
    process.env.COOKIE_DOMAIN = '.ezagui.dev';
    const authService = {
      validateLogin: jest.fn().mockResolvedValue({ adminId: 'a1' }),
      signToken: jest.fn().mockReturnValue('token'),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    const controller = moduleRef.get(AuthController);
    const res = { cookie: jest.fn() } as any;

    await controller.login({ username: 'renzo', password: 'x' }, { secure: true } as any, res);

    expect(res.cookie).toHaveBeenCalledWith(
      'admin_jwt',
      'token',
      expect.objectContaining({ domain: '.ezagui.dev' }),
    );
    delete process.env.COOKIE_DOMAIN;
  });
});
