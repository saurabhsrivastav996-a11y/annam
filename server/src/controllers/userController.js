import User from '../models/User.js';
import { asyncHandler } from '../utils/ApiError.js';

export const getProfile = asyncHandler(async (req, res) => {
  res.json(req.user.toPublic());
});

export const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const { name, phone, address, notifications } = req.body;

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (address !== undefined) user.address = address;
  if (notifications?.email !== undefined) user.notifications.email = Boolean(notifications.email);

  await user.save();
  res.json(user.toPublic());
});

export const updatePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');
  const { currentPassword, newPassword } = req.body;

  if (!(await user.comparePassword(currentPassword))) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  await user.setPassword(newPassword);
  await user.save();
  res.json({ message: 'Password updated' });
});
