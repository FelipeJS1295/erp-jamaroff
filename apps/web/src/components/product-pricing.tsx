'use client';

import {
  DEFAULT_PROFIT_PCT,
  DEFAULT_RETURNS_PCT,
  PRICING_CHANNELS,
  suggestedPrice,
  targetNet,
} from '@erp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, type Product, type ProductInput } from '@/lib/api';
import { cn } from '@/lib/cn';

/** 185000 -> "$185.000" */
function clp(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

/** "20.00" -> "20%"  ·  "15.50" -> "15,5%" */
function pct(value: string | null) {
  if (value === null) return '—';
  return `${Number(value).toLocaleString('es-CL', { maximumFractionDigits: 2 })}%`;
}

/** "105.000" / "$105.000" / "105000" -> 105000  ·  vacío -> null */
function parseAmount(text: string): number | null {
  const clean = text.replace(/[$\s.]/g, '').replace(',', '.');
  if (clean === '') return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** "20" / "20,5" / "20%" -> 20.5  ·  vacío -> null */
function parsePct(text: string): number | null {
  const clean = text.replace(/[%\s]/g, '').replace(',', '.');
  if (clean === '') return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** Número guardado -> texto para editar: "27990.00" -> "27990" · "15.50" -> "15,5" */
function toInput(value: string | null) {
  return value === null ? '' : String(Number(value)).replace('.', ',');
}

/**
 * Productos master con su precio sugerido para publicar en cada retailer.
 * Tabla de solo lectura + formulario (modal) para crear o editar.
 */
export function ProductPricing() {
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ['products'], queryFn: api.listProducts });
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: api.deleteProduct,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
    onError: (err: Error) => setError(err.message),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (products.data ?? []).filter(
      (p) => !term || p.skuMaster.toLowerCase().includes(term) || p.name.toLowerCase().includes(term),
    );
  }, [products.data, search]);

  function confirmRemove(p: Product) {
    if (window.confirm(`¿Eliminar el producto "${p.name}" (${p.skuMaster})?`)) remove.mutate(p.id);
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por SKU master o nombre…"
            className="w-full rounded-md border border-slate-300 bg-white py-1.5 pr-2 pl-8 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
          />
        </div>
        <p className="text-sm text-slate-500">
          {products.data
            ? `${products.data.length} ${products.data.length === 1 ? 'producto' : 'productos'}`
            : ''}
        </p>
        <button
          onClick={() => setEditing('new')}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-600"
        >
          <Plus className="size-4" /> Agregar producto
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="bg-slate-50">
                <th
                  rowSpan={2}
                  className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-2 text-left font-medium"
                >
                  Producto
                </th>
                <th rowSpan={2} className="border-b border-slate-200 px-3 py-2 text-right font-medium">
                  Costo
                </th>
                <th rowSpan={2} className="border-b border-slate-200 px-3 py-2 text-right font-medium">
                  Util.
                </th>
                <th rowSpan={2} className="border-b border-slate-200 px-3 py-2 text-right font-medium">
                  Dev.
                </th>
                <th
                  rowSpan={2}
                  className="border-b border-slate-200 px-3 py-2 text-right font-medium"
                  title="Neto que debemos recibir: costo × (1 + utilidad + devoluciones)"
                >
                  A recibir
                </th>
                {PRICING_CHANNELS.map((ch) => (
                  <th
                    key={ch.code}
                    colSpan={3}
                    className="border-b border-l border-slate-200 px-3 py-1.5 text-center font-semibold text-slate-700"
                  >
                    {ch.label}
                  </th>
                ))}
                <th rowSpan={2} className="w-16 border-b border-slate-200" />
              </tr>
              <tr className="bg-slate-50">
                {PRICING_CHANNELS.map((ch) => (
                  <SubHeaders key={ch.code} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.isLoading ? (
                <tr>
                  <td colSpan={18} className="py-14 text-center text-slate-500">
                    <Loader2 className="mr-2 inline size-4 animate-spin" /> Cargando…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={18} className="py-14 text-center text-slate-500">
                    {search ? 'No hay resultados para la búsqueda.' : 'Aún no hay productos.'}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="group hover:bg-slate-50">
                    {/* Columna fija al hacer scroll horizontal */}
                    <td className="sticky left-0 z-10 bg-white px-4 py-2.5 group-hover:bg-slate-50">
                      <p className="font-medium whitespace-nowrap">{p.name}</p>
                      <p className="font-mono text-[11px] text-slate-500">{p.skuMaster}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{clp(p.provisionalCost)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{pct(p.profitPct)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{pct(p.returnsPct)}</td>
                    <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap tabular-nums">
                      {clp(p.targetNet)}
                    </td>
                    {PRICING_CHANNELS.map((ch) => {
                      const c = p.channels[ch.code];
                      return (
                        <ChannelCells
                          key={ch.code}
                          commissionPct={c?.commissionPct ?? null}
                          logisticsCost={c?.logisticsCost ?? null}
                          price={c?.suggestedPrice ?? null}
                          net={c?.netAtPrice ?? null}
                        />
                      );
                    })}
                    <td className="px-2 py-2.5">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => setEditing(p)}
                          title="Editar"
                          className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={() => confirmRemove(p)}
                          title="Eliminar"
                          className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-700"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-3 text-xs text-slate-500">
        Precio sugerido = (a recibir × 1,19 + logística) ÷ (1 − comisión), redondeado hacia arriba a
        …990. Todo en neto: el IVA de la venta se paga al SII y el de la comisión y la logística se
        recupera. Pasa el mouse sobre un precio para ver cuánto queda neto.
      </p>

      {editing && (
        <ProductDialog
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ['products'] });
          }}
        />
      )}
    </div>
  );
}

