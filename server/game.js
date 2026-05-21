import { pickWord, buildWordPool } from './words.js';
import { persistRoomScores } from './supabase-sync.js';

export const ROUND_SECONDS = 80;
const GUESS_POINTS = 100;
const DRAWER_POINTS = 50;

export const DEFAULT_SETTINGS = {
  roundSeconds: 80,
  maxPlayers: 8,
  wordPacks: [], // extra packs on top of 'basic'
};

export const createRoomGame = () => ({
  active: false,
  drawerId: null,
  word: null,
  turnOrder: [],
  turnIndex: 0,
  round: 0,
  timeLeft: ROUND_SECONDS,
  timer: null,
  usedWords: new Set(),
  guessed: new Set(),
  chat: [],
});

export const wordHint = (word) =>
  word
    .split('')
    .map((c) => (c === ' ' ? ' ' : '_'))
    .join(' ');

export const getPlayersPayload = (room) =>
  Array.from(room.players.entries()).map(([id, p]) => ({
    id,
    nickname: p.nickname,
    score: p.score ?? 0,
  }));

export const getPublicGameState = (room) => {
  const g = room.game;
  const settings = room.settings ?? DEFAULT_SETTINGS;
  return {
    status: g.active ? 'playing' : 'waiting',
    drawerId: g.drawerId,
    timeLeft: g.timeLeft,
    wordHint: g.word ? wordHint(g.word) : '',
    round: g.round,
    settings: {
      roundSeconds: settings.roundSeconds,
      maxPlayers: settings.maxPlayers,
      wordPacks: settings.wordPacks,
    },
  };
};

export const addChat = (room, message) => {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...message,
  };
  room.game.chat.push(entry);
  if (room.game.chat.length > 80) room.game.chat.shift();
  return entry;
};

export const clearRoundTimer = (room) => {
  if (room.game.timer) {
    clearInterval(room.game.timer);
    room.game.timer = null;
  }
};

export const broadcastGame = (io, roomId, room) => {
  const payload = getPublicGameState(room);
  io.to(roomId).emit('game_state', payload);

  if (room.game.drawerId && room.game.word) {
    const drawer = room.players.get(room.game.drawerId);
    if (drawer?.socketId) {
      io.to(drawer.socketId).emit('drawer_word', { word: room.game.word });
    }
  }
};

export const broadcastChat = (io, roomId, entry) => {
  io.to(roomId).emit('chat_message', entry);
};

export const broadcastPlayers = (io, roomId, room) => {
  const payload = getPlayersPayload(room);
  io.to(roomId).emit('players_updated', payload);
  persistRoomScores(roomId, payload);
};

export const endRound = (io, roomId, room, reason) => {
  clearRoundTimer(room);
  const word = room.game.word;
  room.game.active = false;
  room.game.drawerId = null;
  room.game.word = null;
  room.game.guessed.clear();

  if (reason && word) {
    const entry = addChat(room, {
      playerId: null,
      nickname: 'Game',
      text: `${reason} The word was "${word}".`,
      type: 'system',
    });
    broadcastChat(io, roomId, entry);
  }

  broadcastGame(io, roomId, room);
  io.to(roomId).emit('clear_canvas');

  setTimeout(() => {
    if (room.players.size >= 2) startRound(io, roomId, room);
  }, 3000);
};

