'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/** "2026-10-05" -> "05/10/2026" (sin pasar por Date, para no correr el día por zona horaria) */
function formatDate(value: string | null) {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export default function VerVentasPage() {
  const sales = useQuery({ queryKey: ['sales'], queryFn: api.listSales });

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="mt-1 text-sm text-slate-500">
            {sales.data
              ? `${sales.data.length.toLocaleString('es-CL')} ventas cargadas, las más recientes primero.`
              : 'Ventas cargadas desde los archivos de cada retailer.'}
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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Retailer</th>
                  <th className="px-4 py-2.5 font-medium">N° orden</th>
                  <th className="px-4 py-2.5 font-medium">Fecha de creación</th>
                  <th className="px-4 py-2.5 font-medium">Límite despacho</th>
                  <th className="px-4 py-2.5 font-medium">Producto</th>
                  <th className="px-4 py-2.5 font-medium">Courier</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.data?.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{s.retailer}</td>
                    <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                      {s.orderNumber ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                      {formatDate(s.orderDate)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                      {formatDate(s.dispatchDeadline)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{s.productName ?? '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                      {s.carrier?.toUpperCase() ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {s.status ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {s.status}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}