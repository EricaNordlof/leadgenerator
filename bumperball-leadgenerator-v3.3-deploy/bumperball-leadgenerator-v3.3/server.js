import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { config, assertProductionConfig } from './src/config.js';
import { migrate, pool } from './src/db.js';
import { authenticate, ensureAdminUser, ensureCsrfToken } from './src/auth.js';
import { router } from './src/routes.js';

assertProductionConfig();
await migrate();
await ensureAdminUser();

const app = express();
const PgStore = connectPgSimple(session);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(session({
  store: new PgStore({ pool, createTableIfMissing: true, tableName: 'user_sessions' }),
  name: 'bumperball.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 14
  }
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många inloggningsförsök. Vänta en stund.' }
});

app.use('/api/auth/login', loginLimiter);

// Server-side fallback: inloggningen fungerar även om webbläsaren inte kör app.js.
app.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    const user = email && password.length >= 8 ? await authenticate(email, password) : null;

    if (!user) {
      return res.status(401).send(`<!doctype html>
<html lang="sv"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inloggningen misslyckades</title><link rel="stylesheet" href="/styles.css"></head>
<body><section class="login-shell"><div class="login-card"><div class="brand-mark">OB</div>
<p class="eyebrow">Offroad Bumpis · Nordlöf Nordic</p><h1>Fel inloggning</h1>
<p class="error-text">Fel e-postadress eller lösenord.</p>
<a class="button primary full" href="/">Försök igen</a></div></section></body></html>`);
    }

    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => error ? reject(error) : resolve());
    });
    req.session.user = user;
    ensureCsrfToken(req);
    await new Promise((resolve, reject) => {
      req.session.save((error) => error ? reject(error) : resolve());
    });
    return res.redirect(303, '/');
  } catch (error) {
    next(error);
  }
});

app.use('/api', router);
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: 0,
  etag: true,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
  }
}));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error?.name === 'ZodError') {
    return res.status(400).json({ error: 'Kontrollera formulärets uppgifter.', details: error.issues });
  }
  const message = config.nodeEnv === 'production'
    ? (error.message?.includes('Gmail') || error.message?.includes('webhook') ? error.message : 'Ett oväntat fel inträffade.')
    : error.message;
  res.status(error.status || 500).json({ error: message });
});

const server = app.listen(config.port, () => {
  console.log(`${config.business.brandName} Leadgenerator v${config.version} kör på ${config.appUrl}`);
});

async function shutdown(signal) {
  console.log(`${signal}: stänger ned...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
