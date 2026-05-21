import express from 'express';
import session from 'express-session';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

import { initDatabase } from './src/db.js';
import apiRouter from './src/routes.js';
import { startScheduler } from './src/scheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

async function main() {
  await initDatabase();
  console.log('[db] SQLite database initialized');

  const app = express();

  app.set('trust proxy', 1);

  app.use(express.json({ limit: '1mb' }));

  app.use(session({
    secret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: !!process.env.RENDER,
      sameSite: process.env.RENDER ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    },
  }));

  app.use('/api', apiRouter);

  app.use(express.static(join(__dirname, 'public')));

  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  });

  app.use((err, req, res, _next) => {
    console.error('[server] error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  startScheduler();

  app.listen(PORT, () => {
    console.log(`\n  Rocket Announcer running at http://localhost:${PORT}\n`);
  });
}

main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
