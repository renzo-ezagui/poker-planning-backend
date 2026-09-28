import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ParticipantDocument = Participant & Document;

@Schema({ timestamps: true })
export class Participant {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Room' })
  roomId: Types.ObjectId;

  @Prop({ required: true, maxlength: 40 })
  name: string;

  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ type: String, default: null })
  socketId: string | null;

  @Prop({ default: false })
  connected: boolean;

  @Prop({ default: false })
  isSpectator: boolean;

  @Prop({ default: false })
  isHost: boolean;

  @Prop({ default: false })
  muted: boolean;

  @Prop({ type: String, default: '' })
  ip: string;
}

export const ParticipantSchema = SchemaFactory.createForClass(Participant);
