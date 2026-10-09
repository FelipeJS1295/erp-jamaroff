'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  FilePlus2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { api, type ImportResult } from '@/lib/api';
import { cn } from '@/lib/cn';

export default function CargarVentasPage() {
  const retailers = useQuery({ queryKey: ['import-retailers'], queryFn: api.importRetailers });

  const [retailerCode, setRetailerCode] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Selecciona el primer retailer apenas carga la lista
  useEffect(() => {
    if (!retailerCode && retailers.data?.length) setRetailerCode(retailers.data[0].code);
  }, [retailers.data, retailerCode]);

  const upload = useMutation({
    mutationFn: () => api.importSales(retailerCode, file!),
  });

  function pickFile(f: File | undefined) {
    if (!f) return;
    setFile(f);
    upload.reset();
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files[0]);
  }

  function clearFile() {
    setFile(null);
    upload.reset();
    if (inputRef.current) inputRef.current.value = '';
  }

  const canUpload = !!retailerCode && !!file && !upload.isPending;

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Cargar archivos de ventas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sube el reporte de ventas que descargas del portal de cada retailer. Las órdenes que ya
          están en el sistema se omiten; solo se cargan las nuevas.
        </p>
      </header>

      <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-6">
        {/* 1. Retailer */}
        <div>
          <label htmlFor="retailer" className="mb-1.5 block text-sm font-medium text-slate-700">
            Retailer
          </label>
          <select
            id="retailer"
            value={retailerCode}
            onChange={(e) => {
              setRetailerCode(e.target.value);
              upload.reset();
            }}
            disabled={retailers.isLoading}
            className="w-full max-w-xs rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          >
            {retailers.isLoading && <option>Cargando…</option>}
            {retailers.data?.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
          {retailers.isError && (
            <p className="mt-1.5 text-xs text-red-600">
              No se pudo obtener la lista de retailers. ¿Está corriendo la API?
            </p>
          )}
        </div>

        {/* 2. Archivo */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Archivo</p>

          {!file ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
                dragging
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-300 hover:border-brand-500 hover:bg-slate-50',
              )}
            >
              <FilePlus2 className="size-8 text-slate-400" />
              <span className="text-sm text-slate-700">
                Arrastra el Excel aquí o <span className="font-medium text-brand-600">búscalo</span>
              </span>
              <span className="text-xs text-slate-400">Excel (.xlsx) o CSV (.csv), hasta 20 MB</span>
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <FileSpreadsheet className="size-6 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-slate-500">{formatSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={clearFile}
                disabled={upload.isPending}
                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                aria-label="Quitar archivo"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </div>

        {/* 3. Acción */}
        <div className="flex items-center gap-3 border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={() => upload.mutate()}
            disabled={!canUpload}
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {upload.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {upload.isPending ? 'Procesando…' : 'Cargar ventas'}
          </button>
          {upload.isPending && (
            <span className="text-xs text-slate-500">Leyendo y guardando el archivo…</span>
          )}
        </div>
      </section>

      {/* Resultado */}
      {upload.isError && (
        <div className="mt-6 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="size-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-medium text-red-800">No se pudo cargar el archivo</p>
            <p className="mt-0.5 text-sm text-red-700">{upload.error.message}</p>
          </div>
        </div>
      )}

      {upload.isSuccess && <ResultCard result={upload.data} onNew={clearFile} />}
    </div>
  );
}

function ResultCard({ result, onNew }: { result: ImportResult; onNew: () => void }) {
  const hasErrors = result.errors.length > 0;

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-2.5">
          {hasErrors ? (
            <AlertTriangle className="size-5 text-amber-500" />
          ) : (
            <CheckCircle2 className="size-5 text-emerald-600" />
          )}
          <div>
            <p className="text-sm font-semibold">
              {hasErrors ? 'Carga completada con observaciones' : 'Carga completada'}
            </p>
            <p className="text-xs text-slate-500">
              {result.retailer} · {result.fileName}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="size-3.5" />
          Cargar otro archivo
        </button>
      </div>

      <div className="grid grid-cols-2 divide-slate-100 sm:grid-cols-4 sm:divide-x">
        <Stat label="Filas en el archivo" value={result.totalRows} />
        <Stat label="Ventas nuevas" value={result.inserted} tone="green" />
        <Stat
          label="Omitidas (ya existían)"
          value={result.skipped}
          hint={result.skippedOrders > 0 ? `${result.skippedOrders} órdenes` : undefined}
          tone="blue"
        />
        <Stat label="Filas con error" value={result.errors.length} tone={hasErrors ? 'red' : undefined} />
      </div>

      {hasErrors && (
        <div className="border-t border-slate-200">
          <p className="px-6 pt-4 pb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
            Filas no cargadas
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="w-24 px-6 py-2 font-medium">Fila Excel</th>
                <th className="px-6 py-2 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.errors.map((e) => (
                <tr key={e.row}>
                  <td className="px-6 py-2 text-slate-500 tabular-nums">{e.row}</td>
                  <td className="px-6 py-2 text-slate-700">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'green' | 'blue' | 'red';
}) {
  return (
    <div className="px-6 py-5">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'green' && 'text-emerald-600',
          tone === 'blue' && 'text-brand-600',
          tone === 'red' && 'text-red-600',
        )}
      >
        {value.toLocaleString('es-CL')}
      </p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}