import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { RoomSchema, Room } from './room.schema';

describe('Room schema', () => {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('rejects an unknown deckType', async () => {
    const RoomModel = mongoose.model(Room.name, RoomSchema);
    const doc = new RoomModel({
      code: 'ABCD1234',
      adminId: new mongoose.Types.ObjectId(),
      deckType: 'not-a-real-deck',
      status: 'open',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await expect(doc.validate()).rejects.toThrow();
  });

  it('accepts a valid room', async () => {
    const RoomModel = mongoose.model(Room.name, RoomSchema);
    const doc = new RoomModel({
      code: 'ABCD1234',
      adminId: new mongoose.Types.ObjectId(),
      deckType: 'fibonacci',
      status: 'open',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await expect(doc.validate()).resolves.toBeUndefined();
  });
});
