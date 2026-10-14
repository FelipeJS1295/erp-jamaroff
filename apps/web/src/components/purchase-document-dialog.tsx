'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { api, type ReconciliationRow } from '@/lib/api';

/** IVA Chile */
const VAT_RATE = 1.19;

/** "125.000" -> 125000 · vacío o inválido -> null */
function parseAmount(text: string): number | null {
  const clean = text.replace(/[$\s.]/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/**
 * Agrega un documento de compra (factura del proveedor) a las órdenes seleccionadas.
 * Cada orden lleva su monto neto (sin IVA).
 */
export function PurchaseDocumentDialog(props: {
  retailerCode: string;
  rows: ReconciliationRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { retailerCode, rows, onClose, onSaved } = props;
  const queryClient = useQueryClient();
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: api.suppliers });

  const [supplier, setSupplier] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [amounts, setAmounts] = useState<string[]>(() => rows.map(() => ''));
  const [error, setError] = useState<string | null>(null);

  const parsed = amounts.map(parseAmount);
  const totalNet = parsed.reduce<number>((sum, n) => sum + (n ?? 0), 0);

  const save = useMutation({
    mutationFn: () => {
      if (!supplier.trim()) throw new Error('Escribe el proveedor');
      if (!documentNumber.trim()) throw new Error('Escribe el N° de documento');
      const missing = parsed.findIndex((n) => n === null || n <= 0);
      if (missing >= 0) {
        throw new Error(`Falta el monto (mayor a 0) de "${rows[missing].productName ?? rows[missing].orderNumber}"`);
      }
      return api.createPurchaseDocument({
        supplier: supplier.trim(),
        documentNumber: documentNumber.trim(),
        retailerCode,
        lines: rows.map((r, i) => ({
          itemKey: r.itemId!,
          orderNumber: r.orderNumber,
          productName: r.productName,
          amountNet: String(parsed[i]),
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      onSaved();
    },
    onError: (err: Error) => setError(err.message),
  });

  const input =
    'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">Agregar documento</h2>
            <p className="text-xs text-slate-500">
              {rows.length} {rows.length === 1 ? 'orden seleccionada' : 'órdenes seleccionadas'}
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
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Proveedor</span>
              <input
                list="suppliers-list"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Ej: Muebles Sur"
                autoFocus
                className={input}
              />
              <datalist id="suppliers-list">
                {suppliers.data?.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">N° de documento</span>
              <input
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="Ej: 12345"
                className={input}
              />
            </label>
          </div>

          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="w-40 px-3 py-2 font-medium">Monto sin IVA</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">Con IVA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={r.itemId} className="align-top">
                    <td className="px-3 py-2">
                      <p className="text-slate-800">{r.productName ?? 'Sin nombre'}</p>
                      <p className="font-mono text-xs text-slate-400">OC {r.orderNumber ?? r.itemId}</p>
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-slate-400">
                          $
                        </span>
                        <input
                          inputMode="numeric"
                          value={amounts[i]}
                          onChange={(e) =>
                            setAmounts((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))
                          }
                          placeholder="0"
                          className={`${input} pl-6 text-right tabular-nums`}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-slate-500 tabular-nums">
                      {parsed[i] ? clp(parsed[i]! * VAT_RATE) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{clp(totalNet)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{clp(totalNet * VAT_RATE)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            Ingresa los montos <strong>sin IVA</strong>; el IVA (19%) se calcula solo. Si el
            proveedor ya tiene un documento con ese número, las órdenes se agregan a ese mismo
            documento.
          </p>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
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
              Guardar documento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}