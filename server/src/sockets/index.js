import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { setIO } from './emitters.js';

export function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.clientUrls, credentials: true },
  });

  // Sockets are authenticated with the same JWT as the REST API.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(); // anonymous sockets may still watch public feeds
    try {
      const payload = jwt.verify(token, env.jwtSecret);
      socket.userId = payload.userId;
      socket.role = payload.role;
    } catch {
      // Ignore a bad token rather than dropping the connection.
    }
    next();
  });

  io.on('connection', (socket) => {
    if (socket.userId) socket.join(`user:${socket.userId}`);

    // Customer / restaurant / courier all watch the same order room.
    socket.on('joinOrderRoom', async (orderId) => {
      if (!socket.userId || !orderId) return;
      const order = await Order.findById(orderId).select('customerId deliveryId restaurantId').lean();
      if (!order) return;

      const uid = socket.userId;
      const isParty =
        order.customerId?.toString() === uid ||
        order.deliveryId?.toString() === uid ||
        socket.role === 'admin' ||
        socket.role === 'restaurant';

      if (isParty) socket.join(`order:${orderId}`);
    });

    socket.on('leaveOrderRoom', (orderId) => socket.leave(`order:${orderId}`));

    // Courier pushes GPS; only the assigned courier may move the pin.
    socket.on('locationUpdate', async ({ orderId, lat, lng }) => {
      if (!socket.userId || socket.role !== 'delivery' || !orderId) return;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;

      const order = await Order.findById(orderId).select('deliveryId').lean();
      if (!order || order.deliveryId?.toString() !== socket.userId) return;

      io.to(`order:${orderId}`).emit('newLocation', { orderId, lat, lng, at: Date.now() });
      await User.updateOne(
        { _id: socket.userId },
        { location: { type: 'Point', coordinates: [lng, lat] } }
      );
    });
  });

  setIO(io);
  return io;
}
