import { pickWord, buildWordPool } from './words.js';
import { persistRoomScores } from './supabase-sync.js';

export const ROUND_SECONDS = 80;

// ── Scoring constants (skribbl-style) ────────────────────────────────────────
// Guesser: points scale from MAX down to MIN based on how much time is left
// when they guess. First guesser at t=roundSeconds gets MAX; last guesser at
// t=0 gets MIN.
const GUESSER_MAX = 500;
const GUESSER_MIN = 50;

// Drawer: earns a per-correct-guess bonus scaled by the guesser's speed ratio,
// capped at DRAWER_MAX total per round.
const DRAWER_PER_GUESS = 50;   // base per correct guesser
const DRAWER_SPEED_BONUS = 50; // extra if guesser was fast (speed ratio >= 0.5)

export const DEFAULT_SETTINGS = {
  roundSeconds: 80,
  maxPlayers: 8,
  wordPacks: [],
};

export const createRoomGame = () => ({
  active: false,
  drawerId: null,
  word: null,
  turnOrder: [],
  turnIndex: 0,
  round: 0,
  timeLeft: ROUND_SECONDS,
  roundSeconds: ROUND_SECONDS, // snapshot of the setting when round started
  timer: null,
  usedWords: new Set(),
  guessed: new Set(),   // playerIds who have guessed correctly this round
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

// ── Scoring helpers ───────────────────────────────────────────────────────────

/**
 * Points awarded to a guesser based on how much time remains.
 * Scales linearly from GUESSER_MAX (full time left) to GUESSER_MIN (no time).
 */
const calcGuesserPoints = (timeLeft, roundSeconds) => {
  const ratio = Math.max(0, Math.min(1, timeLeft / roundSeconds));
  return Math.round(GUESSER_MIN + (GUESSER_MAX - GUESSER_MIN) * ratio);
};

/**
 * Points awarded to the drawer each time a player guesses correctly.
 * Speed bonus if the guesser used less than half the allotted time.
 */
const calcDrawerBonus = (timeLeft, roundSeconds) => {
  const speedRatio = timeLeft / roundSeconds;
  return DRAWER_PER_GUESS + (speedRatio >= 0.5 ? DRAWER_SPEED_BONUS : 0);
};

// ── Round lifecycle ───────────────────────────────────────────────────────────

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
  room.game.roundSeconds = settings.roundSeconds; // snapshot for scoring

  // Build / refresh turn order, preserving rotation position
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

/**
 * Called when a player joins or re-joins and no round is active but
 * we have enough players. Handles:
 *   - First-ever game start (round === 0)
 *   - Recovery after drawer left mid-round and a new player brings count to 2+
 */
export const maybeStartGame = (io, roomId, room) => {
  if (room.players.size >= 2 && !room.game.active) {
    const isFirstGame = room.game.round === 0;
    const entry = addChat(room, {
      playerId: null,
      nickname: 'Game',
      text: isFirstGame ? 'Game starting...' : 'Resuming game...',
      type: 'system',
    });
    broadcastChat(io, roomId, entry);
    startRound(io, roomId, room);
  }
};

// ── Guess handling ────────────────────────────────────────────────────────────

export const handleGuess = (io, roomId, room, playerId, text) => {
  const g = room.game;
  if (!g.active || !g.word) return;

  const player = room.players.get(playerId);
  if (!player) return;

  // Drawer tried to guess
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

  // Already guessed this round
  if (g.guessed.has(playerId)) return;

  const guess = text.trim().toLowerCase();
  const answer = g.word.toLowerCase();

  if (guess !== answer) {
    // Wrong guess — broadcast to room as normal chat
    const entry = addChat(room, {
      playerId,
      nickname: player.nickname,
      text: guess,
      type: 'guess',
      correct: false,
    });
    broadcastChat(io, roomId, entry);
    return;
  }

  // ── Correct guess ──────────────────────────────────────────────────────────
  g.guessed.add(playerId);

  // Guesser points: speed-based
  const guesserPts = calcGuesserPoints(g.timeLeft, g.roundSeconds);
  player.score = (player.score ?? 0) + guesserPts;

  // Drawer bonus: per-correct-guesser, speed-weighted
  const drawer = room.players.get(g.drawerId);
  const drawerBonus = calcDrawerBonus(g.timeLeft, g.roundSeconds);
  if (drawer) drawer.score = (drawer.score ?? 0) + drawerBonus;

  const entry = addChat(room, {
    playerId,
    nickname: player.nickname,
    text: `guessed the word! (+${guesserPts})`,
    type: 'guess',
    correct: true,
  });
  broadcastChat(io, roomId, entry);
  broadcastPlayers(io, roomId, room);

  // Check if everyone who can guess has guessed
  const eligibleGuessers = Array.from(room.players.keys()).filter(
    (id) => id !== g.drawerId
  );
  const allGuessed = eligibleGuessers.every((id) => g.guessed.has(id));

  if (allGuessed) {
    endRound(io, roomId, room, 'Everyone guessed!');
  }
  // Otherwise keep the round alive for remaining guessers
};

// ── Player leave handling ─────────────────────────────────────────────────────

export const handlePlayerLeave = (io, roomId, room, playerId) => {
  const wasDrawer = room.game.drawerId === playerId;
  room.game.turnOrder = room.game.turnOrder.filter((id) => id !== playerId);

  if (wasDrawer && room.game.active) {
    // Drawer left — end round immediately; if enough players remain,
    // endRound's 3-second timeout will kick off a new round automatically.
    // The new startRound will pick the next person in turnOrder.
    endRound(io, roomId, room, 'Drawer left the game.');
    return;
  }

  // Non-drawer left: check if remaining eligible guessers have all guessed
  if (room.game.active && room.game.drawerId) {
    const eligibleGuessers = Array.from(room.players.keys()).filter(
      (id) => id !== playerId && id !== room.game.drawerId
    );
    const allGuessed =
      eligibleGuessers.length > 0 &&
      eligibleGuessers.every((id) => room.game.guessed.has(id));
    if (allGuessed) {
      endRound(io, roomId, room, 'Everyone guessed!');
      return;
    }
  }

  // Too few players to continue
  if (room.players.size - 1 < 2) {
    // Note: the caller (index.js) removes the player AFTER this function,
    // so we compare against size - 1.
    clearRoundTimer(room);
    room.game.active = false;
    room.game.round = 0;
    room.game.drawerId = null;
    room.game.word = null;
    broadcastGame(io, roomId, room);
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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