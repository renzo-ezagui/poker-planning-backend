import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { Room, RoomSchema } from './schemas/room.schema';
import { Participant, ParticipantSchema } from './schemas/participant.schema';
import { VoteRound, VoteRoundSchema } from './schemas/vote-round.schema';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { RoomsGateway } from './rooms.gateway';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: Participant.name, schema: ParticipantSchema },
      { name: VoteRound.name, schema: VoteRoundSchema },
    ]),
    JwtModule.register({ secret: process.env.JWT_SECRET }),
  ],
  providers: [RoomsService, RoomsGateway],
  controllers: [RoomsController],
  exports: [RoomsService],
})
export class RoomsModule {}
