'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuth } from './auth';

const clp = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
const dmy = (d: string) => d.split('-').reverse().join('/');
/** Fecha local de hoy en AAAA-MM-DD */
const today = () => new Date().toLocaleDateString('sv-SE');

/** "125.000" -> 125000 · vacío o inválido -> null */
function parseAmount(text: string): number | null {
  const clean = text.replace(/[$\s.]/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

const METHODS = ['Transferencia', 'Efectivo', 'Cheque', 'Tarjeta', 'Otro'];

export const INVOICE_STATUS: Record<'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'NOTA_CREDITO', { label: string; badge: string }> = {
  NOTA_CREDITO: { label: 'Nota de crédito', badge: 'bg-violet-50 text-violet-700' },
  PENDIENTE: { label: 'Por pagar', badge: 'bg-red-50 text-red-700' },
  PARCIAL: { label: 'Abonada', badge: 'bg-amber-50 text-amber-700' },
  PAGADA: { label: 'Pagada', badge: 'bg-emerald-50 text-emerald-700' },
};

/** Detalle de una factura del proveedor: órdenes, pagos y formulario para agregar un pago */
export function InvoiceDialog({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { canEdit } = useAuth();
  const invoice = useQuery({ queryKey: ['invoice', invoiceId], queryFn: () => api.getInvoice(invoiceId) });
  const d = invoice.data;
  const setDate = useMutation({
    mutationFn: (issueDate: string) => api.setInvoiceDate(invoiceId, issueDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const [amount, setAmount] = useState<string | null>(null); // null = usar el saldo
  const [paidAt, setPaidAt] = useState(today());
  const [method, setMethod] = useState('Transferencia');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
  };

  const amountText = amount ?? (d ? String(d.balance) : '');
  const parsed = parseAmount(amountText);

  const add = useMutation({
    mutationFn: () => {
      if (parsed === null || parsed <= 0) throw new Error('Escribe el monto del pago (mayor a 0)');
      if (d && parsed > d.balance) throw new Error(`El pago no puede ser mayor a lo que falta (${clp(d.balance)})`);
      return api.addInvoicePayment(invoiceId, {
        amount: String(parsed),
        paidAt,
        method,
        note: note.trim() || null,
      });
    },
    onSuccess: () => {
      setAmount(null);
      setNote('');
      setError(null);
      refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (paymentId: string) => api.deleteInvoicePayment(paymentId),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  const input =
    'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              {d?.status === 'NOTA_CREDITO' ? 'Nota de crédito' : 'Factura'} N° {d?.documentNumber ?? '…'}
              {d && (
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', INVOICE_STATUS[d.status].badge)}>
                  {INVOICE_STATUS[d.status].label}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500">
                {d
                ? `${d.supplier}${d.supplierRut ? ` (${d.supplierRut})` : ''} · cliente ${d.clients.join(', ') || '—'} · ingresada el ${dmy(d.createdAt)}`
                : 'Cargando…'}
            </p>
            {d?.fromSii && (
              <p className="mt-0.5 text-xs text-sky-700">
                Montos según el Registro de Compras del SII{d.siiStatus === 'PENDIENTE' ? ' (aún pendiente de aceptar)' : ''}.
                {d.status !== 'NOTA_CREDITO' &&
                  ` Asignado a órdenes: neto ${clp(d.assignedNet)} de ${clp(d.net)}${d.assignedNet < d.net ? ` (faltan ${clp(d.net - d.assignedNet)})` : ''}.`}
              </p>
            )}
            {d && (
              <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                Fecha de la factura:
                <input
                  type="date"
                  defaultValue={d.issueDate}
                  disabled={!canEdit || setDate.isPending}
                  onBlur={(e) => e.target.value && e.target.value !== d.issueDate && setDate.mutate(e.target.value)}
                  className="rounded border border-slate-300 px-1.5 py-0.5 text-xs disabled:bg-slate-50"
                  title="Define en qué mes entra el IVA crédito de esta factura"
                />
                {setDate.isPending && <Loader2 className="size-3 animate-spin" />}
                {setDate.isError && <span className="text-red-600">{setDate.error.message}</span>}
              </label>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>

        {invoice.isLoading && (
          <p className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" /> Cargando factura…
          </p>
        )}
        {invoice.isError && <p className="py-12 text-center text-sm text-red-600">{invoice.error.message}</p>}

        {d && (
          <div className="space-y-5 px-5 py-4">
            {/* Montos */}
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 sm:grid-cols-5">
              <Amount label="Neto" value={d.net} />
              <Amount label="IVA" value={d.vat} />
              <Amount label="Total" value={d.total} strong />
              <Amount label="Pagado" value={d.paid} />
              <Amount label="Falta pagar" value={d.balance} strong tone={d.balance > 0 ? 'red' : 'green'} />
            </div>

            {/* Órdenes */}
            <section>
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Órdenes ({d.lines.length})
              </h3>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
                {d.lines.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate">{l.productName ?? 'Sin nombre'}</p>
                      <p className="text-xs text-slate-400">
                        {l.retailer} · OC {l.orderNumber ?? '—'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <p>{clp(l.total)}</p>
                      <p className="text-xs text-slate-400">neto {clp(l.net)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Pagos */}
            <section>
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Pagos ({d.payments.length})
              </h3>
              {d.payments.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-center text-sm text-slate-400">
                  Aún no hay pagos.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
                  {d.payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-24 shrink-0 text-slate-600 tabular-nums">{dmy(p.paidAt)}</span>
                      <div className="min-w-0 flex-1">
                        <p>
                          {p.method ?? 'Pago'}
                          {p.note && <span className="text-slate-500"> · {p.note}</span>}
                        </p>
                        {p.createdBy && <p className="text-xs text-slate-400">Registrado por {p.createdBy}</p>}
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">{clp(p.amount)}</span>
                      {canEdit && (
                        <button
                          onClick={() => {
                            if (confirm(`¿Eliminar el pago de ${clp(p.amount)} del ${dmy(p.paidAt)}?`)) {
                              remove.mutate(p.id);
                            }
                          }}
                          disabled={remove.isPending}
                          title="Eliminar pago"
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Nuevo pago */}
            {canEdit && d.balance > 0 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(null);
                  add.mutate();
                }}
                className="space-y-3 rounded-md border border-brand-100 bg-brand-50/50 p-3"
              >
                <h3 className="text-sm font-semibold">Agregar pago</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Monto (con IVA)</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-slate-400">
                        $
                      </span>
                      <input
                        inputMode="numeric"
                        value={amountText}
                        onChange={(e) => setAmount(e.target.value)}
                        className={`${input} pl-6 tabular-nums`}
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Fecha</span>
                    <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={input} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Medio de pago</span>
                    <select value={method} onChange={(e) => setMethod(e.target.value)} className={input}>
                      {METHODS.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Nota (opcional)</span>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ej: N° de operación, banco…"
                    className={input}
                  />
                </label>
                {parsed !== null && parsed > 0 && parsed < d.balance && (
                  <p className="text-xs text-slate-500">Quedará por pagar {clp(d.balance - parsed)}.</p>
                )}
                {error && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                )}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={add.isPending}
                    className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {add.isPending && <Loader2 className="size-4 animate-spin" />}
                    Registrar pago
                  </button>
                </div>
              </form>
            )}
            {!canEdit && error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Amount(props: { label: string; value: number; strong?: boolean; tone?: 'red' | 'green' }) {
  return (
    <div className="bg-white px-3 py-2.5">
      <p className="text-xs text-slate-500">{props.label}</p>
      <p
        className={cn(
          'tabular-nums',
          props.strong ? 'text-base font-semibold' : 'text-sm font-medium',
          props.tone === 'red' && 'text-red-600',
          props.tone === 'green' && 'text-emerald-600',
        )}
      >
        {clp(props.value)}
      </p>
    </div>
  );
}