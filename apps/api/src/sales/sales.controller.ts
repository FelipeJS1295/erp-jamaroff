import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type SessionUser } from '../auth/decorators.js';
import { validate } from '../products/catalog.validation.js';
import { SalesService } from './sales.service.js';

/** Monto en pesos, mayor a 0: acepta 199990, "199.990" o "$199.990" */
const amountSchema = z
  .union([z.number(), z.string()], { error: 'Falta el total' })
  .transform((value, ctx) => {
    const text =
      typeof value === 'number'
        ? String(value)
        : value.trim().replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(text);
    if (text === '' || !Number.isFinite(n) || n <= 0) {
      ctx.addIssue({ code: 'custom', message: 'El total debe ser un número mayor a 0' });
      return z.NEVER;
    }
    return n.toFixed(2);
  });

const receiptSchema = z.object({
  retailerCode: z.string({ error: 'Falta el retailer' }).min(1),
  orderNumber: z.string({ error: 'Falta la orden' }).min(1).max(50),
  receiptNumber: z
    .string({ error: 'Falta el N° de boleta' })
    .trim()
    .min(1, 'Falta el N° de boleta')
    .max(50, 'El N° de boleta puede tener máximo 50 caracteres'),
  /** Total de la boleta con IVA (producto + envío) */
  totalGross: amountSchema,
});

/**
 *   GET    /api/sales                ventas por orden con su margen
 *   POST   /api/sales/receipts       { retailerCode, orderNumber, receiptNumber, totalGross }
 *   DELETE /api/sales/receipts/:id
 * Las rutas que modifican quedan para ADMIN y OPERADOR (regla general del AuthGuard).
 */
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  /**
   * Ventas agrupadas por orden (las más recientes primero), con: precio de venta, boleta,
   * liquidación, factura del proveedor, IVA y total (margen).
   */
  @Get()
  list() {
    return this.sales.listWithMargin();
  }

  /** Datos del cliente de una orden, para hacer la boleta o factura en el SII */
  @Get('customer')
  customer(@Query('retailer') retailer?: string, @Query('order') order?: string) {
    if (!retailer || !order) throw new BadRequestException('Faltan el retailer y la orden');
    return this.sales.customerData(retailer, order);
  }

  @Post('receipts')
  saveReceipt(@Body() body: unknown, @CurrentUser() user: SessionUser) {
    return this.sales.saveReceipt(validate(receiptSchema, body), user?.id ?? null);
  }

  @Delete('receipts/:id')
  deleteReceipt(@Param('id', ParseUUIDPipe) id: string) {
    return this.sales.deleteReceipt(id);
  }
}