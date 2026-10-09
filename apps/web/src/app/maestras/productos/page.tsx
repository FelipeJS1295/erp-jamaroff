'use client';

import { Boxes, Layers } from 'lucide-react';
import { useState } from 'react';
import { CatalogTable } from '@/components/catalog-table';
import { ProductPricing } from '@/components/product-pricing';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

type Tab = 'products' | 'supplies';

const TABS: { id: Tab; label: string; icon: typeof Boxes; description: string }[] = [
  {
    id: 'products',
    label: 'Productos master',
    icon: Boxes,
    description:
      'Producto genérico, sin color ni variante (ej: Seccional Richter), con el precio sugerido para publicar en cada retailer según su costo, utilidad, devoluciones, comisión y logística.',
  },
  {
    id: 'supplies',
    label: 'Insumos',
    icon: Layers,
    description:
      'Materiales con los que se fabrican los productos (telas, espumas, patas…). Costo neto por unidad, sin IVA.',
  },
];

export default function ProductosPage() {
  const [tab, setTab] = useState<Tab>('products');
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="mx-auto max-w-[1600px] px-8 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
        <p className="mt-1 text-sm text-slate-500">{current.description}</p>
      </header>

      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition-colors',
              tab === id
                ? 'border-brand-500 font-medium text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'products' ? (
        <ProductPricing />
      ) : (
        <CatalogTable
          key="supplies"
          queryKey="supplies"
          labels={{
            sku: 'SKU',
            name: 'Nombre insumo',
            cost: 'Costo neto',
            singular: 'insumo',
            plural: 'insumos',
          }}
          placeholders={{ sku: 'INS-TELA-GRIS', name: 'Tela lino gris' }}
          list={async () =>
            (await api.listSupplies()).map((s) => ({ id: s.id, sku: s.sku, name: s.name, cost: s.netCost }))
          }
          create={(d) => api.createSupply({ sku: d.sku, name: d.name, netCost: d.cost })}
          update={(id, d) => api.updateSupply(id, { sku: d.sku, name: d.name, netCost: d.cost })}
          remove={api.deleteSupply}
        />
      )}
    </div>
  );
}