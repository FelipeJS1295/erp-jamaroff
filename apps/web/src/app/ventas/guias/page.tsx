'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileText, Plus, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/auth';
import { MIPYME_GUIDE_URL, SII_URL } from '@/components/credit-note-dialog';
import { Badge, Button, ErrorText, Field, Loading, Modal, PageHeader, Stat, clp, dmy, input, td, th, todayCL } from '@/components/kit';
import { MipymeSync } from '@/components/mipyme-sync';
import { api, type DispatchGuide, type GuideInput } from '@/lib/api';
import { cn } from '@/lib/cn';

const TRANSFER: Record<number, string> = {
  1: 'Venta',
  2: 'Venta por efectuar',
  3: 'Consignación',
  5: 'Traslado interno (ej: a bodega del retailer)',
  6: 'Otros traslados (no venta)',
  7: 'Guía de devolución (ej: al proveedor)',
};

export default function GuidesPage() {
  const { canEdit } = useAuth();
  const queryClient = useQueryClient();
  const sii = useQuery({ queryKey: ['sii-status'], queryFn: api.siiStatus, staleTime: 5 * 60_000 });
  const list = useQuery({ queryKey: ['guides'], queryFn: api.listGuides });
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<DispatchGuide | null>(null);
  const remove = useMutation({ mutationFn: api.deleteGuide, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guides'] }) });
  const all = list.data ?? [];
  const drafts = all.filter((g) => g.status === 'BORRADOR');

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <PageHeader
        title="Guías de despacho"
        subtitle="Para trasladar mercadería que no va con boleta: envíos a bodega de un retailer, devoluciones al proveedor, consignación. El ERP la arma como borrador en el Portal MIPYME y tú la firmas allá."
        actions={
          canEdit &&
          sii.data?.enabled && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Nueva guía
            </Button>
          )
        }
      />
      <MipymeSync hasDrafts={drafts.length > 0} className="mb-4" />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Guías" value={all.length} />
        <Stat label="Borradores sin firmar" value={drafts.length} tone={drafts.length ? 'amber' : undefined} />
        <Stat label="Emitidas" value={all.length - drafts.length} />
      </div>
      <ErrorText error={list.error ?? remove.error} />
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {list.isLoading ? (
          <Loading />
        ) : all.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">Aún no hay guías de despacho.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <th className={th}>Fecha</th>
                  <th className={th}>Destinatario</th>
                  <th className={th}>Motivo</th>
                  <th className={th}>Productos</th>
                  <th className={cn(th, 'text-right')}>Total</th>
                  <th className={th}>Estado</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {all.map((g) => (
                  <tr key={g.id} className="align-top hover:bg-slate-50">
                    <td className={cn(td, 'tabular-nums')}>{dmy(g.issuedAt ?? g.guideDate)}</td>
                    <td className={td}>
                      <span className="font-medium">{g.receptorName}</span>
                      <span className="block text-xs text-slate-500">
                        {g.receptorRut}
                        {g.address && ` · ${g.address}, ${g.commune ?? ''}`}
                      </span>
                      {g.reference && <span className="block text-xs text-slate-500">Ref: {g.reference}</span>}
                    </td>
                    <td className={cn(td, 'text-xs')}>{g.transferLabel}</td>
                    <td className={cn(td, 'max-w-72 text-xs')}>
                      {g.items.map((i, n) => (
                        <span key={n} className="block">
                          {i.quantity} × {i.name}
                        </span>
                      ))}
                    </td>
                    <td className={cn(td, 'text-right tabular-nums')}>{g.totalGross ? clp(g.totalGross) : '—'}</td>
                    <td className={td}>
                      <Badge tone={g.status === 'BORRADOR' ? 'amber' : 'green'}>{g.status === 'BORRADOR' ? 'Borrador: falta firmar' : 'Emitida'}</Badge>
                      <span className="mt-0.5 block text-xs text-slate-500">{g.folio ? `N° ${g.folio}` : `Borrador ${g.draftCode ?? ''}`}</span>
                    </td>
                    <td className={cn(td, 'text-right whitespace-nowrap')}>
                      {g.hasPdf && (
                        <a href={api.guidePdfUrl(g.id)} target="_blank" rel="noreferrer" className="mr-1 inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
                          <FileText className="size-3.5" /> PDF
                        </a>
                      )}
                      {canEdit && g.status === 'BORRADOR' && (
                        <>
                          <Button variant="link" onClick={() => setConfirming(g)}>
                            Anotar folio
                          </Button>
                          <button
                            onClick={() => window.confirm('¿Quitar la guía en borrador? También se borra del Portal MIPYME.') && remove.mutate(g.id)}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Quitar"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {creating && <GuideDialog onClose={() => setCreating(false)} />}
      {confirming && <ConfirmGuide guide={confirming} onClose={() => setConfirming(null)} />}
    </div>
  );
}

const typing = (v: string) => {
  const d = v.replace(/[^\d]/g, '');
  return d ? Number(d).toLocaleString('es-CL') : '';
};

function GuideDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [g, setG] = useState({
    guideDate: todayCL(),
    transferType: 5,
    receptorRut: '',
    receptorName: '',
    receptorActivity: '',
    address: '',
    commune: '',
    reference: '',
    notes: '',
  });
  const [items, setItems] = useState([{ name: '', quantity: '1', price: '' }]);
  const set = (k: keyof typeof g) => (e: { target: { value: string } }) => setG((x) => ({ ...x, [k]: k === 'transferType' ? Number(e.target.value) : e.target.value }));

  const lookup = useMutation({
    mutationFn: () => api.contribuyente(g.receptorRut),
    onSuccess: (c) =>
      setG((x) => ({
        ...x,
        receptorRut: c.rut,
        receptorName: c.razonSocial ?? x.receptorName,
        receptorActivity: (c.actividades[0]?.glosa ?? x.receptorActivity).slice(0, 40),
        address: c.direcciones[0]?.direccion ?? x.address,
        commune: c.direcciones[0]?.comuna ?? x.commune,
      })),
  });

  const save = useMutation({
    mutationFn: () => {
      const data: GuideInput = {
        ...g,
        receptorActivity: g.receptorActivity || null,
        address: g.address || null,
        commune: g.commune || null,
        reference: g.reference || null,
        notes: g.notes || null,
        items: items
          .filter((i) => i.name.trim())
          .map((i) => ({ name: i.name.trim(), quantity: Number(i.quantity.replace(',', '.')) || 1, price: Number(i.price.replace(/[^\d]/g, '')) || 0 })),
      };
      return api.createGuide(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guides'] }),
  });

  if (save.isSuccess) {
    return (
      <Modal title="Guía de despacho" onClose={onClose} footer={<Button onClick={onClose}>Listo</Button>}>
        <p className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="size-5" /> Borrador N° <b>{save.data.draftCode}</b> creado en el Portal MIPYME.
        </p>
        <p className="text-sm text-slate-700">
          Fírmalo en sii.cl → Factura electrónica → Sistema de facturación gratuito → <b>Documentos borradores</b>. Al volver a esta pantalla el ERP anota el
          folio solo.
        </p>
        <div className="flex gap-4 text-sm">
          <a href={SII_URL} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
            Abrir sii.cl
          </a>
          <a href={MIPYME_GUIDE_URL} target="_blank" rel="noreferrer" className="text-slate-600 hover:underline">
            Guía del SII
          </a>
        </div>
      </Modal>
    );
  }

  const total = items.reduce((n, i) => n + (Number(i.price.replace(/[^\d]/g, '')) || 0) * (Number(i.quantity.replace(',', '.')) || 0), 0);
  const ready = g.receptorRut.trim() && g.receptorName.trim() && items.some((i) => i.name.trim());
  return (
    <Modal
      wide
      title="Nueva guía de despacho"
      subtitle="Se crea como borrador en el Portal MIPYME"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!ready}>
            Crear borrador
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha">
          <input type="date" value={g.guideDate} onChange={set('guideDate')} className={input} />
        </Field>
        <Field label="Motivo del traslado">
          <select value={g.transferType} onChange={set('transferType')} className={input}>
            {Object.entries(TRANSFER).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="RUT del destinatario" hint="Para un traslado interno, el RUT de la empresa">
          <div className="flex gap-2">
            <input value={g.receptorRut} onChange={set('receptorRut')} className={input} />
            <Button variant="secondary" onClick={() => lookup.mutate()} loading={lookup.isPending} disabled={!g.receptorRut.trim()}>
              <Search className="size-4" /> SII
            </Button>
          </div>
        </Field>
        <Field label="Nombre / razón social">
          <input value={g.receptorName} onChange={set('receptorName')} maxLength={100} className={input} />
        </Field>
        <Field label="Dirección de destino">
          <input value={g.address} onChange={set('address')} maxLength={70} className={input} />
        </Field>
        <Field label="Comuna">
          <input value={g.commune} onChange={set('commune')} maxLength={20} className={input} />
        </Field>
        <Field label="Giro (opcional)">
          <input value={g.receptorActivity} onChange={set('receptorActivity')} maxLength={40} className={input} />
        </Field>
        <Field label="Referencia (opcional)" hint="Ej: N° de cita, orden, retailer">
          <input value={g.reference} onChange={set('reference')} maxLength={80} className={input} />
        </Field>
      </div>

      <div className="rounded-md border border-slate-200 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-700">Productos</p>
        <div className="space-y-2">
          {items.map((i, n) => (
            <div key={n} className="flex gap-2">
              <input
                value={i.name}
                onChange={(e) => setItems((x) => x.map((y, m) => (m === n ? { ...y, name: e.target.value } : y)))}
                placeholder="Producto"
                maxLength={80}
                className={cn(input, 'flex-1')}
              />
              <input
                value={i.quantity}
                onChange={(e) => setItems((x) => x.map((y, m) => (m === n ? { ...y, quantity: e.target.value } : y)))}
                className={cn(input, 'w-20 text-right')}
                title="Cantidad"
              />
              <input
                value={i.price}
                onChange={(e) => setItems((x) => x.map((y, m) => (m === n ? { ...y, price: typing(e.target.value) } : y)))}
                placeholder="Precio c/IVA"
                className={cn(input, 'w-32 text-right tabular-nums')}
                title="Precio unitario con IVA (déjalo vacío si es solo traslado)"
              />
              <button
                onClick={() => setItems((x) => (x.length > 1 ? x.filter((_, m) => m !== n) : x))}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Quitar producto"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <Button variant="link" onClick={() => setItems((x) => [...x, { name: '', quantity: '1', price: '' }])}>
            <Plus className="size-3.5" /> Agregar producto
          </Button>
          <span className="text-slate-600">Total: {total ? clp(total) : 'sin precio (solo traslado)'}</span>
        </div>
      </div>
      <ErrorText error={lookup.error ?? save.error} />
    </Modal>
  );
}

function ConfirmGuide({ guide, onClose }: { guide: DispatchGuide; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [folio, setFolio] = useState('');
  const [date, setDate] = useState(todayCL());
  const save = useMutation({
    mutationFn: () => api.confirmGuide(guide.id, folio.trim(), date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guides'] });
      onClose();
    },
  });
  return (
    <Modal
      title="Anotar folio de la guía"
      subtitle={`${guide.receptorName} · borrador ${guide.draftCode ?? ''}`}
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
      <p className="text-sm text-slate-600">Normalmente se anota solo al revisar el portal. Úsalo si no se encontró.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Folio">
          <input value={folio} onChange={(e) => setFolio(e.target.value)} className={input} />
        </Field>
        <Field label="Fecha de emisión">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </Field>
      </div>
      <ErrorText error={save.error} />
    </Modal>
  );
}
