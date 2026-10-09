'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  KeyRound,
  LogOut,
  Users,
  Boxes,
  FileSpreadsheet,
  FileUp,
  LayoutDashboard,
  List,
  Scale,
  Store,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { ROLE_LABELS, useAuth } from './auth';

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  ready: boolean;
  /** Solo para quien puede modificar (ADMIN u OPERADOR) */
  edit?: boolean;
  /** Solo para administradores */
  admin?: boolean;
};
type NavSection = { title: string; items: NavItem[] };

// "ready: false" = módulo aún no construido; se va activando paso a paso
const sections: NavSection[] = [
  {
    title: 'General',
    items: [{ label: 'Inicio', href: '/', icon: LayoutDashboard, ready: true }],
  },
  {
    title: 'Maestras',
    items: [
      { label: 'Retailers', href: '/maestras/retailers', icon: Store, ready: false },
      { label: 'Productos', href: '/maestras/productos', icon: Boxes, ready: true },
      { label: 'Catálogo retail', href: '/maestras/catalogo', icon: Tags, ready: true },
    ],
  },
  {
    title: 'Ventas',
    items: [
      { label: 'Ver ventas', href: '/ventas/listado', icon: List, ready: true },
      { label: 'Cargar archivos', href: '/ventas/cargas', icon: FileSpreadsheet, ready: true, edit: true },
    ],
  },
  {
    title: 'Finanzas',
    items: [
      { label: 'Conciliación', href: '/conciliacion', icon: Scale, ready: true },
      { label: 'Cargar liquidaciones', href: '/conciliacion/cargas', icon: FileUp, ready: true, edit: true },
      { label: 'Reportes', href: '/reportes', icon: BarChart3, ready: true },
    ],
  },
  {
    title: 'Administración',
    items: [{ label: 'Usuarios', href: '/usuarios', icon: Users, ready: true, admin: true }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, canEdit, isAdmin, logout } = useAuth();

  // Solo se muestran las opciones que el rol del usuario puede usar
  const visible = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((i) => (!i.edit || canEdit) && (!i.admin || isAdmin)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-slate-200">
      <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
        <div className="grid size-8 place-items-center rounded-md bg-brand-500 text-sm font-bold text-white">
          E
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">ERP Retail</p>
          <p className="text-[11px] text-sidebar-muted">Ventas y conciliación</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {visible.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-2 text-[11px] font-medium tracking-wider text-sidebar-muted uppercase">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map(({ label, href, icon: Icon, ready }) => {
                const active = pathname === href;
                if (!ready) {
                  return (
                    <li key={href}>
                      <span className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-slate-500">
                        <Icon className="size-4" />
                        {label}
                        <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500">
                          pronto
                        </span>
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                        active
                          ? 'bg-brand-500/20 font-medium text-white'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <Icon className="size-4" />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Usuario con sesión */}
      <div className="border-t border-white/10 px-3 py-3">
        <div className="mb-2 flex items-center gap-2.5 px-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white uppercase">
            {user.name.slice(0, 2)}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="text-[11px] text-sidebar-muted">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <Link
            href="/cuenta"
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors',
              pathname === '/cuenta' ? 'bg-brand-500/20 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
            )}
          >
            <KeyRound className="size-3.5" /> Mi cuenta
          </Link>
          <button
            onClick={logout}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="size-3.5" /> Salir
          </button>
        </div>
      </div>
    </aside>
  );
}