import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Admin, AdminDocument } from './schemas/admin.schema';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    private jwtService: JwtService,
  ) {}

  async register(
    username: string,
    password: string,
  ): Promise<{ id: string; username: string }> {
    const existing = await this.adminModel.findOne({ username });
    if (existing) throw new ConflictException('username taken');
    const passwordHash = await bcrypt.hash(password, 12);
    const created = await this.adminModel.create({ username, passwordHash });
    return { id: created._id.toString(), username: created.username };
  }

  async validateLogin(
    username: string,
    password: string,
  ): Promise<{ adminId: string } | null> {
    const admin = await this.adminModel
      .findOne({ username })
      .select('+passwordHash');
    if (!admin) return null;
    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) return null;
    return { adminId: admin._id.toString() };
  }

  signToken(adminId: string): string {
    return this.jwtService.sign({ sub: adminId }, { expiresIn: '2h' });
  }
}
