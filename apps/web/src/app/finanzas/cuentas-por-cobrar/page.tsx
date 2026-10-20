'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, Button, ErrorText, Loading, PageHeader, Stat, clp, dmy, td, th } from '@/components/kit';
import { api, type AgingBucket } from '@/lib/api';
import { cn } from '@/lib/cn';

const BUCKET_TONE: Record<AgingBucket, string> = {
  POR_VENCER: 'bg-emerald-500',
  D1_30: 'bg-amber-400',
  D31_60: 'bg-orange-500',
  D61_90: 'bg-red-500',
  D90: 'bg-red-700',
};

export default function ReceivablesPage() {
  const q = useQuery({ queryKey: ['receivables'], queryFn: api.receivables });
  const [retailer, setRetailer] = useState('');
  const [bucket, setBucket] = useState<AgingBucket | ''>('');
  const d = q.data;

  const items = useMemo(
    () => (d?.items ?? []).filter((i) => (!retailer || i.retailerCode === retailer) && (!bucket || i.bucket === bucket)),
    [d, retailer, bucket],
  );

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <PageHeader
        title="Cuentas por cobrar"
        subtitle="Órdenes vendidas que el retailer aún no paga en una liquidación. Lo esperado es la venta menos la comisión pactada; el vencimiento sale de los días de pago de cada retailer."
        actions={
          <Button variant="secondary" onClick={() => q.refetch()}>
            <RefreshCw className={cn('size-4', q.isFetching && 'animate-spin')} /> Actualizar
          </Button>
        }
      />
      <ErrorText error={q.error} />
      {!d ? (
        q.isLoading && <Loading />
      ) : (
        <>
          {d.missingCommission.length > 0 && (
            <p className="mb-4 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                {d.missingCommission.join(', ')} no {d.missingCommission.length === 1 ? 'tiene' : 'tienen'} comisión definida: lo esperado se muestra igual a
                la venta. Complétala en <Link href="/maestras/retailers" className="font-medium underline">Maestras → Retailers</Link>.
              </span>
            </p>
          )}

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Stat label="Por cobrar (estimado)" value={clp(d.totals.expected)} hint={`${d.totals.orders} órdenes`} />
            <Stat label="Vencido" value={clp(d.totals.overdue)} tone={d.totals.overdue > 0 ? 'red' : undefined} />
            <Stat label="Por vencer" value={clp(d.totals.buckets.POR_VENCER)} tone="green" />
          </div>

          {/* Antigüedad por retailer */}
          <section className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                    <th className={th}>Retailer</th>
                    <th className={th}>Condición</th>
                    <th className={cn(th, 'text-right')}>Órdenes</th>
                    {d.buckets.map((b) => (
                      <th key={b.key} className={cn(th, 'text-right')}>
                        {b.label}
                      </th>
                    ))}
                    <th className={cn(th, 'text-right')}>Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {d.retailers.map((r) => (
                    <tr key={r.code} className={cn('cursor-pointer hover:bg-slate-50', retailer === r.code && 'bg-brand-50')} onClick={() => setRetailer(retailer === r.code ? '' : r.code)}>
                      <td className={cn(td, 'font-medium')}>{r.name}</td>
                      <td className={cn(td, 'text-xs text-slate-500')}>
                        {r.paymentDays} días desde {r.paymentBase === 'ORDEN' ? 'la orden' : 'el despacho'}
                        {r.commissionPct > 0 && ` · comisión ${r.commissionPct}%`}
                      </td>
                      <td className={cn(td, 'text-right tabular-nums')}>{r.orders}</td>
                      {d.buckets.map((b) => (
                        <td key={b.key} className={cn(td, 'text-right tabular-nums', r.buckets[b.key] > 0 && b.key !== 'POR_VENCER' && 'text-red-600')}>
                          {r.buckets[b.key] ? clp(r.buckets[b.key]) : <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                      <td className={cn(td, 'text-right font-semibold tabular-nums')}>{clp(r.expected)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold">
                    <td className={td} colSpan={2}>
                      Total
                    </td>
                    <td className={cn(td, 'text-right tabular-nums')}>{d.totals.orders}</td>
                    {d.buckets.map((b) => (
                      <td key={b.key} className={cn(td, 'text-right tabular-nums')}>
                        {clp(d.totals.buckets[b.key])}
                      </td>
                    ))}
                    <td className={cn(td, 'text-right tabular-nums')}>{clp(d.totals.expected)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Barra de antigüedad */}
            {d.totals.expected > 0 && (
              <div className="flex h-2">
                {d.buckets.map((b) => (
                  <div key={b.key} className={BUCKET_TONE[b.key]} style={{ width: `${(d.totals.buckets[b.key] / d.totals.expected) * 100}%` }} title={b.label} />
                ))}
              </div>
            )}
          </section>

          {/* Órdenes */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={retailer} onChange={(e) => setRetailer(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
              <option value="">Todos los retailers</option>
              {d.retailers.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
            <select value={bucket} onChange={(e) => setBucket(e.target.value as AgingBucket | '')} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
              <option value="">Todos los tramos</option>
              {d.buckets.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </select>
            <span className="text-sm text-slate-500">
              {items.length} órdenes · {clp(items.reduce((n, i) => n + i.expected, 0))}
            </span>
          </div>
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                    <th className={th}>Retailer</th>
                    <th className={th}>N° orden</th>
                    <th className={th}>Fecha</th>
                    <th className={th}>Producto</th>
                    <th className={cn(th, 'text-right')}>Venta</th>
                    <th className={cn(th, 'text-right')}>Esperado</th>
                    <th className={th}>Vence</th>
                    <th className={th}>Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.slice(0, 500).map((i) => (
                    <tr key={`${i.retailerCode}-${i.orderNumber}`} className="hover:bg-slate-50">
                      <td className={cn(td, 'font-medium')}>{i.retailer}</td>
                      <td className={cn(td, 'font-mono text-xs')}>{i.orderLabel ?? i.orderNumber}</td>
                      <td className={cn(td, 'tabular-nums')}>{dmy(i.orderDate)}</td>
                      <td className={cn(td, 'max-w-64 text-slate-700')}>{i.productName}</td>
                      <td className={cn(td, 'text-right tabular-nums')}>{clp(i.salePrice)}</td>
                      <td className={cn(td, 'text-right font-medium tabular-nums')}>{clp(i.expected)}</td>
                      <td className={cn(td, 'tabular-nums')}>{dmy(i.dueDate)}</td>
                      <td className={td}>
                        {i.daysOverdue > 0 ? (
                          <Badge tone="red">Vencida hace {i.daysOverdue} días</Badge>
                        ) : (
                          <Badge tone="green">Vence en {i.daysToDue} días</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {items.length > 500 && <p className="mt-2 text-xs text-slate-400">Se muestran las primeras 500 órdenes.</p>}
        </>
      )}
    </div>
  );
}
