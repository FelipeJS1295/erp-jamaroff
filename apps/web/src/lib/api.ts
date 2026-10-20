import { healthResponseSchema, type HealthResponse } from '@erp/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100/api';

export type ReceiptStatus = 'REGISTRADA' | 'EMITIENDO' | 'EMITIDA' | 'REVISAR';

/** ¿Está configurada la emisión de boletas en el SII (API Gateway)? */
export interface SiiStatus {
  enabled: boolean;
  emisorRut: string | null;
  missing: string[];
}

/** Lo que se va a emitir para una orden */
export interface BoletaPreview {
  retailerCode: string;
  orderNumber: string;
  wantsInvoice: boolean;
  item: string;
  total: number;
  productTotal: number;
  shippingTotal: number;
  receptorRut: string;
  receptorName: string;
  receptorAddress: string | null;
  receptorCommune: string | null;
  genericReceptor: boolean;
  existing: { id: string; number: string; status: string } | null;
  /** Fecha de la orden (AAAA-MM-DD) */
  orderDate: string | null;
  /** Fecha con que se emite la boleta (la de la orden) */
  issueDate: string;
}

export interface BoletaEmitida {
  ok: true;
  id: string;
  folio: number;
  total: number;
  orderNumber: string;
  /** Fecha de la boleta (AAAA-MM-DD) */
  issuedAt: string;
}

export interface BoletasLote {
  emitted: number;
  failed: number;
  results: (BoletaEmitida | { ok: false; orderNumber: string; error: string })[];
}

export interface ImportRetailer {
  code: string;
  name: string;
}

export interface ImportResult {
  retailer: string;
  fileName: string;
  totalRows: number;
  inserted: number;
  /** Filas omitidas porque su orden ya estaba en el sistema */
  skipped: number;
  skippedOrders: number;
  errors: { row: number; message: string }[];
}

/** Datos para emitir la boleta o factura de una orden en el SII */
export interface CustomerData {
  orderNumber: string;
  documentType: 'BOLETA' | 'FACTURA';
  customer: { name: string | null; rut: string | null; email: string | null };
  shipping: { name: string | null; address: string | null; commune: string | null; region: string | null };
  /** Solo si el cliente pidió factura */
  billing: { legalName: string | null; rut: string | null; activity: string | null; address: string | null } | null;
  lines: { productName: string | null; quantity: number; amountGross: number; amountNet: number }[];
  /** Con IVA */
  productTotal: number;
  shippingTotal: number;
  /** Producto + envío, con IVA */
  total: number;
  totalNet: number;
  totalVat: number;
}

/**
 * Una venta (orden) con su resultado:
 *   Total = Liquidación − Proveedor (con IVA) − IVA
 *   IVA   = IVA de la venta (boleta) − IVA de la compra − IVA de la comisión − IVA del envío
 */
export interface SaleRow {
  key: string;
  /** Código del retailer (para guardar la boleta) */
  retailerCode: string;
  retailer: string;
  orderNumber: string | null;
  /** N° de orden para mostrar (Walmart: el del cliente, no la PO "P…") */
  orderLabel: string | null;
  /** AAAA-MM-DD */
  orderDate: string | null;
  dispatchDeadline: string | null;
  productName: string | null;
  /** Estado de la orden tal como lo informa el retailer */
  status: string | null;
  cancelled: boolean;
  /** Lo que pagó el cliente por el producto (con IVA) */
  salePrice: number | null;
  /** Boleta al cliente final (producto + envío, con IVA) */
  receipt: {
    id: string;
    number: string;
    totalGross: number;
    /** REGISTRADA (a mano) · EMITIENDO · EMITIDA (en el SII desde el sistema) · REVISAR */
    status: ReceiptStatus;
    /** Fecha de emisión en el SII (AAAA-MM-DD); null si se anotó a mano */
    issuedAt: string | null;
  } | null;
  /** Neto pagado por el retailer en la liquidación. null = aún no paga */
  settlementNet: number | null;
  /** Comisión cobrada (negativa, con IVA) */
  commission: number | null;
  /** Cargos de envío y logística (negativos, con IVA) */
  shippingCharges: number | null;
  /** Factura del proveedor con IVA / sin IVA. null = sin factura */
  supplierGross: number | null;
  supplierNet: number | null;
  vatSale: number | null;
  vatPurchase: number;
  vatCommission: number;
  vatShipping: number;
  /** IVA a pagar */
  vat: number | null;
  /** null hasta tener liquidación y factura */
  total: number | null;
  /** Total / precio de venta (%) */
  marginPct: number | null;
}

