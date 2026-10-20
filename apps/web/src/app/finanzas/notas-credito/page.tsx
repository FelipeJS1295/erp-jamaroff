'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileMinus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/auth';
import { CreditNoteDialog } from '@/components/credit-note-dialog';
import { Badge, Button, ErrorText, Field, Loading, Modal, PageHeader, Stat, clp, dmy, input, td, th, todayCL } from '@/components/kit';
import { api, type CreditNote, type CreditNoteStatus } from '@/lib/api';
import { cn } from '@/lib/cn';

const STATUS: Record<CreditNoteStatus, { label: string; tone: 'amber' | 'green' | 'blue' | 'red' }> = {
  BORRADOR: { label: 'Borrador: falta firmar', tone: 'amber' },
  EMITIDA: { label: 'Emitida', tone: 'green' },
  REGISTRADA: { label: 'Anotada', tone: 'blue' },
  ERROR: { label: 'Error', tone: 'red' },
};

/** Anotar el folio de un borrador que ya se firmó en el Portal MIPYME */
function ConfirmDialog({ note, onClose }: { note: CreditNote; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [folio, setFolio] = useState(note.folio ?? '');
  const [issuedAt, setIssuedAt] = useState(note.issuedAt ?? todayCL());
  const save = useMutation({
    mutationFn: () => api.confirmCreditNote(note.id, { folio: folio.trim(), issuedAt }),
    onSuccess: () => {
      for (const k of ['credit-notes', 'credit-notes-pending', 'sales', 'vat', 'returns']) queryClient.invalidateQueries({ queryKey: [k] });
      onClose();
    },
  });
  return (
    <Modal
      title="Anotar folio de la nota de crédito"
      subtitle={`Borrador ${note.draftCode} · boleta N° ${note.receiptNumber}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!folio.trim()}>
            Guardar
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">Después de firmarla en el Portal MIPYME, el SII le asigna un N° (folio). Anótalo aquí.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="N° (folio) de la nota">
          <input value={folio} onChange={(e) => setFolio(e.target.value)} autoFocus className={input} />
        </Field>
        <Field label="Fecha de emisión">
          <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} className={input} />
        </Field>
      </div>
      <ErrorText error={save.error} />
    </Modal>
  );
}

export default function CreditNotesPage() {
  const { canEdit } = useAuth();
  const queryClient = useQueryClient();
  const pending = useQuery({ queryKey: ['credit-notes-pending'], queryFn: api.pendingCreditNotes });
  const notes = useQuery({ queryKey: ['credit-notes'], queryFn: api.listCreditNotes });
  const [createFor, setCreateFor] = useState<{ retailerCode: string; orderNumber: string; label: string | null } | null>(null);
  const [confirm, setConfirm] = useState<CreditNote | null>(null);
  const remove = useMutation({
    mutationFn: api.deleteCreditNote,
    onSuccess: () => {
      for (const k of ['credit-notes', 'credit-notes-pending', 'sales', 'vat', 'returns']) queryClient.invalidateQueries({ queryKey: [k] });
    },
  });

  const all = notes.data ?? [];
  const drafts = all.filter((n) => n.status === 'BORRADOR');
  const valid = all.filter((n) => n.status === 'EMITIDA' || n.status === 'REGISTRADA');

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <PageHeader
        title="Notas de crédito"
        subtitle="Anulan o rebajan una boleta cuando la orden se cancela o se devuelve. El ERP arma el borrador en el Portal MIPYME del SII y tú lo firmas allá."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Canceladas con boleta sin nota" value={pending.data?.length ?? '—'} tone={pending.data?.length ? 'red' : undefined} hint={clp((pending.data ?? []).reduce((n, p) => n + p.missing, 0))} />
        <Stat label="Borradores sin firmar" value={drafts.length} tone={drafts.length ? 'amber' : undefined} hint={clp(drafts.reduce((n, d) => n + d.amountGross, 0))} />
        <Stat label="Notas emitidas / anotadas" value={valid.length} hint={clp(valid.reduce((n, d) => n + d.amountGross, 0))} />
        <Stat label="IVA rebajado" value={clp(valid.reduce((n, d) => n + (d.amountGross - d.amountGross / 1.19), 0))} />
      </div>

      {/* Pendientes */}
      <section className="mb-6 rounded-lg border border-red-200 bg-white">
        <header className="flex items-center gap-2 border-b border-red-100 px-4 py-3">
          <AlertTriangle className="size-4 text-red-500" />
          <h2 className="text-sm font-semibold">Órdenes canceladas con boleta y sin nota de crédito</h2>
        </header>
        <ErrorText error={pending.error} />
        {pending.isLoading ? (
          <Loading />
        ) : !pending.data?.length ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No hay órdenes canceladas pendientes de nota de crédito. 👌</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className={th}>Retailer</th>
                  <th className={th}>N° orden</th>
                  <th className={th}>Fecha</th>
                  <th className={th}>Producto</th>
                  <th className={th}>Boleta</th>
                  <th className={cn(th, 'text-right')}>Falta rebajar</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pending.data.map((p) => (
                  <tr key={`${p.retailerCode}-${p.orderNumber}`} className="hover:bg-slate-50">
                    <td className={cn(td, 'font-medium')}>{p.retailer}</td>
                    <td className={cn(td, 'font-mono text-xs')}>{p.orderId && p.retailerCode === 'WALMART' ? p.orderId : p.orderNumber}</td>
                    <td className={cn(td, 'tabular-nums')}>{dmy(p.orderDate)}</td>
                    <td className={cn(td, 'max-w-64 text-slate-700')}>{p.productName}</td>
                    <td className={td}>
                      N° {p.receiptNumber}
                      <span className="block text-xs text-slate-500">{clp(p.receiptTotal)}</span>
                    </td>
                    <td className={cn(td, 'text-right font-semibold text-red-600 tabular-nums')}>{clp(p.missing)}</td>
                    <td className={cn(td, 'text-right')}>
                      {canEdit && (
                        <Button
                          variant="secondary"
                          onClick={() => setCreateFor({ retailerCode: p.retailerCode, orderNumber: p.orderNumber, label: p.retailerCode === 'WALMART' ? p.orderId : p.orderNumber })}
                        >
                          <FileMinus className="size-4" /> Nota de crédito
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Todas */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <header className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold">Notas de crédito</h2>
        </header>
        <ErrorText error={notes.error ?? remove.error} />
        {notes.isLoading ? (
          <Loading />
        ) : !all.length ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">Aún no hay notas de crédito.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className={th}>Fecha</th>
                  <th className={th}>Retailer · orden</th>
                  <th className={th}>Boleta</th>
                  <th className={th}>Motivo</th>
                  <th className={cn(th, 'text-right')}>Monto</th>
                  <th className={th}>Estado</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {all.map((n) => (
                  <tr key={n.id} className="align-top hover:bg-slate-50">
                    <td className={cn(td, 'tabular-nums')}>{dmy(n.issuedAt ?? n.createdAt)}</td>
                    <td className={td}>
                      {n.retailer}
                      <span className="block font-mono text-xs text-slate-500">{n.orderNumber}</span>
                    </td>
                    <td className={td}>N° {n.receiptNumber}</td>
                    <td className={cn(td, 'max-w-64')}>
                      {n.reason}
                      <span className="block text-xs text-slate-500">{n.refCode === 1 ? 'Anula la boleta' : 'Rebaja parcial'}</span>
                    </td>
                    <td className={cn(td, 'text-right tabular-nums')}>{clp(n.amountGross)}</td>
                    <td className={td}>
                      <Badge tone={STATUS[n.status].tone}>{STATUS[n.status].label}</Badge>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {n.folio ? `N° ${n.folio}` : n.draftCode ? `Borrador ${n.draftCode}` : ''}
                      </span>
                    </td>
                    <td className={cn(td, 'text-right whitespace-nowrap')}>
                      {canEdit && n.status === 'BORRADOR' && (
                        <Button variant="link" onClick={() => setConfirm(n)}>
                          Anotar folio
                        </Button>
                      )}
                      {canEdit && n.status !== 'EMITIDA' && (
                        <button
                          onClick={() => {
                            if (confirm2(n)) remove.mutate(n.id);
                          }}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Quitar"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {createFor && (
        <CreditNoteDialog
          retailerCode={createFor.retailerCode}
          orderNumber={createFor.orderNumber}
          orderLabel={createFor.label}
          defaults={{ refCode: 1, reason: 'Orden cancelada' }}
          onClose={() => setCreateFor(null)}
        />
      )}
      {confirm && <ConfirmDialog note={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function confirm2(n: CreditNote) {
  return window.confirm(
    n.status === 'BORRADOR'
      ? `¿Quitar el borrador ${n.draftCode} del ERP? Si no lo vas a usar, bórralo también en el Portal MIPYME.`
      : `¿Quitar la nota de crédito ${n.folio ?? ''} del ERP?`,
  );
}
