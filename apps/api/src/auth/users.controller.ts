import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { and, asc, count, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { DRIZZLE, type Database } from '../database/database.module.js';
import { userRoleEnum, users } from '../database/schema/index.js';
import { validate } from '../products/catalog.validation.js';
import { passwordSchema } from './auth.controller.js';
import { hashPassword } from './crypto.js';
import { CurrentUser, Roles, type SessionUser } from './decorators.js';

const usernameSchema = z
  .string({ error: 'Falta el nombre de usuario' })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, 'El usuario debe tener 3 a 40 caracteres: letras, números, punto, guion o guion bajo (sin espacios)');

const createSchema = z.object({
  username: usernameSchema,
  name: z.string({ error: 'Falta el nombre' }).trim().min(1, 'Falta el nombre').max(120),
  role: z.enum(userRoleEnum.enumValues, { error: 'Rol inválido' }),
  password: passwordSchema,
});

const updateSchema = z.object({
  name: z.string().trim().min(1, 'Falta el nombre').max(120).optional(),
  role: z.enum(userRoleEnum.enumValues, { error: 'Rol inválido' }).optional(),
  isActive: z.boolean().optional(),
  /** Nueva contraseña (el admin la reinicia; cierra las sesiones de ese usuario) */
  password: passwordSchema.optional(),
});

/** Columnas que se devuelven (nunca el hash de la contraseña) */
const PUBLIC_COLUMNS = {
  id: users.id,
  username: users.username,
  name: users.name,
  role: users.role,
  isActive: users.isActive,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};

/**
 * Administración de usuarios (solo ADMIN).
 *   GET    /api/users
 *   POST   /api/users          { username, name, role, password }
 *   PATCH  /api/users/:id      { name?, role?, isActive?, password? }
 *   DELETE /api/users/:id
 */
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  list() {
    return this.db.select(PUBLIC_COLUMNS).from(users).orderBy(asc(users.username));
  }

  @Post()
  async create(@Body() body: unknown) {
    const { password, ...data } = validate(createSchema, body);
    const [exists] = await this.db.select({ id: users.id }).from(users).where(eq(users.username, data.username));
    if (exists) throw new ConflictException(`Ya existe el usuario "${data.username}"`);
    const [row] = await this.db
      .insert(users)
      .values({ ...data, passwordHash: await hashPassword(password) })
      .returning(PUBLIC_COLUMNS);
    return row;
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() me: SessionUser,
  ) {
    const { password, ...data } = validate(updateSchema, body);
    if (id === me.id && (data.isActive === false || (data.role && data.role !== 'ADMIN'))) {
      throw new BadRequestException('No puedes desactivarte ni quitarte el rol de administrador a ti mismo');
    }
    if (data.isActive === false || (data.role && data.role !== 'ADMIN')) {
      await this.ensureAnotherAdmin(id);
    }
    const changes = { ...data, ...(password ? { passwordHash: await hashPassword(password) } : {}) };
    if (Object.keys(changes).length === 0) throw new BadRequestException('No hay cambios');
    const [row] = await this.db.update(users).set(changes).where(eq(users.id, id)).returning(PUBLIC_COLUMNS);
    if (!row) throw new NotFoundException('Usuario no encontrado');
    return row;
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() me: SessionUser) {
    if (id === me.id) throw new BadRequestException('No puedes eliminar tu propio usuario');
    await this.ensureAnotherAdmin(id);
    const [row] = await this.db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    if (!row) throw new NotFoundException('Usuario no encontrado');
    return { deleted: true };
  }

  /** Siempre tiene que quedar al menos un administrador activo */
  private async ensureAnotherAdmin(exceptId: string) {
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(users)
      .where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true), ne(users.id, exceptId)));
    if (total === 0) throw new BadRequestException('Debe quedar al menos un administrador activo');
  }
}