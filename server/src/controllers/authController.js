import User from '../models/User.js';
import { signToken } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role = 'customer', phone, address } = req.body;

  // Self-service admin signup would be a privilege-escalation hole.
  if (role === 'admin') throw new ApiError(403, 'Admin accounts cannot be self-registered');

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new ApiError(409, 'An account with this email already exists');

  const user = new User({ name, email, role, phone, address });
  await user.setPassword(password);
  await user.save();

  res.status(201).json({ token: signToken(user), user: user.toPublic() });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');
  // Same message for unknown email and wrong password, so accounts can't be enumerated.
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  if (user.isSuspended) throw new ApiError(403, 'Account suspended. Contact support.');

  res.json({ token: signToken(user), user: user.toPublic() });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toPublic() });
});
