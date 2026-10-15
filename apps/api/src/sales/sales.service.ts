import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PRICING_CHANNELS } from '@erp/shared';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.module.js';
import { customerReceipts, retailers } from '../database/schema/index.js';
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
 *   IVA   = IVA de la venta (boleta) − IVA de la compra (factura proveedor)
 *           − IVA de la comisión − IVA de los cargos de envío/logística
 */
export interface SaleWithMargin {
  key: string;
  /** Código del retailer en la base (para guardar la boleta) */
  retailerCode: string;
  retailer: string;
  orderNumber: string | null;
  orderDate: string | null;
  dispatchDeadline: string | null;
  productName: string | null;
  status: string | null;
  cancelled: boolean;
  /** Lo que pagó el cliente por el producto (con IVA) */
  salePrice: number | null;
  /** Boleta al cliente final (producto + envío, con IVA). null = aún no se ingresa */
  receipt: { id: string; number: string; totalGross: number } | null;
  /** Neto que pagó el retailer en la liquidación. null = aún no paga */
  settlementNet: number | null;
  /** Comisión cobrada por el retailer (negativa, con IVA) */
  commission: number | null;
  /** Cargos de envío y logística de la liquidación (negativos, con IVA) */
  shippingCharges: number | null;
  /** Facturas del proveedor: con IVA y sin IVA. null = sin factura */
  supplierGross: number | null;
  supplierNet: number | null;
  /** Detalle del IVA (montos positivos) */
  vatSale: number | null;
  vatPurchase: number;
  vatCommission: number;
  vatShipping: number;
  /** IVA a pagar = venta − compra − comisión − envío */
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
  receipt_id: string | null;
  receipt_number: string | null;
  receipt_total: number | null;
};

interface Money {
  salePrice: number;
  settlementNet: number;
  paid: boolean;
  commission: number;
  shippingCharges: number;
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
            * case when s.amounts_include_tax then 1 else ${sql.raw(String(VAT_RATE))} end))::float8 as sale_price,
          min(cr.id::text) as receipt_id,
          min(cr.receipt_number) as receipt_number,
          min(cr.total_gross)::float8 as receipt_total
        from sales_records s
        join retailers r on r.id = s.retailer_id
        left join customer_receipts cr on cr.retailer_id = s.retailer_id and cr.order_number = s.order_number
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
      const shippingCharges = m?.paid ? m.shippingCharges : null;

      // IVA débito: el de la boleta (producto + envío); sin boleta, el del precio de venta.
      // Orden cancelada: no hay venta ni IVA
      const vatBase = g.receipt_total ?? salePrice;
      const vatSale = vatBase !== null && !g.cancelled ? vatOf(vatBase) : null;
      const vatPurchase = supplierGross !== null && supplierNet !== null ? supplierGross - supplierNet : 0;
      // La comisión viene negativa (es un cobro): su IVA es crédito a favor
      const vatCommission = commission !== null ? vatOf(-commission) : 0;
      // Cargos de envío/logística facturados por el retailer: también crédito
      const vatShipping = shippingCharges !== null ? vatOf(-shippingCharges) : 0;
      const vat = vatSale !== null ? vatSale - vatPurchase - vatCommission - vatShipping : null;

      const total =
        !g.cancelled && settlementNet !== null && supplierGross !== null && vat !== null
          ? settlementNet - supplierGross - vat
          : null;

      return {
        key: `${g.retailer_code}|${g.fulfillment ? 'F' : ''}|${g.order_number}`,
        retailerCode: g.retailer_code,
        retailer: g.fulfillment ? `${label} · Fulfillment` : label,
        orderNumber: g.order_number,
        orderDate: g.order_date,
        dispatchDeadline: g.dispatch_deadline,
        productName: g.product_name,
        status: g.status,
        cancelled: g.cancelled,
        salePrice: round(salePrice),
        receipt:
          g.receipt_id && g.receipt_number && g.receipt_total !== null
            ? { id: g.receipt_id, number: g.receipt_number, totalGross: Math.round(g.receipt_total) }
            : null,
        settlementNet: round(settlementNet),
        commission: round(commission),
        shippingCharges: round(shippingCharges),
        supplierGross: round(supplierGross),
        supplierNet: round(supplierNet),
        vatSale: round(vatSale),
        vatPurchase: Math.round(vatPurchase),
        vatCommission: Math.round(vatCommission),
        vatShipping: Math.round(vatShipping),
        vat: round(vat),
        total: round(total),
        marginPct: total !== null && salePrice ? (total / salePrice) * 100 : null,
      };
    });
  }

  /**
   * Boleta al cliente final: una por orden. Si ya existe, se reemplaza.
   */
  async saveReceipt(
    input: { retailerCode: string; orderNumber: string; receiptNumber: string; totalGross: string },
    userId: string | null,
  ) {
    const [retailer] = await this.db
      .select({ id: retailers.id })
      .from(retailers)
      .where(eq(retailers.code, input.retailerCode.toUpperCase()));
    if (!retailer) throw new BadRequestException(`Retailer "${input.retailerCode}" no existe`);

    const [row] = await this.db
      .insert(customerReceipts)
      .values({
        retailerId: retailer.id,
        orderNumber: input.orderNumber,
        receiptNumber: input.receiptNumber,
        totalGross: input.totalGross,
        createdBy: userId,
      })
      .onConflictDoUpdate({
        target: [customerReceipts.retailerId, customerReceipts.orderNumber],
        set: { receiptNumber: input.receiptNumber, totalGross: input.totalGross },
      })
      .returning({ id: customerReceipts.id });
    return row;
  }

  async deleteReceipt(id: string) {
    const [row] = await this.db
      .delete(customerReceipts)
      .where(eq(customerReceipts.id, id))
      .returning({ id: customerReceipts.id });
    if (!row) throw new NotFoundException('La boleta ya no existe');
    return { deleted: true };
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
          shippingCharges: 0,
          supplierNet: 0,
          supplierGross: 0,
          hasDocuments: false,
        };
        m.salePrice += r.salePrice ?? 0;
        if (r.productPaid !== null) {
          m.paid = true;
          m.settlementNet += r.net ?? 0;
          m.commission += r.commission ?? 0;
          m.shippingCharges += r.shippingCharges ?? 0;
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