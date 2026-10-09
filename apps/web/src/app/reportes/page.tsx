'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api, type TopProduct, type TopProductsReport } from '@/lib/api';
import { cn } from '@/lib/cn';

/** 185000 -> "$185.000" */
const clp = (n: number) =>
  n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const int = (n: number) => n.toLocaleString('es-CL');

/** Fecha local en AAAA-MM-DD (sin pasar por UTC, para no correr el día) */
const iso = (d: Date) => d.toLocaleDateString('sv-SE');

type Period = 'month' | '30' | '90' | 'year' | 'all' | 'custom';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'month', label: 'Este mes' },
  { id: '30', label: 'Últimos 30 días' },
  { id: '90', label: 'Últimos 90 días' },
  { id: 'year', label: 'Este año' },
  { id: 'all', label: 'Todo' },
  { id: 'custom', label: 'Rango…' },
];

/** Rango de fechas de cada período rápido */
function periodRange(period: Period): { from?: string; to?: string } {
  const today = new Date();
  switch (period) {
    case 'month':
      return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)) };
    case '30':
    case '90': {
      const d = new Date(today);
      d.setDate(d.getDate() - Number(period) + 1);
      return { from: iso(d) };
    }
    case 'year':
      return { from: `${today.getFullYear()}-01-01` };
    default:
      return {};
  }
}

export default function ReportesPage() {
  const [period, setPeriod] = useState<Period>('all');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const range = period === 'custom' ? { from: custom.from || undefined, to: custom.to || undefined } : periodRange(period);

  const report = useQuery({
    queryKey: ['top-products', range.from, range.to],
    queryFn: () => api.topProducts(range.from, range.to),
  });

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Productos más vendidos en unidades, según el SKU de cada retailer. Las ventas canceladas
          no cuentan.
        </p>
      </header>

      {/* Filtro de período: una sola fila sobre los gráficos */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                'rounded px-3 py-1.5 text-sm transition-colors',
                period === p.id ? 'bg-brand-500 font-medium text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="date"
              value={custom.from}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
            />
            <span>al</span>
            <input
              type="date"
              value={custom.to}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5"
            />
          </div>
        )}
        {report.isFetching && <Loader2 className="size-4 animate-spin text-slate-400" />}
      </div>

      {report.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" /> Calculando…
        </div>
      ) : report.isError ? (
        <p className="py-24 text-center text-sm text-red-600">No se pudo obtener el reporte: {report.error.message}</p>
      ) : report.data && report.data.totals.units === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white py-24 text-center text-sm text-slate-500">
          No hay ventas en este período.
        </p>
      ) : (
        report.data && <ReportBody data={report.data} />
      )}
    </div>
  );
}

function ReportBody({ data }: { data: TopProductsReport }) {
  const notInCatalog = data.retailers.some((r) => r.products.some((p) => !p.inCatalog));
  const maxOverall = Math.max(...data.overall.map((p) => p.units), 1);

  return (
    <div className="space-y-6">
      {/* Totales */}
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Unidades vendidas" value={int(data.totals.units)} />
        <Stat label="Venta bruta (con IVA)" value={clp(data.totals.revenue)} />
        <Stat label="Órdenes" value={int(data.totals.orders)} />
      </div>

      {notInCatalog && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            Algunas ventas no se encontraron en el catálogo del retailer, así que se muestran con
            el SKU seller que trae la venta.{' '}
            <Link href="/maestras/catalogo" className="font-medium underline">
              Revisa o recarga el catálogo
            </Link>
            .
          </p>
        </div>
      )}

      {/* Top 5 en conjunto */}
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
          <Trophy className="size-4 text-brand-600" />
          <h2 className="text-sm font-semibold">Top 5 · todos los retailers</h2>
        </div>
        <ol className="divide-y divide-slate-100">
          {data.overall.map((p, i) => (
            <li key={p.key} className="grid grid-cols-[2rem_minmax(0,22rem)_1fr_7rem] items-center gap-4 px-5 py-3">
              <span className="text-lg font-semibold text-slate-300 tabular-nums">{i + 1}</span>
              <ProductName product={p} showRetailer />
              <Bar value={p.units} max={maxOverall} title={`${int(p.units)} unidades · ${clp(p.revenue)}`} />
              <Figures units={p.units} revenue={p.revenue} />
            </li>
          ))}
        </ol>
      </section>

      {/* Ranking por retailer */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {data.retailers.map((r) => (
          <RetailerRanking key={r.code} label={r.label} units={r.units} revenue={r.revenue} products={r.products} />
        ))}
      </div>
    </div>
  );
}

function RetailerRanking(props: { label: string; units: number; revenue: number; products: TopProduct[] }) {
  const { label, units, revenue, products } = props;
  const max = Math.max(...products.map((p) => p.units), 1);
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-baseline justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold">{label}</h2>
        <p className="text-xs text-slate-500">
          {int(units)} {units === 1 ? 'unidad' : 'unidades'} · {clp(revenue)}
        </p>
      </div>
      <ol className="divide-y divide-slate-100">
        {products.map((p, i) => (
          <li key={p.key} className="grid grid-cols-[1.5rem_minmax(0,1fr)_7rem_6.5rem] items-center gap-3 px-5 py-2.5">
            <span className="text-sm text-slate-400 tabular-nums">{i + 1}</span>
            <ProductName product={p} />
            <Bar value={p.units} max={max} title={`${int(p.units)} unidades · ${clp(p.revenue)}`} />
            <Figures units={p.units} revenue={p.revenue} compact />
          </li>
        ))}
      </ol>
    </section>
  );
}

function ProductName({ product, showRetailer }: { product: TopProduct; showRetailer?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium" title={product.name}>
        {showRetailer && (
          <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
            {product.retailerLabel}
          </span>
        )}
        {product.name}
      </p>
      <p className="truncate font-mono text-[11px] text-slate-500">
        {product.inCatalog ? (
          <>
            {product.retailerSku}
            {product.sellerSku && product.sellerSku !== product.retailerSku && (
              <span className="text-slate-400"> · {product.sellerSku}</span>
            )}
          </>
        ) : (
          <span className="font-sans font-medium text-amber-600">
            {product.sellerSku ? `${product.sellerSku} · ` : ''}no está en el catálogo
          </span>
        )}
      </p>
    </div>
  );
}

/** Barra horizontal de unidades, proporcional al máximo de la lista */
function Bar({ value, max, title }: { value: number; max: number; title: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100" title={title}>
      <div className="h-2 rounded-full bg-brand-500" style={{ width: `${Math.max((value / max) * 100, 2)}%` }} />
    </div>
  );
}

function Figures({ units, revenue, compact }: { units: number; revenue: number; compact?: boolean }) {
  return (
    <div className="text-right">
      <p className={cn('font-semibold tabular-nums', compact ? 'text-sm' : 'text-base')}>
        {int(units)} <span className="text-xs font-normal text-slate-500">un.</span>
      </p>
      <p className="text-[11px] text-slate-500 tabular-nums">{clp(revenue)}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-5 py-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}