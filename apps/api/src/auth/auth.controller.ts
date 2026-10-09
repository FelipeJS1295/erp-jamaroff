import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { validate } from '../products/catalog.validation.js';
import { cookieSecure, SESSION_COOKIE, sessionDays } from './auth.config.js';
import { AuthService } from './auth.service.js';
import { CurrentUser, Public, Roles, type SessionUser } from './decorators.js';

export const passwordSchema = z
  .string({ error: 'Falta la contraseña' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(100, 'La contraseña es demasiado larga');

const loginSchema = z.object({
  username: z.string({ error: 'Falta el usuario' }).trim().min(1, 'Falta el usuario'),
  password: z.string({ error: 'Falta la contraseña' }).min(1, 'Falta la contraseña'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string({ error: 'Falta la contraseña actual' }).min(1, 'Falta la contraseña actual'),
  newPassword: passwordSchema,
});

/** Guarda el token en una cookie httpOnly (el navegador la envía sola; JavaScript no la puede leer) */
function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    path: '/',
    maxAge: sessionDays() * 86400 * 1000,
  });
}

/**
 *   POST /api/auth/login             { username, password }  -> inicia sesión
 *   POST /api/auth/logout            cierra sesión
 *   GET  /api/auth/me                usuario con sesión iniciada
 *   POST /api/auth/change-password   { currentPassword, newPassword }
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { username, password } = validate(loginSchema, body);
    const { user, token } = await this.auth.login(username, password);
    setSessionCookie(res, token);
    return user;
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser) {
    return user;
  }

  /** Cualquier rol puede cambiar su propia contraseña (incluido LECTURA) */
  @Roles('ADMIN', 'OPERADOR', 'LECTURA')
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { currentPassword, newPassword } = validate(changePasswordSchema, body);
    const token = await this.auth.changePassword(user.id, currentPassword, newPassword);
    setSessionCookie(res, token); // la sesión actual sigue; las otras quedan cerradas
    return { ok: true };
  }
}