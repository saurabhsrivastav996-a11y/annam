// Runs before any test module is imported, so src/config/env.js sees the test
// environment (rate limits off, request logging quiet) regardless of .env.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-used-in-production';
process.env.MONGODB_URI = '';
