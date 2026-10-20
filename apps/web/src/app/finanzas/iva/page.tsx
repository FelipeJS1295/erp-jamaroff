'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, Scale } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/kit';
import { Badge, ErrorText, Loading, PageHeader, Stat, clp, dmy, monthName, td, th } from '@/components/kit';
import { api, type VatDocument } from '@/lib/api';
import { cn } from '@/lib/cn';

const KIND: Record<VatDocument['kind'], { label: string; tone: 'blue' | 'red' | 'green' | 'violet' | 'amber' | 'slate' }> = {
  BOLETA: { label: 'Boleta', tone: 'blue' },
  NOTA_CREDITO: { label: 'Nota de crédito', tone: 'red' },
  COMPRA: { label: 'Factura proveedor', tone: 'green' },
  COMISION: { label: 'Comisión', tone: 'violet' },
  LOGISTICA: { label: 'Envío / logística', tone: 'amber' },
  FACTURA_RETAILER: { label: 'Factura retailer (referencia)', tone: 'slate' },
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
              {m.retailerInvoicesVat !== null && (
                <p className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Facturas de los retailers en el SII (comisiones y servicios): IVA <b>{clp(m.retailerInvoicesVat)}</b> · en las liquidaciones:{' '}
                  <b>{clp(m.creditCommissions + m.creditLogistics)}</b>
                  {Math.abs(m.retailerInvoicesVat - (m.creditCommissions + m.creditLogistics)) > 1000 && (
                    <span className="text-amber-700">
                      {' '}
                      — diferencia de {clp(m.retailerInvoicesVat - (m.creditCommissions + m.creditLogistics))}. Para el F29 vale lo facturado (SII); revisa si falta cargar alguna liquidación.
                    </span>
                  )}
                </p>
              )}
              <SalesCheckPanel key={m.month} month={m.month} />
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

/** Ventas del ERP vs Registro de Ventas del SII del mes, por tipo de documento */
function SalesCheckPanel({ month }: { month: string }) {
  const check = useMutation({ mutationFn: () => api.salesCheck(month) });
  const ok = check.data?.types.every((t) => t.countDiff === 0 && t.totalDiff === 0);
  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Scale className="size-4 text-slate-500" />
        <h3 className="text-sm font-semibold">Cuadrar ventas con el SII</h3>
        <span className="text-xs text-slate-500">Boletas, facturas y notas de crédito del ERP vs el Registro de Ventas del SII</span>
        <Button variant="secondary" className="ml-auto" onClick={() => check.mutate()} loading={check.isPending}>
          {check.data ? 'Consultar de nuevo' : 'Consultar SII'}
        </Button>
      </header>
      <ErrorText error={check.error} />
      {check.data && (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500">
                <th className={th}>Documento</th>
                <th className={cn(th, 'text-right')}>ERP</th>
                <th className={cn(th, 'text-right')}>SII</th>
                <th className={cn(th, 'text-right')}>Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {check.data.types.map((t) => (
                <tr key={t.type}>
                  <td className={td}>{t.name}</td>
                  <td className={cn(td, 'text-right')}>
                    {t.erp.count} · {clp(t.erp.total)}
                  </td>
                  <td className={cn(td, 'text-right')}>{t.sii ? `${t.sii.count} · ${clp(t.sii.total)}` : 'Sin datos'}</td>
                  <td className={cn(td, 'text-right font-medium', t.totalDiff ? 'text-red-600' : 'text-emerald-600')}>
                    {t.sii ? (t.countDiff || t.totalDiff ? `${t.countDiff! > 0 ? '+' : ''}${t.countDiff} · ${clp(t.totalDiff)}` : 'Cuadra') : '—'}
                  </td>
                </tr>
              ))}
              {check.data.types.length === 0 && (
                <tr>
                  <td className={cn(td, 'text-center text-slate-500')} colSpan={4}>
                    Sin ventas en el mes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-slate-500">
            {ok
              ? 'Todo cuadra con el SII.'
              : 'Diferencia positiva = el SII tiene más que el ERP (documentos hechos fuera del sistema o no anotados). Negativa = el ERP tiene documentos que el SII no registra en el mes (fecha distinta o boleta anotada con otro N°).'}
          </p>
        </div>
      )}
    </section>
  );
}
