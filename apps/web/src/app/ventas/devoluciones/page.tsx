'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileMinus, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/components/auth';
import { CreditNoteDialog } from '@/components/credit-note-dialog';
import { Badge, Button, ErrorText, Loading, PageHeader, Stat, clp, dmy, td, th } from '@/components/kit';
import { RETURN_STATUS, ReturnDialog, SUPPLIER_ACTION } from '@/components/return-dialog';
import { api, type ProductReturn, type ReturnStatus } from '@/lib/api';
import { cn } from '@/lib/cn';

const FILTERS: { id: 'open' | 'all' | ReturnStatus; label: string }[] = [
  { id: 'open', label: 'Abiertas' },
  { id: 'all', label: 'Todas' },
  { id: 'CERRADA', label: 'Cerradas' },
];

export default function ReturnsPage() {
  const { canEdit } = useAuth();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['returns'], queryFn: api.listReturns });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('open');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ProductReturn | 'new' | null>(null);
  const [ncFor, setNcFor] = useState<ProductReturn | null>(null);
  const remove = useMutation({ mutationFn: api.deleteReturn, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['returns'] }) });

  const all = list.data ?? [];
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (r) =>
        (filter === 'all' ? true : filter === 'open' ? r.status !== 'CERRADA' && r.status !== 'RECHAZADA' : r.status === filter) &&
        (!q || r.orderNumber.toLowerCase().includes(q) || r.orderId?.toLowerCase().includes(q) || r.productName?.toLowerCase().includes(q) || r.retailer.toLowerCase().includes(q)),
    );
  }, [all, filter, search]);

  const open = all.filter((r) => r.status !== 'CERRADA' && r.status !== 'RECHAZADA');
  const withoutNc = all.filter((r) => r.receipt && !r.creditNote && r.status !== 'RECHAZADA');

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <PageHeader
        title="Devoluciones y logística inversa"
        subtitle="Cada devolución con su estado, lo que se le devolvió al cliente, lo que cobró el retailer por el retiro y lo que reconoce el proveedor."
        actions={
          canEdit && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" /> Nueva devolución
            </Button>
          )
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Devoluciones abiertas" value={open.length} />
        <Stat label="Con boleta y sin nota de crédito" value={withoutNc.length} tone={withoutNc.length ? 'amber' : undefined} />
        <Stat label="Logística inversa (total)" value={clp(all.reduce((n, r) => n + (r.reverseLogisticsCost ?? 0), 0))} />
        <Stat label="Costo total para la empresa" value={clp(all.reduce((n, r) => n + r.netCost, 0))} tone="red" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn('rounded px-3 py-1.5 text-sm', filter === f.id ? 'bg-brand-500 font-medium text-white' : 'text-slate-600 hover:bg-slate-100')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar orden o producto"
            className="w-64 rounded-md border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-sm focus:border-brand-500 focus:outline-none"
          />
        </label>
      </div>

      <ErrorText error={list.error ?? remove.error} />
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {list.isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">No hay devoluciones con este filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <th className={th}>Solicitud</th>
                  <th className={th}>Orden</th>
                  <th className={th}>Motivo</th>
                  <th className={th}>Estado</th>
                  <th className={cn(th, 'text-right')}>Devuelto cliente</th>
                  <th className={cn(th, 'text-right')}>Logística inversa</th>
                  <th className={th}>Proveedor</th>
                  <th className={cn(th, 'text-right')}>Costo</th>
                  <th className={th}>Nota de crédito</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-slate-50">
                    <td className={cn(td, 'tabular-nums')}>
                      {dmy(r.requestedAt)}
                      {r.receivedAt && <span className="block text-xs text-slate-500">llegó {dmy(r.receivedAt)}</span>}
                    </td>
                    <td className={td}>
                      <span className="font-medium">{r.retailer}</span>
                      <span className="block font-mono text-xs">{r.retailerCode === 'WALMART' && r.orderId ? r.orderId : r.orderNumber}</span>
                      <span className="block max-w-56 text-xs text-slate-500">{r.productName}</span>
                    </td>
                    <td className={cn(td, 'max-w-56')}>
                      {r.reason}
                      <span className="block text-xs text-slate-500">
                        {r.scope === 'TOTAL' ? 'Toda la orden' : 'Parcial'}
                        {r.productCondition && ` · producto ${r.productCondition === 'BUENO' ? 'bueno' : 'dañado'}`}
                      </span>
                    </td>
                    <td className={td}>
                      <Badge tone={RETURN_STATUS[r.status].tone}>{RETURN_STATUS[r.status].label}</Badge>
                    </td>
                    <td className={cn(td, 'text-right tabular-nums')}>{clp(r.refundGross)}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>
                      {clp(r.reverseLogisticsCost)}
                      {r.settlementLogistics !== null && r.settlementLogistics !== r.reverseLogisticsCost && (
                        <span className="block text-xs text-slate-400">liquidación {clp(r.settlementLogistics)}</span>
                      )}
                    </td>
                    <td className={cn(td, 'max-w-40 text-xs')}>
                      {SUPPLIER_ACTION[r.supplierAction]}
                      {r.supplierCreditGross ? <span className="block tabular-nums">{clp(r.supplierCreditGross)}</span> : null}
                    </td>
                    <td className={cn(td, 'text-right font-semibold tabular-nums')}>{clp(r.netCost)}</td>
                    <td className={td}>
                      {r.creditNote ? (
                        <Badge tone={r.creditNote.status === 'BORRADOR' ? 'amber' : 'green'}>
                          {r.creditNote.folio ? `N° ${r.creditNote.folio}` : 'Borrador'} · {clp(r.creditNote.amountGross)}
                        </Badge>
                      ) : r.receipt ? (
                        canEdit ? (
                          <Button variant="link" onClick={() => setNcFor(r)}>
                            <FileMinus className="size-3.5" /> Crear
                          </Button>
                        ) : (
                          <span className="text-xs text-amber-600">Falta</span>
                        )
                      ) : (
                        <span className="text-xs text-slate-400">Sin boleta</span>
                      )}
                    </td>
                    <td className={cn(td, 'text-right whitespace-nowrap')}>
                      {canEdit && (
                        <>
                          <button onClick={() => setEditing(r)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Editar">
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={() => window.confirm('¿Eliminar esta devolución?') && remove.mutate(r.id)}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Eliminar"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && <ReturnDialog existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {ncFor && (
        <CreditNoteDialog
          retailerCode={ncFor.retailerCode}
          orderNumber={ncFor.orderNumber}
          orderLabel={ncFor.retailerCode === 'WALMART' ? ncFor.orderId : ncFor.orderNumber}
          defaults={{
            refCode: ncFor.scope === 'TOTAL' ? 1 : 3,
            amount: ncFor.refundGross,
            reason: `Devolución: ${ncFor.reason}`.slice(0, 90),
            returnId: ncFor.id,
          }}
          onClose={() => setNcFor(null)}
        />
      )}
    </div>
  );
}
