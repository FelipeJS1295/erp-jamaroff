'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

// Una revisión automática cada 5 minutos como máximo (entre todas las pantallas)
let lastAuto = 0;

/**
 * Revisa en el Portal MIPYME qué borradores (notas de crédito, facturas, guías) ya se
 * firmaron, y les anota el folio solo. Corre al abrir la pantalla y con el botón.
 */
export function MipymeSync({ hasDrafts, className }: { hasDrafts: boolean; className?: string }) {
  const queryClient = useQueryClient();
  const sii = useQuery({ queryKey: ['sii-status'], queryFn: api.siiStatus, staleTime: 5 * 60_000 });
  const sync = useMutation({
    mutationFn: api.mipymeSync,
    onSuccess: (r) => {
      if (r.emitted.length) {
        for (const key of ['sales', 'credit-notes', 'credit-notes-pending', 'vat', 'guides', 'returns']) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
      }
    },
  });
  const enabled = Boolean(sii.data?.enabled);

  useEffect(() => {
    if (enabled && hasDrafts && Date.now() - lastAuto > 5 * 60_000) {
      lastAuto = Date.now();
      sync.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hasDrafts]);

  if (!enabled || (!hasDrafts && !sync.data)) return null;
  const r = sync.data;
  return (
    <div className={cn('flex flex-wrap items-center gap-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900', className)}>
      {sync.isPending ? (
        <span>Revisando en el Portal MIPYME qué borradores ya firmaste…</span>
      ) : sync.isError ? (
        <span className="text-red-700">{sync.error.message}</span>
      ) : r && r.emitted.length > 0 ? (
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="size-4 text-emerald-600" />
          Ya firmados en el SII: {r.emitted.map((e) => `${e.label} (N° ${e.folio})`).join(' · ')}
        </span>
      ) : r ? (
        <span>
          {r.stillDraft > 0 ? `${r.stillDraft} borrador(es) (notas de crédito, facturas o guías) aún sin firmar en el Portal MIPYME.` : 'No hay borradores pendientes.'}
          {r.notFound.length > 0 && ` No se encontró el documento firmado de: ${r.notFound.join(', ')} (anótalo a mano).`}
        </span>
      ) : (
        <span>Hay borradores en el Portal MIPYME esperando tu firma.</span>
      )}
      <button
        onClick={() => {
          lastAuto = Date.now();
          sync.mutate();
        }}
        disabled={sync.isPending}
        className="ml-auto inline-flex items-center gap-1 rounded border border-sky-300 bg-white px-2 py-1 text-xs font-medium hover:bg-sky-100 disabled:opacity-50"
      >
        <RefreshCw className={cn('size-3.5', sync.isPending && 'animate-spin')} /> Revisar en el SII
      </button>
    </div>
  );
}
