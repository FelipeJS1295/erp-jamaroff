'use client';

import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { ROLE_LABELS, useAuth } from '@/components/auth';
import { api } from '@/lib/api';

export default function CuentaPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', repeat: '' });
  const [error, setError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () => api.changePassword(form.current, form.next),
    onSuccess: () => {
      setForm({ current: '', next: '', repeat: '' });
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  function submit() {
    if (form.next !== form.repeat) {
      setError('La contraseña nueva y su repetición no coinciden');
      return;
    }
    change.mutate();
  }

  const input =
    'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none';

  return (
    <div className="mx-auto max-w-lg px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
      <p className="mt-1 text-sm text-slate-500">
        {user.name} · <span className="font-mono">{user.username}</span> · {ROLE_LABELS[user.role]}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-6"
      >
        <h2 className="text-sm font-semibold">Cambiar contraseña</h2>
        <div>
          <label className="mb-1 block text-sm text-slate-700">Contraseña actual</label>
          <input
            type="password"
            autoComplete="current-password"
            value={form.current}
            onChange={(e) => setForm({ ...form, current: e.target.value })}
            className={input}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-700">Contraseña nueva (mínimo 8 caracteres)</label>
          <input
            type="password"
            autoComplete="new-password"
            value={form.next}
            onChange={(e) => setForm({ ...form, next: e.target.value })}
            className={input}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-700">Repite la contraseña nueva</label>
          <input
            type="password"
            autoComplete="new-password"
            value={form.repeat}
            onChange={(e) => setForm({ ...form, repeat: e.target.value })}
            className={input}
          />
        </div>

        {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {change.isSuccess && (
          <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <CheckCircle2 className="size-4" /> Contraseña cambiada. Las otras sesiones abiertas se cerraron.
          </p>
        )}

        <button
          type="submit"
          disabled={change.isPending || !form.current || !form.next || !form.repeat}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {change.isPending && <Loader2 className="size-4 animate-spin" />}
          Guardar contraseña
        </button>
      </form>
    </div>
  );
}