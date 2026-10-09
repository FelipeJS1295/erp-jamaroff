import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { count, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { DRIZZLE, type Database } from '../database/database.module.js';
import { users, type User } from '../database/schema/index.js';
import { authSecret, sessionDays } from './auth.config.js';
import { hashPassword, passwordFingerprint, signSession, verifyPassword } from './crypto.js';
import type { SessionUser } from './decorators.js';

/** Intentos fallidos permitidos antes de bloquear un rato (por usuario) */
const MAX_FAILED = 5;
const LOCK_MINUTES = 5;

export const toSessionUser = (u: User): SessionUser => ({
  id: u.id,
  username: u.username,
  name: u.name,
  role: u.role,
});

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly failed = new Map<string, { count: number; until: number }>();

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Al partir la API: si no hay ningún usuario, crea el administrador inicial
   * con ADMIN_USERNAME / ADMIN_PASSWORD del .env.
   */
  async onModuleInit() {
    const [{ total }] = await this.db.select({ total: count() }).from(users);
    if (total > 0) return;

    const username = (process.env.ADMIN_USERNAME ?? 'admin').trim().toLowerCase();
    let password = process.env.ADMIN_PASSWORD;
    if (!password) {
      password = randomBytes(6).toString('base64url');
      this.logger.warn(`ADMIN_PASSWORD no está en el .env: contraseña generada para "${username}": ${password}`);
    }
    await this.db.insert(users).values({
      username,
      name: 'Administrador',
      passwordHash: await hashPassword(password),
      role: 'ADMIN',
    });
    this.logger.log(`Usuario administrador inicial creado: "${username}". Cambia la contraseña al entrar.`);
  }

  /** Valida usuario y contraseña; devuelve el usuario y el token de sesión */
  async login(usernameRaw: string, password: string) {
    const username = usernameRaw.trim().toLowerCase();
    const lock = this.failed.get(username);
    if (lock && lock.until > Date.now()) {
      const minutes = Math.ceil((lock.until - Date.now()) / 60000);
      throw new UnauthorizedException(`Demasiados intentos. Prueba de nuevo en ${minutes} min`);
    }

    const [user] = await this.db.select().from(users).where(eq(users.username, username));
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok || !user.isActive) {
      const current = this.failed.get(username) ?? { count: 0, until: 0 };
      current.count++;
      if (current.count >= MAX_FAILED) {
        current.until = Date.now() + LOCK_MINUTES * 60000;
        current.count = 0;
      }
      this.failed.set(username, current);
      throw new UnauthorizedException(
        user && ok && !user.isActive ? 'Tu usuario está desactivado' : 'Usuario o contraseña incorrectos',
      );
    }

    this.failed.delete(username);
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    return { user: toSessionUser(user), token: this.tokenFor(user) };
  }

  /** Token de sesión para el usuario (se vuelve a emitir al cambiar la contraseña) */
  tokenFor(user: User) {
    return signSession(
      {
        sub: user.id,
        pf: passwordFingerprint(user.passwordHash),
        exp: Math.floor(Date.now() / 1000) + sessionDays() * 86400,
      },
      authSecret(),
    );
  }

  /** Cambio de contraseña del propio usuario (pide la actual) */
  async changePassword(userId: string, current: string, next: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user || !(await verifyPassword(current, user.passwordHash))) {
            // 400 y no 401: un 401 haría que la pantalla te mande al login como si la sesión venciera
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    const [updated] = await this.db
      .update(users)
      .set({ passwordHash: await hashPassword(next) })
      .where(eq(users.id, userId))
      .returning();
    return this.tokenFor(updated);
  }
}