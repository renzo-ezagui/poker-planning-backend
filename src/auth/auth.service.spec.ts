import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { Admin } from './schemas/admin.schema';

describe('AuthService', () => {
  let service: AuthService;
  const adminModel = {
    findOne: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(Admin.name), useValue: adminModel },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(() => 'signed.jwt') },
        },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('registers a new admin with a bcrypt hash, never the raw password', async () => {
    adminModel.findOne.mockResolvedValue(null);
    adminModel.create.mockResolvedValue({
      _id: 'abc123',
      username: 'renzo',
      passwordHash: 'hashed-value',
    });

    await service.register('renzo', 'correct-horse-battery');

    expect(adminModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'renzo' }),
    );
    const createdArg = adminModel.create.mock.calls[0][0];
    expect(createdArg.passwordHash).not.toBe('correct-horse-battery');
  });

  it('register() never returns the passwordHash to the caller', async () => {
    adminModel.findOne.mockResolvedValue(null);
    adminModel.create.mockResolvedValue({
      _id: 'abc123',
      username: 'renzo',
      passwordHash: 'hashed-value',
    });

    const result = await service.register('renzo', 'correct-horse-battery');

    expect(result).toEqual({ id: 'abc123', username: 'renzo' });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects login with a wrong password', async () => {
    adminModel.findOne().select?.(); // no-op guard if chained select is used
    adminModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'abc123',
        passwordHash: await require('bcrypt').hash('correct-horse-battery', 12),
      }),
    });

    const result = await service.validateLogin('renzo', 'wrong-password');
    expect(result).toBeNull();
  });

  it('accepts login with the correct password and returns adminId', async () => {
    const hash = await require('bcrypt').hash('correct-horse-battery', 12);
    adminModel.findOne.mockReturnValue({
      select: jest
        .fn()
        .mockResolvedValue({ _id: 'abc123', passwordHash: hash }),
    });

    const result = await service.validateLogin(
      'renzo',
      'correct-horse-battery',
    );
    expect(result).toEqual({ adminId: 'abc123' });
  });
});
