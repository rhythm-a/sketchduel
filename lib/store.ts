import { create } from 'zustand';

export interface Player {
  id: string;
  nickname: string;
  score?: number;
}

interface GameState {
  playerId: string;
  nickname: string | null;
  roomId: string | null;
  players: Player[];
  setNickname: (nickname: string) => void;
  setRoomId: (roomId: string) => void;
  setPlayers: (players: Player[]) => void;
  addPlayer: (player: Player) => void;
  removePlayer: (playerId: string) => void;
  reset: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

const getPlayerId = () => {
  if (typeof window === 'undefined') return generateId();
  // sessionStorage: unique player per tab (localStorage shares one id across tabs)
  let id = sessionStorage.getItem('playerId');
  if (!id) {
    id = generateId();
    sessionStorage.setItem('playerId', id);
  }
  return id;
};

export const useGameStore = create<GameState>((set) => ({
  playerId: getPlayerId(),
  nickname: null,
  roomId: null,
  players: [],

  setNickname: (nickname) => set({ nickname }),
  setRoomId: (roomId) => set({ roomId }),
  setPlayers: (players) => set({ players }),

  addPlayer: (player) => set((state) => ({
    players: state.players.some(p => p.id === player.id)
      ? state.players
      : [...state.players, player]
  })),

  removePlayer: (playerId) => set((state) => ({
    players: state.players.filter(p => p.id !== playerId)
  })),

  reset: () => set({
    nickname: null,
    roomId: null,
    players: [],
  }),
}));
