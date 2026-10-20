'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type ProductReturn, type ReturnInput, type ReturnStatus, type SupplierAction } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button, ErrorText, Field, Modal, clp, input, parseAmount, todayCL } from './kit';

export const RETURN_STATUS: Record<ReturnStatus, { label: string; tone: 'slate' | 'blue' | 'amber' | 'green' | 'red' | 'violet' }> = {
  SOLICITADA: { label: 'Solicitada', tone: 'amber' },
  EN_TRANSITO: { label: 'En tránsito', tone: 'blue' },
  RECIBIDA: { label: 'Recibida', tone: 'violet' },
  CERRADA: { label: 'Cerrada', tone: 'green' },
  RECHAZADA: { label: 'Rechazada', tone: 'red' },
};

export const SUPPLIER_ACTION: Record<SupplierAction, string> = {
  NINGUNA: 'Nada (queda en bodega / se revende)',
  DEVUELTO: 'Se devolvió al proveedor',
  NC_PROVEEDOR: 'El proveedor da nota de crédito',
};

const typing = (v: string) => {
  const d = v.replace(/[^\d]/g, '');
  return d ? Number(d).toLocaleString('es-CL') : '';
};
const amountText = (n: number | null | undefined) => (n === null || n === undefined ? '' : typing(String(Math.round(n))));
const toApi = (text: string) => {
  const n = parseAmount(text);
  return n === null ? null : String(n);
};

/**
 * Crear o editar una devolución. Para crear se indica la orden (retailer + N°);
 * desde Ventas ya viene elegida.
 */
