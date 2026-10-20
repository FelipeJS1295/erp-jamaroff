'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { api, type OrderSuggestion, type PurchaseInvoiceDetail } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button, ErrorText, Loading, clp, dmy } from './kit';

type Pick = OrderSuggestion & { amount: string };

/**
 * Productos de la factura del proveedor (de su XML en el Portal MIPYME) y las órdenes sin
 * factura que se parecen a cada uno. Las marcadas se asignan a la factura.
 */
export function InvoiceItemsPanel({ invoice, canEdit }: { invoice: PurchaseInvoiceDetail; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(false);
  const items = useQuery({
    queryKey: ['invoice-items', invoice.id, refresh],
    queryFn: () => api.purchaseItems(invoice.id, refresh),
    enabled: open,
    retry: false,
    staleTime: 60_000,
  });
  const [picks, setPicks] = useState<Map<string, Pick>>(new Map());
  const keyOf = (o: OrderSuggestion) => `${o.retailerCode}|${o.itemKey}`;
  const toggle = (o: OrderSuggestion, price: number) =>
    setPicks((prev) => {
      const next = new Map(prev);
      if (next.has(keyOf(o))) next.delete(keyOf(o));
      else next.set(keyOf(o), { ...o, amount: String(price) });
      return next;
    });

  const assign = useMutation({
    mutationFn: async () => {
      const byRetailer = new Map<string, Pick[]>();
      for (const p of picks.values()) byRetailer.set(p.retailerCode, [...(byRetailer.get(p.retailerCode) ?? []), p]);
      for (const [retailerCode, list] of byRetailer) {
        await api.createPurchaseDocument({
          supplier: invoice.supplier,
          documentNumber: invoice.documentNumber,
          issueDate: invoice.issueDate,
          retailerCode,
          lines: list.map((p) => ({
            itemKey: p.itemKey,
            orderNumber: p.orderNumber,
            productName: p.productName,
            amountNet: String(Math.round(Number(p.amount.replace(/[^\d]/g, '')) || 0)),
          })),
        });
      }
      return picks.size;
    },
    onSuccess: () => {
      setPicks(new Map());
      for (const key of ['invoice', 'invoices', 'invoice-items', 'sales', 'reconciliation', 'vat']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
        <Sparkles className="size-4" />
        Lee los productos de la factura en el SII y te sugiere a qué órdenes corresponden.
        <Button variant="secondary" className="ml-auto" onClick={() => setOpen(true)}>
          Ver productos y sugerencias
        </Button>
      </div>
    );
  }

  const assignedNet = [...picks.values()].reduce((n, p) => n + (Number(p.amount.replace(/[^\d]/g, '')) || 0), 0);
  return (
    <section className="rounded-md border border-slate-200">
      <header className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Productos de la factura (SII)</h3>
        <button
          onClick={() => setRefresh(true)}
          className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          title="Volver a leer el XML desde el SII"
        >
          <RefreshCw className={cn('size-3', items.isFetching && 'animate-spin')} /> Releer
        </button>
      </header>
      <ErrorText error={items.error ?? assign.error} />
      {items.isLoading && <Loading />}
      {assign.isSuccess && (
        <p className="flex items-center gap-2 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="size-4" /> {assign.data} orden(es) asignadas a la factura.
        </p>
      )}
      {items.data && (
        <ul className="divide-y divide-slate-100 text-sm">
          {items.data.items.map((item) => (
            <li key={item.line} className="px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    {item.code && `Código ${item.code} · `}
                    {item.quantity} {item.unit ?? 'un'} × {clp(item.price)} neto
                  </p>
                </div>
                <p className="shrink-0 font-medium tabular-nums">{clp(item.amount)}</p>
              </div>
              {item.suggestions.length === 0 ? (
                <p className="mt-1 text-xs text-slate-400">Sin órdenes parecidas pendientes de factura.</p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {item.suggestions.map((o) => {
                    const k = keyOf(o);
                    const p = picks.get(k);
                    return (
                      <li key={k} className={cn('flex items-center gap-2 rounded px-2 py-1 text-xs', p ? 'bg-brand-50' : 'bg-slate-50')}>
                        {canEdit && <input type="checkbox" checked={Boolean(p)} onChange={() => toggle(o, item.price)} className="accent-brand-600" />}
                        <span className="w-20 shrink-0 font-medium">{o.retailer}</span>
                        <span className="w-28 shrink-0 font-mono">{o.orderLabel}</span>
                        <span className="w-20 shrink-0 tabular-nums">{dmy(o.orderDate)}</span>
                        <span className="min-w-0 flex-1 truncate" title={o.productName ?? ''}>
                          {o.productName}
                        </span>
                        {o.expectedNet !== null && <span className="shrink-0 text-slate-400">costo {clp(o.expectedNet)}</span>}
                        {p && (
                          <input
                            value={p.amount}
                            onChange={(e) => setPicks((prev) => new Map(prev).set(k, { ...p, amount: e.target.value }))}
                            className="w-24 rounded border border-slate-300 px-1.5 py-0.5 text-right tabular-nums"
                            title="Neto que se asigna a esta orden"
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && picks.size > 0 && (
        <div className="flex items-center gap-3 border-t border-slate-100 px-3 py-2 text-sm">
          <span className="text-slate-600">
            {picks.size} orden(es) · neto {clp(assignedNet)}
          </span>
          <Button className="ml-auto" onClick={() => assign.mutate()} loading={assign.isPending}>
            Asignar a la factura
          </Button>
        </div>
      )}
    </section>
  );
}
