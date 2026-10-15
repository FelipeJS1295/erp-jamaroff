'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { api, type SaleRow } from '@/lib/api';

/** IVA Chile */
const VAT_RATE = 1.19;

/** "209.980" -> 209980 · vacío o inválido -> null */
function parseAmount(text: string): number | null {
  const clean = text.replace(/[$\s.]/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/**
 * Boleta al cliente final de una orden: N° y total con IVA (producto + envío).
 * Si la orden ya tiene boleta, se edita (o se quita).
 */
export function ReceiptDialog({ sale, onClose }: { sale: SaleRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [number, setNumber] = useState(sale.receipt?.number ?? '');
  const [total, setTotal] = useState(sale.receipt ? String(sale.receipt.totalGross) : '');
  const [error, setError] = useState<string | null>(null);

  const amount = parseAmount(total);
  const done = () => {
    queryClient.invalidateQueries({ queryKey: ['sales'] });
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      if (!number.trim()) throw new Error('Escribe el N° de boleta');
      if (amount === null || amount <= 0) throw new Error('Escribe el total de la boleta (mayor a 0)');
      return api.saveReceipt({
        retailerCode: sale.retailerCode,
        orderNumber: sale.orderNumber!,
        receiptNumber: number.trim(),
        totalGross: String(amount),
      });
    },
    onSuccess: done,
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteReceipt(sale.receipt!.id),
    onSuccess: done,
    onError: (err: Error) => setError(err.message),
  });

  const input =
    'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">{sale.receipt ? 'Editar boleta' : 'Agregar boleta'}</h2>
            <p className="text-xs text-slate-500">
              {sale.retailer} · OC {sale.orderLabel ?? sale.orderNumber}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
          className="space-y-4 px-5 py-4"
        >
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {sale.productName ?? 'Sin nombre'}
            {sale.salePrice !== null && (
              <span className="block text-xs text-slate-500">Precio del producto: {clp(sale.salePrice)}</span>
            )}
          </p>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">N° de boleta</span>
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Ej: 10234"
              autoFocus
              className={input}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Total de la boleta (con IVA)</span>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-slate-400">
                $
              </span>
              <input
                inputMode="numeric"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="Producto + envío"
                className={`${input} pl-6 tabular-nums`}
              />
            </div>
            {amount !== null && amount > 0 && (
              <span className="mt-1 block text-xs text-slate-500">
                Neto {clp(amount / VAT_RATE)} · IVA {clp(amount - amount / VAT_RATE)}
              </span>
            )}
          </label>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
            {sale.receipt ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿Quitar la boleta N° ${sale.receipt!.number} de esta orden?`)) remove.mutate();
                }}
                disabled={remove.isPending}
                className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:underline disabled:opacity-50"
              >
                <Trash2 className="size-4" /> Quitar boleta
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={save.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {save.isPending && <Loader2 className="size-4 animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}