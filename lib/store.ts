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

export const useGameStore = create<GameState>((set, get) => ({
  playerId: getPlayerId(),
  nickname: null,
  roomId: null,
  players: [],

  setNickname: (nickname) => {
    if (get().nickname !== nickname) set({ nickname });
  },

  // Guard: only update if value actually changed — prevents infinite render loops
  // when setRoomId is called inside a useEffect that also reads from the store.
  setRoomId: (roomId) => {
    if (get().roomId !== roomId) set({ roomId });
  },

  // Guard: only update if the player list has meaningfully changed (different
  // length or any id/score differs), so socket events don't trigger cascading
  // re-renders when the list is functionally identical.
  setPlayers: (players) => {
    const current = get().players;
    const changed =
      current.length !== players.length ||
      players.some((p, i) => {
        const c = current[i];
        return !c || c.id !== p.id || c.score !== p.score || c.nickname !== p.nickname;
      });
    if (changed) set({ players });
  },

  addPlayer: (player) => set((state) => ({
    players: state.players.some(p => p.id === player.id)
      ? state.players
      : [...state.players, player],
  })),

  removePlayer: (playerId) => set((state) => ({
    players: state.players.filter(p => p.id !== playerId),
  })),

  reset: () => set({
    nickname: null,
    roomId: null,
    players: [],
  }),
}));