function SubHeaders() {
  return (
    <>
      <th className="border-b border-l border-slate-200 px-3 py-1.5 text-right font-medium">Com.</th>
      <th className="border-b border-slate-200 px-3 py-1.5 text-right font-medium">Log.</th>
      <th className="border-b border-slate-200 px-3 py-1.5 text-right font-medium">Publicar</th>
    </>
  );
}

function ChannelCells(props: {
  commissionPct: string | null;
  logisticsCost: string | null;
  price: number | null;
  net: number | null;
}) {
  const { commissionPct, logisticsCost, price, net } = props;
  return (
    <>
      <td className="border-l border-slate-100 px-3 py-2.5 text-right text-slate-600 tabular-nums">
        {pct(commissionPct)}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-600 tabular-nums">{clp(logisticsCost)}</td>
      <td
        className="px-3 py-2.5 text-right font-semibold whitespace-nowrap text-brand-700 tabular-nums"
        title={net !== null ? `Publicando a ${clp(price)} quedan ${clp(net)} netos` : 'Falta la comisión'}
      >
        {price !== null ? clp(price) : <span className="font-normal text-slate-300">—</span>}
      </td>
    </>
  );
}

/** Formulario para crear o editar un producto, con vista previa del precio en cada retailer */
function ProductDialog(props: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const { product, onClose, onSaved } = props;
  const [form, setForm] = useState(() => ({
    skuMaster: product?.skuMaster ?? '',
    name: product?.name ?? '',
    provisionalCost: product ? toInput(product.provisionalCost) : '',
    profitPct: product ? toInput(product.profitPct) : String(DEFAULT_PROFIT_PCT),
    returnsPct: product ? toInput(product.returnsPct) : String(DEFAULT_RETURNS_PCT),
    channels: Object.fromEntries(
      PRICING_CHANNELS.map(({ code }) => [
        code,
        {
          commissionPct: toInput(product?.channels[code]?.commissionPct ?? null),
          logisticsCost: toInput(product?.channels[code]?.logisticsCost ?? null),
        },
      ]),
    ) as Record<string, { commissionPct: string; logisticsCost: string }>,
  }));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const data: ProductInput = {
        skuMaster: form.skuMaster,
        name: form.name,
        provisionalCost: form.provisionalCost,
        profitPct: form.profitPct,
        returnsPct: form.returnsPct,
        channels: Object.fromEntries(
          Object.entries(form.channels).map(([code, c]) => [
            code,
            { commissionPct: c.commissionPct || null, logisticsCost: c.logisticsCost || null },
          ]),
        ),
      };
      return product ? api.updateProduct(product.id, data) : api.createProduct(data);
    },
    onSuccess: onSaved,
    onError: (err: Error) => setError(err.message),
  });

  // Vista previa con la misma fórmula que usa el backend
  const cost = parseAmount(form.provisionalCost) ?? 0;
  const profit = parsePct(form.profitPct) ?? 0;
  const returns = parsePct(form.returnsPct) ?? 0;
  const net = targetNet(cost, profit, returns);

  const setChannel = (code: string, field: 'commissionPct' | 'logisticsCost', value: string) =>
    setForm((f) => ({ ...f, channels: { ...f.channels, [code]: { ...f.channels[code], [field]: value } } }));

  const input =
    'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none';
  const label = 'mb-1 block text-xs font-medium text-slate-600';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold">{product ? 'Editar producto' : 'Nuevo producto'}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="space-y-5 px-5 py-4"
        >
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>SKU master</label>
              <input
                autoFocus
                value={form.skuMaster}
                onChange={(e) => setForm({ ...form, skuMaster: e.target.value })}
                placeholder="SEC-RICHTER"
                className={cn(input, 'font-mono uppercase')}
              />
            </div>
            <div className="col-span-2">
              <label className={label}>Nombre</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Seccional Richter"
                className={input}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className={label}>Costo momentáneo (neto)</label>
              <input
                value={form.provisionalCost}
                onChange={(e) => setForm({ ...form, provisionalCost: e.target.value })}
                placeholder="105000"
                inputMode="decimal"
                className={cn(input, 'text-right tabular-nums')}
              />
            </div>
            <div>
              <label className={label}>% Utilidad</label>
              <input
                value={form.profitPct}
                onChange={(e) => setForm({ ...form, profitPct: e.target.value })}
                inputMode="decimal"
                className={cn(input, 'text-right tabular-nums')}
              />
            </div>
            <div>
              <label className={label}>% Devoluciones</label>
              <input
                value={form.returnsPct}
                onChange={(e) => setForm({ ...form, returnsPct: e.target.value })}
                inputMode="decimal"
                className={cn(input, 'text-right tabular-nums')}
              />
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-1.5">
              <p className="text-xs text-slate-500">A recibir (neto)</p>
              <p className="text-lg font-semibold tabular-nums">{clp(Math.round(net))}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Comisión y logística por retailer</p>
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Retailer</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">Comisión %</th>
                    <th className="w-32 px-3 py-2 text-right font-medium">Logística $</th>
                    <th className="w-36 px-3 py-2 text-right font-medium">Publicar a</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {PRICING_CHANNELS.map((ch) => {
                    const c = form.channels[ch.code];
                    const preview = suggestedPrice({
                      cost,
                      profitPct: profit,
                      returnsPct: returns,
                      commissionPct: parsePct(c.commissionPct),
                      logisticsCost: parseAmount(c.logisticsCost),
                    });
                    return (
                      <tr key={ch.code}>
                        <td className="px-3 py-1.5 font-medium">{ch.label}</td>
                        <td className="px-3 py-1.5">
                          <input
                            value={c.commissionPct}
                            onChange={(e) => setChannel(ch.code, 'commissionPct', e.target.value)}
                            placeholder="20"
                            inputMode="decimal"
                            className={cn(input, 'py-1 text-right tabular-nums')}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={c.logisticsCost}
                            onChange={(e) => setChannel(ch.code, 'logisticsCost', e.target.value)}
                            placeholder="27990"
                            inputMode="decimal"
                            className={cn(input, 'py-1 text-right tabular-nums')}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {preview ? (
                            <>
                              <p className="font-semibold text-brand-700">{clp(preview.price)}</p>
                              <p className="text-[11px] text-slate-400">quedan {clp(Math.round(preview.netAtPrice))}</p>
                            </>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

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