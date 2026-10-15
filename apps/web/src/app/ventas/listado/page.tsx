'use client';

import { useQuery } from '@tanstack/react-query';
import { Eye, Loader2, Pencil, Plus, RefreshCw, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth';
import { CustomerDataDialog } from '@/components/customer-data-dialog';
import { ReceiptDialog } from '@/components/receipt-dialog';
import { api, type SaleRow } from '@/lib/api';
import { cn } from '@/lib/cn';

/** "2026-10-05" -> "05/10/2026" (sin pasar por Date, para no correr el día por zona horaria) */
function formatDate(value: string | null) {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function clp(n: number | null) {
  if (n === null) return '—';
  const abs = `$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
  return n < 0 ? `-${abs}` : abs;
}

type Filter = 'all' | 'done' | 'noSettlement' | 'noInvoice' | 'noReceipt';

const FILTERS: { id: Filter; label: string; match: (s: SaleRow) => boolean }[] = [
  { id: 'all', label: 'Todas', match: () => true },
  { id: 'done', label: 'Con resultado', match: (s) => s.total !== null },
  { id: 'noSettlement', label: 'Falta liquidación', match: (s) => !s.cancelled && s.settlementNet === null },
  { id: 'noInvoice', label: 'Falta factura', match: (s) => !s.cancelled && s.supplierGross === null },
  { id: 'noReceipt', label: 'Falta boleta', match: (s) => !s.cancelled && s.receipt === null },
];

export default function VerVentasPage() {
  const sales = useQuery({ queryKey: ['sales'], queryFn: api.listSales });
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  // Orden a la que se le está agregando/editando la boleta
  const [receiptFor, setReceiptFor] = useState<SaleRow | null>(null);

    // Orden de la que se están viendo los datos del cliente
  const [customerFor, setCustomerFor] = useState<SaleRow | null>(null);

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    const q = search.trim().toLowerCase();
    return (sales.data ?? []).filter(
      (s) =>
        f.match(s) &&
        (!q ||
          s.orderNumber?.toLowerCase().includes(q) ||
          s.orderLabel?.toLowerCase().includes(q) ||
          s.productName?.toLowerCase().includes(q) ||
          s.retailer.toLowerCase().includes(q)),
    );
  }, [sales.data, filter, search]);

  // Totales de las órdenes que ya tienen resultado (liquidación + factura)
  const summary = useMemo(() => {
    const done = rows.filter((s) => s.total !== null);
    const sum = (k: 'salePrice' | 'settlementNet' | 'supplierGross' | 'vat' | 'total') =>
      done.reduce((n, s) => n + (s[k] ?? 0), 0);
    return {
      count: done.length,
      salePrice: sum('salePrice'),
      settlementNet: sum('settlementNet'),
      supplierGross: sum('supplierGross'),
      vat: sum('vat'),
      total: sum('total'),
    };
  }, [rows]);

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cada orden con lo que se vendió, lo que pagó el retailer, lo que hay que pagarle al
            proveedor y lo que queda.
          </p>
        </div>
        <button
          onClick={() => sales.refetch()}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className={cn('size-4', sales.isFetching && 'animate-spin')} />
          Actualizar
        </button>
      </header>

      {sales.data && sales.data.length > 0 && (
        <>
          {/* Resumen de las órdenes con resultado */}
          <section className="mb-4 rounded-lg border border-slate-200 bg-white">
            <div className="grid grid-cols-2 divide-slate-100 sm:grid-cols-5 sm:divide-x">
              <Stat label="Venta" value={summary.salePrice} />
              <Stat label="Liquidación" value={summary.settlementNet} />
              <Stat label="Proveedor (con IVA)" value={summary.supplierGross} />
              <Stat label="IVA a pagar" value={summary.vat} />
              <Stat
                label={`Total${summary.salePrice ? ` · ${((summary.total / summary.salePrice) * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%` : ''}`}
                value={summary.total}
                signed
              />
            </div>
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              Suma de {summary.count === 1 ? 'la orden' : `las ${summary.count.toLocaleString('es-CL')} órdenes`} con
              resultado (que ya tienen liquidación y factura del proveedor). Total = Liquidación − Proveedor − IVA. IVA = IVA
              de la boleta (o del precio, si aún no hay boleta) − IVA de la compra − IVA de la comisión − IVA de los
              cargos de envío.
            </p>
          </section>

          {/* Filtros */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'rounded px-3 py-1.5 text-sm transition-colors',
                    filter === f.id ? 'bg-brand-500 font-medium text-white' : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  {f.label}
                  <span className={cn('ml-1.5 text-xs', filter === f.id ? 'text-white/80' : 'text-slate-400')}>
                    {sales.data.filter(f.match).length}
                  </span>
                </button>
              ))}
            </div>
            <label className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar orden o producto"
                className="w-64 rounded-md border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
              />
            </label>
          </div>
        </>
      )}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {sales.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" /> Cargando ventas…
          </div>
        ) : sales.isError ? (
          <p className="py-16 text-center text-sm text-red-600">
            No se pudieron obtener las ventas: {sales.error.message}
          </p>
        ) : sales.data?.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            Aún no hay ventas.{' '}
            <Link href="/ventas/cargas" className="font-medium text-brand-600 hover:underline">
              Carga un archivo
            </Link>{' '}
            para empezar.
          </div>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">No hay ventas con este filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-3 py-2.5 font-medium">Retailer</th>
                  <th className="px-3 py-2.5 font-medium">N° orden</th>
                  <th className="px-3 py-2.5 font-medium">Fecha</th>
                  <th className="px-3 py-2.5 font-medium">Producto</th>
                  <th className="px-3 py-2.5 font-medium">Estado</th>
                  <th className="border-l border-slate-200 px-3 py-2.5 text-right font-medium" title="Lo que pagó el cliente, con IVA">
                    Venta
                  </th>
                  <th className="px-3 py-2.5 font-medium" title="Boleta al cliente final: producto + envío, con IVA">
                    Boleta
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium" title="Neto que pagó el retailer en la liquidación">
                    Liquidación
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium" title="Factura del proveedor, con IVA">
                    Proveedor
                  </th>
                  <th
                    className="px-3 py-2.5 text-right font-medium"
                    title="IVA de la boleta − IVA de la compra − IVA de la comisión − IVA del envío"
                  >
                    IVA
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium" title="Liquidación − Proveedor − IVA">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((s) => (
                  <SaleLine
                    key={s.key}
                    s={s}
                    onReceipt={() => setReceiptFor(s)}
                    onCustomer={() => setCustomerFor(s)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {receiptFor && <ReceiptDialog sale={receiptFor} onClose={() => setReceiptFor(null)} />}
      {customerFor && <CustomerDataDialog sale={customerFor} onClose={() => setCustomerFor(null)} />}

      {sales.data && sales.data.length >= 500 && (
        <p className="mt-2 text-xs text-slate-400">Se muestran las 500 órdenes más recientes.</p>
      )}
    </div>
  );
}

function SaleLine(props: { s: SaleRow; onReceipt: () => void; onCustomer: () => void }) {
  const { s, onReceipt, onCustomer } = props;
  const { canEdit } = useAuth();
  const muted = <span className="text-slate-300">—</span>;
  return (
    <tr className={cn('align-top hover:bg-slate-50', s.cancelled && 'text-slate-400')}>
      <td className="px-3 py-2.5 font-medium whitespace-nowrap">{s.retailer}</td>
      <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{s.orderLabel ?? s.orderNumber ?? '—'}</td>
      <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
        {formatDate(s.orderDate)}
        {s.dispatchDeadline && (
          <span className="block text-xs text-slate-400">límite {formatDate(s.dispatchDeadline)}</span>
        )}
      </td>
      <td className="max-w-64 px-3 py-2.5 text-slate-700">{s.productName ?? '—'}</td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {s.status ? (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs',
              s.cancelled ? 'bg-zinc-100 text-zinc-500 line-through' : 'bg-slate-100 text-slate-700',
            )}
          >
            {s.status}
          </span>
        ) : (
          '—'
        )}
      </td>

      {/* Montos */}
      <td className="border-l border-slate-100 px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
        {s.cancelled ? muted : clp(s.salePrice)}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="flex items-start gap-1.5">
          {s.receipt && (
            <button
              onClick={canEdit ? onReceipt : undefined}
              disabled={!canEdit}
              title={canEdit ? 'Editar boleta' : undefined}
              className="group/receipt mr-1 text-left disabled:cursor-default"
            >
              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-700">
                N° {s.receipt.number}
                {canEdit && <Pencil className="hidden size-3 text-slate-400 group-hover/receipt:inline" />}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500 tabular-nums">{clp(s.receipt.totalGross)}</span>
            </button>
          )}
          {!s.cancelled && s.orderNumber && (
            <>
              <IconButton title="Ver datos del cliente para la boleta o factura" onClick={onCustomer}>
                <Eye className="size-4" />
              </IconButton>
              {canEdit && !s.receipt && (
                <IconButton title="Agregar boleta" onClick={onReceipt}>
                  <Plus className="size-4" />
                </IconButton>
              )}
            </>
          )}
          {(s.cancelled || !s.orderNumber) && !s.receipt && muted}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
        {s.settlementNet !== null ? (
          <>
            {clp(s.settlementNet)}
            {s.commission !== null && s.commission !== 0 && (
              <span className="block text-xs text-slate-400">comisión {clp(s.commission)}</span>
            )}
          </>
        ) : s.cancelled ? (
          muted
        ) : (
          <span className="text-xs text-slate-400">Pendiente</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
        {s.supplierGross !== null ? (
          <>
            {clp(s.supplierGross)}
            <span className="block text-xs text-slate-400">neto {clp(s.supplierNet)}</span>
          </>
        ) : s.cancelled ? (
          muted
        ) : (
          <Link
            href="/conciliacion"
            className="text-xs text-amber-600 hover:underline"
            title="Agrega la factura del proveedor desde Conciliación"
          >
            Falta factura
          </Link>
        )}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
        {s.vat !== null ? (
          <span
            className="cursor-help border-b border-dotted border-slate-300"
            title={[
              `IVA venta${s.receipt ? ' (boleta)' : ' (precio, sin boleta)'}: ${clp(s.vatSale)}`,
              `− IVA compra: ${clp(s.vatPurchase)}`,
              `− IVA comisión: ${clp(s.vatCommission)}`,
              `− IVA envío: ${clp(s.vatShipping)}`,
              `= IVA a pagar: ${clp(s.vat)}`,
            ].join('\n')}
          >
            {clp(s.vat)}
          </span>
        ) : (
          muted
        )}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
        {s.total !== null ? (
          <>
            <span
              className={cn(
                'font-semibold',
                s.total > 0 && 'text-emerald-600',
                s.total < 0 && 'text-red-600',
              )}
            >
              {s.total > 0 ? '+' : ''}
              {clp(s.total)}
            </span>
            {s.marginPct !== null && (
              <span className="block text-xs text-slate-400">
                {s.marginPct.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%
              </span>
            )}
          </>
        ) : (
          muted
        )}
      </td>
    </tr>
  );
}

function IconButton(props: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      title={props.title}
      aria-label={props.title}
      className="grid size-7 place-items-center rounded-md border border-slate-200 text-slate-500 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-600"
    >
      {props.children}
    </button>
  );
}

function Stat({ label, value, signed }: { label: string; value: number; signed?: boolean }) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-lg font-semibold tabular-nums',
          signed && value > 0 && 'text-emerald-600',
          signed && value < 0 && 'text-red-600',
        )}
      >
        {signed && value > 0 ? '+' : ''}
        {clp(value)}
      </p>
    </div>
  );
}