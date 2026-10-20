'use client';

import { useQuery } from '@tanstack/react-query';
import { CloudDownload, Loader2, RefreshCw, Search, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/components/auth';
import { INVOICE_STATUS, InvoiceDialog } from '@/components/invoice-dialog';
import { SiiPurchasesDialog } from '@/components/sii-purchases-dialog';
import { api, type PurchaseInvoice } from '@/lib/api';
import { cn } from '@/lib/cn';

const clp = (n: number) => {
  const abs = `$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
  return n < 0 ? `-${abs}` : abs;
};
const dmy = (d: string) => d.split('-').reverse().join('/');

type StatusFilter = 'all' | 'open' | 'paid';

const STATUS_FILTERS: { id: StatusFilter; label: string; match: (i: PurchaseInvoice) => boolean }[] = [
  { id: 'all', label: 'Todas', match: () => true },
  { id: 'open', label: 'Por pagar', match: (i) => i.balance > 0 },
  { id: 'paid', label: 'Pagadas', match: (i) => i.balance <= 0 },
];

export default function FacturasPage() {
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: api.listInvoices });
  const [status, setStatus] = useState<StatusFilter>('open');
  const [supplierId, setSupplierId] = useState('');
  const [client, setClient] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [siiOpen, setSiiOpen] = useState(false);
  const { canEdit } = useAuth();
  const sii = useQuery({ queryKey: ['sii-status'], queryFn: api.siiStatus, staleTime: 5 * 60_000 });

  const all = useMemo(() => invoices.data ?? [], [invoices.data]);

  // Deuda por proveedor (todas las facturas, sin filtros)
  const bySupplier = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; total: number; paid: number; balance: number }>();
    for (const i of all) {
      const s = map.get(i.supplierId) ?? { id: i.supplierId, name: i.supplier, count: 0, total: 0, paid: 0, balance: 0 };
      s.count++;
      s.total += i.total;
      s.paid += i.paid;
      s.balance += i.balance;
      map.set(i.supplierId, s);
    }
    return [...map.values()].sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
  }, [all]);

    // Clientes (retailers) que aparecen en las facturas
  const clients = useMemo(() => [...new Set(all.flatMap((i) => i.clients))].sort(), [all]);
  const rows = useMemo(() => {
    const f = STATUS_FILTERS.find((x) => x.id === status)!;
    const q = search.trim().toLowerCase();
    return all.filter(
      (i) =>
        f.match(i) &&
        (!supplierId || i.supplierId === supplierId) &&
        (!client || i.clients.includes(client)) &&
        (!q || i.documentNumber.toLowerCase().includes(q) || i.supplier.toLowerCase().includes(q)),
    );
  }, [all, status, supplierId, client, search]);

  const totals = useMemo(
    () => ({
      total: all.reduce((n, i) => n + i.total, 0),
      paid: all.reduce((n, i) => n + i.paid, 0),
      balance: all.reduce((n, i) => n + i.balance, 0),
      open: all.filter((i) => i.balance > 0).length,
    }),
    [all],
  );

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facturas de proveedores</h1>
          <p className="mt-1 text-sm text-slate-500">
            Facturas traídas del SII o agregadas desde la conciliación, con lo pagado y lo que falta pagar a cada proveedor.
          </p>
        </div>
        <div className="flex gap-2">
        {canEdit && sii.data?.enabled && (
          <button
            onClick={() => setSiiOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            <CloudDownload className="size-4" /> Traer del SII
          </button>
        )}
        <button
          onClick={() => invoices.refetch()}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className={cn('size-4', invoices.isFetching && 'animate-spin')} />
          Actualizar
        </button>
        </div>
      </header>
      {siiOpen && <SiiPurchasesDialog onClose={() => setSiiOpen(false)} />}

      {invoices.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" /> Cargando facturas…
        </div>
      ) : invoices.isError ? (
        <p className="py-16 text-center text-sm text-red-600">{invoices.error.message}</p>
      ) : all.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
          Aún no hay facturas. Usa <strong>Traer del SII</strong> o agrégalas desde <strong>Conciliación</strong>: selecciona
          las órdenes y usa &quot;Agregar documento&quot;.
        </div>
      ) : (
        <>
          {/* Resumen */}
          <section className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-3">
            <div className="bg-white px-4 py-3">
              <p className="text-xs text-slate-500">Total facturado (con IVA)</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{clp(totals.total)}</p>
            </div>
            <div className="bg-white px-4 py-3">
              <p className="text-xs text-slate-500">Pagado</p>
              <p className="mt-0.5 text-lg font-semibold text-emerald-600 tabular-nums">{clp(totals.paid)}</p>
            </div>
            <div className="bg-white px-4 py-3">
              <p className="text-xs text-slate-500">
                Deuda con proveedores · {totals.open} {totals.open === 1 ? 'factura' : 'facturas'} por pagar
              </p>
              <p className={cn('mt-0.5 text-lg font-semibold tabular-nums', totals.balance > 0 && 'text-red-600')}>
                {clp(totals.balance)}
              </p>
            </div>
          </section>

          {/* Deuda por proveedor */}
          <section className="mt-4 rounded-lg border border-slate-200 bg-white">
            <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm font-semibold">
              <Wallet className="size-4 text-slate-400" /> Deuda por proveedor
              <span className="text-xs font-normal text-slate-400">(clic para filtrar)</span>
            </h2>
            <ul className="divide-y divide-slate-100">
              {bySupplier.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSupplierId(supplierId === s.id ? '' : s.id)}
                    className={cn(
                      'flex w-full items-center gap-4 px-4 py-2 text-left text-sm hover:bg-slate-50',
                      supplierId === s.id && 'bg-brand-50',
                    )}
                  >
                    <span className="flex-1 font-medium">{s.name}</span>
                    <span className="hidden text-xs text-slate-500 sm:inline">
                      {s.count} {s.count === 1 ? 'factura' : 'facturas'}
                    </span>
                    <span className="hidden w-32 text-right text-xs text-slate-500 tabular-nums sm:inline">
                      pagado {clp(s.paid)}
                    </span>
                    <span
                      className={cn(
                        'w-32 text-right font-semibold tabular-nums',
                        s.balance > 0 ? 'text-red-600' : 'text-emerald-600',
                      )}
                    >
                      {s.balance > 0 ? clp(s.balance) : 'Al día'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Filtros */}
          <div className="mt-6 mb-3 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatus(f.id)}
                  className={cn(
                    'rounded px-3 py-1.5 text-sm transition-colors',
                    status === f.id ? 'bg-brand-500 font-medium text-white' : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  {f.label}
                  <span className={cn('ml-1.5 text-xs', status === f.id ? 'text-white/80' : 'text-slate-400')}>
                    {all.filter(f.match).length}
                  </span>
                </button>
              ))}
            </div>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Todos los proveedores</option>
              {bySupplier.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
                        <select
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Todos los clientes</option>
              {clients.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <label className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar N° de factura"
                className="w-56 rounded-md border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
              />
            </label>
          </div>

          {/* Facturas */}
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {rows.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500">No hay facturas con este filtro.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                      <th className="px-3 py-2.5 font-medium">Proveedor</th>
                      <th className="px-3 py-2.5 font-medium">N° factura</th>
                      <th className="px-3 py-2.5 font-medium">Cliente</th>
                      <th className="px-3 py-2.5 font-medium" title="Fecha de la factura (mes del IVA crédito)">Fecha</th>
                      <th className="px-3 py-2.5 text-right font-medium">Órdenes</th>
                      <th className="border-l border-slate-200 px-3 py-2.5 text-right font-medium">Neto</th>
                      <th className="px-3 py-2.5 text-right font-medium">IVA</th>
                      <th className="px-3 py-2.5 text-right font-medium">Total</th>
                      <th className="border-l border-slate-200 px-3 py-2.5 text-right font-medium">Pagado</th>
                      <th className="px-3 py-2.5 text-right font-medium">Falta pagar</th>
                      <th className="px-3 py-2.5 font-medium">Estado</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((i) => (
                      <tr key={i.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-medium">
                          {i.supplier}
                          {i.supplierRut && <span className="block text-xs font-normal text-slate-400">{i.supplierRut}</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                          {i.documentNumber}
                          {i.documentType !== 33 && (
                            <span className="block font-sans text-[11px] text-violet-700">
                              {i.status === 'NOTA_CREDITO' ? 'Nota de crédito' : i.documentType === 34 ? 'Exenta' : `Tipo ${i.documentType}`}
                            </span>
                          )}
                          {i.fromSii && <span className="block font-sans text-[11px] text-sky-600" title="Montos del Registro de Compras del SII">SII</span>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{i.clients.join(', ') || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{dmy(i.issueDate)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {i.orders}
                          {i.fromSii && i.status !== 'NOTA_CREDITO' && i.assignedNet < i.net && (
                            <span className="block text-xs whitespace-nowrap text-amber-600" title="Neto de la factura que aún no se asigna a órdenes">
                              falta {clp(i.net - i.assignedNet)}
                            </span>
                          )}
                        </td>
                        <td className="border-l border-slate-100 px-3 py-2.5 text-right tabular-nums">{clp(i.net)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{clp(i.vat)}</td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">{clp(i.total)}</td>
                        <td className="border-l border-slate-100 px-3 py-2.5 text-right tabular-nums">
                          {i.paid > 0 ? clp(i.paid) : <span className="text-slate-300">—</span>}
                          {i.lastPaymentAt && (
                            <span className="block text-xs text-slate-400">último {dmy(i.lastPaymentAt)}</span>
                          )}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2.5 text-right font-semibold tabular-nums',
                            i.balance > 0 ? 'text-red-600' : 'text-emerald-600',
                          )}
                        >
                          {clp(i.balance)}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={cn('rounded-full px-2 py-0.5 text-xs font-medium', INVOICE_STATUS[i.status].badge)}
                          >
                            {INVOICE_STATUS[i.status].label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            onClick={() => setOpenId(i.id)}
                            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 hover:border-brand-500 hover:text-brand-600"
                          >
                            {i.balance > 0 ? 'Ver / pagar' : 'Ver'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {openId && <InvoiceDialog invoiceId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}