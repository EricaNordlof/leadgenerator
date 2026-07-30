import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { config } from './config.js';

export async function ensureAdminUser() {
  if (!config.adminPassword) return;

  const existing = await query(
    'SELECT id, password_hash, display_name, role FROM users WHERE lower(email) = lower($1)',
    [config.adminEmail]
  );

  if (!existing.rowCount) {
    const passwordHash = await bcrypt.hash(config.adminPassword, 12);
    await query(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, 'admin')`,
      [config.adminEmail.toLowerCase(), passwordHash, config.adminName]
    );
    console.log(`Administratör skapad: ${config.adminEmail}`);
    return;
  }

  const user = existing.rows[0];
  const passwordMatches = await bcrypt.compare(config.adminPassword, user.password_hash);

  if (!passwordMatches) {
    const passwordHash = await bcrypt.hash(config.adminPassword, 12);
    await query(
      `UPDATE users
       SET password_hash = $1, display_name = $2, role = 'admin', updated_at = now()
       WHERE id = $3`,
      [passwordHash, config.adminName, user.id]
    );
    console.log(`Administratörens lösenord synkroniserades från ADMIN_PASSWORD: ${config.adminEmail}`);
    return;
  }

  if (user.display_name !== config.adminName || user.role !== 'admin') {
    await query(
      `UPDATE users SET display_name = $1, role = 'admin', updated_at = now() WHERE id = $2`,
      [config.adminName, user.id]
    );
  }
}

export async function authenticate(email, password) {
  const result = await query(
    'SELECT id, email, password_hash, display_name, role FROM users WHERE lower(email) = lower($1)',
    [email]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;
  return sanitizeUser(user);
}

export function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name ?? user.displayName ?? '',
    role: user.role
  };
}

export function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Du måste logga in.' });
  next();
}

export function ensureCsrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('base64url');
  return req.session.csrfToken;
}

export function requireCsrf(req, res, next) {
  const expected = req.session?.csrfToken;
  const supplied = req.get('x-csrf-token');
  const expectedBuffer = Buffer.from(expected || '');
  const suppliedBuffer = Buffer.from(supplied || '');
  if (!expected || !supplied || expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return res.status(403).json({ error: 'Säkerhetstoken saknas eller är ogiltig. Ladda om sidan.' });
  }
  next();
}
