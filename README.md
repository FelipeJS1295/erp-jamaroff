# ERP Retail

Gestión de ventas retail, maestras de datos y conciliación de liquidaciones.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | NestJS 12 (ESM) + TypeScript 6 |
| ORM | Drizzle ORM |
| Base de datos | PostgreSQL 16 |
| Colas (próximo) | BullMQ + Redis |
| Frontend | Next.js 16 + React 19 + Tailwind CSS 4 + TanStack Query |
| Compartido | Schemas Zod en `packages/shared` |

## Estructura

```
erp-retail/
├── apps/
│   ├── api/                 # Backend NestJS (puerto 4100, rutas bajo /api)
│   │   ├── src/
│   │   │   ├── database/    # Conexión Drizzle + esquema de tablas
│   │   │   └── health/      # GET /api/health
│   │   └── drizzle.config.ts
│   └── web/                 # Frontend Next.js (puerto 3100)
│       └── src/
│           ├── app/         # Páginas (App Router)
│           ├── components/  # Sidebar, providers…
│           └── lib/         # Cliente de la API
├── packages/
│   └── shared/              # Tipos y schemas Zod usados por api y web
├── docker-compose.yml       # Postgres + Redis
└── .env.example
```

## Requisitos

- Node.js 22 o superior
- pnpm 10 (`npm install -g pnpm`)
- Docker Desktop

## Cómo levantarlo

```bash
# 1. Variables de entorno
cp .env.example .env

# 2. Dependencias
pnpm install

# 3. Base de datos y Redis
pnpm db:up

# 4. API + frontend en modo desarrollo (se recargan al guardar)
pnpm dev
```

Abre http://localhost:3100. La página de inicio muestra si la API y la base de datos están conectadas.

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Levanta API y frontend juntos |
| `pnpm dev:api` / `pnpm dev:web` | Solo uno de los dos |
| `pnpm build` | Compila todo |
| `pnpm db:up` / `pnpm db:down` | Enciende / apaga Postgres y Redis |
| `pnpm db:generate` | Genera migración SQL a partir del esquema Drizzle |
| `pnpm db:migrate` | Aplica las migraciones pendientes |
| `pnpm db:studio` | Abre Drizzle Studio para ver las tablas |

## Hoja de ruta

1. ✅ Base del proyecto: monorepo, API, frontend y base de datos
2. Maestra de retailers
3. Maestra de productos y mapeo de SKU por retailer
4. Subida de archivos y lotes de carga (cola BullMQ)
5. Adaptador de ventas del primer retailer
6. Excepciones y corrección manual de filas
