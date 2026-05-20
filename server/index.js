import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import {
  createRoomGame,
  broadcastPlayers,
  maybeStartGame,
  handleGuess,
  syncPlayerJoin,
  handlePlayerLeave,
  clearRoundTimer,
} from './game.js';
import { fetchRoomScores } from './supabase-sync.js';

const PORT = process.env.PORT || process.env.SOCKET_PORT || 3001;

const httpServer = createServer();

const allowedOrigins = (
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000,http://localhost:3002'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked origin: ${origin}`));
      }
    },
    methods: ['GET', 'POST'],
  },
});

const rooms = new Map();

const createRoom = () => ({
  players: new Map(),
  sockets: new Set(),
  game: createRoomGame(),
});

/** Remove this socket from whichever room it's in (disconnect or explicit leave). */
function leaveRoom(io, socket) {
  const roomId = socket.data.roomId;
  const playerId = socket.data.playerId;
  if (!roomId || !playerId) return;

  const room = rooms.get(roomId);
  socket.leave(roomId);
  delete socket.data.roomId;
  delete socket.data.playerId;

  if (!room) return;

  handlePlayerLeave(io, roomId, room, playerId);
  room.players.delete(playerId);
  room.sockets.delete(socket.id);

  if (room.players.size === 0) {
    clearRoundTimer(room);
    rooms.delete(roomId);
    console.log(`[socket] room ${roomId} destroyed (no players)`);
  } else {
    broadcastPlayers(io, roomId, room);
    maybeStartGame(io, roomId, room);
    console.log(
      `[socket] ${playerId} left room ${roomId}. Total players: ${room.players.size}`
    );
  }
}

io.on('connection', (socket) => {
  console.log(`[socket] client connected: ${socket.id}`);

  socket.on('join_room', async (data) => {
    const { roomId, playerId, nickname } = data;

    if (!roomId || !playerId || !nickname) {
      socket.emit('app_error', { message: 'Missing room or player info. Go back and try again.' });
      return;
    }

    if (socket.data.roomId && socket.data.roomId !== roomId) {
      leaveRoom(io, socket);
    }

    if (!rooms.has(roomId)) {
      rooms.set(roomId, createRoom());
    }

    const room = rooms.get(roomId);
    const existing = room.players.get(playerId);
    room.players.set(playerId, {
      nickname,
      socketId: socket.id,
      score: existing?.score ?? 0,
    });

    try {
      const persisted = await fetchRoomScores(roomId);
      for (const row of persisted) {
        const p = room.players.get(row.player_id);
        if (p) {
          p.score = Math.max(p.score ?? 0, row.score ?? 0);
        }
      }
    } catch (e) {
      console.error('[socket] persistence load failed', e);
    }

    room.sockets.add(socket.id);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.playerId = playerId;

    broadcastPlayers(io, roomId, room);
    syncPlayerJoin(io, socket, roomId, room);
    maybeStartGame(io, roomId, room);

    console.log(
      `[socket] ${playerId} joined room ${roomId}. Total players: ${room.players.size}`
    );
  });

  socket.on('leave_room', () => {
    leaveRoom(io, socket);
  });

  socket.on('submit_guess', (text) => {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    if (!roomId || !playerId || typeof text !== 'string') return;

    const room = rooms.get(roomId);
    if (!room) return;

    handleGuess(io, roomId, room, playerId, text);
  });

  socket.on('draw_stroke', (data) => {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    if (!roomId || !playerId) return;

    const room = rooms.get(roomId);
    if (!room?.game.active || room.game.drawerId !== playerId) return;

    socket.to(roomId).emit('draw_stroke', data);
  });

  socket.on('clear_canvas', () => {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    if (!roomId || !playerId) return;

    const room = rooms.get(roomId);
    if (!room?.game.active || room.game.drawerId !== playerId) return;

    socket.to(roomId).emit('clear_canvas');
  });

  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected (${reason}): ${socket.id}`);
    leaveRoom(io, socket);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] Socket.IO listening on port ${PORT}`);
});
