/**
 * Thin indirection so controllers can emit without importing the socket server,
 * which would create an import cycle (index -> sockets -> routes -> controllers).
 */
let io = null;

export function setIO(instance) {
  io = instance;
}

export function emitToOrder(orderId, event, payload) {
  io?.to(`order:${orderId}`).emit(event, payload);
}

export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function broadcast(event, payload) {
  io?.emit(event, payload);
}
