import { index, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { retailers } from './retailers.js';
import { users } from './users.js';

/**
 * Proveedores: a quienes les compramos los productos que se venden en los retailers.
 * Se crean solos al guardar un documento con un nombre nuevo.
 */
export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Sin duplicados aunque cambien mayúsculas/minúsculas ("Muebles Sur" = "muebles sur")
  (t) => [uniqueIndex('suppliers_name_uq').on(sql`lower(${t.name})`)],
);

/**
 * Documentos de compra (facturas) del proveedor.
 * Un documento puede cubrir varias órdenes (una línea por orden).
 */
export const purchaseDocuments = pgTable(
  'purchase_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    /** N° del documento (factura) del proveedor */
    documentNumber: varchar('document_number', { length: 50 }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('purchase_documents_supplier_number_uq').on(t.supplierId, t.documentNumber)],
);

/**
 * Líneas del documento: qué orden de la conciliación cubre y por cuánto (neto, sin IVA).
 * La orden se identifica igual que en la conciliación: retailer + clave de la fila
 * (Item id, N° de orden u Orden id según el retailer).
 */
export const purchaseDocumentLines = pgTable(
  'purchase_document_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => purchaseDocuments.id, { onDelete: 'cascade' }),
    retailerId: uuid('retailer_id')
      .notNull()
      .references(() => retailers.id),
    /** Clave de la fila en la conciliación (itemId) */
    itemKey: varchar('item_key', { length: 80 }).notNull(),
    orderNumber: varchar('order_number', { length: 50 }),
    productName: text('product_name'),
    /** Monto neto (sin IVA) */
    amountNet: numeric('amount_net', { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('purchase_document_lines_uq').on(t.documentId, t.retailerId, t.itemKey),
    index('purchase_document_lines_item_idx').on(t.retailerId, t.itemKey),
  ],
);


/**
 * Boleta emitida al cliente final por una orden (producto + envío).
 * Una por orden; su IVA es el IVA débito de la venta.
 */
export const customerReceipts = pgTable(
  'customer_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    retailerId: uuid('retailer_id')
      .notNull()
      .references(() => retailers.id),
    orderNumber: varchar('order_number', { length: 50 }).notNull(),
    /** N° de la boleta */
    receiptNumber: varchar('receipt_number', { length: 50 }).notNull(),
    /** Total de la boleta, con IVA */
    totalGross: numeric('total_gross', { precision: 14, scale: 2 }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('customer_receipts_order_uq').on(t.retailerId, t.orderNumber)],
);

export type CustomerReceipt = typeof customerReceipts.$inferSelect;

export type Supplier = typeof suppliers.$inferSelect;
export type PurchaseDocument = typeof purchaseDocuments.$inferSelect;
export type PurchaseDocumentLine = typeof purchaseDocumentLines.$inferSelect;