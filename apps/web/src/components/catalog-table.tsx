'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';

/** Una fila de la maestra, con nombres comunes (sirve para productos e insumos) */
export interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  /** Costo neto como texto exacto: "185000.00" */
  cost: string;
}

export interface CatalogDraft {
  sku: string;
  name: string;
  cost: string;
}

interface CatalogTableProps {
  queryKey: string;
  labels: { sku: string; name: string; cost: string; singular: string; plural: string };
  placeholders: { sku: string; name: string };
  list: () => Promise<CatalogItem[]>;
  create: (draft: CatalogDraft) => Promise<unknown>;
  update: (id: string, draft: CatalogDraft) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}

const EMPTY: CatalogDraft = { sku: '', name: '', cost: '' };

/** "185000.00" -> "$185.000"  ·  "4500.50" -> "$4.500,5" */
export function formatCLP(value: string) {
  return Number(value).toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 2,
  });
}

/** "185000.00" -> "185000"  ·  "4500.50" -> "4500,5" (para editar) */
function costToInput(value: string) {
  return String(Number(value)).replace('.', ',');
}

/**
 * Tabla editable de una maestra (productos master o insumos):
 * buscar, agregar, editar en la misma fila y eliminar.
 */
export function CatalogTable({ queryKey, labels, placeholders, list, create, update, remove }: CatalogTableProps) {
  const queryClient = useQueryClient();
  const items = useQuery({ queryKey: [queryKey], queryFn: list });

  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<CatalogDraft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<CatalogDraft>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: [queryKey] });
  const onError = (err: Error) => setError(err.message);

  const createMutation = useMutation({
    mutationFn: create,
    onSuccess: () => {
      setNewDraft(EMPTY);
      setAdding(false);
      setError(null);
      refresh();
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: CatalogDraft }) => update(id, draft),
    onSuccess: () => {
      setEditingId(null);
      setError(null);
      refresh();
    },
    onError,
  });

  const removeMutation = useMutation({
    mutationFn: remove,
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items.data ?? [];
    return (items.data ?? []).filter(
      (i) => i.sku.toLowerCase().includes(term) || i.name.toLowerCase().includes(term),
    );
  }, [items.data, search]);

  function startEdit(item: CatalogItem) {
    setEditingId(item.id);
    setEditDraft({ sku: item.sku, name: item.name, cost: costToInput(item.cost) });
    setError(null);
  }

  function confirmRemove(item: CatalogItem) {
    if (window.confirm(`¿Eliminar ${labels.singular} "${item.name}" (${item.sku})?`)) {
      removeMutation.mutate(item.id);
    }
  }

  const inputClass =
    'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none';

  return (
    <div>
      {/* Barra superior: buscador + agregar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Buscar por ${labels.sku} o nombre…`}
            className={cn(inputClass, 'py-1.5 pl-8')}
          />
        </div>
        <p className="text-sm text-slate-500">
          {items.data
            ? `${items.data.length.toLocaleString('es-CL')} ${items.data.length === 1 ? labels.singular : labels.plural}`
            : ''}
        </p>
        <button
          onClick={() => {
            setAdding(true);
            setError(null);
          }}
          disabled={adding}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-600 disabled:opacity-50"
        >
          <Plus className="size-4" /> Agregar {labels.singular}
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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <th className="w-48 px-4 py-2.5 font-medium">{labels.sku}</th>
              <th className="px-4 py-2.5 font-medium">{labels.name}</th>
              <th className="w-44 px-4 py-2.5 text-right font-medium">{labels.cost}</th>
              <th className="w-24 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* Fila para agregar */}
            {adding && (
              <tr className="bg-brand-50/60">
                <td className="px-4 py-2">
                  <input
                    autoFocus
                    value={newDraft.sku}
                    onChange={(e) => setNewDraft({ ...newDraft, sku: e.target.value })}
                    placeholder={placeholders.sku}
                    className={cn(inputClass, 'font-mono uppercase')}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    value={newDraft.name}
                    onChange={(e) => setNewDraft({ ...newDraft, name: e.target.value })}
                    placeholder={placeholders.name}
                    className={inputClass}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    value={newDraft.cost}
                    onChange={(e) => setNewDraft({ ...newDraft, cost: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && createMutation.mutate(newDraft)}
                    placeholder="0"
                    inputMode="decimal"
                    className={cn(inputClass, 'text-right tabular-nums')}
                  />
                </td>
                <td className="px-4 py-2">
                  <RowActions
                    busy={createMutation.isPending}
                    onSave={() => createMutation.mutate(newDraft)}
                    onCancel={() => {
                      setAdding(false);
                      setNewDraft(EMPTY);
                      setError(null);
                    }}
                  />
                </td>
              </tr>
            )}

            {items.isLoading ? (
              <tr>
                <td colSpan={4} className="py-14 text-center text-slate-500">
                  <Loader2 className="mr-2 inline size-4 animate-spin" />
                  Cargando…
                </td>
              </tr>
            ) : items.isError ? (
              <tr>
                <td colSpan={4} className="py-14 text-center text-red-600">
                  No se pudo obtener la lista: {items.error.message}
                </td>
              </tr>
            ) : filtered.length === 0 && !adding ? (
              <tr>
                <td colSpan={4} className="py-14 text-center text-slate-500">
                  {search ? 'No hay resultados para la búsqueda.' : `Aún no hay ${labels.plural}.`}
                </td>
              </tr>
            ) : (
              filtered.map((item) =>
                editingId === item.id ? (
                  <tr key={item.id} className="bg-amber-50/60">
                    <td className="px-4 py-2">
                      <input
                        value={editDraft.sku}
                        onChange={(e) => setEditDraft({ ...editDraft, sku: e.target.value })}
                        className={cn(inputClass, 'font-mono uppercase')}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        autoFocus
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editDraft.cost}
                        onChange={(e) => setEditDraft({ ...editDraft, cost: e.target.value })}
                        onKeyDown={(e) =>
                          e.key === 'Enter' && updateMutation.mutate({ id: item.id, draft: editDraft })
                        }
                        inputMode="decimal"
                        className={cn(inputClass, 'text-right tabular-nums')}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <RowActions
                        busy={updateMutation.isPending}
                        onSave={() => updateMutation.mutate({ id: item.id, draft: editDraft })}
                        onCancel={() => {
                          setEditingId(null);
                          setError(null);
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id} className="group hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs">{item.sku}</td>
                    <td className="px-4 py-2.5">{item.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCLP(item.cost)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => startEdit(item)}
                          title="Editar"
                          className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={() => confirmRemove(item)}
                          title="Eliminar"
                          className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-700"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function RowActions({ busy, onSave, onCancel }: { busy: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <button
        onClick={onSave}
        disabled={busy}
        title="Guardar"
        className="rounded p-1 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
      </button>
      <button onClick={onCancel} title="Cancelar" className="rounded p-1 text-slate-500 hover:bg-slate-200">
        <X className="size-4" />
      </button>
    </div>
  );
}