export interface SettlementImportResult {
  retailer: string;
  fileName: string;
  totalRows: number;
  /** Movimientos nuevos */
  inserted: number;
  /** Movimientos que ya existían (se actualizó su estado de pago) */
  updated: number;
  errors: { row: number; message: string }[];
}

export type ReconciliationStatus =
  | 'CONCILIADA'
  | 'CON_DIFERENCIA'
  | 'PENDIENTE'
  | 'SIN_VENTA'
  | 'CANCELADA'
  | 'MULTA';

export interface ReconciliationRow {
  status: ReconciliationStatus;
  reasons: string[];
  orderNumber: string | null;
  /** N° de orden para mostrar (Walmart: el del cliente, no la PO "P…") */
  orderLabel: string | null;
  itemId: string | null;
  orderDate: string | null;
  productName: string | null;
  sellerSku: string | null;
  salePrice: number | null;
  productPaid: number | null;
  commission: number | null;
  commissionPct: number | null;
  otherCharges: number | null;
  net: number | null;
  paymentStatus: string | null;
  statementNumber: string | null;
  /** "A recibir" de Productos (sin IVA), según el costo del producto master. null = sin costo */
  expectedNet: number | null;
  /** Debíamos recibir = "A recibir" de Productos, sin IVA */
  expected: number | null;
  /** Total = Neto − Debíamos recibir (positivo = ganancia, negativo = pérdida) */
  result: number | null;
  /** Productos de la venta sin costo. masterId/masterSku = tiene master, pero sin costo */
  missingProducts: MissingCostProduct[];
  /** Documentos de compra (facturas del proveedor) agregados a esta orden */
  documents: RowDocument[];
}

/** Documento de compra ligado a una orden de la conciliación */
export interface RowDocument {
  lineId: string;
  documentId: string;
  documentNumber: string;
  supplier: string;
  /** Sin IVA */
  amountNet: number;
  /** Con IVA */
  amountGross: number;
}

/** Factura del proveedor con sus totales y lo pagado */
export interface PurchaseInvoice {
  id: string;
  supplierId: string;
  supplier: string;
  documentNumber: string;
  /** Clientes (retailers) de las órdenes de la factura. Ej: ["Falabella"] */
  clients: string[];
  /** Fecha en que se ingresó (AAAA-MM-DD) */
  createdAt: string;
  orders: number;
  net: number;
  vat: number;
  /** Total con IVA */
  total: number;
  paid: number;
  /** Lo que falta pagar */
  balance: number;
  status: 'PENDIENTE' | 'PARCIAL' | 'PAGADA';
  lastPaymentAt: string | null;
}

export interface PurchaseInvoiceDetail extends PurchaseInvoice {
  lines: { id: string; retailer: string; orderNumber: string | null; productName: string | null; net: number; total: number }[];
  payments: {
    id: string;
    amount: number;
    paidAt: string;
    method: string | null;
    note: string | null;
    createdBy: string | null;
  }[];
}
export interface Supplier {
  id: string;
  name: string;
}

export interface NewPurchaseDocument {
  supplier: string;
  documentNumber: string;
  /** Opción de conciliación elegida (ej: CENCOSUD, CENCOSUD_FULFILLMENT) */
  retailerCode: string;
  lines: { itemKey: string; orderNumber: string | null; productName: string | null; amountNet: string }[];
}

export interface MissingCostProduct {
  sellerSku: string | null;
  name: string | null;
  masterId: string | null;
  masterSku: string | null;
}

export interface ReconciliationResult {
  retailer: string;
  /** Código del retailer en la base (ej: CENCOSUD, también para la opción fulfillment) */
  retailerCode: string;
  contractCommissionPct: number | null;
  summary: Record<ReconciliationStatus, number>;
    totals: {
    salePrice: number;
    productPaid: number;
    commission: number;
    otherCharges: number;
    net: number;
    /** Neto, Debíamos recibir y Total de las filas que tienen total */
    resultNet: number;
    expected: number;
    result: number;
  };
  /** Ventas pagadas cuyo producto no tiene master/costo */
  rowsWithoutCost: number;
  /** Pagos de productos sin venta cargada */
  rowsWithoutSale: number;
  rows: ReconciliationRow[];
}