export const startRound = (io, roomId, room) => {
  if (room.players.size < 2) return;

  const settings = room.settings ?? DEFAULT_SETTINGS;
  const wordPool = buildWordPool(settings.wordPacks);

  clearRoundTimer(room);
  room.game.guessed.clear();
  room.game.round += 1;

  if (room.game.turnOrder.length === 0) {
    room.game.turnOrder = Array.from(room.players.keys());
    room.game.turnIndex = 0;
  } else {
    room.game.turnOrder = room.game.turnOrder.filter((id) => room.players.has(id));
    if (room.game.turnOrder.length === 0) {
      room.game.turnOrder = Array.from(room.players.keys());
    }
    room.game.turnIndex = room.game.turnIndex % room.game.turnOrder.length;
  }

  const drawerId = room.game.turnOrder[room.game.turnIndex];
  room.game.turnIndex = (room.game.turnIndex + 1) % room.game.turnOrder.length;

  const word = pickWord(room.game.usedWords, wordPool);
  room.game.usedWords.add(word);
  room.game.word = word;
  room.game.drawerId = drawerId;
  room.game.active = true;
  room.game.timeLeft = settings.roundSeconds;

  const drawer = room.players.get(drawerId);
  const entry = addChat(room, {
    playerId: null,
    nickname: 'Game',
    text: `${drawer?.nickname ?? 'Someone'} is drawing!`,
    type: 'system',
  });
  broadcastChat(io, roomId, entry);
  broadcastGame(io, roomId, room);
  io.to(roomId).emit('clear_canvas');

  room.game.timer = setInterval(() => {
    room.game.timeLeft -= 1;
    io.to(roomId).emit('game_state', getPublicGameState(room));
    if (room.game.timeLeft <= 0) {
      endRound(io, roomId, room, "Time's up!");
    }
  }, 1000);
};

export const maybeStartGame = (io, roomId, room) => {
  if (room.players.size >= 2 && !room.game.active && room.game.round === 0) {
    const entry = addChat(room, {
      playerId: null,
      nickname: 'Game',
      text: 'Game starting...',
      type: 'system',
    });
    broadcastChat(io, roomId, entry);
    startRound(io, roomId, room);
  }
};

export const handleGuess = (io, roomId, room, playerId, text) => {
  const g = room.game;
  if (!g.active || !g.word) return;

  const player = room.players.get(playerId);
  if (!player) return;

  if (playerId === g.drawerId) {
    const entry = addChat(room, {
      playerId,
      nickname: player.nickname,
      text: "You're drawing — you can't guess.",
      type: 'system',
    });
    socketEmitToPlayer(io, room, playerId, 'chat_message', entry);
    return;
  }

  if (g.guessed.has(playerId)) return;

  const guess = text.trim().toLowerCase();
  const answer = g.word.toLowerCase();

  if (guess === answer) {
    g.guessed.add(playerId);
    player.score = (player.score ?? 0) + GUESS_POINTS;

    const drawer = room.players.get(g.drawerId);
    if (drawer) drawer.score = (drawer.score ?? 0) + DRAWER_POINTS;

    const entry = addChat(room, {
      playerId,
      nickname: player.nickname,
      text: `guessed the word! (+${GUESS_POINTS})`,
      type: 'guess',
      correct: true,
    });
    broadcastChat(io, roomId, entry);
    broadcastPlayers(io, roomId, room);
    endRound(io, roomId, room, `${player.nickname} guessed correctly!`);
    return;
  }

  const entry = addChat(room, {
    playerId,
    nickname: player.nickname,
    text: guess,
    type: 'guess',
    correct: false,
  });
  broadcastChat(io, roomId, entry);
};

const socketEmitToPlayer = (io, room, playerId, event, data) => {
  const player = room.players.get(playerId);
  if (player?.socketId) io.to(player.socketId).emit(event, data);
};

export const syncPlayerJoin = (io, socket, roomId, room) => {
  socket.emit('players_updated', getPlayersPayload(room));
  socket.emit('game_state', getPublicGameState(room));
  socket.emit('chat_history', room.game.chat);

  if (room.game.drawerId === socket.data.playerId && room.game.word) {
    socket.emit('drawer_word', { word: room.game.word });
  }
};

export const handlePlayerLeave = (io, roomId, room, playerId) => {
  const wasDrawer = room.game.drawerId === playerId;
  room.game.turnOrder = room.game.turnOrder.filter((id) => id !== playerId);

  if (wasDrawer && room.game.active) {
    endRound(io, roomId, room, 'Drawer left.');
  } else if (room.players.size < 2) {
    clearRoundTimer(room);
    room.game.active = false;
    room.game.round = 0;
    room.game.drawerId = null;
    room.game.word = null;
    broadcastGame(io, roomId, room);
  }
};