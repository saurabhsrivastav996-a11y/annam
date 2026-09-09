import { jest } from '@jest/globals';
import request from 'supertest';
import { startDb, stopDb, clearDb } from './setup.js';
import { app, makeUser, auth } from './helpers.js';

jest.setTimeout(60000);

beforeAll(startDb);
afterAll(stopDb);
afterEach(clearDb);

describe('POST /api/auth/register', () => {
  it('creates a user and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Priya Sharma', email: 'priya@example.com', password: 'secret123', role: 'volunteer' });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'priya@example.com', role: 'volunteer' });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects invalid input with field details', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'x', email: 'nope', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toEqual(
      expect.arrayContaining(['name', 'email', 'password'])
    );
  });

  it('refuses to create an admin account', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Sneaky', email: 'sneaky@example.com', password: 'secret123', role: 'admin' });

    expect(res.status).toBe(403);
  });

  it('rejects a duplicate email', async () => {
    await makeUser({ email: 'dupe@example.com' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Other', email: 'dupe@example.com', password: 'secret123' });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token for valid credentials', async () => {
    await makeUser({ email: 'user@example.com' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'Test@123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    await makeUser({ email: 'user@example.com' });

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'wrong-password' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'Test@123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
  });

  it('blocks NoSQL operator injection in credentials', async () => {
    await makeUser({ email: 'user@example.com' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } });

    expect(res.status).not.toBe(200);
  });

  it('refuses a suspended account', async () => {
    const { user } = await makeUser({ email: 'banned@example.com' });
    user.isSuspended = true;
    await user.save();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'banned@example.com', password: 'Test@123' });

    expect(res.status).toBe(403);
  });
});

describe('protected routes', () => {
  it('rejects a request with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed token', async () => {
    const res = await request(app).get('/api/auth/me').set(auth('not-a-real-jwt'));
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid token', async () => {
    const { token } = await makeUser({ email: 'me@example.com', name: 'Me' });
    const res = await request(app).get('/api/auth/me').set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Me');
  });
});
