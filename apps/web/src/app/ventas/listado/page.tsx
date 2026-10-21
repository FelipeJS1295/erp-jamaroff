'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Building2, Download, Eye, FileMinus, FileText, Loader2, Pencil, Plus, RefreshCw, Search, Send, Undo2, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth';
import { CreditNoteDialog } from '@/components/credit-note-dialog';
import { CustomerDataDialog } from '@/components/customer-data-dialog';
import { DownloadBoletasDialog } from '@/components/download-boletas-dialog';
import { EmitBoletaDialog, EmitBoletasDialog } from '@/components/emit-boleta-dialog';
import { FacturaDialog } from '@/components/factura-dialog';
import { MipymeSync } from '@/components/mipyme-sync';
import { ReceiptDialog } from '@/components/receipt-dialog';
import { ReturnDialog } from '@/components/return-dialog';
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

type Filter = 'all' | 'done' | 'noSettlement' | 'noInvoice' | 'noReceipt' | 'needsCreditNote';

/** Boleta válida a la que todavía le queda monto por rebajar con nota de crédito */
const creditable = (s: SaleRow) =>
  Boolean(s.receipt && (s.receipt.status === 'EMITIDA' || s.receipt.status === 'REGISTRADA') && (s.receipt.creditNotes ?? 0) < (s.receipt.totalGross ?? 0));

const FILTERS: { id: Filter; label: string; match: (s: SaleRow) => boolean }[] = [
  { id: 'all', label: 'Todas', match: () => true },
  { id: 'done', label: 'Con resultado', match: (s) => s.total !== null },
  { id: 'noSettlement', label: 'Falta liquidación', match: (s) => !s.cancelled && s.settlementNet === null },
  { id: 'noInvoice', label: 'Falta factura', match: (s) => !s.cancelled && s.supplierGross === null },
  { id: 'noReceipt', label: 'Falta boleta', match: (s) => !s.cancelled && s.receipt === null },
  { id: 'needsCreditNote', label: 'Cancelada con boleta', match: (s) => s.cancelled && creditable(s) },
];

/** Hoy en Chile (AAAA-MM-DD) */
const todayCL = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

/** Rango por defecto: desde el día 20 del mes pasado hasta hoy */
function defaultRange() {
  const today = todayCL();
  const [y, m] = today.split('-').map(Number);
  return { from: new Date(Date.UTC(y, m - 2, 20)).toISOString().slice(0, 10), to: today };
}