export function ReturnDialog({
  existing,
  order,
  onClose,
}: {
  existing?: ProductReturn;
  order?: { retailerCode: string; orderNumber: string; label?: string | null; salePrice?: number | null };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const retailers = useQuery({ queryKey: ['retailers'], queryFn: api.listRetailers, enabled: !existing && !order });

  const [retailerCode, setRetailerCode] = useState(existing?.retailerCode ?? order?.retailerCode ?? '');
  const [orderNumber, setOrderNumber] = useState(existing?.orderNumber ?? order?.orderNumber ?? '');
  const [requestedAt, setRequestedAt] = useState(existing?.requestedAt ?? todayCL());
  const [scope, setScope] = useState<'TOTAL' | 'PARCIAL'>(existing?.scope ?? 'TOTAL');
  const [reason, setReason] = useState(existing?.reason ?? '');
  const [status, setStatus] = useState<ReturnStatus>(existing?.status ?? 'SOLICITADA');
  const [receivedAt, setReceivedAt] = useState(existing?.receivedAt ?? '');
  const [condition, setCondition] = useState(existing?.productCondition ?? '');
  const [refund, setRefund] = useState(amountText(existing?.refundGross ?? (existing ? null : order?.salePrice)));
  const [logistics, setLogistics] = useState(amountText(existing?.reverseLogisticsCost));
  const [supplierAction, setSupplierAction] = useState<SupplierAction>(existing?.supplierAction ?? 'NINGUNA');
  const [supplierCredit, setSupplierCredit] = useState(amountText(existing?.supplierCreditGross));
  const [tracking, setTracking] = useState(existing?.trackingCode ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const save = useMutation({
    mutationFn: () => {
      const data: ReturnInput = {
        retailerCode,
        orderNumber: orderNumber.trim(),
        requestedAt,
        scope,
        reason: reason.trim(),
        status,
        receivedAt: receivedAt || null,
        productCondition: (condition || null) as ReturnInput['productCondition'],
        refundGross: toApi(refund),
        reverseLogisticsCost: toApi(logistics),
        supplierAction,
        supplierCreditGross: supplierAction === 'NC_PROVEEDOR' ? toApi(supplierCredit) : null,
        trackingCode: tracking.trim() || null,
        notes: notes.trim() || null,
      };
      if (existing) {
        const { retailerCode: _r, orderNumber: _o, ...changes } = data;
        return api.updateReturn(existing.id, changes);
      }
      return api.createReturn(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      onClose();
    },
  });

  const cost = (parseAmount(logistics) ?? 0) + (parseAmount(refund) ?? 0) - (supplierAction === 'NC_PROVEEDOR' ? (parseAmount(supplierCredit) ?? 0) : 0);

  return (
    <Modal
      wide
      title={existing ? 'Editar devolución' : 'Nueva devolución'}
      subtitle={existing || order ? `${existing?.retailer ?? order?.retailerCode} · OC ${existing?.orderId ?? order?.label ?? orderNumber}` : undefined}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!retailerCode || !orderNumber.trim() || reason.trim().length < 3}>
            Guardar
          </Button>
        </>
      }
    >
      {!existing && !order && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Retailer">
            <select value={retailerCode} onChange={(e) => setRetailerCode(e.target.value)} className={input}>
              <option value="">Elige…</option>
              {retailers.data?.map((r) => (
                <option key={r.id} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="N° de orden" hint="Tal como aparece en el archivo de ventas">
            <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} className={input} />
          </Field>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Fecha de solicitud">
          <input type="date" value={requestedAt} onChange={(e) => setRequestedAt(e.target.value)} className={input} />
        </Field>
        <Field label="Alcance">
          <select value={scope} onChange={(e) => setScope(e.target.value as 'TOTAL' | 'PARCIAL')} className={input}>
            <option value="TOTAL">Toda la orden</option>
            <option value="PARCIAL">Parte de la orden</option>
          </select>
        </Field>
        <Field label="Estado">
          <select value={status} onChange={(e) => setStatus(e.target.value as ReturnStatus)} className={input}>
            {Object.entries(RETURN_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Motivo" className="sm:col-span-3">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: producto con falla, no le gustó, llegó dañado…" className={input} />
        </Field>
        <Field label="Fecha en que llegó">
          <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className={input} />
        </Field>
        <Field label="Estado del producto">
          <select value={condition} onChange={(e) => setCondition(e.target.value)} className={input}>
            <option value="">Sin revisar</option>
            <option value="BUENO">Bueno (se puede vender)</option>
            <option value="DANADO">Dañado</option>
          </select>
        </Field>
        <Field label="N° de seguimiento">
          <input value={tracking} onChange={(e) => setTracking(e.target.value)} className={input} />
        </Field>
      </div>

      <div className="rounded-md border border-slate-200 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-700">Costos (con IVA)</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Devuelto al cliente" hint="Lo que se le reembolsa">
            <input inputMode="numeric" value={refund} onChange={(e) => setRefund(typing(e.target.value))} className={cn(input, 'tabular-nums')} />
          </Field>
          <Field
            label="Logística inversa"
            hint={
              existing?.settlementLogistics ? (
                <button type="button" onClick={() => setLogistics(amountText(existing.settlementLogistics))} className="text-brand-600 hover:underline">
                  Usar lo de la liquidación: {clp(existing.settlementLogistics)}
                </button>
              ) : (
                'Lo que cobra el retailer por el retiro'
              )
            }
          >
            <input inputMode="numeric" value={logistics} onChange={(e) => setLogistics(typing(e.target.value))} className={cn(input, 'tabular-nums')} />
          </Field>
          <Field label="Con el proveedor">
            <select value={supplierAction} onChange={(e) => setSupplierAction(e.target.value as SupplierAction)} className={input}>
              {Object.entries(SUPPLIER_ACTION).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          {supplierAction === 'NC_PROVEEDOR' && (
            <Field label="Monto que reconoce el proveedor">
              <input inputMode="numeric" value={supplierCredit} onChange={(e) => setSupplierCredit(typing(e.target.value))} className={cn(input, 'tabular-nums')} />
            </Field>
          )}
        </div>
        <p className="mt-2 text-sm">
          Costo de la devolución para la empresa: <b className="tabular-nums">{clp(cost)}</b>
          <span className="block text-xs text-slate-500">Logística inversa + devuelto al cliente − lo que reconoce el proveedor</span>
        </p>
      </div>

      <Field label="Notas">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={input} />
      </Field>
      <ErrorText error={save.error} />
    </Modal>
  );
}
