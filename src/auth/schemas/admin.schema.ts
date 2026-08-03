import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdminDocument = Admin & Document;

@Schema({ timestamps: true })
export class Admin {
  @Prop({ required: true, unique: true, minlength: 3, maxlength: 40 })
  username: string;

  @Prop({ required: true, select: false })
  passwordHash: string;
}

export const AdminSchema = SchemaFactory.createForClass(Admin);
