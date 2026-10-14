import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.module.js';
import {
  purchaseDocumentLines,
  purchaseDocuments,
  retailers,
  suppliers,
} from '../database/schema/index.js';

/** IVA Chile */
export const VAT_RATE = 1.19;

export interface NewDocumentInput {
  supplier: string;
  documentNumber: string;
  /** Opción de conciliación (ej: CENCOSUD, CENCOSUD_FULFILLMENT, FALABELLA) */
  retailerCode: string;
  lines: { itemKey: string; orderNumber: string | null; productName: string | null; amountNet: string }[];
}

/** Documento de compra ligado a una fila de la conciliación */
export interface RowDocument {
  lineId: string;
  documentId: string;
  documentNumber: string;
  supplier: string;
  amountNet: number;
  amountGross: number;
}

/** Retailer en la base a partir de la opción de conciliación (CENCOSUD_FULFILLMENT -> CENCOSUD) */
const baseRetailerCode = (code: string) => code.toUpperCase().replace(/_FULFILLMENT$/, '');

@Injectable()
export class PurchasesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Proveedores ya usados (para sugerirlos al escribir) */
  listSuppliers() {
    return this.db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .orderBy(asc(suppliers.name));
  }

  /**
   * Guarda un documento con sus líneas (una por orden).
   * - El proveedor se crea si no existe (sin importar mayúsculas).
   * - Si el mismo proveedor ya tiene ese N° de documento, las órdenes se agregan a ese
   *   documento; si una orden ya estaba en él, se actualiza su monto.
   */
  async createDocument(input: NewDocumentInput, userId: string | null) {
    const [retailer] = await this.db
      .select({ id: retailers.id })
      .from(retailers)
      .where(eq(retailers.code, baseRetailerCode(input.retailerCode)));
    if (!retailer) throw new BadRequestException(`Retailer "${input.retailerCode}" no existe`);

    return this.db.transaction(async (tx) => {
      // Proveedor (lo crea si es nuevo)
      await tx
        .insert(suppliers)
        .values({ name: input.supplier })
        .onConflictDoNothing();
      const [supplier] = await tx
        .select()
        .from(suppliers)
        .where(sql`lower(${suppliers.name}) = lower(${input.supplier})`);

      // Documento (lo reutiliza si ya existe para ese proveedor)
      await tx
        .insert(purchaseDocuments)
        .values({ supplierId: supplier.id, documentNumber: input.documentNumber, createdBy: userId })
        .onConflictDoNothing();
      const [document] = await tx
        .select()
        .from(purchaseDocuments)
        .where(
          and(
            eq(purchaseDocuments.supplierId, supplier.id),
            eq(purchaseDocuments.documentNumber, input.documentNumber),
          ),
        );

      // Líneas: una por orden; si la orden ya estaba en este documento, se actualiza el monto
      await tx
        .insert(purchaseDocumentLines)
        .values(
          input.lines.map((l) => ({
            documentId: document.id,
            retailerId: retailer.id,
            itemKey: l.itemKey,
            orderNumber: l.orderNumber,
            productName: l.productName,
            amountNet: l.amountNet,
          })),
        )
        .onConflictDoUpdate({
          target: [purchaseDocumentLines.documentId, purchaseDocumentLines.retailerId, purchaseDocumentLines.itemKey],
          set: { amountNet: sql`excluded.amount_net`, productName: sql`excluded.product_name` },
        });

      return {
        documentId: document.id,
        supplier: supplier.name,
        documentNumber: document.documentNumber,
        lines: input.lines.length,
      };
    });
  }

  /** Quita una orden de un documento; si el documento queda sin órdenes, se elimina */
  async deleteLine(lineId: string) {
    return this.db.transaction(async (tx) => {
      const [line] = await tx
        .delete(purchaseDocumentLines)
        .where(eq(purchaseDocumentLines.id, lineId))
        .returning({ documentId: purchaseDocumentLines.documentId });
      if (!line) throw new NotFoundException('La orden ya no está en ese documento');

      const [{ remaining }] = await tx
        .select({ remaining: sql<number>`count(*)::int` })
        .from(purchaseDocumentLines)
        .where(eq(purchaseDocumentLines.documentId, line.documentId));
      if (remaining === 0) {
        await tx.delete(purchaseDocuments).where(eq(purchaseDocuments.id, line.documentId));
      }
      return { deleted: true, documentDeleted: remaining === 0 };
    });
  }

  /** Documentos de las filas de la conciliación de un retailer, agrupados por clave de fila */
  async documentsByItem(retailerId: string, itemKeys: string[]): Promise<Map<string, RowDocument[]>> {
    const map = new Map<string, RowDocument[]>();
    if (itemKeys.length === 0) return map;
    const rows = await this.db
      .select({
        itemKey: purchaseDocumentLines.itemKey,
        lineId: purchaseDocumentLines.id,
        documentId: purchaseDocuments.id,
        documentNumber: purchaseDocuments.documentNumber,
        supplier: suppliers.name,
        amountNet: purchaseDocumentLines.amountNet,
      })
      .from(purchaseDocumentLines)
      .innerJoin(purchaseDocuments, eq(purchaseDocuments.id, purchaseDocumentLines.documentId))
      .innerJoin(suppliers, eq(suppliers.id, purchaseDocuments.supplierId))
      .where(
        and(eq(purchaseDocumentLines.retailerId, retailerId), inArray(purchaseDocumentLines.itemKey, itemKeys)),
      )
      .orderBy(asc(purchaseDocuments.createdAt));

    for (const r of rows) {
      const net = Number(r.amountNet);
      const list = map.get(r.itemKey) ?? [];
      list.push({
        lineId: r.lineId,
        documentId: r.documentId,
        documentNumber: r.documentNumber,
        supplier: r.supplier,
        amountNet: net,
        amountGross: Math.round(net * VAT_RATE),
      });
      map.set(r.itemKey, list);
    }
    return map;
  }
}