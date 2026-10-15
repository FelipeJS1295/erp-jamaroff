'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  FilePlus2,
  Gavel,
  HelpCircle,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import {
  api,
  type ReconciliationResult,
  type ReconciliationRow,
  type ReconciliationStatus,
  type RowDocument,
} from '@/lib/api';
import { AssignCostDialog } from '@/components/assign-cost-dialog';
import { PurchaseDocumentDialog } from '@/components/purchase-document-dialog';
import { useAuth } from '@/components/auth';
import { cn } from '@/lib/cn';

const STATUS: Record<
  ReconciliationStatus,
  { label: string; icon: ReactNode; badge: string; card: string }
> = {
  CONCILIADA: {
    label: 'Conciliadas',
    icon: <CheckCircle2 className="size-4" />,
    badge: 'bg-emerald-50 text-emerald-700',
    card: 'text-emerald-600',
  },
  CON_DIFERENCIA: {
    label: 'Con diferencia',
    icon: <AlertTriangle className="size-4" />,
    badge: 'bg-amber-50 text-amber-700',
    card: 'text-amber-600',
  },
  PENDIENTE: {
    label: 'Pendientes de pago',
    icon: <Clock className="size-4" />,
    badge: 'bg-slate-100 text-slate-700',
    card: 'text-slate-700',
  },
  SIN_VENTA: {
    label: 'Sin venta cargada',
    icon: <HelpCircle className="size-4" />,
    badge: 'bg-red-50 text-red-700',
    card: 'text-red-600',
  },
  CANCELADA: {
    label: 'Canceladas',
    icon: <Ban className="size-4" />,
    badge: 'bg-zinc-100 text-zinc-500 line-through decoration-zinc-400',
    card: 'text-zinc-500',
  },
  MULTA: {
    label: 'Multas sin OC',
    icon: <Gavel className="size-4" />,
    badge: 'bg-rose-50 text-rose-700',
    card: 'text-rose-600',
  },
};

const ORDER: ReconciliationStatus[] = [
  'CONCILIADA',
  'CON_DIFERENCIA',
  'PENDIENTE',
  'SIN_VENTA',
  'CANCELADA',
  'MULTA',
];

