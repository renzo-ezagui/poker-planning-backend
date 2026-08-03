import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  it('GET /health returns ok', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();
    const controller = moduleRef.get(AppController);
    expect(controller.health()).toEqual({ ok: true });
  });
});
