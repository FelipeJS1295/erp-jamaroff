'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type FacturaReceptor } from '@/lib/api';
import { cn } from '@/lib/cn';
import { MIPYME_GUIDE_URL, SII_URL } from './credit-note-dialog';
import { Button, ErrorText, Field, Loading, Modal, clp, dmy, input } from './kit';

const EMPTY: FacturaReceptor = { rut: '', name: '', activity: '', address: '', commune: '' };

/**
 * Factura (33) de una orden cuyo cliente pidió factura: el ERP la arma como borrador en el
 * Portal MIPYME con los datos de facturación que trae el retailer (o los que se busquen en el SII).
 */
export function FacturaDialog({
  retailerCode,
  orderNumber,
  orderLabel,
  onClose,
}: {
  retailerCode: string;
  orderNumber: string;
  orderLabel?: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ['factura-preview', retailerCode, orderNumber],
    queryFn: () => api.facturaPreview(retailerCode, orderNumber),
    gcTime: 0,
  });
  const p = preview.data;
  const [r, setR] = useState<FacturaReceptor>(EMPTY);
  const [activities, setActivities] = useState<string[]>([]);
  useEffect(() => {
    if (p) setR(p.receptor);
  }, [p]);
  const set = (k: keyof FacturaReceptor) => (e: { target: { value: string } }) => setR((x) => ({ ...x, [k]: e.target.value }));

  const lookup = useMutation({
    mutationFn: () => api.contribuyente(r.rut),
    onSuccess: (c) => {
      const dir = c.direcciones[0];
      const acts = c.actividades.map((a) => a.glosa.slice(0, 40));
      setActivities(acts);
      setR((x) => ({
        rut: c.rut,
        name: c.razonSocial ?? x.name,
        activity: x.activity || acts[0] || '',
        address: dir?.direccion ?? x.address,
        commune: dir?.comuna ?? x.commune,
      }));
    },
  });

  const save = useMutation({
    mutationFn: () => api.createFactura({ retailerCode, orderNumber, receptor: r }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales'] }),
  });

  if (save.isSuccess) {
    return (
      <Modal title="Factura" subtitle={`OC ${orderLabel ?? orderNumber}`} onClose={onClose} footer={<Button onClick={onClose}>Listo</Button>}>
        <p className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="size-5" /> Borrador N° <b>{save.data.draftCode}</b> creado en el Portal MIPYME.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>
            En sii.cl entra a <b>Factura electrónica</b> → <b>Sistema de facturación gratuito del SII</b> → <b>Documentos borradores</b>.
          </li>
          <li>
            Abre el borrador <b>{save.data.draftCode}</b>, revísalo y presiona <b>Firmar y enviar</b>.
          </li>
          <li>Al volver a Ventas, el ERP detecta la factura firmada, le anota el folio y deja su PDF disponible.</li>
        </ol>
        <div className="flex gap-4 text-sm">
          <a href={SII_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
            Abrir sii.cl <ExternalLink className="size-3.5" />
          </a>
          <a href={MIPYME_GUIDE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-600 hover:underline">
            Guía del SII <ExternalLink className="size-3.5" />
          </a>
        </div>
      </Modal>
    );
  }

  const ready = r.rut.trim() && r.name.trim() && r.activity.trim() && r.address.trim() && r.commune.trim();
  return (
    <Modal
      wide
      title="Factura en el Portal MIPYME"
      subtitle={`${retailerCode} · OC ${orderLabel ?? orderNumber}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!p || !ready || Boolean(p.existing)}>
            Crear borrador
          </Button>
        </>
      }
    >
      <ErrorText error={preview.error} />
      {preview.isLoading && <Loading />}
      {p && (
        <>
          {p.existing && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Esta orden ya tiene documento ({p.existing.status === 'BORRADOR' ? 'factura en borrador' : `N° ${p.existing.number}`}).
            </p>
          )}
          {!p.wantsInvoice && (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              El archivo del retailer no indica que el cliente pidió factura. Puedes hacerla igual si te la solicitó.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="col-span-2 rounded-md bg-slate-50 p-2 text-left">
              <p className="text-xs text-slate-500">Detalle</p>
              <p className="font-medium">{p.item}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-2">
              <p className="text-xs text-slate-500">Total con IVA · {dmy(p.issueDate)}</p>
              <p className="font-semibold tabular-nums">{clp(p.total)}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="RUT de la empresa">
              <div className="flex gap-2">
                <input value={r.rut} onChange={set('rut')} placeholder="76.123.456-7" className={input} />
                <Button variant="secondary" onClick={() => lookup.mutate()} loading={lookup.isPending} disabled={!r.rut.trim()} title="Traer razón social, dirección y giro desde el SII">
                  <Search className="size-4" /> SII
                </Button>
              </div>
            </Field>
            <Field label="Razón social">
              <input value={r.name} onChange={set('name')} maxLength={100} className={input} />
            </Field>
            <Field label="Giro" hint="Máximo 40 caracteres">
              {activities.length > 1 ? (
                <select value={r.activity} onChange={set('activity')} className={input}>
                  {activities.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              ) : (
                <input value={r.activity} onChange={set('activity')} maxLength={40} className={input} />
              )}
            </Field>
            <Field label="Dirección">
              <input value={r.address} onChange={set('address')} maxLength={70} className={input} />
            </Field>
            <Field label="Comuna">
              <input value={r.commune} onChange={set('commune')} maxLength={20} className={cn(input)} />
            </Field>
          </div>
          <ErrorText error={lookup.error ?? save.error} />
          <p className="text-xs text-slate-500">
            Queda como borrador en el Portal MIPYME: no es válida hasta que la firmes allá. No cuenta en el IVA hasta que esté firmada.
          </p>
        </>
      )}
    </Modal>
  );
}
