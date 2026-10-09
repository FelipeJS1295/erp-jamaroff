import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { DRIZZLE, type Database } from '../database/database.module.js';
import { users, type UserRole } from '../database/schema/index.js';
import { authSecret, SESSION_COOKIE } from './auth.config.js';
import { passwordFingerprint, verifySession } from './crypto.js';
import { IS_PUBLIC, ROLES, type SessionUser } from './decorators.js';

/** Lee una cookie del header (sin dependencias extra) */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/**
 * Guardia global: todas las rutas exigen sesión iniciada, salvo las marcadas con @Public().
 *  - @Roles('ADMIN') limita la ruta a esos roles.
 *  - Sin @Roles: cualquier rol puede LEER (GET); para modificar (POST/PATCH/DELETE)
 *    se necesita ADMIN u OPERADOR. LECTURA solo mira.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const token = readCookie(req, SESSION_COOKIE);
    const session = token ? verifySession(token, authSecret()) : null;
    if (!session) throw new UnauthorizedException('Inicia sesión para continuar');

    // Se lee el usuario en cada pedido: si lo desactivan o cambian su rol, aplica de inmediato
    const [user] = await this.db.select().from(users).where(eq(users.id, session.sub));
    if (!user || !user.isActive || passwordFingerprint(user.passwordHash) !== session.pf) {
      throw new UnauthorizedException('Tu sesión ya no es válida. Inicia sesión de nuevo');
    }
    req.user = { id: user.id, username: user.username, name: user.name, role: user.role };

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
    if (!roles && req.method !== 'GET' && user.role === 'LECTURA') {
      throw new ForbiddenException('Tu usuario es de solo lectura');
    }
    return true;
  }
}