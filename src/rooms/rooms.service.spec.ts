import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RoomsService } from './rooms.service';
import { Room } from './schemas/room.schema';

describe('RoomsService', () => {
  let service: RoomsService;
  const roomModel = { create: jest.fn(), findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: getModelToken(Room.name), useValue: roomModel },
      ],
    }).compile();
    service = moduleRef.get(RoomsService);
  });

  it('creates a room with an 8-char code and given deck/admin', async () => {
    roomModel.create.mockImplementation((doc) => Promise.resolve(doc));
    const room = await service.createRoom('admin1', 'fibonacci', 8);
    expect(room.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(room.adminId).toBe('admin1');
    expect(room.deckType).toBe('fibonacci');
    expect(room.status).toBe('open');
  });

  it('rejects an invalid deckType', async () => {
    await expect(
      service.createRoom('admin1', 'not-real' as any, 8),
    ).rejects.toThrow();
  });
});
