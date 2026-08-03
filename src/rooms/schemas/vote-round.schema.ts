import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema()
class Vote {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Participant' })
  participantId: Types.ObjectId;

  @Prop({ required: true })
  value: string;
}
const VoteSchema = SchemaFactory.createForClass(Vote);

@Schema()
class RoundStats {
  @Prop({ type: Number })
  avg: number;

  @Prop({ type: Number })
  median: number;

  @Prop({ type: Number })
  variance: number;
}
const RoundStatsSchema = SchemaFactory.createForClass(RoundStats);

export type VoteRoundDocument = VoteRound & Document;

@Schema({ timestamps: true })
export class VoteRound {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Room' })
  roomId: Types.ObjectId;

  @Prop({ required: true, maxlength: 280 })
  topic: string;

  @Prop({ type: [VoteSchema], default: [] })
  votes: Vote[];

  @Prop({ type: Date, default: null })
  revealedAt: Date | null;

  @Prop({ type: RoundStatsSchema, default: null })
  stats: RoundStats | null;
}

export const VoteRoundSchema = SchemaFactory.createForClass(VoteRound);