function clp(n: number | null) {
  if (n === null) return '—';
  const abs = `$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
  return n < 0 ? `-${abs}` : abs;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}

export default function ConciliacionPage() {
  // useSearchParams necesita Suspense en Next.js
  return (
    <Suspense>
      <Conciliacion />
    </Suspense>
  );
}

function Conciliacion() {
  const params = useSearchParams();
  const retailers = useQuery({
    queryKey: ['settlement-retailers'],
    queryFn: api.settlementRetailers,
  });

  const [retailerCode, setRetailerCode] = useState(params.get('retailer') ?? '');
  const [filter, setFilter] = useState<ReconciliationStatus | null>(null);
  const [assigning, setAssigning] = useState<ReconciliationRow | null>(null);
  const { canEdit } = useAuth();
  // Órdenes seleccionadas para agregarles un documento de compra (por su clave itemId)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addingDocument, setAddingDocument] = useState(false);

  useEffect(() => {
    if (!retailerCode && retailers.data?.length) setRetailerCode(retailers.data[0].code);
  }, [retailers.data, retailerCode]);

  const rec = useQuery({
    queryKey: ['reconciliation', retailerCode],
    queryFn: () => api.reconcile(retailerCode),
    enabled: !!retailerCode,
  });

  const rows = rec.data?.rows.filter((r) => !filter || r.status === filter) ?? [];
  // Se pueden seleccionar las órdenes (no las multas ni los movimientos sin OC)
  const selectableRows = rows.filter(isSelectable);
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.itemId!));
  const selectedRows = rec.data?.rows.filter((r) => isSelectable(r) && selected.has(r.itemId!)) ?? [];

  const toggle = (itemId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectableRows.map((r) => r.itemId!)));

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conciliación</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cruce de las ventas cargadas contra lo que informa el retailer en su liquidación.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={retailerCode}
            onChange={(e) => {
              setRetailerCode(e.target.value);
              setFilter(null);
              setSelected(new Set());
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm"
          >
            {retailers.data?.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => rec.refetch()}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={cn('size-4', rec.isFetching && 'animate-spin')} />
            Actualizar
          </button>
        </div>
      </header>

      {rec.isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" /> Cruzando ventas y liquidaciones…
        </div>
      )}

      {rec.isError && (
        <p className="py-16 text-center text-sm text-red-600">{rec.error.message}</p>
      )}

      {rec.data && (
        <>
          {/* Resumen por estado (clic = filtrar) */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {ORDER.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setFilter(filter === s ? null : s);
                  setSelected(new Set());
                }}
                className={cn(
                  'rounded-lg border bg-white p-4 text-left transition-colors',
                  filter === s ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-200 hover:border-slate-300',
                )}
              >
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={STATUS[s].card}>{STATUS[s].icon}</span>
                  {STATUS[s].label}
                </p>
                <p className={cn('mt-1 text-2xl font-semibold tabular-nums', STATUS[s].card)}>
                  {rec.data.summary[s]}
                </p>
              </button>
            ))}
          </section>

          {/* Totales en dinero */}
          <section className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-5">
            <Total label="Precio de venta" value={rec.data.totals.salePrice} />
            <Total label="Pagado por productos" value={rec.data.totals.productPaid} />
            <Total label="Comisiones" value={rec.data.totals.commission} />
            <Total label="Otros cargos" value={rec.data.totals.otherCharges} />
            <Total label="Neto a recibir" value={rec.data.totals.net} strong />
          </section>
          {/* Resultado: lo que pagó el retailer vs lo que deberíamos recibir */}
          <ResultSummary data={rec.data} />

          <p className="mt-2 text-xs text-slate-400">
            Comisión pactada:{' '}
            {rec.data.contractCommissionPct !== null
              ? `${rec.data.contractCommissionPct}%`
              : 'no definida en la maestra de retailers (solo se valida que el monto cobrado corresponda a su %)'}
          </p>

          {/* Barra de acciones de las órdenes seleccionadas */}
          {canEdit && selectedRows.length > 0 && (
            <div className="sticky top-0 z-10 mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-brand-100 bg-brand-50 px-4 py-2.5 text-sm shadow-sm">
              <span className="font-medium text-brand-700">
                {selectedRows.length} {selectedRows.length === 1 ? 'orden seleccionada' : 'órdenes seleccionadas'}
              </span>
              <button
                onClick={() => setAddingDocument(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                <FilePlus2 className="size-4" /> Agregar documento
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-sm text-slate-600 hover:text-slate-900 hover:underline"
              >
                Quitar selección
              </button>
            </div>
          )}

          {/* Detalle */}
          <section
            className={cn(
              'overflow-hidden rounded-lg border border-slate-200 bg-white',
              canEdit && selectedRows.length > 0 ? 'mt-3' : 'mt-6',
            )}
          >
            {rows.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-500">
                No hay registros{filter ? ' con este estado' : ''}.{' '}
                {!filter && (
                  <Link href="/conciliacion/cargas" className="font-medium text-brand-600 hover:underline">
                    Cargar una liquidación
                  </Link>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                      {canEdit && (
                        <th className="w-8 py-2.5 pr-1 pl-3">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleAll}
                            disabled={selectableRows.length === 0}
                            title="Seleccionar todas las órdenes"
                            className="size-4 rounded border-slate-300 accent-brand-600"
                          />
                        </th>
                      )}
                      <th className="px-3 py-2.5 font-medium">Estado</th>
                      <th className="px-3 py-2.5 font-medium">N° orden</th>
                      <th className="px-3 py-2.5 font-medium">Fecha</th>
                      <th className="px-3 py-2.5 font-medium">Producto</th>
                      <th className="px-3 py-2.5 text-right font-medium">Precio venta</th>
                      <th className="px-3 py-2.5 text-right font-medium">Pago producto</th>
                      <th className="px-3 py-2.5 text-right font-medium">Comisión</th>
                      <th className="px-3 py-2.5 text-right font-medium">Otros cargos</th>
                      <th className="px-3 py-2.5 text-right font-medium">Neto</th>
                      <th
                        className="border-l border-slate-200 px-3 py-2.5 text-right font-medium"
                        title="A recibir del producto master: costo × (1 + utilidad + devoluciones), sin IVA"
                      >
                        Debíamos recibir
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium" title="Neto − Debíamos recibir">
                        Total
                      </th>
                      <th className="border-l border-slate-200 px-3 py-2.5 font-medium" title="Facturas del proveedor">
                        Documento
                      </th>
                      <th className="px-3 py-2.5 font-medium">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <Row
                        key={`${r.itemId}-${r.orderNumber}`}
                        r={r}
                        onAssign={() => setAssigning(r)}
                        selectable={canEdit}
                        checked={isSelectable(r) && selected.has(r.itemId!)}
                        onToggle={() => toggle(r.itemId!)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {addingDocument && rec.data && (
        <PurchaseDocumentDialog
          retailerCode={retailerCode}
          rows={selectedRows}
          onClose={() => setAddingDocument(false)}
          onSaved={() => {
            setAddingDocument(false);
            setSelected(new Set());
          }}
        />
      )}

      {assigning && rec.data && (
        <AssignCostDialog
          retailerCode={rec.data.retailerCode}
          row={assigning}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  );
}

/** Nombre del estado en singular, para la columna Estado */
const SINGULAR: Record<ReconciliationStatus, string> = {
  CONCILIADA: 'Conciliada',
  CON_DIFERENCIA: 'Con diferencia',
  PENDIENTE: 'Pendiente',
  SIN_VENTA: 'Sin venta',
  CANCELADA: 'Cancelada',
  MULTA: 'Multa',
};

/** Órdenes a las que se les puede agregar un documento de compra */
function isSelectable(r: ReconciliationRow) {
  return r.itemId !== null && r.status !== 'MULTA';
}

/** Estados en los que tiene sentido asignar costo (hay una venta con producto) */
const CAN_ASSIGN: ReconciliationStatus[] = ['CONCILIADA', 'CON_DIFERENCIA', 'PENDIENTE'];

function Row(props: {
  r: ReconciliationRow;
  onAssign: () => void;
  selectable: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const { r, onAssign, selectable, checked, onToggle } = props;
  const st = STATUS[r.status];
  const { canEdit } = useAuth();
  const missing = r.missingProducts.length > 0 && CAN_ASSIGN.includes(r.status);
  const canAssign = missing && canEdit;
  return (
    <tr
      className={cn(
        'align-top hover:bg-slate-50',
        r.status === 'CANCELADA' && 'text-slate-400',
        checked && 'bg-brand-50/60 hover:bg-brand-50',
      )}
    >
      {selectable && (
        <td className="py-2.5 pr-1 pl-3">
          {isSelectable(r) && (
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggle}
              aria-label={`Seleccionar orden ${r.orderLabel ?? r.orderNumber ?? r.itemId}`}
              className="size-4 rounded border-slate-300 accent-brand-600"
            />
          )}
        </td>
      )}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', st.badge)}>
          {st.icon}
          {SINGULAR[r.status]}
        </span>
      </td>
      <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{r.orderLabel ?? r.orderNumber ?? '—'}</td>
      <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatDate(r.orderDate)}</td>
      <td className="max-w-56 px-3 py-2.5 text-slate-700">{r.productName ?? '—'}</td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{clp(r.salePrice)}</td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{clp(r.productPaid)}</td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
        {clp(r.commission)}
        {r.commissionPct !== null && (
          <span className="block text-xs text-slate-400">{r.commissionPct}%</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{clp(r.otherCharges)}</td>
      <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap tabular-nums">{clp(r.net)}</td>
      <td className="border-l border-slate-100 px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
        {canAssign ? (
          <button
            onClick={onAssign}
            title="Este producto no tiene costo: asígnale un producto master"
            className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            Sin costo · Asignar
          </button>
        ) : missing || (r.expected === null && r.net !== null && r.status !== 'PENDIENTE') ? (
          <span className="text-xs text-amber-600">{r.status === 'SIN_VENTA' ? 'Sin venta' : 'Sin costo'}</span>
        ) : (
          clp(r.expected)
        )}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <ResultValue value={r.result} />
      </td>
      <td className="border-l border-slate-100 px-3 py-2.5">
        <Documents documents={r.documents} canEdit={canEdit} />
      </td>
      <td className="px-3 py-2.5 text-xs text-slate-600">
        {r.reasons.length > 0 ? r.reasons.join(' · ') : <span className="text-slate-400">—</span>}
        {r.statementNumber && (
          <span className="mt-0.5 block text-slate-400">Estado de cuenta: {r.statementNumber}</span>
        )}
      </td>
    </tr>
  );
}

/**
 * Documentos de compra de la orden: N° de documento, monto sin IVA y con IVA.
 * Al pasar el cursor sobre el documento se ve el proveedor.
 */
function Documents({ documents, canEdit }: { documents: RowDocument[]; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (lineId: string) => api.deletePurchaseLine(lineId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reconciliation'] }),
    onError: (err: Error) => alert(err.message),
  });

  if (documents.length === 0) return <span className="text-slate-300">—</span>;
  return (
    <ul className="space-y-1.5">
      {documents.map((d) => (
        <li key={d.lineId} className="group/doc relative whitespace-nowrap">
          <span className="inline-flex cursor-default items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-700">
            N° {d.documentNumber}
            {canEdit && (
              <button
                onClick={() => {
                  if (confirm(`¿Quitar esta orden del documento N° ${d.documentNumber} de ${d.supplier}?`)) {
                    remove.mutate(d.lineId);
                  }
                }}
                disabled={remove.isPending}
                title="Quitar el documento de esta orden"
                className="hidden rounded text-slate-400 group-hover/doc:inline-block hover:text-red-600"
              >
                <X className="size-3" />
              </button>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-slate-500 tabular-nums">
            {clp(d.amountNet)} <span className="text-slate-400">s/IVA</span> · {clp(d.amountGross)}{' '}
            <span className="text-slate-400">c/IVA</span>
          </span>
          {/* Proveedor, al pasar el cursor */}
          <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover/doc:block">
            Proveedor: <strong>{d.supplier}</strong>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Ganancia (verde, con +) o pérdida (rojo, con −) */
function ResultValue({ value, large }: { value: number | null; large?: boolean }) {
  if (value === null) return <span className="text-slate-300">—</span>;
  const rounded = Math.round(value);
  return (
    <span
      className={cn(
        'font-semibold tabular-nums',
        large ? 'text-lg' : 'text-sm',
        rounded > 0 && 'text-emerald-600',
        rounded < 0 && 'text-red-600',
        rounded === 0 && 'text-slate-500',
      )}
    >
      {rounded > 0 ? '+' : ''}
      {clp(rounded)}
    </span>
  );
}

function ResultSummary({ data }: { data: ReconciliationResult }) {
  const { resultNet, expected, result } = data.totals;
  const notes: string[] = [];
  if (data.rowsWithoutCost > 0) {
    notes.push(
      `${data.rowsWithoutCost} ${data.rowsWithoutCost === 1 ? 'venta pagada no tiene' : 'ventas pagadas no tienen'} costo (falta asignar el producto master en Catálogo retail o el costo en Productos)`,
    );
  }
  if (data.rowsWithoutSale > 0) {
    notes.push(
      `${data.rowsWithoutSale} ${data.rowsWithoutSale === 1 ? 'pago' : 'pagos'} de productos sin venta cargada`,
    );
  }
  return (
    <section className="mt-3 rounded-lg border border-slate-200 bg-white">
      <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-4 py-3">
          <p className="text-xs text-slate-500">Neto (pagado por el retailer)</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{clp(resultNet)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-slate-500">Debíamos recibir</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{clp(expected)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-slate-500">Total ({result < 0 ? 'pérdida' : 'ganancia'})</p>
          <p className="mt-0.5">
            <ResultValue value={result} large />
          </p>
        </div>
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        Total = Neto − Debíamos recibir. Debíamos recibir = &quot;A recibir&quot; de Productos (sin
        IVA). Solo ventas pagadas con costo, más multas y cobros sin venta (que son pérdida); las
        pendientes de pago aún no cuentan.
        {notes.length > 0 && <span className="text-amber-600"> No incluye: {notes.join(' · ')}.</span>}
      </p>
    </section>
  );
}

function Total({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-0.5 tabular-nums',
          strong ? 'text-lg font-semibold' : 'text-sm font-medium',
          value < 0 && 'text-red-600',
        )}
      >
        {clp(value)}
      </p>
    </div>
  );
}