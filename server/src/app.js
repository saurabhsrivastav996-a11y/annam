import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env, isProd, isTest } from './config/env.js';
import { mongoSanitize } from './middleware/sanitize.js';
import { notFound, errorHandler } from './middleware/error.js';
import routes from './routes/index.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      // Locally served media is loaded cross-origin by the Vite dev server.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(mongoSanitize);
  if (!isProd && !isTest) app.use(morgan('dev'));

  // Rate limits are per-IP infrastructure; under test every request shares one IP,
  // so they would throttle the suite rather than exercise any behaviour.
  app.use(rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false, skip: () => isTest }));

  // Fallback media host when Cloudinary is not configured.
  app.use('/uploads', express.static(env.uploadsDir, { maxAge: '7d' }));
  // Demo reel clips that ship with the repo, so seeded reels play offline.
  app.use('/seed-media', express.static(env.seedMediaDir, { maxAge: '7d' }));

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
