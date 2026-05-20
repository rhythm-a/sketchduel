import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Creates the singleton Socket.IO client with resilient reconnect defaults. */
export const getSocket = (): Socket => {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

    socket = io(url, {
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
      timeout: 15000,
    });
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
