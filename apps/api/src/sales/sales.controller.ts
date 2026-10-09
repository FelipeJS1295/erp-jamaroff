import { Controller, Get, Inject } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.module.js';
import { retailers, salesRecords } from '../database/schema/index.js';
import { NOT_FULFILLMENT_SQL } from '../settlements/reconciliation.service.js';

@Controller('sales')
export class SalesController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * GET /api/sales — ventas cargadas, las más recientes primero.
   * Por ahora solo algunas columnas y hasta 500 filas; luego agregamos filtros y paginación.
   */
  @Get()
  list() {
    return this.db
      .select({
        id: salesRecords.id,
        // Las ventas fulfillment se muestran aparte: "Cencosud · Fulfillment"
        retailer: sql<string>`case when ${sql.raw(NOT_FULFILLMENT_SQL)} then ${retailers.name}
          else ${retailers.name} || ' · Fulfillment' end`,
        orderNumber: salesRecords.orderNumber,
        orderDate: salesRecords.orderDate,
        dispatchDeadline: salesRecords.dispatchDeadline,
        productName: salesRecords.productName,
        carrier: salesRecords.carrier,
        status: salesRecords.status,
      })
      .from(salesRecords)
      .innerJoin(retailers, eq(salesRecords.retailerId, retailers.id))
      .orderBy(desc(salesRecords.orderDate), desc(salesRecords.orderNumber))
      .limit(500);
  }
}