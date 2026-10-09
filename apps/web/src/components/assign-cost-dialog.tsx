'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { api, type MissingCostProduct, type ReconciliationRow } from '@/lib/api';
import { cn } from '@/lib/cn';

/** Lo que el usuario elige para cada producto sin costo */
interface Choice {
  /** "existing" = master que ya existe · "new" = crear un master nuevo · "cost" = poner costo al master */
  mode: 'existing' | 'new' | 'cost';
  productId: string;
  skuMaster: string;
  name: string;
  cost: string;
}

/**
 * Desde la conciliación: a cada producto de la venta que no tiene costo se le asigna un
 * producto master (uno existente o uno nuevo). Si ya tiene master pero ese master no tiene
 * costo, se le ingresa el costo.
 */
export function AssignCostDialog(props: { retailerCode: string; row: ReconciliationRow; onClose: () => void }) {
  const { retailerCode, row, onClose } = props;
  const queryClient = useQueryClient();
  const masters = useQuery({ queryKey: ['products'], queryFn: api.listProducts });

  const [choices, setChoices] = useState<Choice[]>(() =>
    row.missingProducts.map((p) => ({
      mode: p.masterId ? 'cost' : 'existing',
      productId: '',
      skuMaster: '',
      name: p.name ?? '',
      cost: '',
    })),
  );
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Choice>) =>
    setChoices((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const save = useMutation({
    mutationFn: async () => {
      for (const [i, p] of row.missingProducts.entries()) {
        const c = choices[i];
        if (c.mode === 'cost') {
          // El producto ya tiene master: solo falta su costo
          await api.updateProduct(p.masterId!, { provisionalCost: c.cost });
          continue;
        }
        let productId = c.productId;
        if (c.mode === 'new') {
          const created = await api.createProduct({ skuMaster: c.skuMaster, name: c.name, provisionalCost: c.cost });
          productId = created.id;
        }
        if (!productId) throw new Error(`Elige un producto master para "${p.name ?? p.sellerSku}"`);
        await api.manualCatalogAssign({
          retailerCode,
          sellerSku: p.sellerSku,
          name: p.name ?? p.sellerSku ?? 'Sin nombre',
          productId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const input =
    'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6">
      <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">Asignar costo</h2>
            <p className="text-xs text-slate-500">Orden {row.orderNumber}</p>
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
          {row.missingProducts.map((p, i) => (
            <ProductChoice
              key={`${p.sellerSku}-${p.name}`}
              product={p}
              choice={choices[i]}
              masters={masters.data ?? []}
              input={input}
              onChange={(patch) => update(i, patch)}
            />
          ))}

          <p className="text-xs text-slate-500">
            El producto queda unido al master en el catálogo del retailer, así que las próximas
            ventas con este SKU ya tendrán costo.
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
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProductChoice(props: {
  product: MissingCostProduct;
  choice: Choice;
  masters: { id: string; skuMaster: string; name: string }[];
  input: string;
  onChange: (patch: Partial<Choice>) => void;
}) {
  const { product: p, choice: c, masters, input, onChange } = props;
  const label = 'mb-1 block text-xs font-medium text-slate-600';

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-sm font-medium">{p.name ?? 'Sin nombre'}</p>
      <p className="mb-3 font-mono text-[11px] text-slate-500">SKU seller: {p.sellerSku ?? '— (sin SKU)'}</p>

      {c.mode === 'cost' ? (
        <div>
          <p className="mb-2 text-xs text-amber-700">
            Ya tiene el master <span className="font-mono">{p.masterSku}</span>, pero ese master no tiene costo.
          </p>
          <label className={label}>Costo momentáneo (neto) de {p.masterSku}</label>
          <input
            autoFocus
            value={c.cost}
            onChange={(e) => onChange({ cost: e.target.value })}
            placeholder="105000"
            inputMode="decimal"
            className={cn(input, 'text-right tabular-nums')}
          />
        </div>
      ) : (
        <>
          <div className="mb-3 inline-flex rounded-md border border-slate-200 p-0.5 text-xs">
            {(['existing', 'new'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChange({ mode: m })}
                className={cn(
                  'rounded px-2.5 py-1',
                  c.mode === m ? 'bg-brand-500 font-medium text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {m === 'existing' ? 'Master existente' : 'Crear master nuevo'}
              </button>
            ))}
          </div>

          {c.mode === 'existing' ? (
            <div>
              <label className={label}>Producto master</label>
              <select value={c.productId} onChange={(e) => onChange({ productId: e.target.value })} className={input}>
                <option value="">Elegir…</option>
                {masters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.skuMaster} · {m.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={label}>SKU master</label>
                <input
                  value={c.skuMaster}
                  onChange={(e) => onChange({ skuMaster: e.target.value })}
                  placeholder="SEC-RICHTER"
                  className={cn(input, 'font-mono uppercase')}
                />
              </div>
              <div>
                <label className={label}>Nombre</label>
                <input value={c.name} onChange={(e) => onChange({ name: e.target.value })} className={input} />
              </div>
              <div>
                <label className={label}>Costo (neto)</label>
                <input
                  value={c.cost}
                  onChange={(e) => onChange({ cost: e.target.value })}
                  placeholder="105000"
                  inputMode="decimal"
                  className={cn(input, 'text-right tabular-nums')}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}