import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.module.js';
import { customerReceipts, retailers } from '../database/schema/index.js';
import { SalesService } from '../sales/sales.service.js';
import { ApiGatewayClient, SiiRejectedError } from './api-gateway.client.js';
import { RUT_GENERICO, siiRut } from './rut.js';

/** Nombre del ítem: el SII acepta hasta 80 caracteres */
const ITEM_MAX = 80;

const todayCL = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

export interface BoletaPreview {
  retailerCode: string;
  orderNumber: string;
  /** El cliente pidió factura: no se emite como boleta */
  wantsInvoice: boolean;
  item: string;
  total: number;
  productTotal: number;
  shippingTotal: number;
  receptorRut: string;
  /** Nombre del cliente que va en la boleta (si no viene, "Cliente") */
  receptorName: string;
  receptorAddress: string | null;
  receptorCommune: string | null;
  /** El RUT del cliente no vino o no es válido: se usa el genérico */
  genericReceptor: boolean;
  existing: { id: string; number: string; status: string } | null;
}

@Injectable()
export class SiiService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly sales: SalesService,
    private readonly gateway: ApiGatewayClient,
  ) {}

  status() {
    const cfg = this.gateway.config();
    return { enabled: cfg.enabled, emisorRut: cfg.rut, missing: cfg.missing };
  }

  private async retailerId(code: string) {
    const [r] = await this.db.select({ id: retailers.id }).from(retailers).where(eq(retailers.code, code.toUpperCase()));
    if (!r) throw new BadRequestException(`Retailer "${code}" no existe`);
    return r.id;
  }

  private async existing(retailerId: string, orderNumber: string) {
    const [row] = await this.db
      .select({ id: customerReceipts.id, number: customerReceipts.receiptNumber, status: customerReceipts.status })
      .from(customerReceipts)
      .where(and(eq(customerReceipts.retailerId, retailerId), eq(customerReceipts.orderNumber, orderNumber)));
    return row ?? null;
  }

  /** Lo que se va a emitir (se muestra antes de confirmar) */
  async preview(retailerCode: string, orderNumber: string): Promise<BoletaPreview> {
    const data = await this.sales.customerData(retailerCode, orderNumber);
    const names = [...new Set(data.lines.map((l) => (l.quantity > 1 ? `${l.quantity} x ` : '') + (l.productName ?? 'Producto')))].join(' + ');
    const suffix = data.shippingTotal > 0 ? ' + despacho' : '';
    const item = names.length + suffix.length > ITEM_MAX ? `${names.slice(0, ITEM_MAX - suffix.length - 1)}…${suffix}` : `${names}${suffix}`;
    const rut = siiRut(data.customer.rut);
    return {
      retailerCode: retailerCode.toUpperCase(),
      orderNumber,
      wantsInvoice: data.documentType === 'FACTURA',
      item,
      total: data.total,
      productTotal: data.productTotal,
      shippingTotal: data.shippingTotal,
      receptorRut: rut ?? RUT_GENERICO,
      receptorName: (data.customer.name ?? data.shipping.name ?? '').trim() || 'Cliente',
      receptorAddress: data.shipping.address,
      receptorCommune: data.shipping.commune,
      genericReceptor: !rut,
      existing: await this.existing(await this.retailerId(retailerCode), orderNumber),
    };
  }

  /**
   * Emite la boleta de una orden en el SII (portal eBoleta) y la guarda en el ERP.
   * Nunca emite dos veces la misma orden: antes de llamar al SII deja la orden "EMITIENDO".
   */
  async emitirBoleta(retailerCode: string, orderNumber: string, userId: string | null) {
    const p = await this.preview(retailerCode, orderNumber);
    if (p.wantsInvoice) throw new BadRequestException('Esta orden pide FACTURA: no se puede emitir como boleta');
    if (p.total <= 0) throw new BadRequestException('La orden no tiene monto');
    if (p.existing) {
      const why =
        p.existing.status === 'EMITIENDO'
          ? 'se está emitiendo en este momento'
          : p.existing.status === 'REVISAR'
            ? 'tiene un intento sin confirmar: revísalo en el portal eBoleta del SII'
            : `ya tiene la boleta N° ${p.existing.number}`;
      throw new ConflictException(`La orden ${orderNumber} ${why}`);
    }

    const retailerId = await this.retailerId(retailerCode);
    // 1. Reserva la orden (el índice único impide dos emisiones al mismo tiempo)
    let receiptId: string;
    try {
      const [row] = await this.db
        .insert(customerReceipts)
        .values({
          retailerId,
          orderNumber,
          receiptNumber: 'EMITIENDO',
          totalGross: String(p.total),
          documentType: 39,
          status: 'EMITIENDO',
          createdBy: userId,
        })
        .returning({ id: customerReceipts.id });
      receiptId = row.id;
    } catch {
      throw new ConflictException(`La orden ${orderNumber} ya tiene boleta o se está emitiendo`);
    }

    // 2. Emite en el SII
    try {
      const result = await this.gateway.emitirBoleta({
        tipo: 39,
        receptorRut: p.receptorRut,
        receptorNombre: p.receptorName,
        receptorDireccion: p.receptorAddress,
        receptorComuna: p.receptorCommune,
        item: p.item,
        total: p.total,
      });
      const [saved] = await this.db
        .update(customerReceipts)
        .set({
          receiptNumber: String(result.folio),
          documentType: result.dte,
          status: 'EMITIDA',
          issuedAt: todayCL(),
          pdfUrl: result.pdfUrl,
          pdfData: result.pdfBase64,
          siiResponse: result.raw,
        })
        .where(eq(customerReceipts.id, receiptId))
        .returning({ id: customerReceipts.id, number: customerReceipts.receiptNumber });
      return { ok: true as const, id: saved.id, folio: result.folio, total: p.total, orderNumber };
    } catch (err) {
      const message = (err as Error).message;
      if (err instanceof SiiRejectedError) {
        // Rechazada: no se emitió, se libera la orden para reintentar
        await this.db.delete(customerReceipts).where(eq(customerReceipts.id, receiptId));
        throw new BadGatewayException(`El SII / API Gateway rechazó la boleta: ${message}`);
      }
      // No se sabe si quedó emitida: se marca para revisar en el portal (no se reintenta solo)
      await this.db
        .update(customerReceipts)
        .set({ status: 'REVISAR', receiptNumber: 'REVISAR', siiResponse: { error: message } })
        .where(eq(customerReceipts.id, receiptId));
      throw new BadGatewayException(
        `No se pudo confirmar la boleta (${message}). Revisa en el portal eBoleta del SII si quedó emitida: ` +
          'si quedó, anota su N° en la orden; si no, quita el intento y vuelve a emitir.',
      );
    }
  }

  /** Emite varias boletas, una tras otra. Devuelve el resultado de cada una */
  async emitirVarias(orders: { retailerCode: string; orderNumber: string }[], userId: string | null) {
    const results = [];
    for (const o of orders) {
      try {
        results.push(await this.emitirBoleta(o.retailerCode, o.orderNumber, userId));
      } catch (err) {
        results.push({ ok: false as const, orderNumber: o.orderNumber, error: (err as Error).message });
        // Si falla la configuración o las credenciales, no tiene sentido seguir
        if (/configurad|clave|token|autentic|crédito|credito/i.test((err as Error).message)) break;
      }
    }
    return {
      emitted: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  /** PDF de una boleta emitida desde el sistema */
  async pdf(receiptId: string): Promise<{ data: Buffer; fileName: string }> {
    const [r] = await this.db.select().from(customerReceipts).where(eq(customerReceipts.id, receiptId));
    if (!r) throw new NotFoundException('La boleta no existe');
    if (r.status !== 'EMITIDA') throw new BadRequestException('Esta boleta no se emitió desde el sistema');
    const fileName = `boleta-${r.receiptNumber}.pdf`;
    if (r.pdfData) return { data: Buffer.from(r.pdfData, 'base64'), fileName };
    const data = await this.gateway.pdfBoleta(Number(r.receiptNumber), r.documentType, r.issuedAt ?? todayCL());
    await this.db.update(customerReceipts).set({ pdfData: data.toString('base64') }).where(eq(customerReceipts.id, r.id));
    return { data, fileName };
  }
}