/** Comisión, logística y precio sugerido de un producto en un retailer */
export interface ProductChannel {
  commissionPct: string | null;
  logisticsCost: string | null;
  /** Precio a publicar, redondeado a ...990 (null si falta la comisión) */
  suggestedPrice: number | null;
  /** Neto que queda al publicar a ese precio */
  netAtPrice: number | null;
}

/** Producto MASTER (genérico, ej: "Seccional Richter") */
export interface Product {
  id: string;
  skuMaster: string;
  name: string;
  /** Costo momentáneo neto, como texto exacto: "185000.00" */
  provisionalCost: string;
  /** % utilidad y % devoluciones sobre el costo: "20.00" */
  profitPct: string;
  returnsPct: string;
  /** Neto que debemos recibir por unidad */
  targetNet: number;
  /** Por código de retailer: CENCOSUD, WALMART, FALABELLA, HITES */
  channels: Record<string, ProductChannel>;
}

/** Insumo (tela, espuma, patas...) */
export interface Supply {
  id: string;
  sku: string;
  name: string;
  /** Costo neto por unidad, como texto exacto: "4500.00" */
  netCost: string;
}

export interface ProductInput {
  skuMaster: string;
  name: string;
  provisionalCost: string;
  profitPct?: string;
  returnsPct?: string;
  channels?: Record<string, { commissionPct: string | null; logisticsCost: string | null }>;
}
export type SupplyInput = { sku: string; name: string; netCost: string };

/** Retailer con catálogo cargable, con conteos */
export interface CatalogRetailer {
  code: string;
  name: string;
  total: number;
  /** Productos sin master asignado */
  unassigned: number;
}

/** Producto del catálogo de un retailer, con su master (si tiene) */
export interface CatalogRow {
  id: string;
  retailerSku: string;
  sellerSku: string | null;
  name: string;
  listPrice: string | null;
  offerPrice: string | null;
  offerFrom: string | null;
  offerTo: string | null;
  status: string | null;
  stock: number | null;
  imageUrl: string | null;
  productId: string | null;
  productSku: string | null;
  productName: string | null;
}

export interface CatalogImportResult {
  retailer: string;
  fileName: string;
  totalRows: number;
  inserted: number;
  updated: number;
  errors: { row: number; message: string }[];
  /** Productos del sistema que no vienen en el archivo */
  missing: CatalogRow[];
}

/** Un producto en el ranking de más vendidos */
/** Un producto (de un retailer) en el ranking de más vendidos */
export interface TopProduct {
  key: string;
  retailerCode: string;
  /** Nombre a mostrar: Paris, Walmart, Falabella, Hites */
  retailerLabel: string;
  /** SKU del producto en el retailer (ej: Paris MK8400CF1K) */
  retailerSku: string | null;
  /** SKU del vendedor (ej: SECRICHFBNGCL) */
  sellerSku: string | null;
  name: string;
  /** false = la venta no se encontró en el catálogo del retailer */
  inCatalog: boolean;
  units: number;
  /** Venta bruta con IVA */
  revenue: number;
  orders: number;
}

export interface TopProductsReport {
  from: string | null;
  to: string | null;
  totals: { units: number; revenue: number; orders: number };
  /** Top 5 de todos los retailers juntos */
  overall: TopProduct[];
  retailers: { code: string; label: string; units: number; revenue: number; products: TopProduct[] }[];
}

/** Ventas de un período: todo con IVA, sin contar las canceladas */
export interface SalesKpis {
  revenue: number;
  units: number;
  orders: number;
  avgTicket: number;
  cancelledOrders: number;
}

/** Resultado de la conciliación de un retailer (acumulado) */
export interface DashboardConciliation {
  code: string;
  label: string;
  net: number;
  resultNet: number;
  expected: number;
  /** Total = Neto − Debíamos recibir (positivo = ganancia) */
  result: number;
  conciliated: number;
  withDifference: number;
  pendingCount: number;
  pendingAmount: number;
  penalties: number;
  rowsWithoutCost: number;
  rowsWithoutSale: number;
}

export interface Dashboard {
  from: string | null;
  to: string | null;
  previous: { from: string; to: string } | null;
  kpis: SalesKpis;
  previousKpis: SalesKpis | null;
  trend: { granularity: 'day' | 'month'; points: { date: string; revenue: number; units: number }[] };
  byRetailer: { code: string; label: string; revenue: number; units: number; orders: number; share: number }[];
  topProducts: TopProduct[];
  conciliation: { retailers: DashboardConciliation[]; totals: Omit<DashboardConciliation, 'code' | 'label'> };
  dispatch: {
    pending: number;
    overdue: number;
    dueToday: number;
    next: {
      retailerLabel: string;
      orderNumber: string | null;
      productName: string | null;
      status: string | null;
      deadline: string | null;
      daysLeft: number | null;
    }[];
  };
  alerts: { catalogWithoutMaster: number; mastersWithoutCost: number; salesWithoutCatalog: number };
}

