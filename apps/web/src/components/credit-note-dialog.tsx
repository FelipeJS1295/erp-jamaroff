'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button, ErrorText, Field, Modal, clp, dmy, input, parseAmount, todayCL } from './kit';

/** Sitio del SII y guía oficial para emitir un borrador del sistema de facturación gratuito */
export const SII_URL = 'https://www.sii.cl';
export const MIPYME_GUIDE_URL = 'https://www.sii.cl/destacados/factura_electronica/guias_ayuda/borradorfgratuita.htm';

const typing = (v: string) => {
  const d = v.replace(/[^\d]/g, '');
  return d ? Number(d).toLocaleString('es-CL') : '';
};

/**
 * Nota de crédito para la boleta de una orden:
 *  - "Borrador en MIPYME": el ERP la arma y queda en el portal para firmarla.
 *  - "Ya la emití": se anota una nota hecha fuera del ERP (folio, fecha y monto).
 */
export function CreditNoteDialog({
  retailerCode,
  orderNumber,
  orderLabel,
  defaults,
  onClose,
}: {
  retailerCode: string;
  orderNumber: string;
  orderLabel?: string | null;
  defaults?: { amount?: number | null; refCode?: 1 | 3; reason?: string; returnId?: string | null };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const sii = useQuery({ queryKey: ['sii-status'], queryFn: api.siiStatus, staleTime: 5 * 60_000 });
  const preview = useQuery({
    queryKey: ['credit-note-preview', retailerCode, orderNumber],
    queryFn: () => api.creditNotePreview(retailerCode, orderNumber),
    gcTime: 0,
  });
  const p = preview.data;

  const [mode, setMode] = useState<'draft' | 'register'>('draft');
  const [refCode, setRefCode] = useState<1 | 3>(defaults?.refCode ?? 1);
  const [amount, setAmount] = useState(defaults?.amount ? typing(String(Math.round(defaults.amount))) : '');
  const [reason, setReason] = useState(defaults?.reason ?? 'Orden cancelada');
  const [folio, setFolio] = useState('');
  const [issuedAt, setIssuedAt] = useState(todayCL());

  // Anular = todo lo que queda por rebajar de la boleta
  const effectiveAmount = refCode === 1 ? (p?.available ?? 0) : (parseAmount(amount) ?? 0);

  const refresh = () => {
    for (const key of ['sales', 'credit-notes', 'credit-notes-pending', 'returns', 'vat']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const save = useMutation({
    mutationFn: () => {
      const data = {
        retailerCode,
        orderNumber,
        amountGross: effectiveAmount,
        refCode,
        reason: reason.trim(),
        returnId: defaults?.returnId ?? null,
      };
      return mode === 'draft'
        ? api.draftCreditNote(data).then((r) => ({ draftCode: r.draftCode as string | null }))
        : api.registerCreditNote({ ...data, folio: folio.trim(), issuedAt }).then(() => ({ draftCode: null }));
    },
    onSuccess: refresh,
  });

  const canDraft = Boolean(sii.data?.enabled);

  if (save.isSuccess) {
    return (
      <Modal title="Nota de crédito" subtitle={`OC ${orderLabel ?? orderNumber}`} onClose={onClose} footer={<Button onClick={onClose}>Listo</Button>}>
        {save.data.draftCode ? (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">
              <CheckCircle2 className="size-5" /> Borrador N° <b>{save.data.draftCode}</b> creado en el Portal MIPYME.
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-slate-700">
              <li>
                Entra a sii.cl → <b>Servicios online</b> → <b>Factura electrónica</b> → <b>Sistema de facturación gratuito del SII</b>.
              </li>
              <li>
                Ve a <b>Documentos borradores</b>, abre el borrador <b>{save.data.draftCode}</b>, revísalo y presiona{' '}
                <b>Firmar y enviar</b> (con tu certificado digital).
              </li>
              <li>
                Vuelve al ERP → <b>Notas de crédito</b> → <b>Anotar folio</b> con el N° que te dio el SII.
              </li>
            </ol>
            <div className="flex gap-4">
              <a href={SII_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
                Abrir sii.cl <ExternalLink className="size-3.5" />
              </a>
              <a href={MIPYME_GUIDE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-600 hover:underline">
                Guía del SII: emitir un borrador <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle2 className="size-5" /> Nota de crédito N° {folio} anotada.
          </p>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      title="Nota de crédito"
      subtitle={`${p?.retailerCode ?? retailerCode} · OC ${orderLabel ?? orderNumber}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!p || effectiveAmount <= 0 || reason.trim().length < 3 || (mode === 'register' && !folio.trim()) || (mode === 'draft' && !canDraft)}
          >
            {mode === 'draft' ? 'Crear borrador en MIPYME' : 'Anotar nota de crédito'}
          </Button>
        </>
      }
    >
      <ErrorText error={preview.error} />
      {p && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-md bg-slate-50 p-2">
              <p className="text-xs text-slate-500">Boleta N° {p.receiptNumber}</p>
              <p className="font-semibold tabular-nums">{clp(p.receiptTotal)}</p>
              <p className="text-[11px] text-slate-400">{dmy(p.receiptDate)}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-2">
              <p className="text-xs text-slate-500">Ya rebajado</p>
              <p className="font-semibold tabular-nums">{clp(p.credited)}</p>
            </div>
            <div className="rounded-md bg-amber-50 p-2">
              <p className="text-xs text-amber-700">Se puede rebajar</p>
              <p className="font-semibold text-amber-900 tabular-nums">{clp(p.available)}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Cliente: {p.customerName} · RUT {p.customerRut}
          </p>

          <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-sm">
            {(
              [
                ['draft', 'Borrador en MIPYME'],
                ['register', 'Ya la emití (anotar)'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMode(k)}
                className={cn('rounded px-3 py-1', mode === k ? 'bg-white font-medium shadow-sm' : 'text-slate-500')}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === 'draft' && !canDraft && (
            <p className="text-xs text-amber-700">La conexión con el SII (API Gateway) no está configurada: solo puedes anotarla.</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              <select value={refCode} onChange={(e) => setRefCode(Number(e.target.value) as 1 | 3)} className={input}>
                <option value={1}>Anula la boleta (todo lo que queda)</option>
                <option value={3}>Rebaja parcial (devolución parcial)</option>
              </select>
            </Field>
            <Field label="Monto con IVA">
              {refCode === 1 ? (
                <input value={clp(p.available)} disabled className={cn(input, 'tabular-nums')} />
              ) : (
                <input
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(typing(e.target.value))}
                  placeholder={`Hasta ${clp(p.available)}`}
                  className={cn(input, 'tabular-nums')}
                />
              )}
            </Field>
            <Field label="Motivo (aparece en la nota)" className="sm:col-span-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={90} className={input} />
            </Field>
            {mode === 'register' && (
              <>
                <Field label="N° (folio) de la nota">
                  <input value={folio} onChange={(e) => setFolio(e.target.value)} className={input} />
                </Field>
                <Field label="Fecha de emisión" hint="Define el mes en el resumen de IVA">
                  <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} className={input} />
                </Field>
              </>
            )}
          </div>
          {mode === 'draft' && (
            <p className="text-xs text-slate-500">
              El borrador queda en el Portal MIPYME del SII. No es válido hasta que lo firmes y envíes allá; mientras tanto no rebaja el IVA.
            </p>
          )}
          <ErrorText error={save.error} />
        </>
      )}
    </Modal>
  );
}
