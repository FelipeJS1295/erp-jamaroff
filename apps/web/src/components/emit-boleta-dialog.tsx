'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Send, X, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { api, type BoletasLote, type SaleRow } from '@/lib/api';

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

function Shell({ title, subtitle, onClose, children }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

const btnPrimary =
  'inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';
const btnSecondary = 'rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50';

/**
 * Emitir la boleta de UNA orden en el SII (portal eBoleta, vía API Gateway).
 * Muestra lo que se va a emitir y pide confirmar: la boleta es real.
 */
export function EmitBoletaDialog({ sale, onClose }: { sale: SaleRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ['boleta-preview', sale.retailerCode, sale.orderNumber],
    queryFn: () => api.boletaPreview(sale.retailerCode, sale.orderNumber!),
    gcTime: 0,
  });
  const emit = useMutation({
    mutationFn: () => api.emitBoleta(sale.retailerCode, sale.orderNumber!),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['sales'] }),
  });
  const p = preview.data;

  return (
    <Shell title="Emitir boleta en el SII" subtitle={`${sale.retailer} · OC ${sale.orderLabel ?? sale.orderNumber}`} onClose={onClose}>
      {preview.isLoading && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" /> Preparando la boleta…
        </p>
      )}
      {preview.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{preview.error.message}</p>}

      {emit.isSuccess ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="size-5" /> Boleta N° <b>{emit.data.folio}</b> emitida por {clp(emit.data.total)}
          </p>
          <div className="flex justify-end gap-2">
            <a href={api.boletaPdfUrl(emit.data.id)} target="_blank" rel="noreferrer" className={btnSecondary + ' inline-flex items-center gap-1.5'}>
              <FileText className="size-4" /> Ver PDF
            </a>
            <button onClick={onClose} className={btnPrimary}>
              Listo
            </button>
          </div>
        </div>
      ) : (
        p && (
          <>
            {p.existing ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Esta orden ya tiene boleta ({p.existing.status === 'REVISAR' ? 'intento sin confirmar' : `N° ${p.existing.number}`}).
              </p>
            ) : p.wantsInvoice ? (
              <p className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> El cliente pidió <b>factura</b>: esta orden no se emite como boleta.
              </p>
            ) : null}

            <dl className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
              <Row label="Tipo">Boleta electrónica afecta (39)</Row>
              <Row label="Cliente">
                {p.receptorName}
                <span className="block font-mono text-xs text-slate-500">
                  RUT {p.receptorRut}
                  {p.genericReceptor && ' (genérico: la orden no trae un RUT válido)'}
                </span>
                {p.receptorAddress && (
                  <span className="block text-xs text-slate-500">
                    {p.receptorAddress}
                    {p.receptorCommune && `, ${p.receptorCommune}`}
                  </span>
                )}
              </Row>
              <Row label="Detalle">{p.item}</Row>
              <Row label="Producto">{clp(p.productTotal)}</Row>
              {p.shippingTotal > 0 && <Row label="Despacho">{clp(p.shippingTotal)}</Row>}
              <Row label="Total (con IVA)">
                <b>{clp(p.total)}</b>
                <span className="block text-xs text-slate-500">
                  Neto {clp(p.total / 1.19)} · IVA {clp(p.total - p.total / 1.19)}
                </span>
              </Row>
            </dl>

            {emit.isError && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{emit.error.message}</p>}

            <p className="text-xs text-slate-500">
              Se emite una boleta <b>real</b> en el SII con el RUT de la empresa. Si hay un error después de emitirla, se anula con una nota de crédito.
            </p>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button onClick={onClose} className={btnSecondary}>
                Cancelar
              </button>
              <button
                onClick={() => emit.mutate()}
                disabled={emit.isPending || Boolean(p.existing) || p.wantsInvoice || p.total <= 0}
                className={btnPrimary}
              >
                {emit.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Emitir boleta
              </button>
            </div>
          </>
        )
      )}
    </Shell>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 px-3 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2">{children}</dd>
    </div>
  );
}

/**
 * Emitir boletas de VARIAS órdenes (las que faltan del filtro actual).
 * Se emiten una tras otra; al final se muestra el resultado de cada una.
 */
