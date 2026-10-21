'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Loader2, PlugZap, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth';
import { Badge, Button, ErrorText, Field, Loading, PageHeader, input } from '@/components/kit';
import { api, type RetailApiConnection, type RetailSyncJob } from '@/lib/api';
import { cn } from '@/lib/cn';

const STATUS = {
  SIN_PROBAR: { label: 'Sin probar', tone: 'slate' as const },
  OK: { label: 'Conectado', tone: 'green' as const },
  ERROR: { label: 'Con error', tone: 'red' as const },
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' }) : 'nunca';

export default function RetailConnectionPage() {
  const list = useQuery({ queryKey: ['retail-connections'], queryFn: api.retailConnections });
  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <PageHeader
        title="Conexión con los retailers"
        subtitle="Credenciales para traer ventas y productos directo desde las APIs de Falabella, Paris y Walmart. Las claves se guardan cifradas y nunca se vuelven a mostrar completas."
      />
      <ErrorText error={list.error} />
      {list.isLoading && <Loading />}
      <div className="space-y-5">
        {list.data?.map((c) => (
          <ConnectionCard key={c.provider} c={c} />
        ))}
      </div>
    </div>
  );
}

function ConnectionCard({ c }: { c: RetailApiConnection }) {
  const queryClient = useQueryClient();
  const { isAdmin, canEdit } = useAuth();
  const [settings, setSettings] = useState(c.settings);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(c.enabled || !c.configured);
  useEffect(() => setSettings(c.settings), [c.settings]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['retail-connections'] });
  const save = useMutation({
    mutationFn: () => api.saveRetailConnection(c.provider, { enabled, settings, secrets }),
    onSuccess: () => {
      setSecrets({});
      refresh();
    },
  });
  const test = useMutation({
    mutationFn: () => api.testRetailConnection(c.provider),
    onSettled: refresh,
    onSuccess: (r) => setJob(r.job ?? null),
  });
  // Al conectar se traen solas las ventas del período: se muestra el avance
  const [job, setJob] = useState<RetailSyncJob | null>(null);
  useEffect(() => {
    if (!job || job.status !== 'RUNNING') return;
    const t = setTimeout(async () => {
      const next = await api.retailJob(job.id).catch(() => ({ ...job, status: 'ERROR' as const, message: 'Se perdió el avance' }));
      setJob(next);
      if (next.status !== 'RUNNING') {
        refresh();
        queryClient.invalidateQueries({ queryKey: ['retail-orders'] });
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
        <PlugZap className="size-5 text-slate-400" />
        <h2 className="text-lg font-semibold">{c.label}</h2>
        <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
        <span className="ml-auto text-xs text-slate-500">
          Probada: {when(c.lastTestAt)} · Ventas: {when(c.lastOrdersSyncAt)} · Productos: {when(c.lastProductsSyncAt)}
        </span>
      </header>
      <div className="space-y-4 px-5 py-4">
        <p className="text-sm text-slate-600">
          {c.howTo}{' '}
          <a href={c.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand-600 hover:underline">
            Documentación <ExternalLink className="size-3" />
          </a>
        </p>
        {c.lastError && c.status === 'ERROR' && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Último error: {c.lastError}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          {c.fields.map((f) => (
            <Field key={f.key} label={`${f.label}${f.required ? '' : ''}`} hint={f.help}>
              {f.secret ? (
                <input
                  type="password"
                  autoComplete="new-password"
                  value={secrets[f.key] ?? ''}
                  onChange={(e) => setSecrets((x) => ({ ...x, [f.key]: e.target.value }))}
                  placeholder={c.secrets[f.key] ? `Guardada (${c.secrets[f.key]}) · escribe para cambiarla` : 'Pega aquí la clave'}
                  disabled={!isAdmin}
                  className={input}
                />
              ) : (
                <input
                  value={settings[f.key] ?? ''}
                  onChange={(e) => setSettings((x) => ({ ...x, [f.key]: e.target.value }))}
                  placeholder={f.placeholder ?? f.default}
                  disabled={!isAdmin}
                  className={cn(input, f.key.toLowerCase().includes('url') || f.key.endsWith('Path') ? 'font-mono text-xs' : '')}
                />
              )}
            </Field>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-brand-600" /> Activa
              </label>
              <Button onClick={() => save.mutate()} loading={save.isPending}>
                Guardar
              </Button>
            </>
          )}
          {canEdit && (
            <Button variant="secondary" onClick={() => test.mutate()} loading={test.isPending} disabled={!c.configured}>
              Conectar y traer ventas
            </Button>
          )}
          {save.isSuccess && <span className="text-sm text-emerald-700">Guardado</span>}
          {!isAdmin && <span className="text-xs text-slate-500">Solo un administrador puede cambiar las credenciales.</span>}
        </div>
        <ErrorText error={save.error ?? test.error} />
        {test.data && (
          <div className={cn('rounded-md px-3 py-2 text-sm', test.data.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>
            <p className="flex items-center gap-1.5 font-medium">
              {test.data.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />} {test.data.message}
            </p>
            {job && (
              <p className={cn('mt-1 flex items-center gap-1.5', job.status === 'ERROR' ? 'text-red-700' : 'text-slate-700')}>
                {job.status === 'RUNNING' ? <Loader2 className="size-4 animate-spin" /> : job.status === 'DONE' ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                {job.message}
                {job.status === 'DONE' && (
                  <Link href="/api-retail/ventas" className="ml-1 font-medium underline">
                    Ver ventas
                  </Link>
                )}
              </p>
            )}
            {test.data.sample && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs">Ver respuesta del retailer</summary>
                <pre className="mt-1 max-h-72 overflow-auto rounded bg-white/70 p-2 text-[11px] text-slate-700">{test.data.sample}</pre>
              </details>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
