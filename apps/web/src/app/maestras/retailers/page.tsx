'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/auth';
import { Badge, Button, ErrorText, Field, Loading, Modal, PageHeader, dmy, input, td, th } from '@/components/kit';
import { api, type ChannelType, type PaymentBase, type RetailerMaster } from '@/lib/api';
import { cn } from '@/lib/cn';

const CHANNELS: Record<ChannelType, string> = {
  department_store: 'Tienda por departamento',
  supermarket: 'Supermercado',
  marketplace: 'Marketplace',
  ecommerce: 'Tienda online propia',
  other: 'Otro',
};

const BASES: Record<PaymentBase, string> = {
  ORDEN: 'fecha de la orden',
  DESPACHO: 'fecha límite de despacho',
};

function RetailerDialog({ r, onClose }: { r: RetailerMaster; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: r.name,
    legalName: r.legalName ?? '',
    taxId: r.taxId ?? '',
    channelType: r.channelType,
    commissionPct: String(r.commissionPct).replace('.', ','),
    paymentDays: String(r.paymentDays),
    paymentBase: r.paymentBase,
    contact: r.contact ?? '',
    commercialTerms: r.commercialTerms ?? '',
    isActive: r.isActive,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () =>
      api.updateRetailer(r.id, {
        ...form,
        legalName: form.legalName || null,
        taxId: form.taxId || null,
        contact: form.contact || null,
        commercialTerms: form.commercialTerms || null,
        paymentDays: Number(form.paymentDays),
        commissionPct: form.commissionPct,
      }),
    onSuccess: () => {
      for (const k of ['retailers', 'receivables']) queryClient.invalidateQueries({ queryKey: [k] });
      onClose();
    },
  });

  return (
    <Modal
      wide
      title={`Editar ${r.name}`}
      subtitle={`Código ${r.code} (lo usan las cargas de archivos, no se cambia)`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre comercial">
          <input value={form.name} onChange={(e) => set('name', e.target.value)} className={input} />
        </Field>
        <Field label="Razón social">
          <input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} className={input} />
        </Field>
        <Field label="RUT">
          <input value={form.taxId} onChange={(e) => set('taxId', e.target.value)} placeholder="77.261.280-K" className={input} />
        </Field>
        <Field label="Tipo de canal">
          <select value={form.channelType} onChange={(e) => set('channelType', e.target.value as ChannelType)} className={input}>
            {Object.entries(CHANNELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="rounded-md border border-slate-200 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-700">Condiciones de pago</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Comisión pactada (%)" hint="Se usa para estimar lo que falta cobrar">
            <input value={form.commissionPct} onChange={(e) => set('commissionPct', e.target.value)} inputMode="decimal" className={input} />
          </Field>
          <Field label="Días de pago">
            <input type="number" min={0} max={365} value={form.paymentDays} onChange={(e) => set('paymentDays', e.target.value)} className={input} />
          </Field>
          <Field label="Se cuentan desde">
            <select value={form.paymentBase} onChange={(e) => set('paymentBase', e.target.value as PaymentBase)} className={input}>
              <option value="ORDEN">La fecha de la orden</option>
              <option value="DESPACHO">La fecha límite de despacho</option>
            </select>
          </Field>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Los archivos de los retailers no traen la fecha de entrega real; la fecha límite de despacho es lo más cercano.
        </p>
      </div>

      <Field label="Contacto comercial (KAM)" hint="Nombre, correo, teléfono">
        <input value={form.contact} onChange={(e) => set('contact', e.target.value)} className={input} />
      </Field>
      <Field label="Condiciones comerciales" hint="Rappel, aportes, cofinanciamientos, acuerdos…">
        <textarea value={form.commercialTerms} onChange={(e) => set('commercialTerms', e.target.value)} rows={3} className={input} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="accent-brand-600" />
        Activo
      </label>
      <ErrorText error={save.error} />
    </Modal>
  );
}

export default function RetailersPage() {
  const { isAdmin } = useAuth();
  const list = useQuery({ queryKey: ['retailers'], queryFn: api.listRetailers });
  const [editing, setEditing] = useState<RetailerMaster | null>(null);

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <PageHeader
        title="Retailers"
        subtitle="Datos de cada cliente retail: razón social, comisión pactada y cuándo paga. Con esto se calculan las cuentas por cobrar."
      />
      <ErrorText error={list.error} />
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {list.isLoading ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <th className={th}>Retailer</th>
                  <th className={th}>Razón social / RUT</th>
                  <th className={cn(th, 'text-right')}>Comisión</th>
                  <th className={th}>Paga</th>
                  <th className={th}>Contacto</th>
                  <th className={cn(th, 'text-right')}>Órdenes</th>
                  <th className={th}>Última venta</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.data?.map((r) => (
                  <tr key={r.id} className={cn('align-top hover:bg-slate-50', !r.isActive && 'text-slate-400')}>
                    <td className={td}>
                      <p className="font-medium">{r.name}</p>
                      <p className="font-mono text-xs text-slate-400">{r.code}</p>
                      {!r.isActive && <Badge>Inactivo</Badge>}
                    </td>
                    <td className={td}>
                      {r.legalName ?? <span className="text-slate-300">—</span>}
                      {r.taxId && <span className="block text-xs text-slate-500">{r.taxId}</span>}
                    </td>
                    <td className={cn(td, 'text-right tabular-nums')}>
                      {r.commissionPct > 0 ? `${r.commissionPct.toLocaleString('es-CL')}%` : <Badge tone="amber">Sin definir</Badge>}
                    </td>
                    <td className={td}>
                      {r.paymentDays} días
                      <span className="block text-xs text-slate-500">desde la {BASES[r.paymentBase]}</span>
                    </td>
                    <td className={cn(td, 'max-w-56 text-xs text-slate-600')}>{r.contact ?? <span className="text-slate-300">—</span>}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{r.orders.toLocaleString('es-CL')}</td>
                    <td className={cn(td, 'tabular-nums')}>{dmy(r.lastOrderDate)}</td>
                    <td className={cn(td, 'text-right')}>
                      {isAdmin && (
                        <button onClick={() => setEditing(r)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Editar">
                          <Pencil className="size-4" />
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
      {!isAdmin && <p className="mt-2 text-xs text-slate-400">Solo los administradores pueden editar los retailers.</p>}
      {editing && <RetailerDialog r={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