export default function VerVentasPage() {
  const [range, setRange] = useState(defaultRange);
  const sales = useQuery({ queryKey: ['sales', range.from, range.to], queryFn: () => api.listSales(range.from, range.to) });
  const isDefaultRange = range.from === defaultRange().from && range.to === defaultRange().to;
  // ¿Se pueden emitir boletas en el SII desde el sistema? (API Gateway configurado)
  const sii = useQuery({ queryKey: ['sii-status'], queryFn: api.siiStatus, staleTime: 5 * 60_000 });
  const { canEdit } = useAuth();
  const siiEnabled = Boolean(sii.data?.enabled) && canEdit;
  // Orden a la que se le está emitiendo la boleta en el SII / emisión de varias
  const [emitFor, setEmitFor] = useState<SaleRow | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  // Emitir boletas solo de las órdenes seleccionadas que no tienen
  const [emitSelectedOpen, setEmitSelectedOpen] = useState(false);
  // Órdenes seleccionadas (casillas) para descargar sus boletas
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloadOpen, setDownloadOpen] = useState(false);
  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  // Orden a la que se le está agregando/editando la boleta
  const [receiptFor, setReceiptFor] = useState<SaleRow | null>(null);

    // Orden de la que se están viendo los datos del cliente
  const [customerFor, setCustomerFor] = useState<SaleRow | null>(null);
  // Nota de crédito / devolución de una orden
  const [ncFor, setNcFor] = useState<SaleRow | null>(null);
  const [returnFor, setReturnFor] = useState<SaleRow | null>(null);
  const [facturaFor, setFacturaFor] = useState<SaleRow | null>(null);

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

  // Selección: solo cuentan las órdenes que siguen en la lista (ventas recargadas)
  const selectedSales = useMemo(() => (sales.data ?? []).filter((s) => selected.has(s.key)), [sales.data, selected]);
  const selectedWithoutReceipt = useMemo(
    () => selectedSales.filter((s) => !s.receipt && !s.cancelled && s.orderNumber),
    [selectedSales],
  );
  const allVisibleSelected = rows.length > 0 && rows.every((s) => selected.has(s.key));
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) rows.forEach((s) => next.delete(s.key));
      else rows.forEach((s) => next.add(s.key));
      return next;
    });

  // Órdenes del filtro actual a las que les falta boleta (para emitirlas todas juntas)
  const pendingReceipts = useMemo(
    () => rows.filter((s) => !s.cancelled && s.orderNumber && !s.receipt),
    [rows],
  );

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
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cada orden con lo que se vendió, lo que pagó el retailer, lo que hay que pagarle al
            proveedor y lo que queda.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">
            Desde
            <input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))}
              className="mt-0.5 block rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
            />
          </label>
          <label className="text-xs text-slate-500">
            Hasta
            <input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))}
              className="mt-0.5 block rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
            />
          </label>
          {!isDefaultRange && (
            <button
              onClick={() => setRange(defaultRange())}
              className="px-1 py-1.5 text-sm font-medium text-brand-600 hover:underline"
              title="Desde el 20 del mes pasado hasta hoy"
            >
              Volver al período actual
            </button>
          )}
          <button
            onClick={() => sales.refetch()}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={cn('size-4', sales.isFetching && 'animate-spin')} />
            Actualizar
          </button>
        </div>
      </header>
      <MipymeSync hasDrafts={(sales.data ?? []).some((x) => x.receipt?.status === 'BORRADOR')} className="mb-4" />

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
            {siiEnabled && filter === 'noReceipt' && pendingReceipts.length > 0 && (
              <button
                onClick={() => setBulkOpen(true)}
                className="ml-auto inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
              >
                <Send className="size-4" /> Emitir {pendingReceipts.length} boleta(s) en el SII
              </button>
            )}
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
            No hay ventas entre el {range.from.split('-').reverse().join('/')} y el {range.to.split('-').reverse().join('/')}. Cambia las fechas o{' '}
            <Link href="/ventas/cargas" className="font-medium text-brand-600 hover:underline">
              carga un archivo
            </Link>
            .
          </div>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">No hay ventas con este filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="w-8 py-2.5 pl-3">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      title="Seleccionar todas las órdenes de la lista"
                      className="accent-brand-600"
                    />
                  </th>
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
                    onCreditNote={() => setNcFor(s)}
                    onReturn={() => setReturnFor(s)}
                    onFactura={siiEnabled ? () => setFacturaFor(s) : undefined}
                    onEmit={siiEnabled ? () => setEmitFor(s) : undefined}
                    selected={selected.has(s.key)}
                    onToggle={() => toggle(s.key)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {receiptFor && <ReceiptDialog sale={receiptFor} onClose={() => setReceiptFor(null)} />}
      {customerFor && <CustomerDataDialog sale={customerFor} onClose={() => setCustomerFor(null)} />}
      {emitFor && <EmitBoletaDialog sale={emitFor} onClose={() => setEmitFor(null)} />}
      {ncFor && ncFor.orderNumber && (
        <CreditNoteDialog
          retailerCode={ncFor.retailerCode}
          orderNumber={ncFor.orderNumber}
          orderLabel={ncFor.orderLabel}
          defaults={{ refCode: 1, reason: ncFor.cancelled ? 'Orden cancelada' : 'Devolución del cliente' }}
          onClose={() => setNcFor(null)}
        />
      )}
      {facturaFor && facturaFor.orderNumber && (
        <FacturaDialog
          retailerCode={facturaFor.retailerCode}
          orderNumber={facturaFor.orderNumber}
          orderLabel={facturaFor.orderLabel}
          onClose={() => setFacturaFor(null)}
        />
      )}
      {returnFor && returnFor.orderNumber && (
        <ReturnDialog
          order={{ retailerCode: returnFor.retailerCode, orderNumber: returnFor.orderNumber, label: returnFor.orderLabel, salePrice: returnFor.salePrice }}
          onClose={() => setReturnFor(null)}
        />
      )}
      {bulkOpen && <EmitBoletasDialog sales={pendingReceipts} onClose={() => setBulkOpen(false)} />}
      {emitSelectedOpen && (
        <EmitBoletasDialog
          sales={selectedWithoutReceipt}
          onClose={() => {
            setEmitSelectedOpen(false);
            setSelected(new Set());
          }}
        />
      )}
      {downloadOpen && (
        <DownloadBoletasDialog
          sales={selectedSales}
          siiEnabled={siiEnabled}
          onClose={() => {
            setDownloadOpen(false);
            setSelected(new Set());
          }}
        />
      )}

      {/* Barra de acciones de la selección */}
      {selectedSales.length > 0 && !downloadOpen && !emitSelectedOpen && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full bg-slate-900 py-2 pr-2 pl-5 text-sm text-white shadow-xl">
            <span>
              <b>{selectedSales.length}</b> seleccionada(s)
              <span className="ml-1 text-slate-400">
                · {selectedSales.filter((s) => s.receipt?.status === 'EMITIDA').length} con boleta
              </span>
            </span>
            {siiEnabled && selectedWithoutReceipt.length > 0 && (
              <button
                onClick={() => setEmitSelectedOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 font-medium hover:bg-white/20"
              >
                <Send className="size-4" /> Emitir {selectedWithoutReceipt.length} boleta(s)
              </button>
            )}
            <button
              onClick={() => setDownloadOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-4 py-1.5 font-medium hover:bg-brand-600"
            >
              <Download className="size-4" /> Descargar boletas
            </button>
            <button onClick={() => setSelected(new Set())} className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Quitar selección">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {sales.data && sales.data.length >= 5000 && (
        <p className="mt-2 text-xs text-slate-400">Se muestran las 5.000 órdenes más recientes del rango: acorta las fechas para ver el resto.</p>
      )}
    </div>
  );
}