export function EmitBoletasDialog({ sales, onClose }: { sales: SaleRow[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState('');
  // Órdenes marcadas para emitir (todas al abrir)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(sales.map((s) => s.key)));
  const chosen = sales.filter((s) => selected.has(s.key));
  const total = chosen.reduce((n, s) => n + (s.salePrice ?? 0), 0);
  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const emit = useMutation({
    mutationFn: () => api.emitBoletas(chosen.map((s) => ({ retailerCode: s.retailerCode, orderNumber: s.orderNumber! }))),
  });
  // La lista de ventas se refresca al cerrar (así no cambia la lista mientras se ve el resultado)
  const close = () => {
    if (emit.isSuccess || emit.isError) queryClient.invalidateQueries({ queryKey: ['sales'] });
    onClose();
  };
  const result: BoletasLote | undefined = emit.data;

  return (
    <Shell title="Emitir boletas pendientes en el SII" subtitle={`${sales.length} orden(es)`} onClose={emit.isPending ? () => undefined : close}>
      {!result ? (
        <>
          <p className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Desmarca las órdenes que <b>ya tienen boleta</b> emitida fuera del sistema (o anótalas antes con <b>+</b>): si no, quedarían
              con boleta doble.
            </span>
          </p>
          <p className="text-sm text-slate-700">
            Se van a emitir <b>{chosen.length}</b> boletas <b>reales</b> en el SII, una por orden (producto + despacho). Las órdenes que piden
            factura no se emiten (aparecen con error).
          </p>
          <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 text-sm">
            {sales.map((s) => (
              <li key={s.key}>
                <label className="flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 hover:bg-slate-50">
                  <span className="flex min-w-0 items-center gap-2">
                    <input type="checkbox" checked={selected.has(s.key)} onChange={() => toggle(s.key)} className="accent-brand-600" />
                    <span className="truncate">
                      <span className="text-slate-500">{s.retailer}</span> · {s.orderLabel ?? s.orderNumber}
                      {s.orderDate && <span className="ml-1 text-xs text-slate-400">{s.orderDate.split('-').reverse().join('/')}</span>}
                    </span>
                  </span>
                  <span className="tabular-nums">{s.salePrice !== null ? clp(s.salePrice) : '—'}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Venta sin despacho: {clp(total)}. Cada boleta incluye el despacho de su orden.</span>
            <span className="flex shrink-0 gap-2">
              <button type="button" onClick={() => setSelected(new Set(sales.map((s) => s.key)))} className="text-brand-600 hover:underline">
                Todas
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="text-brand-600 hover:underline">
                Ninguna
              </button>
            </span>
          </div>
          {chosen.length > 100 && <p className="text-xs text-red-600">Máximo 100 boletas por vez: desmarca algunas.</p>}
          <label className="block text-sm">
            Para confirmar escribe <b>EMITIR</b>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
            />
          </label>
          {emit.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{emit.error.message}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={close} disabled={emit.isPending} className={btnSecondary}>
              Cancelar
            </button>
            <button
              onClick={() => emit.mutate()}
              disabled={confirm.trim().toUpperCase() !== 'EMITIR' || emit.isPending || chosen.length === 0 || chosen.length > 100}
              className={btnPrimary}
            >
              {emit.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {emit.isPending ? 'Emitiendo… no cierres la página' : `Emitir ${chosen.length} boleta(s)`}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm">
            <b className="text-emerald-700">{result.emitted} emitida(s)</b>
            {result.failed > 0 && <b className="ml-2 text-red-600">{result.failed} con error</b>}
          </p>
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 text-sm">
            {result.results.map((r, i) => (
              <li key={i} className="flex items-start gap-2 px-3 py-1.5">
                {r.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />}
                <span className="flex-1">
                  OC {r.orderNumber}
                  {r.ok ? (
                    <span className="text-slate-500"> · boleta N° {r.folio} · {clp(r.total)}</span>
                  ) : (
                    <span className="block text-xs text-red-600">{r.error}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {result.results.length < chosen.length && (
            <p className="text-xs text-amber-700">Se detuvo antes de terminar por un error de configuración o credenciales.</p>
          )}
          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button onClick={close} className={btnPrimary}>
              Listo
            </button>
          </div>
        </>
      )}
    </Shell>
  );
}
