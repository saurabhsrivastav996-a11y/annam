import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { env, isProd, isTest } from './config/env.js';
import { mongoSanitize } from './middleware/sanitize.js';
import { notFound, errorHandler } from './middleware/error.js';
import routes from './routes/index.js';

/**
 * Decides CORS per request.
 *
 * Allowed: the configured client origins, requests with no Origin at all
 * (health checks, curl, the Razorpay webhook), and same-origin requests — the
 * last matters when SERVE_CLIENT has Express hosting the app itself, where the
 * page's own asset requests carry an Origin the allowlist would not contain.
 *
 * A disallowed origin simply gets no CORS headers, so the browser blocks it.
 * Throwing here would turn every such request into a 500 instead.
 */
function corsOptions(req, callback) {
  const origin = req.headers.origin;
  if (!origin) return callback(null, { origin: true, credentials: true });

  let sameOrigin = false;
  try {
    sameOrigin = new URL(origin).host === req.headers.host;
  } catch {
    sameOrigin = false; // unparseable Origin is not same-origin
  }

  const allowed = sameOrigin || env.clientUrls.includes(origin);
  callback(null, { origin: allowed, credentials: true });
}

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      // Locally served media is loaded cross-origin by the Vite dev server.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // Helmet's default CSP assumes a page that loads nothing third-party.
      // When Express serves the app, that silently breaks the map, the dish
      // photos, the kitchen stream and Razorpay — so name what we actually use.
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          // Razorpay Checkout is injected at runtime by the client.
          scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
          // Leaflet and the Razorpay modal both set inline styles.
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: [
            "'self'",
            'data:',
            'blob:',
            'https://images.unsplash.com',
            'https://res.cloudinary.com',
            // OpenStreetMap serves tiles from a/b/c subdomains.
            'https://*.tile.openstreetmap.org',
          ],
          mediaSrc: ["'self'", 'blob:', 'https://res.cloudinary.com'],
          // Kitchen streams and the Razorpay payment modal.
          frameSrc: [
            "'self'",
            'https://www.youtube-nocookie.com',
            'https://www.youtube.com',
            'https://*.razorpay.com',
          ],
          // Socket.IO upgrades to a WebSocket on this same origin.
          connectSrc: ["'self'", 'ws:', 'wss:', 'https://*.razorpay.com'],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
        },
      },
    })
  );
  app.use(cors(corsOptions));
  // Razorpay signs the exact bytes it sends, so this route must see the raw
  // body. It has to be mounted before express.json would consume the stream.
  app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
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

  // Single-service deploy: serve the built client from the same origin, which
  // removes CORS and the API URL from the equation entirely.
  if (env.serveClient && fs.existsSync(env.clientDistDir)) {
    app.use(express.static(env.clientDistDir, { maxAge: '1h', index: false }));

    // Client-side routing: any non-API path returns the app shell, so a
    // refresh on /annadevta or a shared /order/:id link resolves.
    app.get(/^(?!\/api\/).*/, (req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(env.clientDistDir, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
