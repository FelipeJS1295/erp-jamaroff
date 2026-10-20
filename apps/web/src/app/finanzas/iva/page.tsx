'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, ErrorText, Loading, PageHeader, Stat, clp, dmy, monthName, td, th } from '@/components/kit';
import { api, type VatDocument } from '@/lib/api';
import { cn } from '@/lib/cn';

const KIND: Record<VatDocument['kind'], { label: string; tone: 'blue' | 'red' | 'green' | 'violet' | 'amber' }> = {
  BOLETA: { label: 'Boleta', tone: 'blue' },
  NOTA_CREDITO: { label: 'Nota de crédito', tone: 'red' },
  COMPRA: { label: 'Factura proveedor', tone: 'green' },
  COMISION: { label: 'Comisión', tone: 'violet' },
  LOGISTICA: { label: 'Envío / logística', tone: 'amber' },
};

export default function VatPage() {
  const months = useQuery({ queryKey: ['vat'], queryFn: () => api.vatMonths(12) });
  const [month, setMonth] = useState<string | null>(null);
  useEffect(() => {
    if (!month && months.data?.length) setMonth(months.data[0].month);
  }, [months.data, month]);
  const detail = useQuery({ queryKey: ['vat', month], queryFn: () => api.vatDetail(month!), enabled: Boolean(month) });
  const m = months.data?.find((x) => x.month === month);

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <PageHeader
        title="Resumen de IVA"
        subtitle="IVA del mes según la fecha de cada documento, como en el F29: débito de las boletas menos las notas de crédito, y crédito de las facturas de proveedores, comisiones y cargos de envío de los retailers."
      />
      <ErrorText error={months.error} />
      {months.isLoading ? (
        <Loading />
      ) : (
        <>
          <section className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                    <th className={th}>Mes</th>
                    <th className={cn(th, 'text-right')}>IVA boletas</th>
                    <th className={cn(th, 'text-right')}>Notas de crédito</th>
                    <th className={cn(th, 'border-r border-slate-200 text-right')}>Débito</th>
                    <th className={cn(th, 'text-right')}>Compras</th>
                    <th className={cn(th, 'text-right')}>Comisiones</th>
                    <th className={cn(th, 'text-right')}>Envío/logística</th>
                    <th className={cn(th, 'border-r border-slate-200 text-right')}>Crédito</th>
                    <th className={cn(th, 'text-right')}>A pagar</th>
                    <th className={th}>Alertas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {months.data?.map((r) => (
                    <tr
                      key={r.month}
                      onClick={() => setMonth(r.month)}
                      className={cn('cursor-pointer tabular-nums hover:bg-slate-50', month === r.month && 'bg-brand-50')}
                    >
                      <td className={cn(td, 'font-medium')}>{monthName(r.month)}</td>
                      <td className={cn(td, 'text-right')}>{clp(r.debitReceipts)}</td>
                      <td className={cn(td, 'text-right text-red-600')}>{r.debitCreditNotes ? clp(r.debitCreditNotes) : '—'}</td>
                      <td className={cn(td, 'border-r border-slate-100 text-right font-medium')}>{clp(r.debit)}</td>
                      <td className={cn(td, 'text-right')}>{clp(r.creditPurchases)}</td>
                      <td className={cn(td, 'text-right')}>{clp(r.creditCommissions)}</td>
                      <td className={cn(td, 'text-right')}>{clp(r.creditLogistics)}</td>
                      <td className={cn(td, 'border-r border-slate-100 text-right font-medium')}>{clp(r.credit)}</td>
                      <td className={cn(td, 'text-right font-semibold', r.balance > 0 ? 'text-slate-900' : 'text-emerald-600')}>
                        {r.balance >= 0 ? clp(r.balance) : `Remanente ${clp(-r.balance)}`}
                      </td>
                      <td className={cn(td, 'text-xs')}>
                        {r.salesWithoutReceipt > 0 && (
                          <span className="block text-amber-700" title="Ventas del mes sin boleta: su IVA no está en el débito">
                            Ventas sin boleta: {clp(r.salesWithoutReceipt)}
                          </span>
                        )}
                        {r.draftCreditNotes > 0 && <span className="block text-amber-700">{r.draftCreditNotes} NC sin firmar</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {m && (
            <>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <h2 className="text-lg font-semibold">{monthName(m.month)}</h2>
                <a
                  href={api.vatCsvUrl(m.month)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <Download className="size-4" /> Detalle en Excel (CSV)
                </a>
              </div>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Stat label="IVA débito" value={clp(m.debit)} hint={`Boletas ${clp(m.debitReceipts)} · NC ${clp(m.debitCreditNotes)}`} />
                <Stat label="IVA crédito" value={clp(m.credit)} hint={`Compras ${clp(m.creditPurchases)} · comisiones ${clp(m.creditCommissions)} · envío ${clp(m.creditLogistics)}`} />
                <Stat label={m.balance >= 0 ? 'IVA a pagar' : 'Remanente (a favor)'} value={clp(Math.abs(m.balance))} tone={m.balance >= 0 ? 'red' : 'green'} />
              </div>
              {(m.salesWithoutReceipt > 0 || m.draftCreditNotes > 0) && (
                <p className="mb-4 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {m.salesWithoutReceipt > 0 &&
                      `Hay ventas de este mes sin boleta por ${clp(m.salesWithoutReceipt)} (IVA ${clp(m.salesWithoutReceiptVat)}) que todavía no están en el débito. `}
                    {m.draftCreditNotes > 0 && `${m.draftCreditNotes} nota(s) de crédito en borrador: no rebajan hasta firmarlas en el Portal MIPYME.`}
                  </span>
                </p>
              )}
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {detail.isLoading ? (
                  <Loading />
                ) : !detail.data?.length ? (
                  <p className="py-10 text-center text-sm text-slate-500">Sin documentos en este mes.</p>
                ) : (
                  <div className="max-h-[520px] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                          <th className={th}>Fecha</th>
                          <th className={th}>Tipo</th>
                          <th className={th}>Retailer / proveedor</th>
                          <th className={th}>N° documento</th>
                          <th className={th}>Orden</th>
                          <th className={cn(th, 'text-right')}>Total</th>
                          <th className={cn(th, 'text-right')}>IVA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.data.map((x, i) => (
                          <tr key={i} className="tabular-nums">
                            <td className={td}>{dmy(x.date)}</td>
                            <td className={td}>
                              <Badge tone={KIND[x.kind].tone}>{KIND[x.kind].label}</Badge>
                            </td>
                            <td className={td}>{x.retailer}</td>
                            <td className={cn(td, 'font-mono text-xs')}>{x.reference}</td>
                            <td className={cn(td, 'font-mono text-xs')}>{x.description ?? '—'}</td>
                            <td className={cn(td, 'text-right')}>{clp(x.gross)}</td>
                            <td className={cn(td, 'text-right font-medium')}>{clp(x.vat)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              <p className="mt-2 text-xs text-slate-400">
                Referencial para preparar el F29: compáralo con el Registro de Compras y Ventas del SII antes de declarar. Las comisiones y cargos se toman
                de la fecha del movimiento en la liquidación.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
