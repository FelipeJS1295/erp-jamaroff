'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CircleDollarSign,
  Clock,
  Loader2,
  Package,
  Receipt,
  RefreshCw,
  ShoppingCart,
  Tags,
  Trophy,
  Truck,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth';
import { api, type Dashboard, type SalesKpis } from '@/lib/api';
import { cn } from '@/lib/cn';

/* ---------- Formatos ---------- */

/** 185000 -> "$185.000", -5000 -> "-$5.000" */
const clp = (n: number) => {
  const abs = `$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
  return n < 0 ? `-${abs}` : abs;
};
/** 1850000 -> "$1,9 M" (para ejes y textos cortos) */
const clpShort = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000).toLocaleString('es-CL')} mil`;
  return clp(n);
};
const int = (n: number) => n.toLocaleString('es-CL');
/** Fecha local en AAAA-MM-DD (sin pasar por UTC, para no correr el día) */
const iso = (d: Date) => d.toLocaleDateString('sv-SE');
/** "2026-10-08" -> "08/10/2026" */
const dmy = (d: string) => d.split('-').reverse().join('/');
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** Etiqueta del eje: "08 oct" por día, "oct 26" por mes */
const pointLabel = (d: string, granularity: 'day' | 'month') => {
  const [y, m, day] = d.split('-');
  return granularity === 'day' ? `${day} ${MONTHS[Number(m) - 1]}` : `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
};

/** Color de cada retailer en los gráficos */
const RETAILER_COLORS: Record<string, string> = {
  CENCOSUD: 'bg-sky-500',
  WALMART: 'bg-blue-700',
  FALABELLA: 'bg-lime-600',
  HITES: 'bg-rose-500',
};
const retailerColor = (code: string) => RETAILER_COLORS[code.split('_')[0]] ?? 'bg-slate-400';

/* ---------- Período ---------- */

type Period = 'month' | 'lastMonth' | '30' | '90' | 'year' | 'all';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'month', label: 'Este mes' },
  { id: 'lastMonth', label: 'Mes pasado' },
  { id: '30', label: 'Últimos 30 días' },
  { id: '90', label: 'Últimos 90 días' },
  { id: 'year', label: 'Este año' },
  { id: 'all', label: 'Todo' },
];

function periodRange(period: Period): { from?: string; to?: string } {
  const today = new Date();
  switch (period) {
    case 'month':
      return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
    case 'lastMonth':
      return {
        from: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: iso(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    case '30':
    case '90': {
      const d = new Date(today);
      d.setDate(d.getDate() - Number(period) + 1);
      return { from: iso(d), to: iso(today) };
    }
    case 'year':
      return { from: `${today.getFullYear()}-01-01`, to: iso(today) };
    default:
      return {};
  }
}

/* ---------- Página ---------- */

export default function HomePage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('30');
  const range = periodRange(period);

  const dashboard = useQuery({
    queryKey: ['dashboard', range.from, range.to],
    queryFn: () => api.dashboard(range.from, range.to),
    placeholderData: (prev) => prev, // mantiene los datos mientras cambia el período
  });
  const d = dashboard.data;

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hola, {user.name.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Resumen de ventas, despachos y conciliación de todos los retailers.
          </p>
        </div>
        <button
          onClick={() => dashboard.refetch()}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className={cn('size-4', dashboard.isFetching && 'animate-spin')} />
          Actualizar
        </button>
      </header>

      {/* Filtro de período */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap rounded-md border border-slate-200 bg-white p-0.5">
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
        {d && (
          <span className="text-xs text-slate-500">
            {d.from && d.to ? `${dmy(d.from)} – ${dmy(d.to)}` : 'Todas las fechas'}
            {d.previous && ` · comparado con ${dmy(d.previous.from)} – ${dmy(d.previous.to)}`}
          </span>
        )}
      </div>

      {dashboard.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" /> Cargando el resumen…
        </div>
      ) : dashboard.isError || !d ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el resumen: {(dashboard.error as Error | null)?.message ?? 'error desconocido'}
        </div>
      ) : (
        <div className={cn('space-y-6 transition-opacity', dashboard.isFetching && 'opacity-60')}>
          <KpiCards kpis={d.kpis} previous={d.previousKpis} />

          <div className="grid gap-6 lg:grid-cols-3">
            <TrendChart trend={d.trend} className="lg:col-span-2" />
            <RetailerSales rows={d.byRetailer} />
          </div>

          <ConciliationPanel conciliation={d.conciliation} />

          <div className="grid gap-6 lg:grid-cols-2">
            <TopProducts products={d.topProducts} />
            <DispatchPanel dispatch={d.dispatch} />
          </div>

          <AlertsPanel alerts={d.alerts} conciliation={d.conciliation.totals} />
        </div>
      )}
    </div>
  );
}

/* ---------- Componentes ---------- */

function Card({
  title,
  subtitle,
  icon,
  action,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('rounded-lg border border-slate-200 bg-white', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          {icon && (
            <span className="grid size-8 place-items-center rounded-md bg-brand-50 text-brand-600">{icon}</span>
          )}
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function LinkAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
      {children} <ArrowRight className="size-3" />
    </Link>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-slate-400">{children}</p>;
}

/** Variación % contra el período anterior */
function Delta({ now, before }: { now: number; before: number | undefined }) {
  if (before === undefined) return null;
  if (before === 0) {
    return now > 0 ? <span className="text-xs text-slate-400">sin ventas en el período anterior</span> : null;
  }
  const pct = ((now - before) / before) * 100;
  const up = pct >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium',
        up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
      )}
    >
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(pct).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%
    </span>
  );
}

function KpiCards({ kpis, previous }: { kpis: SalesKpis; previous: SalesKpis | null }) {
  const cards = [
    { label: 'Venta bruta', value: clp(kpis.revenue), now: kpis.revenue, before: previous?.revenue, icon: CircleDollarSign, note: 'con IVA' },
    { label: 'Unidades vendidas', value: int(kpis.units), now: kpis.units, before: previous?.units, icon: Package },
    { label: 'Órdenes', value: int(kpis.orders), now: kpis.orders, before: previous?.orders, icon: ShoppingCart, note: kpis.cancelledOrders > 0 ? `${int(kpis.cancelledOrders)} canceladas` : undefined },
    { label: 'Ticket promedio', value: clp(kpis.avgTicket), now: kpis.avgTicket, before: previous?.avgTicket, icon: Receipt, note: 'por orden' },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ label, value, now, before, icon: Icon, note }) => (
        <div key={label} className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-sm">{label}</span>
            <Icon className="size-4" />
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-2">
            <Delta now={now} before={before} />
            {note && <span className="text-xs text-slate-400">{note}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ trend, className }: { trend: Dashboard['trend']; className?: string }) {
  const { points, granularity } = trend;
  const max = Math.max(...points.map((p) => p.revenue), 0);
  // Muestra como máximo ~8 etiquetas en el eje
  const every = Math.max(1, Math.ceil(points.length / 8));

  return (
    <Card
      title={granularity === 'day' ? 'Ventas por día' : 'Ventas por mes'}
      subtitle="Venta bruta con IVA, sin canceladas"
      className={className}
    >
      {points.length === 0 || max === 0 ? (
        <Empty>No hay ventas en este período.</Empty>
      ) : (
        <div className="px-5 pt-6 pb-4">
          <div className="flex h-56 gap-3">
            {/* Eje Y */}
            <div className="flex flex-col justify-between pb-6 text-right text-[11px] text-slate-400 tabular-nums">
              <span>{clpShort(max)}</span>
              <span>{clpShort(max / 2)}</span>
              <span>$0</span>
            </div>
            <div className="relative flex-1">
              {/* Líneas guía */}
              <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="border-t border-dashed border-slate-100" />
                ))}
              </div>
              <div className="absolute inset-0 flex items-end gap-[3px]">
                {points.map((p, i) => (
                  <div key={p.date} className="group relative flex h-full flex-1 flex-col justify-end">
                    <div className="relative flex-1 pb-6">
                      <div className="flex h-full items-end">
                        <div
                          className="w-full rounded-t bg-brand-500/80 transition-colors group-hover:bg-brand-600"
                          style={{ height: `${(p.revenue / max) * 100}%`, minHeight: p.revenue > 0 ? 2 : 0 }}
                        />
                      </div>
                    </div>
                    {/* Etiqueta del eje X */}
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap text-slate-400">
                      {i % every === 0 ? pointLabel(p.date, granularity) : ''}
                    </span>
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg group-hover:block">
                      <p className="font-medium">
                        {granularity === 'day' ? dmy(p.date) : pointLabel(p.date, 'month')}
                      </p>
                      <p>{clp(p.revenue)}</p>
                      <p className="text-slate-300">
                        {int(p.units)} {p.units === 1 ? 'unidad' : 'unidades'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function RetailerSales({ rows }: { rows: Dashboard['byRetailer'] }) {
  return (
    <Card title="Ventas por retailer" subtitle="Participación en la venta del período">
      {rows.length === 0 ? (
        <Empty>Sin ventas.</Empty>
      ) : (
        <div className="space-y-4 px-5 py-5">
          {/* Barra apilada con la participación */}
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
            {rows.map((r) => (
              <div key={r.code} className={retailerColor(r.code)} style={{ width: `${r.share}%` }} title={r.label} />
            ))}
          </div>
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.code} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <span className={cn('size-2.5 rounded-full', retailerColor(r.code))} />
                    {r.label}
                  </span>
                  <span className="tabular-nums">{clp(r.revenue)}</span>
                </div>
                <div className="mt-0.5 flex justify-between pl-[18px] text-xs text-slate-500">
                  <span>
                    {int(r.units)} {r.units === 1 ? 'unidad' : 'unidades'} · {int(r.orders)}{' '}
                    {r.orders === 1 ? 'orden' : 'órdenes'}
                  </span>
                  <span className="tabular-nums">
                    {r.share.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Money({ value, signed }: { value: number; signed?: boolean }) {
  return (
    <span
      className={cn(
        'tabular-nums',
        signed && value > 0 && 'text-emerald-700',
        signed && value < 0 && 'text-red-700',
      )}
    >
      {signed && value > 0 ? '+' : ''}
      {clp(value)}
    </span>
  );
}

function ConciliationPanel({ conciliation }: { conciliation: Dashboard['conciliation'] }) {
  const { retailers, totals } = conciliation;
  const tiles = [
    { label: 'Neto liquidado', value: <Money value={totals.resultNet} />, note: 'de las ventas con resultado' },
    { label: 'Debíamos recibir', value: <Money value={totals.expected} />, note: 'según costo, sin IVA' },
    {
      label: totals.result >= 0 ? 'Ganancia' : 'Pérdida',
      value: <Money value={totals.result} signed />,
      note: 'Neto − Debíamos recibir',
      strong: true,
    },
    {
      label: 'Por cobrar',
      value: <Money value={totals.pendingAmount} />,
      note: `${int(totals.pendingCount)} ${totals.pendingCount === 1 ? 'venta aún no pagada' : 'ventas aún no pagadas'}`,
    },
  ];

  return (
    <Card
      title="Conciliación"
      subtitle="Acumulado de todas las ventas y liquidaciones cargadas (no depende del período)"
      icon={<Wallet className="size-4" />}
      action={<LinkAction href="/conciliacion">Ver detalle</LinkAction>}
    >
      {retailers.length === 0 ? (
        <Empty>Aún no hay liquidaciones cargadas.</Empty>
      ) : (
        <>
          <div className="grid gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="bg-white px-5 py-4">
                <p className="text-xs text-slate-500">{t.label}</p>
                <p className={cn('mt-1 text-xl font-semibold', t.strong && 'text-2xl')}>{t.value}</p>
                <p className="mt-0.5 text-xs text-slate-400">{t.note}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-5 py-2.5 font-medium">Retailer</th>
                  <th className="px-3 py-2.5 text-right font-medium">Neto</th>
                  <th className="px-3 py-2.5 text-right font-medium">Debíamos recibir</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="px-3 py-2.5 text-right font-medium">Por cobrar</th>
                  <th className="px-3 py-2.5 text-right font-medium">Multas</th>
                  <th className="px-5 py-2.5 text-right font-medium">Revisar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {retailers.map((r) => {
                  const review = r.withDifference + r.rowsWithoutCost + r.rowsWithoutSale;
                  return (
                    <tr key={r.code} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5">
                        <span className="flex items-center gap-2 font-medium">
                          <span className={cn('size-2.5 rounded-full', retailerColor(r.code))} />
                          {r.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Money value={r.resultNet} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Money value={r.expected} />
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium">
                        <Money value={r.result} signed />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Money value={r.pendingAmount} />
                        {r.pendingCount > 0 && (
                          <span className="ml-1 text-xs text-slate-400">({int(r.pendingCount)})</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {r.penalties !== 0 ? <Money value={r.penalties} signed /> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        {review > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                            title={[
                              r.withDifference && `${r.withDifference} con diferencia`,
                              r.rowsWithoutCost && `${r.rowsWithoutCost} sin costo`,
                              r.rowsWithoutSale && `${r.rowsWithoutSale} pagos sin venta`,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          >
                            <AlertTriangle className="size-3" /> {int(review)}
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-600">Al día</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                  <td className="px-5 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right">
                    <Money value={totals.resultNet} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Money value={totals.expected} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Money value={totals.result} signed />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Money value={totals.pendingAmount} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {totals.penalties !== 0 ? <Money value={totals.penalties} signed /> : '—'}
                  </td>
                  <td className="px-5 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function TopProducts({ products }: { products: Dashboard['topProducts'] }) {
  const max = Math.max(...products.map((p) => p.units), 0);
  return (
    <Card
      title="Top 5 productos"
      subtitle="Más vendidos en unidades, todos los retailers"
      icon={<Trophy className="size-4" />}
      action={<LinkAction href="/reportes">Ver reporte</LinkAction>}
    >
      {products.length === 0 ? (
        <Empty>Sin ventas en este período.</Empty>
      ) : (
        <ol className="divide-y divide-slate-100">
          {products.map((p, i) => (
            <li key={p.key} className="flex items-center gap-3 px-5 py-3">
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600',
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={p.name}>
                  {p.name}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn('h-full rounded-full', retailerColor(p.retailerCode))}
                      style={{ width: `${max ? (p.units / max) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">
                    {p.retailerLabel}
                    {p.retailerSku && ` · ${p.retailerSku}`}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{int(p.units)} u.</p>
                <p className="text-xs text-slate-500 tabular-nums">{clpShort(p.revenue)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function DeadlineBadge({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft === null) return <span className="text-xs text-slate-400">Sin fecha</span>;
  if (daysLeft < 0) {
    const n = Math.abs(daysLeft);
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        Atrasado {n} {n === 1 ? 'día' : 'días'}
      </span>
    );
  }
  if (daysLeft === 0)
    return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Hoy</span>;
  if (daysLeft === 1)
    return <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">Mañana</span>;
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">En {daysLeft} días</span>;
}

function DispatchPanel({ dispatch }: { dispatch: Dashboard['dispatch'] }) {
  return (
    <Card
      title="Despachos pendientes"
      subtitle="Órdenes aún no enviadas, por fecha límite"
      icon={<Truck className="size-4" />}
      action={<LinkAction href="/ventas/listado">Ver ventas</LinkAction>}
    >
      <div className="grid grid-cols-3 gap-px border-b border-slate-100 bg-slate-100 text-center">
        <div className="bg-white px-3 py-3">
          <p className="text-xl font-semibold tabular-nums">{int(dispatch.pending)}</p>
          <p className="text-xs text-slate-500">Pendientes</p>
        </div>
        <div className="bg-white px-3 py-3">
          <p className={cn('text-xl font-semibold tabular-nums', dispatch.dueToday > 0 && 'text-amber-600')}>
            {int(dispatch.dueToday)}
          </p>
          <p className="text-xs text-slate-500">Vencen hoy</p>
        </div>
        <div className="bg-white px-3 py-3">
          <p className={cn('text-xl font-semibold tabular-nums', dispatch.overdue > 0 && 'text-red-600')}>
            {int(dispatch.overdue)}
          </p>
          <p className="text-xs text-slate-500">Atrasados</p>
        </div>
      </div>
      {dispatch.next.length === 0 ? (
        <Empty>No hay despachos pendientes. 🎉</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {dispatch.next.map((o, i) => (
            <li key={`${o.retailerLabel}-${o.orderNumber}-${i}`} className="flex items-center gap-3 px-5 py-2.5">
              <Clock className="size-4 shrink-0 text-slate-300" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" title={o.productName ?? undefined}>
                  {o.productName ?? 'Sin nombre'}
                </p>
                <p className="text-xs text-slate-500">
                  {o.retailerLabel} · OC {o.orderNumber ?? '—'}
                  {o.deadline && ` · límite ${dmy(o.deadline)}`}
                </p>
              </div>
              <DeadlineBadge daysLeft={o.daysLeft} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AlertsPanel({
  alerts,
  conciliation,
}: {
  alerts: Dashboard['alerts'];
  conciliation: Dashboard['conciliation']['totals'];
}) {
  const items = [
    {
      count: alerts.salesWithoutCatalog,
      text: ['producto vendido que no está', 'productos vendidos que no están'],
      extra: 'en el catálogo de su retailer',
      href: '/maestras/catalogo',
      icon: Tags,
    },
    {
      count: alerts.catalogWithoutMaster,
      text: ['producto del catálogo', 'productos del catálogo'],
      extra: 'sin producto master asignado',
      href: '/maestras/catalogo',
      icon: Tags,
    },
    {
      count: alerts.mastersWithoutCost,
      text: ['producto master', 'productos master'],
      extra: 'sin costo',
      href: '/maestras/productos',
      icon: Boxes,
    },
    {
      count: conciliation.rowsWithoutCost,
      text: ['venta pagada', 'ventas pagadas'],
      extra: 'sin costo (no entran en la ganancia)',
      href: '/conciliacion',
      icon: Wallet,
    },
    {
      count: conciliation.withDifference,
      text: ['venta', 'ventas'],
      extra: 'con diferencia en la conciliación',
      href: '/conciliacion',
      icon: AlertTriangle,
    },
    {
      count: conciliation.rowsWithoutSale,
      text: ['pago', 'pagos'],
      extra: 'en liquidaciones sin venta cargada',
      href: '/ventas/cargas',
      icon: ShoppingCart,
    },
  ].filter((a) => a.count > 0);

  return (
    <Card
      title="Pendientes por revisar"
      subtitle="Datos que faltan para que los reportes y la conciliación cuadren"
      icon={<AlertTriangle className="size-4" />}
    >
      {items.length === 0 ? (
        <Empty>Todo al día: no hay nada pendiente.</Empty>
      ) : (
        <ul className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ count, text, extra, href, icon: Icon }) => (
            <li key={extra} className="bg-white">
              <Link href={href} className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-amber-50 text-amber-600">
                  <Icon className="size-4" />
                </span>
                <span className="text-sm text-slate-600">
                  <span className="text-base font-semibold text-slate-900 tabular-nums">{int(count)}</span>{' '}
                  {count === 1 ? text[0] : text[1]} {extra}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}