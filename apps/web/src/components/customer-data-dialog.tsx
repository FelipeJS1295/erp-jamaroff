'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Loader2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { api, type SaleRow } from '@/lib/api';
import { cn } from '@/lib/cn';

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/**
 * Datos del cliente de una orden para emitir la boleta o la factura en el SII.
 * Cada dato tiene su botón de copiar.
 */
export function CustomerDataDialog({ sale, onClose }: { sale: SaleRow; onClose: () => void }) {
  const data = useQuery({
    queryKey: ['customer-data', sale.retailerCode, sale.orderNumber],
    queryFn: () => api.customerData(sale.retailerCode, sale.orderNumber!),
  });
  const d = data.data;
  const isInvoice = d?.documentType === 'FACTURA';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              Datos para {isInvoice ? 'la factura' : 'la boleta'}
              {d && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    isInvoice ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700',
                  )}
                >
                  {isInvoice ? 'Factura' : 'Boleta'}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500">
              {sale.retailer} · OC {sale.orderNumber}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {data.isLoading && (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" /> Cargando datos…
            </p>
          )}
          {data.isError && <p className="py-8 text-center text-sm text-red-600">{data.error.message}</p>}

          {d && (
            <>
              {isInvoice && d.billing && (
                <Section title="Datos de facturación">
                  <Field label="Razón social" value={d.billing.legalName} />
                  <Field label="RUT empresa" value={d.billing.rut} />
                  <Field label="Giro" value={d.billing.activity} />
                  <Field label="Dirección" value={d.billing.address} />
                </Section>
              )}

              <Section title={isInvoice ? 'Contacto' : 'Cliente'}>
                <Field label="RUT" value={d.customer.rut} />
                <Field label="Nombre" value={d.customer.name} />
                {d.customer.email && <Field label="Email" value={d.customer.email} />}
                {!isInvoice && (
                  <Field
                    label="Dirección"
                    value={[d.shipping.address, d.shipping.commune, d.shipping.region].filter(Boolean).join(', ') || null}
                  />
                )}
              </Section>

              <Section title={d.lines.length === 1 ? 'Producto' : 'Productos'}>
                {d.lines.map((l, i) => (
                  <Field
                    key={i}
                    label={l.quantity > 1 ? `Producto (${l.quantity} u.)` : 'Producto'}
                    value={l.productName}
                    note={isInvoice ? `Neto ${clp(l.amountNet)}` : clp(l.amountGross)}
                  />
                ))}
              </Section>

              {isInvoice ? (
                <Section title="Montos (producto + envío)">
                  <Field label="Neto" value={String(d.totalNet)} display={clp(d.totalNet)} />
                  <Field label="IVA (19%)" value={String(d.totalVat)} display={clp(d.totalVat)} />
                  <Field label="Total" value={String(d.total)} display={clp(d.total)} strong />
                  <p className="text-xs text-slate-500">
                    Producto {clp(d.productTotal)} + envío {clp(d.shippingTotal)}, con IVA.
                  </p>
                </Section>
              ) : (
                <Section title="Total">
                  <Field label="Total (producto + envío)" value={String(d.total)} display={clp(d.total)} strong />
                  <p className="text-xs text-slate-500">
                    Producto {clp(d.productTotal)} + envío {clp(d.shippingTotal)}, con IVA.
                  </p>
                </Section>
              )}

              {!d.customer.rut && !isInvoice && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Este retailer no informa el RUT del cliente en el archivo de ventas.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

/** Un dato con su botón de copiar. "display" = cómo se muestra, si es distinto de lo que se copia */
function Field(props: { label: string; value: string | null; display?: string; note?: string; strong?: boolean }) {
  const { label, value, display, note, strong } = props;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Respaldo si el navegador no permite el portapapeles
      const area = document.createElement('textarea');
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={cn('text-sm break-words', strong && 'text-base font-semibold', !value && 'text-slate-400')}>
          {value ? (display ?? value) : 'No informado'}
        </p>
        {note && <p className="text-xs text-slate-500">{note}</p>}
      </div>
      <button
        onClick={copy}
        disabled={!value}
        title={copied ? 'Copiado' : 'Copiar'}
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-md border transition-colors disabled:opacity-30',
          copied
            ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
            : 'border-slate-200 text-slate-500 hover:border-brand-500 hover:text-brand-600',
        )}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}