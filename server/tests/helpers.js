import request from 'supertest';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import Restaurant from '../src/models/Restaurant.js';
import FoodItem from '../src/models/FoodItem.js';

export const app = createApp();

/** Creates a user directly and returns { user, token } via a real login. */
export async function makeUser({ email, role = 'customer', name = 'Test User', password = 'Test@123' }) {
  const user = new User({ name, email, role });
  await user.setPassword(password);
  await user.save();

  const res = await request(app).post('/api/auth/login').send({ email, password });
  return { user, token: res.body.token };
}

export async function makeRestaurantWithMenu(ownerUserId) {
  const restaurant = await Restaurant.create({
    ownerUserId,
    name: 'Test Kitchen',
    address: '1 Test Road, Hyderabad',
    cuisineType: 'Indian',
  });
  const items = await FoodItem.insertMany([
    { restaurantId: restaurant._id, name: 'Dal', price: 100, category: 'veg' },
    { restaurantId: restaurant._id, name: 'Roti', price: 20, category: 'veg' },
  ]);
  return { restaurant, items };
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });
