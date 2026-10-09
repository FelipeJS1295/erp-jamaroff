import { boolean, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Roles del sistema:
 *  ADMIN     todo, incluye crear usuarios y editar costos/precios de Productos
 *  OPERADOR  carga archivos (ventas, liquidaciones, catálogos), asigna masters; ve todo
 *  LECTURA   solo puede mirar
 */
export const userRoleEnum = pgEnum('user_role', ['ADMIN', 'OPERADOR', 'LECTURA']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** Nombre de usuario para iniciar sesión, en minúsculas y único. Ej: sandra */
  username: varchar('username', { length: 40 }).notNull().unique(),

  /** Nombre para mostrar. Ej: Sandra Santibáñez */
  name: varchar('name', { length: 120 }).notNull(),

  /** Contraseña cifrada (scrypt). Nunca se guarda la contraseña en texto */
  passwordHash: varchar('password_hash', { length: 200 }).notNull(),

  role: userRoleEnum('role').notNull().default('LECTURA'),

  /** Un usuario desactivado no puede iniciar sesión (se conserva su historial) */
  isActive: boolean('is_active').notNull().default(true),

  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type UserRole = (typeof userRoleEnum.enumValues)[number];