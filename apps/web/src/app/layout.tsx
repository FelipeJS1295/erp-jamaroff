import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/auth';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'ERP Retail',
  description: 'Gestión de ventas retail, maestras y conciliación de liquidaciones',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}