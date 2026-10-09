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
import Link from 'next/link';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { api, type SettlementImportResult } from '@/lib/api';
import { cn } from '@/lib/cn';

export default function CargarLiquidacionesPage() {
  const retailers = useQuery({
    queryKey: ['settlement-retailers'],
    queryFn: api.settlementRetailers,
  });

  const [retailerCode, setRetailerCode] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!retailerCode && retailers.data?.length) setRetailerCode(retailers.data[0].code);
  }, [retailers.data, retailerCode]);

  const upload = useMutation({ mutationFn: () => api.importSettlement(retailerCode, file!) });

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
        <h1 className="text-2xl font-semibold tracking-tight">Cargar liquidaciones</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sube el reporte de transacciones o liquidación del retailer. Los movimientos que ya
          existen no se duplican; solo se actualiza su estado de pago.
        </p>
      </header>

      <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-6">
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
        </div>

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
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</p>
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
            {upload.isPending ? 'Procesando…' : 'Cargar liquidación'}
          </button>
        </div>
      </section>

      {upload.isError && (
        <div className="mt-6 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="size-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-medium text-red-800">No se pudo cargar el archivo</p>
            <p className="mt-0.5 text-sm text-red-700">{upload.error.message}</p>
          </div>
        </div>
      )}

      {upload.isSuccess && (
        <ResultCard result={upload.data} retailerCode={retailerCode} onNew={clearFile} />
      )}
    </div>
  );
}

function ResultCard(props: {
  result: SettlementImportResult;
  retailerCode: string;
  onNew: () => void;
}) {
  const { result, retailerCode, onNew } = props;
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onNew}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="size-3.5" />
            Cargar otro
          </button>
          <Link
            href={`/conciliacion?retailer=${retailerCode}`}
            className="inline-flex items-center rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            Ver conciliación →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-slate-100">
        <Stat label="Movimientos en el archivo" value={result.totalRows} />
        <Stat label="Nuevos" value={result.inserted} className="text-emerald-600" />
        <Stat label="Ya existían (actualizados)" value={result.updated} className="text-brand-600" />
        <Stat
          label="Filas con error"
          value={result.errors.length}
          className={hasErrors ? 'text-red-600' : undefined}
        />
      </div>

      {hasErrors && (
        <ul className="divide-y divide-slate-100 border-t border-slate-200 text-sm">
          {result.errors.map((e) => (
            <li key={e.row} className="flex gap-4 px-6 py-2">
              <span className="w-16 text-slate-500 tabular-nums">Fila {e.row}</span>
              <span className="text-slate-700">{e.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="px-6 py-5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', className)}>
        {value.toLocaleString('es-CL')}
      </p>
    </div>
  );
}