export type UserRole = 'ADMIN' | 'OPERADOR' | 'LECTURA';

/** Usuario con sesión iniciada */
export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

/** Usuario en la administración de usuarios */
export interface AppUser extends SessionUser {
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Lanza un Error con el mensaje que devuelve la API (ej: "Faltan las columnas: ...") */
async function handle<T>(res: Response): Promise<T> {
    // Sesión vencida o sin iniciar: se manda al login (salvo que ya estemos ahí)
  if (res.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      /* respuesta sin JSON */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include', // envía la cookie de sesión
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  return handle<T>(res);
}

export const api = {
    /** Sesión */
  login: (username: string, password: string) =>
    request<SessionUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<SessionUser>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  /** Usuarios (solo admin) */
  listUsers: () => request<AppUser[]>('/users'),
  createUser: (data: { username: string; name: string; role: UserRole; password: string }) =>
    request<AppUser>('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: Partial<{ name: string; role: UserRole; isActive: boolean; password: string }>) =>
    request<AppUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request<{ deleted: boolean }>(`/users/${id}`, { method: 'DELETE' }),
  /** Valida la respuesta con el mismo schema Zod que usa el backend */
  health: async (): Promise<HealthResponse> =>
    healthResponseSchema.parse(await request<unknown>('/health')),

  /** Ventas cargadas (las más recientes primero) */
  listSales: () => request<SaleRow[]>('/sales'),

    /** Datos del cliente de una orden (para la boleta o factura del SII) */
  customerData: (retailerCode: string, orderNumber: string) =>
    request<CustomerData>(
      `/sales/customer?retailer=${encodeURIComponent(retailerCode)}&order=${encodeURIComponent(orderNumber)}`,
    ),

  /** Boleta al cliente final de una orden (si ya tiene, se reemplaza) */
  saveReceipt: (data: { retailerCode: string; orderNumber: string; receiptNumber: string; totalGross: string }) =>
    request<{ id: string }>('/sales/receipts', { method: 'POST', body: JSON.stringify(data) }),
  deleteReceipt: (id: string) => request<{ deleted: boolean }>(`/sales/receipts/${id}`, { method: 'DELETE' }),

  /** Boletas en el SII (API Gateway) */
  siiStatus: () => request<SiiStatus>('/sii/status'),
  boletaPreview: (retailerCode: string, orderNumber: string) =>
    request<BoletaPreview>(
      `/sii/boletas/preview?retailer=${encodeURIComponent(retailerCode)}&order=${encodeURIComponent(orderNumber)}`,
    ),
  emitBoleta: (retailerCode: string, orderNumber: string) =>
    request<BoletaEmitida>('/sii/boletas', { method: 'POST', body: JSON.stringify({ retailerCode, orderNumber }) }),
  emitBoletas: (orders: { retailerCode: string; orderNumber: string }[]) =>
    request<BoletasLote>('/sii/boletas/lote', { method: 'POST', body: JSON.stringify({ orders }) }),
  /** PDF de una boleta emitida (se abre en otra pestaña con la cookie de sesión) */
  /** Nombre del PDF (sin .pdf): Falabella "<N° orden>_<N° boleta>", resto "<N° orden>" */
  boletaFileName: (sale: SaleRow, receiptNumber?: string | number | null) => {
    const order = (sale.orderLabel ?? sale.orderNumber ?? 'orden').replace(/[^\w.-]+/g, '_');
    const number = receiptNumber ?? sale.receipt?.number;
    return sale.retailerCode.toUpperCase() === 'FALABELLA' && number ? `${order}_${number}` : order;
  },
  boletaPdfUrl: (receiptId: string, orderLabel?: string | null) =>
    `${API_URL}/sii/boletas/${receiptId}/pdf${orderLabel ? `/${encodeURIComponent(orderLabel.replace(/[^\w.-]+/g, '_'))}.pdf` : ''}`,

  /** Retailers cuyos archivos de ventas se pueden cargar */
  importRetailers: () => request<ImportRetailer[]>('/sales/import/retailers'),

  /** Sube un Excel de ventas. No se fija Content-Type: el navegador lo arma con FormData */
  importSales: async (retailerCode: string, file: File): Promise<ImportResult> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_URL}/sales/import/${retailerCode}`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    return handle<ImportResult>(res);
  },

    /** Retailers cuyos archivos de liquidación se pueden cargar */
  settlementRetailers: () => request<ImportRetailer[]>('/settlements/import/retailers'),

  /** Sube un Excel de liquidación / transacciones */
  importSettlement: async (retailerCode: string, file: File): Promise<SettlementImportResult> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_URL}/settlements/import/${retailerCode}`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    return handle<SettlementImportResult>(res);
  },

    /** Productos master */
  listProducts: () => request<Product[]>('/products'),
  createProduct: (data: ProductInput) =>
    request<Product>('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: string, data: Partial<ProductInput>) =>
    request<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProduct: (id: string) => request<{ deleted: boolean }>(`/products/${id}`, { method: 'DELETE' }),

  /** Insumos */
  listSupplies: () => request<Supply[]>('/supplies'),
  createSupply: (data: SupplyInput) =>
    request<Supply>('/supplies', { method: 'POST', body: JSON.stringify(data) }),
  updateSupply: (id: string, data: Partial<SupplyInput>) =>
    request<Supply>(`/supplies/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSupply: (id: string) => request<{ deleted: boolean }>(`/supplies/${id}`, { method: 'DELETE' }),

    /** Catálogo retail */
  catalogRetailers: () => request<CatalogRetailer[]>('/catalog/retailers'),
  listCatalog: (retailerCode: string) => request<CatalogRow[]>(`/catalog?retailer=${retailerCode}`),
  importCatalog: async (retailerCode: string, file: File): Promise<CatalogImportResult> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_URL}/catalog/import/${retailerCode}`, { method: 'POST', body: form });
    return handle<CatalogImportResult>(res);
  },
  /** Asigna un master a varios productos del catálogo (null = quitarlo) */
  assignMaster: (ids: string[], productId: string | null) =>
    request<{ updated: number }>('/catalog/assign', {
      method: 'POST',
      body: JSON.stringify({ ids, productId }),
    }),
    /** Desde la conciliación: une un producto (sin catálogo o sin master) a un master */
  manualCatalogAssign: (data: { retailerCode: string; sellerSku: string | null; name: string; productId: string }) =>
    request<{ created: boolean; updated: number }>('/catalog/manual', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteCatalogItems: (ids: string[]) =>
    request<{ deleted: number }>('/catalog/delete', { method: 'POST', body: JSON.stringify({ ids }) }),

    /** Reporte: productos más vendidos. Fechas AAAA-MM-DD opcionales */
  topProducts: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return request<TopProductsReport>(`/reports/top-products${qs ? `?${qs}` : ''}`);
  },


    /** Dashboard de Inicio. Fechas AAAA-MM-DD opcionales */
  dashboard: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return request<Dashboard>(`/reports/dashboard${qs ? `?${qs}` : ''}`);
  },

