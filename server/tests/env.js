// Runs before any test module is imported, so src/config/env.js sees the test
// environment (rate limits off, request logging quiet) regardless of .env.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-used-in-production';
process.env.MONGODB_URI = '';

// Fake Razorpay credentials so the payment paths are exercised. Signature
// checks are pure HMAC, so no network or real account is involved.
process.env.RAZORPAY_KEY_ID = 'rzp_test_fake_key_id';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';
