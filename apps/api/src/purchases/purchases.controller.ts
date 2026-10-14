import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type SessionUser } from '../auth/decorators.js';
import { validate } from '../products/catalog.validation.js';
import { PurchasesService } from './purchases.service.js';

/** Monto neto en pesos, mayor a 0: acepta 125000, "125000", "125.000" o "$125.000" */
const amountSchema = z
  .union([z.number(), z.string()], { error: 'Falta el monto' })
  .transform((value, ctx) => {
    const text =
      typeof value === 'number'
        ? String(value)
        : value.trim().replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(text);
    if (text === '' || !Number.isFinite(n) || n <= 0) {
      ctx.addIssue({ code: 'custom', message: 'Cada monto debe ser un número mayor a 0' });
      return z.NEVER;
    }
    return n.toFixed(2);
  });

const documentSchema = z.object({
  supplier: z
    .string({ error: 'Falta el proveedor' })
    .trim()
    .min(1, 'Falta el proveedor')
    .max(200, 'El proveedor puede tener máximo 200 caracteres'),
  documentNumber: z
    .string({ error: 'Falta el N° de documento' })
    .trim()
    .min(1, 'Falta el N° de documento')
    .max(50, 'El N° de documento puede tener máximo 50 caracteres'),
  retailerCode: z.string({ error: 'Falta el retailer' }).min(1),
  lines: z
    .array(
      z.object({
        itemKey: z.string().min(1).max(80),
        orderNumber: z.string().max(50).nullable(),
        productName: z.string().nullable(),
        /** Monto neto (sin IVA): acepta 125000, "125.000", "125000,5" */
        amountNet: amountSchema,
      }),
      { error: 'Faltan las órdenes' },
    )
    .min(1, 'Selecciona al menos una orden'),
});

/**
 * Documentos de compra (facturas del proveedor) ligados a órdenes de la conciliación.
 *   GET    /api/purchases/suppliers
 *   POST   /api/purchases/documents     { supplier, documentNumber, retailerCode, lines[] }
 *   DELETE /api/purchases/lines/:id     quita una orden del documento
 * Las rutas que modifican quedan para ADMIN y OPERADOR (regla general del AuthGuard).
 */
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get('suppliers')
  suppliers() {
    return this.purchases.listSuppliers();
  }

  @Post('documents')
  create(@Body() body: unknown, @CurrentUser() user: SessionUser) {
    return this.purchases.createDocument(validate(documentSchema, body), user?.id ?? null);
  }

  @Delete('lines/:id')
  removeLine(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchases.deleteLine(id);
  }
}