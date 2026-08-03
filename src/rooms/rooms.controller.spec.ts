import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

describe('RoomsController', () => {
  it('GET /rooms/:code throws 404 when room is missing', async () => {
    const roomsService = { getByCode: jest.fn().mockResolvedValue(null) };
    const moduleRef = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [{ provide: RoomsService, useValue: roomsService }],
    }).compile();
    const controller = moduleRef.get(RoomsController);

    await expect(controller.get('NOPE0000')).rejects.toThrow(NotFoundException);
  });
});

describe('isAdmin', () => {
  it('returns true when the requesting admin owns the room', async () => {
    const roomsService = {
      getByCode: jest.fn().mockResolvedValue({ adminId: { toString: () => 'admin1' } }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [{ provide: RoomsService, useValue: roomsService }],
    }).compile();
    const controller = moduleRef.get(RoomsController);

    const result = await controller.isAdmin('ABCD1234', { user: { adminId: 'admin1' } });
    expect(result).toEqual({ isAdmin: true });
  });

  it('returns false when a different admin owns the room', async () => {
    const roomsService = {
      getByCode: jest.fn().mockResolvedValue({ adminId: { toString: () => 'admin1' } }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [{ provide: RoomsService, useValue: roomsService }],
    }).compile();
    const controller = moduleRef.get(RoomsController);

    const result = await controller.isAdmin('ABCD1234', { user: { adminId: 'admin2' } });
    expect(result).toEqual({ isAdmin: false });
  });
});
