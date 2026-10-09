/**
 * Cambia la contraseña de un usuario directo en la base de datos.
 * Sirve si nadie puede entrar (ej: se olvidó la clave del administrador).
 *
 *   pnpm --filter @erp/api user:password <usuario> <nueva-contraseña>
 *
 * También reactiva el usuario si estaba desactivado.
 * Si el usuario no existe, lo crea como ADMIN.
 */
import { randomBytes, scrypt } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';

// Mismo .env de la raíz del monorepo que usa la API
for (const file of ['.env', '../../.env']) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) process.loadEnvFile(path);
}

const [usernameRaw, password] = process.argv.slice(2);
if (!usernameRaw || !password) {
  console.error('Uso: pnpm --filter @erp/api user:password <usuario> <nueva-contraseña>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres');
  process.exit(1);
}
const username = usernameRaw.trim().toLowerCase();

// Igual que apps/api/src/auth/crypto.ts -> "scrypt$<sal>$<hash>"
const salt = randomBytes(16);
const hash = await promisify(scrypt)(password, salt, 64);
const passwordHash = `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const { rowCount } = await client.query(
    'update users set password_hash = $1, is_active = true, updated_at = now() where username = $2',
    [passwordHash, username],
  );
  if (rowCount) {
    console.log(`Listo: contraseña de "${username}" cambiada.`);
  } else {
    await client.query(
      `insert into users (username, name, password_hash, role) values ($1, $2, $3, 'ADMIN')`,
      [username, username, passwordHash],
    );
    console.log(`El usuario "${username}" no existía: se creó como Administrador.`);
  }
  console.log('Si te bloqueó por intentos fallidos, reinicia la API (o espera 5 minutos).');
} finally {
  await client.end();
}