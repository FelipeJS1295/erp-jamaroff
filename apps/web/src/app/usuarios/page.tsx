'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { ROLE_LABELS, useAuth } from '@/components/auth';
import { api, type AppUser, type UserRole } from '@/lib/api';
import { cn } from '@/lib/cn';

const ROLE_HELP: Record<UserRole, string> = {
  ADMIN: 'Todo: usuarios, costos y precios de productos, cargas y conciliación',
  OPERADOR: 'Carga archivos, asigna masters y ve todo. No edita costos ni usuarios',
  LECTURA: 'Solo puede mirar: ventas, conciliación, catálogo y reportes',
};

const ROLE_BADGE: Record<UserRole, string> = {
  ADMIN: 'bg-brand-50 text-brand-700',
  OPERADOR: 'bg-sky-50 text-sky-700',
  LECTURA: 'bg-slate-100 text-slate-600',
};

/** "2026-10-08T15:59:26Z" -> "08/10/2026 12:59" (hora de Chile del navegador) */
function formatDateTime(value: string | null) {
  if (!value) return 'Nunca';
  return new Date(value).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

export default function UsuariosPage() {
  const { user: me, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: api.listUsers, enabled: isAdmin });
  const [editing, setEditing] = useState<AppUser | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });
  const toggle = useMutation({
    mutationFn: (u: AppUser) => api.updateUser(u.id, { isActive: !u.isActive }),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: api.deleteUser,
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  if (!isAdmin) {
    return <p className="px-8 py-16 text-center text-sm text-slate-500">Solo los administradores pueden ver esta página.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="mt-1 text-sm text-slate-500">Quiénes pueden entrar al ERP y qué puede hacer cada uno.</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-600"
        >
          <Plus className="size-4" /> Nuevo usuario
        </button>
      </header>

      {/* Qué puede hacer cada rol */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {(Object.keys(ROLE_HELP) as UserRole[]).map((r) => (
          <div key={r} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', ROLE_BADGE[r])}>{ROLE_LABELS[r]}</span>
            <p className="mt-2 text-xs text-slate-600">{ROLE_HELP[r]}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <th className="px-4 py-2.5 font-medium">Usuario</th>
              <th className="px-4 py-2.5 font-medium">Nombre</th>
              <th className="px-4 py-2.5 font-medium">Rol</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              <th className="px-4 py-2.5 font-medium">Último ingreso</th>
              <th className="w-24 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.isLoading ? (
              <tr>
                <td colSpan={6} className="py-14 text-center text-slate-500">
                  <Loader2 className="mr-2 inline size-4 animate-spin" /> Cargando…
                </td>
              </tr>
            ) : (
              users.data?.map((u) => (
                <tr key={u.id} className={cn('group hover:bg-slate-50', !u.isActive && 'text-slate-400')}>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {u.username}
                    {u.id === me.id && <span className="ml-1.5 font-sans text-[11px] text-slate-400">(tú)</span>}
                  </td>
                  <td className="px-4 py-2.5">{u.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', ROLE_BADGE[u.role])}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => toggle.mutate(u)}
                      disabled={u.id === me.id || toggle.isPending}
                      title={u.id === me.id ? 'No puedes desactivarte a ti mismo' : u.isActive ? 'Desactivar' : 'Activar'}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium disabled:cursor-not-allowed',
                        u.isActive ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200',
                      )}
                    >
                      {u.isActive ? 'Activo' : 'Desactivado'}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 tabular-nums">{formatDateTime(u.lastLoginAt)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => setEditing(u)}
                        title="Editar / cambiar contraseña"
                        className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                      >
                        <Pencil className="size-4" />
                      </button>
                      {u.id !== me.id && (
                        <button
                          onClick={() => window.confirm(`¿Eliminar el usuario "${u.username}"?`) && remove.mutate(u.id)}
                          title="Eliminar"
                          className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-700"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
      <p className="mt-3 text-xs text-slate-500">
        Desactivar un usuario le impide entrar pero conserva su registro. Si cambias su contraseña, se cierran sus sesiones abiertas.
      </p>

      {editing && (
        <UserDialog
          user={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && editing.id === me.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function UserDialog(props: { user: AppUser | null; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const { user, isSelf, onClose, onSaved } = props;
  const [form, setForm] = useState({
    username: user?.username ?? '',
    name: user?.name ?? '',
    role: (user?.role ?? 'OPERADOR') as UserRole,
    password: '',
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      user
        ? api.updateUser(user.id, {
            name: form.name,
            ...(isSelf ? {} : { role: form.role }),
            ...(form.password ? { password: form.password } : {}),
          })
        : api.createUser(form),
    onSuccess: onSaved,
    onError: (err: Error) => setError(err.message),
  });

  const input =
    'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none';
  const label = 'mb-1 block text-xs font-medium text-slate-600';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-6">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold">{user ? `Editar ${user.username}` : 'Nuevo usuario'}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
          className="space-y-4 px-5 py-4"
        >
          {!user && (
            <div>
              <label className={label}>Nombre de usuario (para entrar)</label>
              <input
                autoFocus
                autoCapitalize="none"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
                placeholder="sandra"
                className={cn(input, 'font-mono')}
              />
            </div>
          )}
          <div>
            <label className={label}>Nombre</label>
            <input
              autoFocus={!!user}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Sandra Santibáñez"
              className={input}
            />
          </div>
          <div>
            <label className={label}>Rol</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              disabled={isSelf}
              className={input}
            >
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              {isSelf ? 'No puedes cambiar tu propio rol.' : ROLE_HELP[form.role]}
            </p>
          </div>
          <div>
            <label className={label}>
              {user ? (
                <span className="inline-flex items-center gap-1">
                  <KeyRound className="size-3" /> Nueva contraseña (dejar vacío para no cambiarla)
                </span>
              ) : (
                'Contraseña inicial (mínimo 8 caracteres)'
              )}
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={input}
            />
          </div>

          {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}