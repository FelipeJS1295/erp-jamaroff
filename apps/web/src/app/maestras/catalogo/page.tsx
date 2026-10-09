'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Loader2,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCLP } from '@/components/catalog-table';
import { api, type CatalogImportResult, type CatalogRow, type Product } from '@/lib/api';
import { cn } from '@/lib/cn';

/** "2026-10-05" -> "05/10/2026" */
function formatDate(value: string | null) {
  if (!value) return '';
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}

/** Estados de publicación conocidos, en español */
const STATUS_LABELS: Record<string, string> = {
  PUBLISHED: 'Publicado',
  PUBLICADO: 'Publicado',
  UNPUBLISHED: 'No publicado',
  PENDIENTE: 'Pendiente',
  SYSTEM_PROBLEM: 'Con problema',
};

/** Estados que significan "publicado y vendiendo" (los demás se destacan en ámbar) */
const OK_STATUSES = ['PUBLISHED', 'PUBLICADO'];

export default function CatalogoRetailPage() {
  const queryClient = useQueryClient();
  const retailers = useQuery({ queryKey: ['catalog-retailers'], queryFn: api.catalogRetailers });
  const masters = useQuery({ queryKey: ['products'], queryFn: api.listProducts });

  const [retailerCode, setRetailerCode] = useState('');
  useEffect(() => {
    if (!retailerCode && retailers.data?.length) setRetailerCode(retailers.data[0].code);
  }, [retailers.data, retailerCode]);

  const catalog = useQuery({
    queryKey: ['catalog', retailerCode],
    queryFn: () => api.listCatalog(retailerCode),
    enabled: !!retailerCode,
  });

  const [search, setSearch] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMaster, setBulkMaster] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<CatalogImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['catalog', retailerCode] });
    queryClient.invalidateQueries({ queryKey: ['catalog-retailers'] });
  }
  const onError = (err: Error) => setError(err.message);

  const upload = useMutation({
    mutationFn: (file: File) => api.importCatalog(retailerCode, file),
    onSuccess: (result) => {
      setImportResult(result);
      setError(null);
      refresh();
    },
    onError,
  });

  const assign = useMutation({
    mutationFn: ({ ids, productId }: { ids: string[]; productId: string | null }) =>
      api.assignMaster(ids, productId),
    onSuccess: () => {
      setSelected(new Set());
      setBulkMaster('');
      setError(null);
      refresh();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: api.deleteCatalogItems,
    onSuccess: (_, ids) => {
      setSelected((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      setImportResult((prev) =>
        prev ? { ...prev, missing: prev.missing.filter((m) => !ids.includes(m.id)) } : prev,
      );
      setError(null);
      refresh();
    },
    onError,
  });

  function changeRetailer(code: string) {
    setRetailerCode(code);
    setSelected(new Set());
    setImportResult(null);
    setError(null);
  }

  function confirmDelete(ids: string[]) {
    const msg =
      ids.length === 1
        ? '¿Eliminar este producto del catálogo?'
        : `¿Eliminar ${ids.length} productos del catálogo?`;
    if (window.confirm(msg)) remove.mutate(ids);
  }

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (catalog.data ?? []).filter(
      (r) =>
        (!onlyUnassigned || !r.productId) &&
        (!term ||
          r.name.toLowerCase().includes(term) ||
          r.retailerSku.toLowerCase().includes(term) ||
          (r.sellerSku ?? '').toLowerCase().includes(term)),
    );
  }, [catalog.data, search, onlyUnassigned]);

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => (allVisibleSelected ? next.delete(r.id) : next.add(r.id)));
      return next;
    });
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const current = retailers.data?.find((r) => r.code === retailerCode);
  const noMasters = masters.data?.length === 0;

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catálogo retail</h1>
          <p className="mt-1 text-sm text-slate-500">
            Productos publicados en cada retailer (uno por color o variante). Asigna a cada uno su
            producto master.
          </p>
        </div>
        <div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!retailerCode || upload.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {upload.isPending ? 'Procesando…' : `Cargar catálogo${current ? ` de ${current.name}` : ''}`}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {/* Retailers */}
      <div className="mb-6 flex flex-wrap gap-2">
        {retailers.data?.map((r) => (
          <button
            key={r.code}
            onClick={() => changeRetailer(r.code)}
            className={cn(
              'rounded-lg border px-4 py-2 text-left transition-colors',
              r.code === retailerCode
                ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                : 'border-slate-200 bg-white hover:border-slate-300',
            )}
          >
            <p className="text-sm font-medium">{r.name}</p>
            <p className="text-xs text-slate-500">
              {r.total.toLocaleString('es-CL')} productos
              {r.unassigned > 0 && <span className="text-amber-600"> · {r.unassigned} sin master</span>}
            </p>
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
      )}

      {importResult && (
        <ImportSummary
          key={upload.submittedAt}
          result={importResult}
          deleting={remove.isPending}
          onDelete={confirmDelete}
          onClose={() => setImportResult(null)}
        />
      )}

      {noMasters && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Aún no hay productos master.{' '}
          <Link href="/maestras/productos" className="font-medium underline">
            Créalos en Productos
          </Link>{' '}
          para poder asignarlos.
        </div>
      )}

      {/* Filtros y acciones masivas */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o SKU…"
            className="w-full rounded-md border border-slate-300 bg-white py-1.5 pr-2 pl-8 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={onlyUnassigned}
            onChange={(e) => setOnlyUnassigned(e.target.checked)}
            className="size-4 rounded border-slate-300 accent-brand-600"
          />
          Solo sin master
        </label>

        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2 rounded-md border border-brand-100 bg-brand-50 px-3 py-1.5 text-sm">
            <span className="font-medium text-brand-700">{selected.size} seleccionados</span>
            <MasterSelect
              value={bulkMaster}
              masters={masters.data ?? []}
              onChange={setBulkMaster}
              placeholder="Elegir master…"
            />
            <button
              onClick={() => assign.mutate({ ids: [...selected], productId: bulkMaster || null })}
              disabled={!bulkMaster || assign.isPending}
              className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Link2 className="size-3.5" /> Asignar
            </button>
            <button
              onClick={() => assign.mutate({ ids: [...selected], productId: null })}
              disabled={assign.isPending}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              Quitar master
            </button>
            <button
              onClick={() => confirmDelete([...selected])}
              disabled={remove.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
            >
              <Trash2 className="size-3.5" /> Eliminar
            </button>
          </div>
        )}
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    className="size-4 rounded border-slate-300 accent-brand-600"
                    aria-label="Seleccionar todos"
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">SKU retail</th>
                <th className="px-3 py-2.5 font-medium">SKU seller</th>
                <th className="px-3 py-2.5 font-medium">Producto</th>
                <th className="px-3 py-2.5 text-right font-medium">Precio</th>
                <th className="px-3 py-2.5 text-right font-medium">Oferta</th>
                <th className="w-72 px-3 py-2.5 font-medium">Producto master</th>
                <th className="w-10 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {catalog.isLoading ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-slate-500">
                    <Loader2 className="mr-2 inline size-4 animate-spin" /> Cargando catálogo…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-slate-500">
                    {catalog.data?.length
                      ? 'No hay productos con ese filtro.'
                      : 'Aún no hay catálogo cargado para este retailer. Usa "Cargar catálogo".'}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <CatalogLine
                    key={r.id}
                    row={r}
                    masters={masters.data ?? []}
                    selected={selected.has(r.id)}
                    onToggle={() => toggle(r.id)}
                    onAssign={(productId) => assign.mutate({ ids: [r.id], productId })}
                    onDelete={() => confirmDelete([r.id])}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CatalogLine(props: {
  row: CatalogRow;
  masters: Product[];
  selected: boolean;
  onToggle: () => void;
  onAssign: (productId: string | null) => void;
  onDelete: () => void;
}) {
  const { row: r, masters, selected, onToggle, onAssign, onDelete } = props;
  // Oferta vencida: su fecha "hasta" ya pasó (se comparan textos AAAA-MM-DD)
  const expired = !!r.offerTo && r.offerTo < new Date().toLocaleDateString('sv-SE');
  return (
    <tr className={cn('group', selected ? 'bg-brand-50/50' : 'hover:bg-slate-50')}>
      <td className="px-4 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="size-4 rounded border-slate-300 accent-brand-600"
        />
      </td>
      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.retailerSku}</td>
      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-slate-600">{r.sellerSku ?? '—'}</td>
            <td className="px-3 py-2">
        <div className="flex items-center gap-2.5">
          {r.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={r.imageUrl}
              alt=""
              loading="lazy"
              onError={(e) => (e.currentTarget.style.display = 'none')}
              className="size-10 shrink-0 rounded border border-slate-200 bg-white object-contain"
            />
          )}
          <div>
            <p>{r.name}</p>
            {(r.status || r.stock !== null) && (
              <p className="text-[11px] text-slate-400">
                {r.status && (
                    <span className={cn(!OK_STATUSES.includes(r.status) && 'font-medium text-amber-600')}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                )}
                {r.status && r.stock !== null && ' · '}
                {r.stock !== null && `Stock ${r.stock.toLocaleString('es-CL')}`}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
        {r.listPrice ? formatCLP(r.listPrice) : '—'}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
        {r.offerPrice ? (
          <span
            title={`${formatDate(r.offerFrom)} al ${formatDate(r.offerTo)}`}
            className={cn(expired && 'text-slate-400')}
          >
            {formatCLP(r.offerPrice)}
            <span className={cn('block text-[11px]', expired ? 'text-red-500' : 'text-slate-400')}>
              {expired ? 'vencida' : 'hasta'} {formatDate(r.offerTo)}
            </span>
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-2">
        <MasterSelect
          value={r.productId ?? ''}
          masters={masters}
          onChange={(id) => onAssign(id || null)}
          placeholder="— Sin master —"
          highlightEmpty
        />
      </td>
      <td className="px-3 py-2">
        <button
          onClick={onDelete}
          title="Eliminar del catálogo"
          className="rounded p-1 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-700"
        >
          <Trash2 className="size-4" />
        </button>
      </td>
    </tr>
  );
}

function MasterSelect(props: {
  value: string;
  masters: Product[];
  onChange: (productId: string) => void;
  placeholder: string;
  highlightEmpty?: boolean;
}) {
  const { value, masters, onChange, placeholder, highlightEmpty } = props;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full max-w-72 rounded-md border bg-white px-2 py-1 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none',
        highlightEmpty && !value ? 'border-amber-300 text-amber-700' : 'border-slate-300',
      )}
    >
      <option value="">{placeholder}</option>
      {masters.map((m) => (
        <option key={m.id} value={m.id}>
          {m.skuMaster} · {m.name}
        </option>
      ))}
    </select>
  );
}

