'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type RetailProviderCode, type RetailSyncJob } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * Botón que sincroniza uno o varios retailers por API. La sincronización corre en el
 * servidor; aquí se consulta el avance cada segundo y medio.
 */
export function RetailSyncButton({
  providers,
  kind,
  range,
  invalidate,
  disabled,
}: {
  providers: { code: RetailProviderCode; label: string }[];
  kind: 'orders' | 'products';
  range?: { from: string; to: string };
  invalidate: string[];
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [jobs, setJobs] = useState<RetailSyncJob[]>([]);
  const running = jobs.some((j) => j.status === 'RUNNING');

  const start = useMutation({
    mutationFn: () =>
      Promise.all(
        providers.map((p) =>
          (kind === 'orders' ? api.syncRetailOrders(p.code, range!.from, range!.to) : api.syncRetailProducts(p.code)).catch(
            (err: Error): RetailSyncJob => ({
              id: '',
              provider: p.code,
              kind,
              status: 'ERROR',
              message: `${p.label}: ${err.message}`,
              count: 0,
              startedAt: '',
              finishedAt: null,
            }),
          ),
        ),
      ),
    onSuccess: setJobs,
  });

  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const next = await Promise.all(jobs.map((j) => (j.status === 'RUNNING' && j.id ? api.retailJob(j.id).catch(() => ({ ...j, status: 'ERROR' as const, message: 'Se perdió el avance' })) : j)));
      setJobs(next);
      if (!next.some((j) => j.status === 'RUNNING')) for (const key of invalidate) queryClient.invalidateQueries({ queryKey: [key] });
    }, 1500);
    return () => clearInterval(t);
  }, [jobs, running, invalidate, queryClient]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => start.mutate()}
        disabled={disabled || running || start.isPending || providers.length === 0}
        className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
      >
        <RefreshCw className={cn('size-4', (running || start.isPending) && 'animate-spin')} />
        {running ? 'Sincronizando…' : `Sincronizar ${providers.length === 1 ? providers[0].label : 'todo'}`}
      </button>
      {jobs.map((j) => (
        <span
          key={j.provider}
          className={cn(
            'flex items-center gap-1 text-xs',
            j.status === 'ERROR' ? 'text-red-600' : j.status === 'DONE' ? 'text-emerald-700' : 'text-slate-500',
          )}
        >
          {j.status === 'RUNNING' ? <Loader2 className="size-3 animate-spin" /> : j.status === 'DONE' ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
          {j.message}
        </span>
      ))}
    </div>
  );
}
