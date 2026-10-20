import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, type SessionUser } from '../auth/decorators.js';
import { validate } from '../products/catalog.validation.js';
import { SiiService } from './sii.service.js';

const orderSchema = z.object({
  retailerCode: z.string({ error: 'Falta el retailer' }).min(1),
  orderNumber: z.string({ error: 'Falta la orden' }).min(1).max(50),
});

/**
 * Boletas en el SII (portal eBoleta) a través de API Gateway.
 *   GET  /api/sii/status                                ¿está configurado?
 *   GET  /api/sii/boletas/preview?retailer=&order=      lo que se va a emitir
 *   POST /api/sii/boletas        { retailerCode, orderNumber }       emite una
 *   POST /api/sii/boletas/lote   { orders: [{ retailerCode, orderNumber }] }  emite varias
 *   GET  /api/sii/boletas/:id/pdf
 * Emitir queda para ADMIN y OPERADOR (regla general del AuthGuard).
 */
@Controller('sii')
export class SiiController {
  constructor(private readonly sii: SiiService) {}

  @Get('status')
  status() {
    return this.sii.status();
  }

  @Get('boletas/preview')
  preview(@Query('retailer') retailer: string, @Query('order') order: string) {
    const { retailerCode, orderNumber } = validate(orderSchema, { retailerCode: retailer, orderNumber: order });
    return this.sii.preview(retailerCode, orderNumber);
  }

  @Post('boletas')
  @HttpCode(200)
  emitir(@Body() body: unknown, @CurrentUser() user: SessionUser) {
    const { retailerCode, orderNumber } = validate(orderSchema, body);
    return this.sii.emitirBoleta(retailerCode, orderNumber, user?.id ?? null);
  }

  @Post('boletas/lote')
  @HttpCode(200)
  emitirVarias(@Body() body: unknown, @CurrentUser() user: SessionUser) {
    const { orders } = validate(
      z.object({ orders: z.array(orderSchema).min(1, 'No hay órdenes').max(100, 'Máximo 100 boletas por vez') }),
      body,
    );
    return this.sii.emitirVarias(orders, user?.id ?? null);
  }

  @Get('boletas/:id/pdf')
  async pdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { data, fileName } = await this.sii.pdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(data);
  }
}