function SaleLine(props: {
  s: SaleRow;
  onReceipt: () => void;
  onCustomer: () => void;
  onCreditNote: () => void;
  onReturn: () => void;
  onFactura?: () => void;
  onEmit?: () => void;
  selected: boolean;
  onToggle: () => void;
}) {
  const { s, onReceipt, onCustomer, onCreditNote, onReturn, onFactura, onEmit, selected, onToggle } = props;
  const queryClient = useQueryClient();
  const dropFactura = useMutation({
    mutationFn: (id: string) => api.deleteFactura(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales'] }),
    onError: (err: Error) => window.alert(err.message),
  });
  const { canEdit } = useAuth();
  const muted = <span className="text-slate-300">—</span>;
  return (
    <tr className={cn('align-top hover:bg-slate-50', s.cancelled && 'text-slate-400', selected && 'bg-brand-50/60')}>
      <td className="py-2.5 pl-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="accent-brand-600" aria-label="Seleccionar orden" />
      </td>
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
          {s.receipt?.status === 'EMITIDA' && (
            // Emitida en el SII desde el sistema: no se edita, se ve el PDF
            <a
              href={api.boletaPdfUrl(s.receipt.id, api.boletaFileName(s))}
              target="_blank"
              rel="noreferrer"
              title="Emitida en el SII · ver PDF"
              className="mr-1 text-left"
            >
              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                {s.receipt.documentType === 33 ? 'Fact. ' : ''}N° {s.receipt.number}
                <FileText className="size-3" />
              </span>
              <span className="mt-0.5 block text-xs text-slate-500 tabular-nums">{clp(s.receipt.totalGross)} · SII</span>
            </a>
          )}
          {s.receipt?.status === 'BORRADOR' && (
            <span className="mr-1 text-left" title="Factura armada en el Portal MIPYME: falta firmarla allá">
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                Factura borrador
                {canEdit && (
                  <button
                    onClick={() => window.confirm('¿Quitar la factura en borrador? También se borra del Portal MIPYME.') && dropFactura.mutate(s.receipt!.id)}
                    className="text-amber-500 hover:text-red-600"
                    aria-label="Quitar factura en borrador"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500 tabular-nums">{clp(s.receipt.totalGross)} · MIPYME</span>
            </span>
          )}
          {(s.receipt?.status === 'REVISAR' || s.receipt?.status === 'EMITIENDO') && (
            <button
              onClick={canEdit && s.receipt.status === 'REVISAR' ? onReceipt : undefined}
              title="El SII no confirmó la boleta: revisa en el portal eBoleta si quedó emitida y anota su N°, o quita el intento"
              className="mr-1 text-left"
            >
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                <AlertTriangle className="size-3" />
                {s.receipt.status === 'REVISAR' ? 'Revisar' : 'Emitiendo…'}
              </span>
            </button>
          )}
          {s.receipt && s.receipt.status === 'REGISTRADA' && (
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
              {onEmit && !s.receipt && (
                <IconButton title="Emitir boleta en el SII" onClick={onEmit}>
                  <Send className="size-4" />
                </IconButton>
              )}
              {onFactura && !s.receipt && (
                <IconButton title="Hacer factura (borrador en el Portal MIPYME)" onClick={onFactura}>
                  <Building2 className="size-4" />
                </IconButton>
              )}
              {canEdit && !s.receipt && (
                <IconButton title="Agregar boleta emitida fuera del sistema (a mano)" onClick={onReceipt}>
                  <Plus className="size-4" />
                </IconButton>
              )}
            </>
          )}
          {canEdit && s.cancelled && s.orderNumber && creditable(s) && !s.receipt?.draftCreditNotes && (
            <IconButton title="Orden cancelada: hacer nota de crédito" onClick={onCreditNote}>
              <FileMinus className="size-4 text-red-500" />
            </IconButton>
          )}
          {canEdit && !s.cancelled && s.orderNumber && (
            <IconButton title="Registrar devolución" onClick={onReturn}>
              <Undo2 className="size-4" />
            </IconButton>
          )}
          {(s.cancelled || !s.orderNumber) && !s.receipt && muted}
        </div>
        {s.receipt && (s.receipt.creditNotes > 0 || s.receipt.draftCreditNotes > 0) && (
          <span className="mt-0.5 block text-xs text-red-600 tabular-nums">
            {s.receipt.creditNotes > 0 && `NC −${clp(s.receipt.creditNotes)}`}
            {s.receipt.draftCreditNotes > 0 && <span className="text-amber-600"> · NC borrador {clp(s.receipt.draftCreditNotes)}</span>}
          </span>
        )}
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