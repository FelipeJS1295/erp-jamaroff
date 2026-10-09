'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => api.login(username, password),
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
      router.replace('/');
    },
  });

  const input =
    'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none';

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-lg bg-brand-500 text-lg font-bold text-white">E</div>
          <div className="leading-tight">
            <p className="text-lg font-semibold text-white">ERP Retail</p>
            <p className="text-xs text-sidebar-muted">Ventas y conciliación</p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
          className="space-y-4 rounded-lg bg-white p-6 shadow-xl"
        >
          <h1 className="text-base font-semibold">Iniciar sesión</h1>
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
              Usuario
            </label>
            <input
              id="username"
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </div>

          {login.isError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {login.error.message}
            </p>
          )}

          <button
            type="submit"
            disabled={login.isPending || !username || !password}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {login.isPending ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}