    /** Documentos de compra (facturas del proveedor) */
  suppliers: () => request<Supplier[]>('/purchases/suppliers'),
  createPurchaseDocument: (data: NewPurchaseDocument) =>
    request<{ documentId: string; supplier: string; documentNumber: string; lines: number }>(
      '/purchases/documents',
      { method: 'POST', body: JSON.stringify(data) },
    ),
    /** Facturas de proveedores y sus pagos */
  listInvoices: () => request<PurchaseInvoice[]>('/purchases/invoices'),
  getInvoice: (id: string) => request<PurchaseInvoiceDetail>(`/purchases/invoices/${id}`),
  addInvoicePayment: (id: string, data: { amount: string; paidAt: string; method: string | null; note: string | null }) =>
    request<{ id: string }>(`/purchases/invoices/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  deleteInvoicePayment: (paymentId: string) =>
    request<{ deleted: boolean }>(`/purchases/payments/${paymentId}`, { method: 'DELETE' }),
  deletePurchaseLine: (lineId: string) =>
    request<{ deleted: boolean; documentDeleted: boolean }>(`/purchases/lines/${lineId}`, { method: 'DELETE' }),

  /** Cruce de ventas vs liquidación de un retailer */
  reconcile: (retailerCode: string) =>
    request<ReconciliationResult>(`/reconciliation/${retailerCode}`),
};