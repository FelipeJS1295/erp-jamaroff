import { Inject, Injectable } from '@nestjs/common';
import { PRICING_CHANNELS } from '@erp/shared';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.module.js';
import { NOT_FULFILLMENT_SQL, ReconciliationService } from '../settlements/reconciliation.service.js';
import { SettlementsService } from '../settlements/settlements.service.js';

/** IVA Chile */
const VAT_RATE = 1.19;
/** Parte de IVA que trae un monto con IVA: 119 -> 19 */
const vatOf = (gross: number) => gross - gross / VAT_RATE;

const LABELS: Record<string, string> = Object.fromEntries(PRICING_CHANNELS.map((c) => [c.code, c.label]));

/**
 * Una venta (orden) con su resultado:
 *   Total = Liquidación − Proveedor (con IVA) − IVA
 *   IVA   = IVA de la venta − IVA de la compra (factura proveedor) − IVA de la comisión
 */
export interface SaleWithMargin {
  key: string;
  retailer: string;
  orderNumber: string | null;
  orderDate: string | null;
  dispatchDeadline: string | null;
  productName: string | null;
  status: string | null;
  cancelled: boolean;
  /** Lo que pagó el cliente (con IVA) */
  salePrice: number | null;
  /** Neto que pagó el retailer en la liquidación. null = aún no paga */
  settlementNet: number | null;
  /** Comisión cobrada por el retailer (negativa, con IVA) */
  commission: number | null;
  /** Facturas del proveedor: con IVA y sin IVA. null = sin factura */
  supplierGross: number | null;
  supplierNet: number | null;
  /** Detalle del IVA (montos positivos) */
  vatSale: number | null;
  vatPurchase: number;
  vatCommission: number;
  /** IVA a pagar = venta − compra − comisión */
  vat: number | null;
  /** null hasta tener liquidación y factura del proveedor */
  total: number | null;
  /** Total sobre el precio de venta (%) */
  marginPct: number | null;
}

type SaleGroup = {
  retailer_code: string;
  retailer_name: string;
  fulfillment: boolean;
  order_number: string | null;
  order_date: string | null;
  dispatch_deadline: string | null;
  product_name: string | null;
  status: string | null;
  cancelled: boolean;
  /** Respaldo si la orden no está en ninguna conciliación (con IVA) */
  sale_price: number | null;
};

interface Money {
  salePrice: number;
  settlementNet: number;
  paid: boolean;
  commission: number;
  supplierNet: number;
  supplierGross: number;
  hasDocuments: boolean;
}

/** Hasta cuántas órdenes se muestran (las más recientes) */
const LIMIT = 500;

@Injectable()
export class SalesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly settlements: SettlementsService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  /** Ventas agrupadas por orden, con lo liquidado, lo pagado al proveedor, el IVA y el total */
  async listWithMargin(): Promise<SaleWithMargin[]> {
    const [{ rows: groups }, money] = await Promise.all([
      this.db.execute<SaleGroup>(sql`
        select
          r.code as retailer_code,
          r.name as retailer_name,
          not (${sql.raw(NOT_FULFILLMENT_SQL.replace(/fulfillment/g, 's.fulfillment'))}) as fulfillment,
          s.order_number,
          min(s.order_date)::text as order_date,
          min(s.dispatch_deadline)::text as dispatch_deadline,
          string_agg(distinct s.product_name, ' + ') as product_name,
          min(s.status) as status,
          bool_and(coalesce(s.status, '') ~* 'cancel|anulad') as cancelled,
          round(sum(coalesce(s.paid_price, s.unit_price, 0) * s.quantity
            * case when s.amounts_include_tax then 1 else ${sql.raw(String(VAT_RATE))} end))::float8 as sale_price
        from sales_records s
        join retailers r on r.id = s.retailer_id
        group by 1, 2, 3, 4
        order by min(s.order_date) desc nulls last, s.order_number desc
        limit ${LIMIT}
      `),
      this.moneyByOrder(),
    ]);

    return groups.map((g) => {
      const label = LABELS[g.retailer_code] ?? g.retailer_name;
      const m = money.get(`${g.retailer_code}|${g.order_number}`);
      const salePrice = g.cancelled ? 0 : (m?.salePrice ?? g.sale_price);
      const settlementNet = m?.paid && !(g.cancelled && m.settlementNet === 0) ? m.settlementNet : null;
      const supplierGross = m?.hasDocuments ? m.supplierGross : null;
      const supplierNet = m?.hasDocuments ? m.supplierNet : null;
      const commission = m?.paid ? m.commission : null;

      // Orden cancelada: no hay venta ni IVA; solo se muestra si el retailer igual cobró algo
      const vatSale = salePrice !== null && !g.cancelled ? vatOf(salePrice) : null;
      const vatPurchase = supplierGross !== null && supplierNet !== null ? supplierGross - supplierNet : 0;
      // La comisión viene negativa (es un cobro): su IVA es crédito a favor
      const vatCommission = commission !== null ? vatOf(-commission) : 0;
      const vat = vatSale !== null ? vatSale - vatPurchase - vatCommission : null;

      const total =
        !g.cancelled && settlementNet !== null && supplierGross !== null && vat !== null
          ? settlementNet - supplierGross - vat
          : null;

      return {
        key: `${g.retailer_code}|${g.fulfillment ? 'F' : ''}|${g.order_number}`,
        retailer: g.fulfillment ? `${label} · Fulfillment` : label,
        orderNumber: g.order_number,
        orderDate: g.order_date,
        dispatchDeadline: g.dispatch_deadline,
        productName: g.product_name,
        status: g.status,
        cancelled: g.cancelled,
        salePrice: round(salePrice),
        settlementNet: round(settlementNet),
        commission: round(commission),
        supplierGross: round(supplierGross),
        supplierNet: round(supplierNet),
        vatSale: round(vatSale),
        vatPurchase: Math.round(vatPurchase),
        vatCommission: Math.round(vatCommission),
        vat: round(vat),
        total: round(total),
        marginPct: total !== null && salePrice ? (total / salePrice) * 100 : null,
      };
    });
  }

  /**
   * Montos de cada orden sacados de la conciliación de cada retailer (así cuadran con
   * la página Conciliación). Si el retailer cruza por línea (Falabella), se suman las
   * líneas de la misma orden.
   */
  private async moneyByOrder(): Promise<Map<string, Money>> {
    const map = new Map<string, Money>();
    const options = this.settlements.availableRetailers();
    const results = await Promise.all(
      options.map((o) => this.reconciliation.reconcile(o.code).catch(() => null)),
    );
    for (const data of results) {
      if (!data) continue;
      for (const r of data.rows) {
        // Solo filas con venta (no multas ni pagos sin venta)
        if (r.status === 'SIN_VENTA' || r.status === 'MULTA' || !r.orderNumber) continue;
        const key = `${data.retailerCode}|${r.orderNumber}`;
        const m = map.get(key) ?? {
          salePrice: 0,
          settlementNet: 0,
          paid: false,
          commission: 0,
          supplierNet: 0,
          supplierGross: 0,
          hasDocuments: false,
        };
        m.salePrice += r.salePrice ?? 0;
        if (r.productPaid !== null) {
          m.paid = true;
          m.settlementNet += r.net ?? 0;
          m.commission += r.commission ?? 0;
        }
        for (const d of r.documents) {
          m.hasDocuments = true;
          m.supplierNet += d.amountNet;
          m.supplierGross += d.amountGross;
        }
        map.set(key, m);
      }
    }
    return map;
  }
}

const round = (n: number | null) => (n === null ? null : Math.round(n));