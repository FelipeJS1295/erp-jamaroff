import { Controller, Get } from '@nestjs/common';
import { SalesService } from './sales.service.js';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  /**
   * GET /api/sales — ventas agrupadas por orden (las más recientes primero), con:
   * precio de venta, liquidación, factura del proveedor, IVA y total (margen).
   */
  @Get()
  list() {
    return this.sales.listWithMargin();
  }
}