import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RoomsGateway } from './rooms.gateway';
import { Room } from './schemas/room.schema';
import { Participant } from './schemas/participant.schema';
import { VoteRound } from './schemas/vote-round.schema';

function fakeClient() {
  return { id: 'socket-1', join: jest.fn(), emit: jest.fn(), to: jest.fn() };
}

describe('RoomsGateway.handleJoin', () => {
  let gateway: RoomsGateway;
  const roomModel = { findOne: jest.fn() };
  const participantModel = { findOne: jest.fn(), create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    // jest.clearAllMocks() clears call history but NOT a previously-set
    // mockImplementation, so without a fresh default here, a later test's
    // `create` call would silently inherit an earlier test's mocked
    // return value. Give every test an isolated, distinct default.
    participantModel.create.mockImplementation((doc) =>
      Promise.resolve({ ...doc, _id: 'default-new-id' }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        RoomsGateway,
        { provide: getModelToken(Room.name), useValue: roomModel },
        { provide: getModelToken(Participant.name), useValue: participantModel },
        { provide: getModelToken(VoteRound.name), useValue: {} },
      ],
    }).compile();
    gateway = moduleRef.get(RoomsGateway);
    gateway.server = { to: jest.fn(() => ({ emit: jest.fn() })) } as any;
  });

  it('creates a new participant and issues a fresh token when none is provided', async () => {
    roomModel.findOne.mockResolvedValue({ _id: 'room1', status: 'open' });
    participantModel.create.mockImplementation((doc) =>
      Promise.resolve({ ...doc, _id: 'p1' }),
    );
    const client = fakeClient();

    await gateway.handleJoin(client as any, { roomCode: 'ABCD1234', name: 'Alice' });

    expect(participantModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Alice', roomId: 'room1', connected: true }),
    );
    expect(client.emit).toHaveBeenCalledWith(
      'joined',
      expect.objectContaining({ participantId: 'p1' }),
    );
  });

  it('reattaches an existing participant when a valid token is provided', async () => {
    roomModel.findOne.mockResolvedValue({ _id: 'room1', status: 'open' });
    participantModel.findOne.mockResolvedValue({
      _id: 'p1',
      roomId: 'room1',
      name: 'Alice',
      token: 'existing-token',
      save: jest.fn(),
    });
    const client = fakeClient();

    await gateway.handleJoin(client as any, {
      roomCode: 'ABCD1234',
      name: 'Alice',
      token: 'existing-token',
    });

    expect(participantModel.create).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'joined',
      expect.objectContaining({ participantId: 'p1' }),
    );
  });

  it('rejects a token from a different room', async () => {
    roomModel.findOne.mockResolvedValue({ _id: 'room1', status: 'open' });
    participantModel.findOne.mockResolvedValue({
      _id: 'p1',
      roomId: 'room-OTHER',
      token: 'existing-token',
    });
    const client = fakeClient();

    await gateway.handleJoin(client as any, {
      roomCode: 'ABCD1234',
      name: 'Alice',
      token: 'existing-token',
    });

    expect(client.emit).toHaveBeenCalledWith(
      'joined',
      expect.objectContaining({ participantId: expect.anything() }),
    );
    // must NOT be the mismatched participant's id
    const emittedPayload = client.emit.mock.calls.find((c) => c[0] === 'joined')[1];
    expect(emittedPayload.participantId).not.toBe('p1');
  });
});

describe('RoomsGateway.handleVoteCast', () => {
  let gateway: RoomsGateway;
  const participantModel = { findById: jest.fn() };
  const voteRoundModel = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RoomsGateway,
        { provide: getModelToken(Room.name), useValue: {} },
        { provide: getModelToken(Participant.name), useValue: participantModel },
        { provide: getModelToken(VoteRound.name), useValue: voteRoundModel },
      ],
    }).compile();
    gateway = moduleRef.get(RoomsGateway);
    gateway.server = { to: jest.fn(() => ({ emit: jest.fn() })) } as any;
  });

  it('rejects a vote from a spectator', async () => {
    participantModel.findById.mockResolvedValue({ _id: 'p1', isSpectator: true });
    const client = { id: 's1', emit: jest.fn() };

    await gateway.handleVoteCast(client as any, {
      participantId: 'p1',
      roomCode: 'ABCD1234',
      value: '5',
    });

    expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      message: expect.stringContaining('spectator'),
    }));
  });

  it('rejects a vote whose participantId belongs to a different socket', async () => {
    // fabricated/borrowed participantId: participant exists, is a voter,
    // but its socketId (set on join/reconnect) is NOT this calling socket
    participantModel.findById.mockResolvedValue({
      _id: 'p1',
      isSpectator: false,
      socketId: 'someone-elses-socket',
      roomId: 'room1',
    });
    const client = { id: 's1', emit: jest.fn() };

    await gateway.handleVoteCast(client as any, {
      participantId: 'p1',
      roomCode: 'ABCD1234',
      value: '5',
    });

    expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      message: expect.stringContaining('not authorized'),
    }));
  });
});

describe('RoomsGateway admin-only events', () => {
  let gateway: RoomsGateway;
  const roomModel = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RoomsGateway,
        { provide: getModelToken(Room.name), useValue: roomModel },
        { provide: getModelToken(Participant.name), useValue: {} },
        { provide: getModelToken(VoteRound.name), useValue: {} },
      ],
    }).compile();
    gateway = moduleRef.get(RoomsGateway);
    gateway.server = { to: jest.fn(() => ({ emit: jest.fn() })) } as any;
  });

  it('rejects round:start from a socket whose adminId does not own the room', async () => {
    roomModel.findOne.mockResolvedValue({ _id: 'room1', adminId: 'realAdmin', code: 'ABCD1234' });
    const client = { id: 's1', emit: jest.fn(), data: { adminId: 'imposter' } };

    await gateway.handleRoundStart(client as any, { roomCode: 'ABCD1234', topic: 'Story 1' });

    expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      message: expect.stringContaining('not authorized'),
    }));
  });
});
