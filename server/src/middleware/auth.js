import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

export function signToken(user) {
  return jwt.sign({ userId: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.token || null;
}

/** Rejects the request with 401 unless a valid, non-suspended user is attached. */
export async function requireAuth(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) throw new ApiError(401, 'Authentication required');

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      throw new ApiError(401, 'Invalid or expired token');
    }

    const user = await User.findById(payload.userId);
    if (!user) throw new ApiError(401, 'User no longer exists');
    if (user.isSuspended) throw new ApiError(403, 'Account suspended');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Route guard: requireRole('restaurant', 'admin') */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, `Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}

/** Attaches req.user when a token is present, but never rejects. */
export async function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = await User.findById(payload.userId);
  } catch {
    // An unreadable token on a public route is simply ignored.
  }
  next();
}
