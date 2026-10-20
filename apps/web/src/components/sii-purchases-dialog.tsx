'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, type SiiPurchase } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Badge, Button, ErrorText, Loading, Modal, clp, dmy, monthName, todayCL } from './kit';

const ERP_STATUS: Record<SiiPurchase['erpStatus'], { label: string; tone: 'green' | 'blue' | 'slate' }> = {
  NUEVA: { label: 'Nueva', tone: 'green' },
  COINCIDE: { label: 'Ya ingresada a mano', tone: 'blue' },
  IMPORTADA: { label: 'Ya importada', tone: 'slate' },
};

const isNc = (d: SiiPurchase) => d.type === 60 || d.type === 61;

/** Últimos 12 meses ("2026-10", "2026-09", …) */
function lastMonths(count = 12) {
  const [y, m] = todayCL().split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/**
 * Trae las facturas de compra del Registro de Compras y Ventas (RCV) del SII.
 * Muestra las del mes, marca las que ya están en el ERP y se importan las elegidas.
 */
export function SiiPurchasesDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const months = useMemo(() => lastMonths(), []);
  const [month, setMonth] = useState(months[0]);
  const preview = useQuery({
    queryKey: ['sii-purchases', month],
    queryFn: () => api.siiPurchases(month),
    gcTime: 0,
    retry: false,
  });
  const docs = preview.data?.documents ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Por defecto quedan marcadas las que faltan en el ERP
  useEffect(() => {
    setSelected(new Set(docs.filter((d) => d.erpStatus !== 'IMPORTADA').map((d) => d.key)));
  }, [preview.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => api.importSiiPurchases(month, [...selected]),
    onSuccess: () => {
      for (const key of ['invoices', 'vat', 'sii-purchases']) queryClient.invalidateQueries({ queryKey: [key] });
    },
  });

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allSelected = docs.length > 0 && docs.every((d) => selected.has(d.key));
  const chosen = docs.filter((d) => selected.has(d.key));
  const signed = (d: SiiPurchase, n: number) => (isNc(d) ? -n : n);

  if (save.isSuccess) {
    const r = save.data;
    return (
      <Modal title="Compras del SII" subtitle={monthName(month)} onClose={onClose} footer={<Button onClick={onClose}>Listo</Button>}>
        <p className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <span>
            {r.created > 0 && `${r.created} documento(s) nuevos. `}
            {r.linked > 0 && `${r.linked} que ya tenías ingresados quedaron con los montos del SII. `}
            {r.updated > 0 && `${r.updated} actualizados. `}
          </span>
        </p>
        <p className="text-sm text-slate-600">
          Las facturas nuevas quedan en <b>Compras → Facturas</b> sin órdenes asignadas. Para asociarlas a las ventas, en{' '}
          <b>Conciliación</b> selecciona las órdenes y usa &quot;Agregar documento&quot; con el mismo proveedor y N° de factura.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      wide
      title="Traer compras del SII"
      subtitle="Facturas y notas de crédito que los proveedores le emitieron a la empresa, según el Registro de Compras y Ventas"
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto self-center text-sm text-slate-500">
            {chosen.length} elegidos · {clp(chosen.reduce((n, d) => n + signed(d, d.total), 0))}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={chosen.length === 0}>
            Importar {chosen.length || ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthName(m)}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={() => preview.refetch()} disabled={preview.isFetching}>
          <RefreshCw className={cn('size-4', preview.isFetching && 'animate-spin')} /> Consultar de nuevo
        </Button>
      </div>

      <ErrorText error={preview.error ?? save.error} />
      {preview.data?.warnings.map((w) => (
        <p key={w} className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {w}
        </p>
      ))}

      {preview.isFetching ? (
        <Loading />
      ) : preview.data && docs.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">El SII no tiene compras registradas en {monthName(month)}.</p>
      ) : (
        docs.length > 0 && (
          <div className="max-h-[55vh] overflow-auto rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="w-8 py-2 pl-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(docs.map((d) => d.key)))}
                      className="accent-brand-600"
                    />
                  </th>
                  <th className="px-2 py-2 font-medium">Proveedor</th>
                  <th className="px-2 py-2 font-medium">Documento</th>
                  <th className="px-2 py-2 font-medium">Fecha</th>
                  <th className="px-2 py-2 text-right font-medium">Neto</th>
                  <th className="px-2 py-2 text-right font-medium">IVA</th>
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                  <th className="px-2 py-2 font-medium">En el ERP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {docs.map((d) => (
                  <tr key={d.key} className={cn('cursor-pointer align-top hover:bg-slate-50', selected.has(d.key) && 'bg-brand-50/50')} onClick={() => toggle(d.key)}>
                    <td className="py-2 pl-3">
                      <input type="checkbox" checked={selected.has(d.key)} onChange={() => toggle(d.key)} onClick={(e) => e.stopPropagation()} className="accent-brand-600" />
                    </td>
                    <td className="px-2 py-2">
                      <span className="font-medium">{d.supplierName}</span>
                      <span className="block text-xs text-slate-500">{d.supplierRut}</span>
                      {d.erpSupplier && d.erpSupplier.toLowerCase() !== d.supplierName.toLowerCase() && (
                        <span className="block text-xs text-sky-700">en el ERP: {d.erpSupplier}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span className="font-mono text-xs">N° {d.folio}</span>
                      <span className={cn('block text-xs', isNc(d) ? 'text-violet-700' : 'text-slate-500')}>{d.typeLabel}</span>
                      {d.siiStatus === 'PENDIENTE' && <span className="block text-xs text-amber-700">Pendiente de aceptar</span>}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap tabular-nums">{dmy(d.issueDate)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{clp(signed(d, d.net + d.exempt))}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{clp(signed(d, d.vat))}</td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums">{clp(signed(d, d.total))}</td>
                    <td className="px-2 py-2">
                      <Badge tone={ERP_STATUS[d.erpStatus].tone}>{ERP_STATUS[d.erpStatus].label}</Badge>
                      {d.erpStatus === 'COINCIDE' && Math.round(d.assignedNet) !== Math.round(d.net + d.exempt) && (
                        <span className="mt-0.5 block text-xs text-amber-700">ERP: neto {clp(d.assignedNet)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      {preview.data && docs.length > 0 && (
        <p className="text-xs text-slate-500">
          Total del mes en el SII: neto {clp(preview.data.totals.net)} · IVA {clp(preview.data.totals.vat)} · total {clp(preview.data.totals.total)}.
          Las que ya ingresaste a mano no se duplican: se les agregan el RUT y los montos del SII.
        </p>
      )}
    </Modal>
  );
}
