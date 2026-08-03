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
      controller.login({ username: 'x', password: 'y' }, res),
    ).rejects.toThrow(UnauthorizedException);
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
