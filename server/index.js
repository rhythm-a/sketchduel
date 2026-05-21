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
  DEFAULT_SETTINGS,
} from './game.js';
import {
  fetchRoomScores,
  persistRoomSettings,
  fetchRoomSettings,
} from './supabase-sync.js';
import { WORD_PACKS } from './words.js';

const PORT = process.env.PORT || process.env.SOCKET_PORT || 3001;

const httpServer = createServer();

const allowedOrigins = [
  'https://sketchduel.netlify.app',
  'http://localhost:3000',
  'http://localhost:3002',
];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const rooms = new Map();

const VALID_ROUND_SECONDS = [30, 60, 80, 120];
const VALID_MAX_PLAYERS = [4, 6, 8, 10, 16];
const VALID_WORD_PACKS = Object.keys(WORD_PACKS).filter((k) => k !== 'basic');

function sanitizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  return {
    roundSeconds: VALID_ROUND_SECONDS.includes(raw.roundSeconds)
      ? raw.roundSeconds
      : DEFAULT_SETTINGS.roundSeconds,
    maxPlayers: VALID_MAX_PLAYERS.includes(raw.maxPlayers)
      ? raw.maxPlayers
      : DEFAULT_SETTINGS.maxPlayers,
    wordPacks: Array.isArray(raw.wordPacks)
      ? raw.wordPacks.filter((p) => VALID_WORD_PACKS.includes(p))
      : DEFAULT_SETTINGS.wordPacks,
  };
}

const createRoom = () => ({
  players: new Map(),
  sockets: new Set(),
  game: createRoomGame(),
  settings: { ...DEFAULT_SETTINGS },
  hostId: null,
});

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
    console.log(`[socket] ${playerId} left room ${roomId}. Total: ${room.players.size}`);
  }
}

io.on('connection', (socket) => {
  console.log(`[socket] client connected: ${socket.id}`);

  socket.on('join_room', async (data) => {
    const { roomId, playerId, nickname, settings: rawSettings } = data;

    if (!roomId || !playerId || !nickname) {
      socket.emit('app_error', { message: 'Missing room or player info. Go back and try again.' });
      return;
    }

    if (socket.data.roomId && socket.data.roomId !== roomId) {
      leaveRoom(io, socket);
    }

    const isNewRoom = !rooms.has(roomId);
    if (isNewRoom) {
      rooms.set(roomId, createRoom());
    }

    const room = rooms.get(roomId);

    // Enforce max players (don't block rejoins)
    const isRejoin = room.players.has(playerId);
    if (!isRejoin && room.players.size >= room.settings.maxPlayers) {
      socket.emit('app_error', { message: `Room is full (max ${room.settings.maxPlayers} players).` });
      return;
    }

    if (isNewRoom) {
      room.hostId = playerId;

      // 1. Try settings passed directly by the creator (fastest path)
      // 2. Fall back to DB (handles page refresh by the host)
      // 3. Fall back to defaults
      let resolvedSettings = rawSettings ? sanitizeSettings(rawSettings) : null;
      if (!resolvedSettings) {
        const persisted = await fetchRoomSettings(roomId).catch(() => null);
        resolvedSettings = persisted ? sanitizeSettings(persisted) : { ...DEFAULT_SETTINGS };
      }
      room.settings = resolvedSettings;

      // Always persist so joining players (and rejoining hosts) can load from DB
      persistRoomSettings(roomId, room.settings).catch((e) =>
        console.error('[socket] persistRoomSettings failed', e)
      );

      console.log(`[socket] room ${roomId} created with settings`, room.settings);
    } else if (!isRejoin) {
      // Non-host joiner: if settings aren't loaded yet (edge case on cold restart),
      // fetch from DB so the room always has accurate settings.
      if (!room._settingsLoaded) {
        const persisted = await fetchRoomSettings(roomId).catch(() => null);
        if (persisted) room.settings = sanitizeSettings(persisted);
        room._settingsLoaded = true;
      }
    }

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
        if (p) p.score = Math.max(p.score ?? 0, row.score ?? 0);
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

    console.log(`[socket] ${playerId} joined room ${roomId}. Total: ${room.players.size}`);
  });

  socket.on('leave_room', () => leaveRoom(io, socket));

  socket.on('submit_guess', (text) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId || typeof text !== 'string') return;
    const room = rooms.get(roomId);
    if (!room) return;
    handleGuess(io, roomId, room, playerId, text);
  });

  socket.on('draw_stroke', (data) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    const room = rooms.get(roomId);
    if (!room?.game.active || room.game.drawerId !== playerId) return;
    socket.to(roomId).emit('draw_stroke', data);
  });

  socket.on('clear_canvas', () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    const room = rooms.get(roomId);
    if (!room?.game.active || room.game.drawerId !== playerId) return;
    socket.to(roomId).emit('clear_canvas');
  });

  socket.on('fill_stroke', (data) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    const room = rooms.get(roomId);
    if (!room?.game.active || room.game.drawerId !== playerId) return;
    if (
      typeof data?.x !== 'number' ||
      typeof data?.y !== 'number' ||
      typeof data?.color !== 'string'
    ) return;
    socket.to(roomId).emit('fill_stroke', data);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected (${reason}): ${socket.id}`);
    leaveRoom(io, socket);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Socket.IO listening on port ${PORT}`);
});