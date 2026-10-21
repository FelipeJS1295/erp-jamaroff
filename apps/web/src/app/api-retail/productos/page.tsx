'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from '@/components/auth';
import { Badge, ErrorText, Loading, PageHeader, Stat, clp, td, th } from '@/components/kit';
import { RetailSyncButton } from '@/components/retail-sync';
import { api, type RetailProviderCode } from '@/lib/api';
import { cn } from '@/lib/cn';

export default function RetailApiProductsPage() {
  const { canEdit } = useAuth();
  const [provider, setProvider] = useState<RetailProviderCode | ''>('');
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const connections = useQuery({ queryKey: ['retail-connections'], queryFn: api.retailConnections });
  const products = useQuery({ queryKey: ['retail-products'], queryFn: () => api.retailProducts() });
  const ready = (connections.data ?? []).filter((c) => c.configured && c.enabled);
  const all = products.data ?? [];

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (p) =>
        (!provider || p.provider === provider) &&
        (!onlyMissing || !p.inCatalog) &&
        (!q || [p.sellerSku, p.retailerSku, p.name, p.brand].filter(Boolean).some((v) => v!.toLowerCase().includes(q))),
    );
  }, [all, provider, search, onlyMissing]);
  const targets = provider ? ready.filter((c) => c.provider === provider) : ready;

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <PageHeader
        title="Productos por API"
        subtitle="Productos publicados en cada retailer, con precio, oferta y stock según su API. Se compara con el Catálogo retail del ERP por SKU."
        actions={
          canEdit && (
            <RetailSyncButton
              providers={targets.map((c) => ({ code: c.provider, label: c.label }))}
              kind="products"
              invalidate={['retail-products', 'retail-connections']}
            />
          )
        }
      />
      {connections.data && ready.length === 0 && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Aún no hay retailers conectados.{' '}
          <Link href="/api-retail/conexion" className="font-medium underline">
            Configura la conexión
          </Link>
          .
        </p>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Productos" value={rows.length.toLocaleString('es-CL')} />
        <Stat label="En el Catálogo retail" value={rows.filter((p) => p.inCatalog).length} tone="green" />
        <Stat label="No están en el catálogo" value={rows.filter((p) => !p.inCatalog).length} tone={rows.some((p) => !p.inCatalog) ? 'amber' : undefined} />
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
                {all.filter((p) => !c.provider || p.provider === c.provider).length}
              </span>
            </button>
          ))}
        </div>
        <label className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SKU o nombre"
            className="w-64 rounded-md border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-sm focus:border-brand-500 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="accent-brand-600" />
          Solo los que no están en el catálogo
        </label>
      </div>
      <ErrorText error={products.error} />
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {products.isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="py-14 text-center text-sm text-slate-500">No hay productos. Usa “Sincronizar” para traerlos desde los retailers.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <th className={th} />
                  <th className={th}>Retailer</th>
                  <th className={th}>SKU vendedor</th>
                  <th className={th}>Producto</th>
                  <th className={cn(th, 'text-right')}>Precio</th>
                  <th className={cn(th, 'text-right')}>Oferta</th>
                  <th className={cn(th, 'text-right')}>Stock</th>
                  <th className={th}>Estado</th>
                  <th className={th}>Catálogo ERP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 2000).map((p) => (
                  <tr key={p.id} className="align-top hover:bg-slate-50">
                    <td className="py-2 pl-3">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="size-10 rounded object-cover" loading="lazy" />
                      ) : (
                        <div className="size-10 rounded bg-slate-100" />
                      )}
                    </td>
                    <td className={cn(td, 'font-medium')}>{p.retailer}</td>
                    <td className={cn(td, 'font-mono text-xs')}>
                      {p.sellerSku}
                      {p.retailerSku && <span className="block text-slate-400">{p.retailerSku}</span>}
                    </td>
                    <td className={cn(td, 'max-w-80')}>
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {p.name} <ExternalLink className="inline size-3 text-slate-400" />
                        </a>
                      ) : (
                        p.name
                      )}
                      {p.brand && <span className="block text-xs text-slate-500">{p.brand}</span>}
                    </td>
                    <td className={cn(td, 'text-right tabular-nums')}>{clp(p.price)}</td>
                    <td className={cn(td, 'text-right tabular-nums', p.salePrice && 'text-emerald-700')}>{p.salePrice ? clp(p.salePrice) : '—'}</td>
                    <td className={cn(td, 'text-right tabular-nums', p.stock === 0 && 'text-red-600')}>{p.stock ?? '—'}</td>
                    <td className={cn(td, 'text-xs')}>{p.status ?? '—'}</td>
                    <td className={td}>
                      {p.inCatalog ? <Badge tone="green">{p.masterSku ? `Sí · ${p.masterSku}` : 'Sí'}</Badge> : <Badge tone="amber">No</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {rows.length > 2000 && <p className="mt-2 text-xs text-slate-400">Se muestran los primeros 2.000: usa el buscador.</p>}
    </div>
  );
}
