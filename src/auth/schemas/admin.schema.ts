import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdminDocument = Admin & Document;

@Schema({ timestamps: true })
export class Admin {
  @Prop({ required: true, unique: true, minlength: 3, maxlength: 40 })
  username: string;

  // absent for accounts that only ever sign in with Google
  @Prop({ type: String, select: false, default: null })
  passwordHash: string | null;

  @Prop({ type: String, unique: true, sparse: true, default: undefined })
  googleSub?: string;

  @Prop({ type: String, default: null })
  email: string | null;
}

export const AdminSchema = SchemaFactory.createForClass(Admin);
