import { Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoomsService, publicRoomView } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';

@Controller('rooms')
export class RoomsController {
  constructor(private roomsService: RoomsService) {}

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 3600_000 } })
  @Post()
  async create(@Body() dto: CreateRoomDto, @Req() req: any) {
    const room = await this.roomsService.createRoom(req.user.adminId, dto.deckType, dto.expiresInHours);
    return publicRoomView(room);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  async mine(@Req() req: any) {
    const rooms = await this.roomsService.listForAdmin(req.user.adminId);
    return rooms.map(publicRoomView);
  }

  @Get(':code')
  async get(@Param('code') code: string) {
    const room = await this.roomsService.getByCode(code);
    if (!room) throw new NotFoundException('room not found');
    return publicRoomView(room);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':code/is-admin')
  async isAdmin(@Param('code') code: string, @Req() req: any) {
    const room = await this.roomsService.getByCode(code);
    if (!room) throw new NotFoundException('room not found');
    return { isAdmin: room.adminId?.toString() === req.user.adminId };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':code/banned-ips')
  async bannedIps(@Param('code') code: string, @Req() req: any) {
    const room = await this.roomsService.getByCode(code);
    if (!room || room.adminId?.toString() !== req.user.adminId) {
      throw new NotFoundException('room not found');
    }
    return { bannedIps: (room as any).bannedIps ?? [] };
  }
}
