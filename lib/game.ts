export type GameStatus = 'waiting' | 'playing' | 'round_end';

export interface GameState {
  status: GameStatus;
  drawerId: string | null;
  timeLeft: number;
  wordHint: string;
  round: number;
  settings: {
    roundSeconds: number;
    maxPlayers: number;
    wordPacks: string[];
  };
}

export interface ChatMessage {
  id: string;
  playerId: string | null;
  nickname: string;
  text: string;
  type: 'guess' | 'system';
  correct?: boolean;
}
