import { Injectable, ConflictException, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { Admin, AdminDocument } from './schemas/admin.schema';

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
    private jwtService: JwtService,
  ) {}

  /** Seeds the admin account from ADMIN_USERNAME / ADMIN_PASSWORD if it doesn't exist yet. */
  async onApplicationBootstrap() {
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    if (!username || !password) return;
    if (password.length < 12) {
      this.logger.warn('ADMIN_PASSWORD shorter than 12 characters — admin not seeded');
      return;
    }
    const existing = await this.adminModel.findOne({ username: String(username) });
    if (existing) return;
    await this.register(username, password);
    this.logger.log(`seeded admin account "${username}"`);
  }

  async register(username: string, password: string): Promise<{ id: string; username: string }> {
    const existing = await this.adminModel.findOne({ username: String(username) });
    if (existing) throw new ConflictException('username taken');
    const passwordHash = await bcrypt.hash(password, 12);
    const created = await this.adminModel.create({ username, passwordHash });
    return { id: created._id.toString(), username: created.username };
  }

  async validateLogin(username: string, password: string): Promise<{ adminId: string } | null> {
    const admin = await this.adminModel.findOne({ username: String(username) }).select('+passwordHash');
    if (!admin || !admin.passwordHash) return null;
    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) return null;
    return { adminId: admin._id.toString() };
  }

  /** Verifies a Google Identity Services ID token and returns (or creates) the matching admin. */
  async loginWithGoogle(credential: string, allowCreate: boolean): Promise<{ adminId: string } | null> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return null;
    const ticket = await new OAuth2Client(clientId)
      .verifyIdToken({ idToken: credential, audience: clientId })
      .catch(() => null);
    const payload = ticket?.getPayload();
    if (!payload?.sub || !payload.email_verified) return null;

    const existing = await this.adminModel.findOne({ googleSub: String(payload.sub) });
    if (existing) return { adminId: existing._id.toString() };
    if (!allowCreate) return null;

    const base = (payload.email ?? payload.name ?? 'host')
      .split('@')[0]
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .slice(0, 30)
      .padEnd(3, '0');
    let username = base;
    for (let i = 2; await this.adminModel.exists({ username }); i++) username = `${base}${i}`;
    const created = await this.adminModel.create({
      username,
      googleSub: payload.sub,
      email: payload.email ?? null,
    });
    return { adminId: created._id.toString() };
  }

  async findById(adminId: string) {
    if (!Types.ObjectId.isValid(adminId)) return null;
    return this.adminModel.findById(adminId);
  }

  signToken(adminId: string): string {
    return this.jwtService.sign({ sub: adminId }, { expiresIn: '2h' });
  }
}
