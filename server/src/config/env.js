import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  // Comma-separated, so a custom domain and Vercel preview URLs can coexist.
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // When true, Express also serves the built client — one service, no CORS.
  serveClient: process.env.SERVE_CLIENT === 'true',
  jwtSecret: process.env.JWT_SECRET || 'annam_dev_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  mongoUri: process.env.MONGODB_URI || '',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 465,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || '',
  },
  anthropic: {
    // Optional. Without it, natural-language search falls back to a rules parser.
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  clientDistDir: path.resolve(__dirname, '../../../client/dist'),
  uploadsDir: path.resolve(__dirname, '../../uploads'),
  seedMediaDir: path.resolve(__dirname, '../../seed-media'),
};

export const isProd = env.nodeEnv === 'production';
export const isTest = env.nodeEnv === 'test';

// Fail fast if someone ships the dev secret to production.
if (isProd && env.jwtSecret === 'annam_dev_secret_change_me') {
  throw new Error('JWT_SECRET must be set to a strong value in production');
}
