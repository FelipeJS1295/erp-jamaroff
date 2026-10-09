'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { api, type SessionUser, type UserRole } from '@/lib/api';
import { Sidebar } from './sidebar';

interface AuthContextValue {
  user: SessionUser;
  /** ¿Puede modificar? (cargar archivos, asignar masters…) = ADMIN u OPERADOR */
  canEdit: boolean;
  /** ¿Es administrador? (usuarios, costos y precios) */
  isAdmin: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Usuario con sesión y sus permisos. Solo se usa dentro de las páginas protegidas */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AppShell');
  return ctx;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  OPERADOR: 'Operador',
  LECTURA: 'Solo lectura',
};

/**
 * Envoltorio de toda la app: si no hay sesión, manda al login.
 * La página /login se muestra sola, sin menú lateral.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isLogin = pathname === '/login';

  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false, enabled: !isLogin });

  useEffect(() => {
    if (!isLogin && me.isError) router.replace('/login');
  }, [isLogin, me.isError, router]);

  if (isLogin) return <>{children}</>;

  if (!me.data) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Cargando…
      </div>
    );
  }

  const value: AuthContextValue = {
    user: me.data,
    canEdit: me.data.role !== 'LECTURA',
    isAdmin: me.data.role === 'ADMIN',
    logout: async () => {
      await api.logout();
      queryClient.clear();
      router.replace('/login');
    },
  };

  return (
    <AuthContext.Provider value={value}>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </AuthContext.Provider>
  );
}