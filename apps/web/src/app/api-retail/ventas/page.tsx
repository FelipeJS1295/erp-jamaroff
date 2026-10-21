'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth';
import { Badge, ErrorText, Loading, Modal, PageHeader, Stat, clp, td, th } from '@/components/kit';
import { RetailSyncButton } from '@/components/retail-sync';
import { api, type RetailProviderCode } from '@/lib/api';
import { cn } from '@/lib/cn';

const todayCL = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
function defaultRange() {
  const today = todayCL();
  const [y, m] = today.split('-').map(Number);
  return { from: new Date(Date.UTC(y, m - 2, 20)).toISOString().slice(0, 10), to: today };
}
const dmyTime = (v: string | null) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)} ${v.slice(11)}` : '—');

export default function RetailApiSalesPage() {
  const { canEdit } = useAuth();
  const [range, setRange] = useState(defaultRange);
  const [provider, setProvider] = useState<RetailProviderCode | ''>('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [rawFor, setRawFor] = useState<string | null>(null);
  const connections = useQuery({ queryKey: ['retail-connections'], queryFn: api.retailConnections });
  const orders = useQuery({ queryKey: ['retail-orders', range.from, range.to], queryFn: () => api.retailOrders(range.from, range.to) });

  const ready = (connections.data ?? []).filter((c) => c.configured && c.enabled);
  const all = orders.data ?? [];
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (o) =>
        (!provider || o.provider === provider) &&
        (!q ||
          [o.orderNumber, o.customerOrderId, o.customerName, o.customerRut, ...o.items.map((i) => `${i.name} ${i.sellerSku}`)]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q))),
    );
  }, [all, provider, search]);
  const syncTargets = provider ? ready.filter((c) => c.provider === provider) : ready;

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <PageHeader
        title="Ventas por API"
        subtitle="Órdenes traídas directo desde la API de cada retailer. Es una sección aparte: no cambia la página Ventas (la que se carga por archivo)."
        actions={
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
            {canEdit && (
              <RetailSyncButton
                providers={syncTargets.map((c) => ({ code: c.provider, label: c.label }))}
                kind="orders"
                range={range}
                invalidate={['retail-orders', 'retail-connections']}
              />
            )}
          </div>
        }
      />
      {connections.data && ready.length === 0 && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Aún no hay retailers conectados.{' '}
          <Link href="/api-retail/conexion" className="font-medium underline">
            Configura la conexión
          </Link>{' '}
          para traer las ventas.
        </p>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Órdenes" value={rows.length.toLocaleString('es-CL')} />
        <Stat label="Total vendido (con IVA)" value={clp(rows.reduce((n, o) => n + (o.total ?? 0), 0))} />
        <Stat label="También en Ventas (archivo)" value={rows.filter((o) => o.inErp).length} tone="green" />
        <Stat label="Solo por API" value={rows.filter((o) => !o.inErp).length} tone={rows.some((o) => !o.inErp) ? 'amber' : undefined} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
          {[{ provider: '' as const, label: 'Todos' }, ...(connections.data ?? [])].map((c) => (
            <button
              key={c.provider}
              onClick={() => setProvider(c.provider)}
              className={cn('rounded px-3 py-1.5 text-sm', provider === c.provider ? 'bg-brand-500 font-medium text-white' : 'text-slate-600 hover:bg-slate-100')}
            >
              {c.label}
              <span className={cn('ml-1.5 text-xs', provider === c.provider ? 'text-white/80' : 'text-slate-400')}>
                {all.filter((o) => !c.provider || o.provider === c.provider).length}
              </span>
            </button>
          ))}
        </div>
        <label className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Orden, cliente, RUT o producto"
            className="w-72 rounded-md border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-sm focus:border-brand-500 focus:outline-none"
          />
        </label>
      </div>

      <ErrorText error={orders.error} />
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {orders.isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="py-14 text-center text-sm text-slate-500">No hay órdenes en este rango. Usa “Sincronizar” para traerlas desde los retailers.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="w-6" />
                  <th className={th}>Retailer</th>
                  <th className={th}>N° orden</th>
                  <th className={th}>Fecha</th>
                  <th className={th}>Cliente</th>
                  <th className={th}>Productos</th>
                  <th className={th}>Estado</th>
                  <th className={cn(th, 'text-right')}>Total</th>
                  <th className={th}>En Ventas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((o) => {
                  const isOpen = open.has(o.id);
                  return (
                    <Fragment key={o.id}>
                      <tr
                        className="cursor-pointer align-top hover:bg-slate-50"
                        onClick={() =>
                          setOpen((s) => {
                            const n = new Set(s);
                            if (n.has(o.id)) n.delete(o.id);
                            else n.add(o.id);
                            return n;
                          })
                        }
                      >
                        <td className="py-2.5 pl-2 text-slate-400">{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
                        <td className={cn(td, 'font-medium')}>{o.retailer}</td>
                        <td className={cn(td, 'font-mono text-xs')}>
                          {o.provider === 'WALMART' ? (o.customerOrderId ?? o.orderNumber) : o.orderNumber}
                          {o.provider === 'WALMART' && <span className="block text-slate-400">{o.orderNumber}</span>}
                        </td>
                        <td className={cn(td, 'whitespace-nowrap tabular-nums')}>{dmyTime(o.orderDate)}</td>
                        <td className={td}>
                          {o.customerName ?? '—'}
                          <span className="block text-xs text-slate-500">{o.customerRut ?? 'sin RUT'}</span>
                        </td>
                        <td className={cn(td, 'max-w-72')}>
                          {o.items.length === 1 ? o.items[0].name : `${o.items.length} productos`}
                        </td>
                        <td className={cn(td, 'text-xs')}>{o.status ?? '—'}</td>
                        <td className={cn(td, 'text-right tabular-nums')}>
                          {clp(o.total)}
                          {o.shippingTotal ? <span className="block text-xs text-slate-400">envío {clp(o.shippingTotal)}</span> : null}
                        </td>
                        <td className={td}>{o.inErp ? <Badge tone="green">Sí</Badge> : <Badge tone="amber">No</Badge>}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50/60">
                          <td />
                          <td colSpan={8} className="px-3 pb-3">
                            <div className="grid gap-3 text-xs sm:grid-cols-3">
                              <div>
                                <p className="font-semibold text-slate-600">Despacho</p>
                                <p>{[o.address, o.commune, o.region].filter(Boolean).join(', ') || '—'}</p>
                                <p className="text-slate-500">{o.customerEmail}</p>
                              </div>
                              <div className="sm:col-span-2">
                                <p className="font-semibold text-slate-600">Productos</p>
                                {o.items.map((i, n) => (
                                  <p key={n} className="flex justify-between gap-3">
                                    <span>
                                      {i.quantity} × {i.name} <span className="font-mono text-slate-400">{i.sellerSku}</span>
                                      {i.status && <span className="text-slate-400"> · {i.status}</span>}
                                    </span>
                                    <span className="tabular-nums">{clp(i.paidPrice)}</span>
                                  </p>
                                ))}
                              </div>
                            </div>
                            <button onClick={() => setRawFor(o.id)} className="mt-2 text-xs font-medium text-brand-600 hover:underline">
                              Ver respuesta completa del retailer
                            </button>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {rawFor && <RawDialog id={rawFor} onClose={() => setRawFor(null)} />}
    </div>
  );
}

function RawDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const raw = useQuery({ queryKey: ['retail-order-raw', id], queryFn: () => api.retailOrderRaw(id) });
  const copy = useMutation({ mutationFn: () => navigator.clipboard.writeText(JSON.stringify(raw.data, null, 2)) });
  return (
    <Modal wide title="Respuesta del retailer" subtitle="Así llegó la orden desde la API (sirve para revisar campos)" onClose={onClose}>
      {raw.isLoading && <Loading />}
      <ErrorText error={raw.error} />
      {raw.data !== undefined && (
        <>
          <button onClick={() => copy.mutate()} className="text-xs font-medium text-brand-600 hover:underline">
            {copy.isSuccess ? 'Copiado' : 'Copiar'}
          </button>
          <pre className="max-h-[60vh] overflow-auto rounded bg-slate-50 p-3 text-[11px]">{JSON.stringify(raw.data, null, 2)}</pre>
        </>
      )}
    </Modal>
  );
}
