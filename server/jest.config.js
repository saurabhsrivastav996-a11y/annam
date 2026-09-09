export default {
  testEnvironment: 'node',
  // ESM sources are run natively via --experimental-vm-modules; no transform needed.
  transform: {},
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/env.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/seed/**', '!src/index.js'],
  // The in-memory MongoDB downloads its binary on first run.
  testTimeout: 60000,
};
