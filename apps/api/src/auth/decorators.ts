import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { UserRole } from '../database/schema/index.js';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** Ruta sin inicio de sesión (ej: login, health) */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Solo estos roles pueden usar la ruta (ej: @Roles('ADMIN')) */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

/** Usuario con sesión iniciada (lo deja el AuthGuard en la request) */
export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser => ctx.switchToHttp().getRequest().user,
);