'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, FolderOpen, Loader2, X, XCircle } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { api, type SaleRow } from '@/lib/api';
import {
  canSaveToFolders,
  chooseBaseFolder,
  documentFolders,
  downloadWithPathName,
  saveInFolders,
} from '@/lib/doc-folders';

const todayCL = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

/** Lo que hay que descargar de cada orden */
interface Job {
  sale: SaleRow;
  receiptId: string;
  /** N° (folio) de la boleta, para el nombre del archivo de Falabella */
  receiptNumber: string;
  issuedAt: string | null;
}

interface Outcome {
  label: string;
  ok: boolean;
  detail: string;
}

const btnPrimary =
  'inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';
const btnSecondary = 'rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50';

const orderOf = (s: SaleRow) => s.orderLabel ?? s.orderNumber ?? '';

/**
 * Descarga las boletas de las órdenes seleccionadas en carpetas:
 *   <carpeta elegida>\Boletas 2026\Boletas Walmart\Octubre\<N° orden>.pdf
 * Si alguna orden no tiene boleta, ofrece emitirla antes en el SII.
 */
export function DownloadBoletasDialog({
  sales,
  siiEnabled,
  onClose,
}: {
  sales: SaleRow[];
  siiEnabled: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const groups = useMemo(() => {
    const withPdf = sales.filter((s) => s.receipt?.status === 'EMITIDA');
    const missing = sales.filter((s) => !s.receipt && !s.cancelled && s.orderNumber);
    const manual = sales.filter((s) => s.receipt && s.receipt.status !== 'EMITIDA');
    const cancelled = sales.filter((s) => !s.receipt && (s.cancelled || !s.orderNumber));
    return { withPdf, missing, manual, cancelled };
  }, [sales]);

  const [generate, setGenerate] = useState(siiEnabled && groups.missing.length > 0);
  const [folderName, setFolderName] = useState<string | null>(null);
  // Crear subcarpetas Boletas <año>\Boletas <retailer>\<Mes> dentro de la carpeta elegida (se recuerda)
  const [subfolders, setSubfolders] = useState(() => {
    try {
      return localStorage.getItem('boletas-subcarpetas') === '1';
    } catch {
      return false;
    }
  });
  const toggleSubfolders = (v: boolean) => {
    setSubfolders(v);
    try {
      localStorage.setItem('boletas-subcarpetas', v ? '1' : '0');
    } catch {
      /* sin almacenamiento */
    }
  };
  const [phase, setPhase] = useState<'review' | 'working' | 'done'>('review');
  const [progress, setProgress] = useState('');
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [error, setError] = useState<string | null>(null);
  const folders = canSaveToFolders();

  const total = groups.withPdf.length + (generate ? groups.missing.length : 0);
  // Ejemplo de nombre de archivo para mostrar
  const sample = groups.withPdf[0] ?? groups.missing[0] ?? sales[0];
  const sampleName = sample ? `${api.boletaFileName(sample, sample.receipt?.number ?? (sample.retailerCode.toUpperCase() === 'FALABELLA' ? 'N°boleta' : null))}.pdf` : 'N° orden.pdf';

  const run = async () => {
    setError(null);
    // 1. Preguntar la carpeta cada vez (tiene que ser en el mismo clic: el navegador lo exige)
    let base: Awaited<ReturnType<typeof chooseBaseFolder>> | null = null;
    if (folders) {
      try {
        base = await chooseBaseFolder();
        setFolderName(base.name);
      } catch {
        setError('No se eligió carpeta. Presiona Descargar de nuevo y elige dónde guardar.');
        return;
      }
    }

    setPhase('working');
    const results: Outcome[] = [];
    const jobs: Job[] = groups.withPdf.map((s) => ({
      sale: s,
      receiptId: s.receipt!.id,
      receiptNumber: s.receipt!.number,
      issuedAt: s.receipt!.issuedAt,
    }));

    // 2. Emitir las que faltan (si se pidió)
    if (generate && groups.missing.length > 0) {
      setProgress(`Emitiendo ${groups.missing.length} boleta(s) en el SII…`);
      // De a 100 (máximo que acepta la API por vez)
      for (let i = 0; i < groups.missing.length; i += 100) {
        const chunk = groups.missing.slice(i, i + 100);
        try {
          const lote = await api.emitBoletas(chunk.map((s) => ({ retailerCode: s.retailerCode, orderNumber: s.orderNumber! })));
          for (const r of lote.results) {
            const sale = chunk.find((s) => s.orderNumber === r.orderNumber)!;
            if (r.ok) jobs.push({ sale, receiptId: r.id, receiptNumber: String(r.folio), issuedAt: r.issuedAt });
            else results.push({ label: orderOf(sale), ok: false, detail: `No se emitió: ${r.error}` });
          }
          // Se detuvo por un error de configuración/credenciales: no seguir con más lotes
          if (lote.results.length < chunk.length) break;
        } catch (err) {
          results.push({ label: 'Emisión', ok: false, detail: (err as Error).message });
          break;
        }
      }
    }

    // 3. Bajar cada PDF y guardarlo en su carpeta
    for (const [i, job] of jobs.entries()) {
      const label = orderOf(job.sale);
      const fileName = `${api.boletaFileName(job.sale, job.receiptNumber)}.pdf`;
      setProgress(`Guardando ${i + 1} de ${jobs.length}…`);
      const path = subfolders ? documentFolders('Boletas', job.sale.retailer, job.issuedAt) : [];
      try {
        const res = await fetch(api.boletaPdfUrl(job.receiptId, fileName.slice(0, -4)), { credentials: 'include' });
        if (!res.ok) {
          let msg = `Error ${res.status}`;
          try {
            msg = (await res.json()).message ?? msg;
          } catch {
            /* sin JSON */
          }
          throw new Error(msg);
        }
        const pdf = await res.blob();
        if (base) await saveInFolders(base, path, fileName, pdf);
        else downloadWithPathName(path, fileName, pdf);
        results.push({ label, ok: true, detail: [base?.name ?? 'Descargas', ...path, fileName].join('\\') });
      } catch (err) {
        results.push({ label, ok: false, detail: (err as Error).message });
      }
    }

    setOutcomes(results);
    setPhase('done');
    queryClient.invalidateQueries({ queryKey: ['sales'] });
  };

  // Resumen por carpeta: "Boletas 2026\Boletas Walmart\Octubre" -> 5
  const byFolder = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of outcomes.filter((x) => x.ok)) {
      const dir = o.detail.split('\\').slice(0, -1).join('\\');
      map.set(dir, (map.get(dir) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [outcomes]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">Descargar boletas</h2>
            <p className="text-xs text-slate-500">{sales.length} orden(es) seleccionada(s)</p>
          </div>
          <button
            onClick={phase === 'working' ? undefined : onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {phase === 'review' && (
            <>
              <ul className="space-y-2 text-sm">
                <Line ok>
                  <b>{groups.withPdf.length}</b> con boleta emitida en el SII: se descargan.
                </Line>
                {groups.missing.length > 0 && (
                  <li className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">
                    <p className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span>
                        <b>{groups.missing.length}</b> sin boleta: {groups.missing.map(orderOf).slice(0, 6).join(', ')}
                        {groups.missing.length > 6 && '…'}
                      </span>
                    </p>
                    {siiEnabled ? (
                      <label className="mt-2 flex items-center gap-2 font-medium">
                        <input type="checkbox" checked={generate} onChange={(e) => setGenerate(e.target.checked)} className="accent-brand-600" />
                        ¿Deseas generar estos documentos? (boletas reales en el SII)
                      </label>
                    ) : (
                      <p className="mt-1 text-xs">La emisión en el SII no está configurada: se saltan.</p>
                    )}
                  </li>
                )}
                {groups.manual.length > 0 && (
                  <Line>
                    <b>{groups.manual.length}</b> con boleta anotada a mano (sin PDF en el sistema): se saltan.
                  </Line>
                )}
                {groups.cancelled.length > 0 && (
                  <Line>
                    <b>{groups.cancelled.length}</b> cancelada(s): se saltan.
                  </Line>
                )}
              </ul>

              <div className="space-y-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                {folders ? (
                  <>
                    <p className="flex items-start gap-2">
                      <FolderOpen className="mt-0.5 size-4 shrink-0 text-brand-600" />
                      <span>
                        Al presionar <b>Descargar</b>, Chrome te pregunta <b>en qué carpeta</b> guardarlas.
                        <span className="block text-xs text-slate-500">
                          Ej: {subfolders
                            ? `…\\${documentFolders('Boletas', sample?.retailer ?? 'Falabella', todayCL()).join('\\')}\\${sampleName}`
                            : `…\\<carpeta elegida>\\${sampleName}`}
                        </span>
                      </span>
                    </p>
                    <label className="flex items-center gap-2 text-xs text-slate-700">
                      <input type="checkbox" checked={subfolders} onChange={(e) => toggleSubfolders(e.target.checked)} className="accent-brand-600" />
                      Ordenar en subcarpetas por año, retailer y mes (Boletas 2026\Boletas Falabella\Octubre)
                    </label>
                  </>
                ) : (
                  <p className="text-slate-600">
                    Este navegador no puede guardar en carpetas (usa Chrome o Edge). Se descargarán con la carpeta en el nombre, ej:{' '}
                    <i>Boletas 2026 - Walmart - Octubre - 123.pdf</i>
                  </p>
                )}
              </div>
              {folders && (
                <p className="text-xs text-slate-500">Chrome también te pide permiso para que el ERP guarde archivos en esa carpeta.</p>
              )}

              {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button onClick={onClose} className={btnSecondary}>
                  Cancelar
                </button>
                <button onClick={run} disabled={total === 0} className={btnPrimary}>
                  <Download className="size-4" />
                  {generate && groups.missing.length > 0
                    ? `Generar ${groups.missing.length} y descargar ${total}`
                    : `Descargar ${total} boleta(s)`}
                </button>
              </div>
            </>
          )}

          {phase === 'working' && (
            <p className="flex items-center gap-2 py-6 text-sm text-slate-600">
              <Loader2 className="size-4 animate-spin" /> {progress} No cierres esta ventana.
            </p>
          )}

          {phase === 'done' && (
            <>
              <p className="text-sm">
                <b className="text-emerald-700">{outcomes.filter((o) => o.ok).length} guardada(s)</b>
                {outcomes.some((o) => !o.ok) && (
                  <b className="ml-2 text-red-600">{outcomes.filter((o) => !o.ok).length} con error</b>
                )}
                {folderName && <span className="text-slate-500"> en {folderName}</span>}
              </p>
              {byFolder.length > 0 && (
                <ul className="space-y-1 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  {byFolder.map(([dir, n]) => (
                    <li key={dir} className="flex items-center gap-2">
                      <FolderOpen className="size-3.5 text-brand-600" /> {dir} <span className="text-slate-400">({n})</span>
                    </li>
                  ))}
                </ul>
              )}
              {outcomes.some((o) => !o.ok) && (
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                  {outcomes
                    .filter((o) => !o.ok)
                    .map((o, i) => (
                      <li key={i} className="flex gap-2 text-red-700">
                        <XCircle className="mt-0.5 size-3.5 shrink-0" /> OC {o.label}: {o.detail}
                      </li>
                    ))}
                </ul>
              )}
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <button onClick={onClose} className={btnPrimary}>
                  Listo
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Line({ ok, children }: { ok?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-slate-700">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <span className="mt-0.5 size-4 shrink-0 text-center text-slate-400">·</span>}
      <span>{children}</span>
    </li>
  );
}
