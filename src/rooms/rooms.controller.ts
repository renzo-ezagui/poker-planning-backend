import { Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';

@Controller('rooms')
export class RoomsController {
  constructor(private roomsService: RoomsService) {}

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 3600_000 } })
  @Post()
  create(@Body() dto: CreateRoomDto, @Req() req: any) {
    return this.roomsService.createRoom(req.user.adminId, dto.deckType, dto.expiresInHours);
  }

  @Get(':code')
  async get(@Param('code') code: string) {
    const room = await this.roomsService.getByCode(code);
    if (!room) throw new NotFoundException('room not found');
    return room;
  }
}
