import { io } from 'socket.io-client';
import { API_ORIGIN } from './api.js';

let socket = null;

/** One shared socket per tab, re-created when the auth token changes. */
export function getSocket() {
  const token = localStorage.getItem('annam_token');

  if (socket && socket.auth?.token !== token) {
    socket.disconnect();
    socket = null;
  }
  if (!socket) {
    socket = io(API_ORIGIN || '/', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