function ImportSummary(props: {
  result: CatalogImportResult;
  deleting: boolean;
  onDelete: (ids: string[]) => void;
  onClose: () => void;
}) {
  const { result, deleting, onDelete, onClose } = props;
  const [marked, setMarked] = useState<Set<string>>(() => new Set(result.missing.map((m) => m.id)));
  const hasErrors = result.errors.length > 0;
  // Solo cuentan los marcados que siguen en la lista (los eliminados ya salieron)
  const toDelete = result.missing.filter((m) => marked.has(m.id)).map((m) => m.id);

  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="flex gap-2.5">
          {hasErrors ? (
            <AlertTriangle className="size-5 shrink-0 text-amber-500" />
          ) : (
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
          )}
          <div>
            <p className="text-sm font-semibold">
              Catálogo cargado · {result.retailer} · {result.fileName}
            </p>
            <p className="mt-0.5 text-sm text-slate-600">
              {result.totalRows} productos en el archivo:{' '}
              <span className="font-medium text-emerald-700">{result.inserted} nuevos</span>,{' '}
              <span className="font-medium text-brand-700">{result.updated} actualizados</span>
              {hasErrors && <span className="font-medium text-red-600">, {result.errors.length} con error</span>}
              .
            </p>
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>

      {hasErrors && (
        <ul className="divide-y divide-slate-100 border-t border-slate-200 text-sm">
          {result.errors.map((e) => (
            <li key={e.row} className="flex gap-4 px-5 py-2">
              <span className="w-16 text-slate-500 tabular-nums">Fila {e.row}</span>
              <span className="text-slate-700">{e.message}</span>
            </li>
          ))}
        </ul>
      )}

      {result.missing.length > 0 && (
        <div className="border-t border-amber-200 bg-amber-50/60 px-5 py-4">
          <p className="text-sm font-medium text-amber-900">
            {result.missing.length === 1
              ? '1 producto está en el sistema pero no viene en este archivo.'
              : `${result.missing.length} productos están en el sistema pero no vienen en este archivo.`}{' '}
            Si ya no se usan, puedes eliminarlos:
          </p>
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            {result.missing.map((m) => (
              <li key={m.id}>
                <label className="flex items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={marked.has(m.id)}
                    onChange={() =>
                      setMarked((prev) => {
                        const next = new Set(prev);
                        if (next.has(m.id)) next.delete(m.id);
                        else next.add(m.id);
                        return next;
                      })
                    }
                    className="size-4 rounded border-slate-300 accent-red-600"
                  />
                  <span className="font-mono text-xs text-slate-500">{m.retailerSku}</span>
                  <span>{m.name}</span>
                  {m.productSku && <span className="text-xs text-slate-500">(master {m.productSku})</span>}
                </label>
              </li>
            ))}
          </ul>
          <button
            onClick={() => onDelete(toDelete)}
            disabled={toDelete.length === 0 || deleting}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            Eliminar seleccionados ({toDelete.length})
          </button>
        </div>
      )}
    </section>
  );
}