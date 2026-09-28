import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const DECK_TYPES = ['fibonacci', 'tshirt'] as const;
export type DeckType = (typeof DECK_TYPES)[number];

export const THEMES = ['cardroom', 'dungeon'] as const;
export type ThemeId = (typeof THEMES)[number];

export type RoomDocument = Room & Document;

@Schema({ timestamps: true })
export class Room {
  @Prop({ required: true, unique: true, minlength: 8, maxlength: 12 })
  code: string;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Admin' })
  adminId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: DECK_TYPES })
  deckType: DeckType;

  @Prop({ type: String, required: true, enum: ['open', 'closed'], default: 'open' })
  status: 'open' | 'closed';

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: '', maxlength: 280 })
  currentTopic: string;

  @Prop({ type: String, required: true, enum: ['hidden', 'revealed'], default: 'hidden' })
  revealState: 'hidden' | 'revealed';

  @Prop({ type: Date, default: null })
  timerEndsAt: Date | null;

  @Prop({ type: [String], default: [] })
  bannedIps: string[];

  @Prop({ type: String, enum: THEMES, default: 'cardroom' })
  theme: ThemeId;
}

export const RoomSchema = SchemaFactory.createForClass(Room);
