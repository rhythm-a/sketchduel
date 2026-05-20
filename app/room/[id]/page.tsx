'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Users,
  Copy,
  Check,
  Trash2,
  Loader2,
  WifiOff,
  Cloud,
  AlertCircle,
} from 'lucide-react';
import { useGameStore, type Player } from '@/lib/store';
import { getSocket } from '@/lib/socket';
import { drawLine, clearCanvas, getCanvasPoint, type DrawStroke } from '@/lib/canvas';
import type { ChatMessage, GameState } from '@/lib/game';
import { getSupabaseBrowser } from '@/lib/supabase/client';

type PersistStatus = 'unknown' | 'ready' | 'unavailable';

export default function RoomPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { playerId, nickname, setRoomId, setPlayers, players } = useGameStore();

  const [copied, setCopied] = useState(false);
  const [hydratedFromServer, setHydratedFromServer] = useState(false);
  const [connectionLabel, setConnectionLabel] = useState<'connecting' | 'live' | 'reconnecting' | 'error'>(
    'connecting'
  );
  const [socketMessage, setSocketMessage] = useState<string | null>(null);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [drawerWord, setDrawerWord] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [guess, setGuess] = useState('');
  const [persistStatus, setPersistStatus] = useState<PersistStatus>('unknown');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activePointerId = useRef<number | null>(null);

  const [color, setColor] = useState('#000000');
  const [size, setSize] = useState(2);
  const isDrawing = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);

  const joinRoom = useCallback(() => {
    if (!id || !nickname) return;
    getSocket().emit('join_room', { roomId: id, playerId, nickname });
  }, [id, playerId, nickname]);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setPersistStatus('unavailable');
      return;
    }
    sb.from('room_scores')
      .select('room_id')
      .limit(1)
      .then(({ error }) => {
        setPersistStatus(error ? 'unavailable' : 'ready');
      });
  }, []);

  useEffect(() => {
    if (!id || !nickname) {
      router.push('/');
      return;
    }

    setRoomId(id);
    const socket = getSocket();

    const markHydrated = () => setHydratedFromServer(true);

    const onConnect = () => {
      setConnectionLabel('live');
      setSocketMessage(null);
      joinRoom();
    };

    const onDisconnect = (reason: string) => {
      setHydratedFromServer(false);
      if (reason === 'io client disconnect') {
        setConnectionLabel('connecting');
      } else {
        setConnectionLabel('reconnecting');
        setSocketMessage('Connection lost. Rejoining…');
      }
    };

    const onReconnectAttempt = () => {
      setConnectionLabel('reconnecting');
      setSocketMessage('Reconnecting to game server…');
    };

    const onConnectError = (err: Error) => {
      setConnectionLabel('error');
      setSocketMessage(
        err?.message || 'Cannot reach game server. Is it running (npm run server)?'
      );
    };

    const onAppError = (payload: { message?: string }) => {
      setSocketMessage(payload?.message ?? 'Something went wrong.');
    };

    const handlePlayersUpdated = (updatedPlayers: Player[]) => {
      setPlayers(updatedPlayers);
      markHydrated();
    };

    const handleDrawStroke = (stroke: DrawStroke) => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) drawLine(ctx, stroke);
    };

    const handleClearCanvas = () => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) clearCanvas(ctx, canvasRef.current.width, canvasRef.current.height);
    };

    const handleGameState = (state: GameState) => {
      setGameState(state);
      if (state.drawerId !== playerId) {
        setDrawerWord(null);
      }
      markHydrated();
    };

    const handleDrawerWord = ({ word }: { word: string }) => {
      setDrawerWord(word);
    };

    const handleChatMessage = (message: ChatMessage) => {
      setChatMessages((prev) => [...prev, message]);
    };

    const handleChatHistory = (history: ChatMessage[]) => {
      setChatMessages(history);
      markHydrated();
    };

    if (socket.connected) {
      setConnectionLabel('live');
      joinRoom();
    } else {
      setConnectionLabel('connecting');
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.on('connect_error', onConnectError);
    socket.on('app_error', onAppError);
    socket.on('players_updated', handlePlayersUpdated);
    socket.on('draw_stroke', handleDrawStroke);
    socket.on('clear_canvas', handleClearCanvas);
    socket.on('game_state', handleGameState);
    socket.on('drawer_word', handleDrawerWord);
    socket.on('chat_message', handleChatMessage);
    socket.on('chat_history', handleChatHistory);

    return () => {
      socket.emit('leave_room');
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.off('connect_error', onConnectError);
      socket.off('app_error', onAppError);
      socket.off('players_updated', handlePlayersUpdated);
      socket.off('draw_stroke', handleDrawStroke);
      socket.off('clear_canvas', handleClearCanvas);
      socket.off('game_state', handleGameState);
      socket.off('drawer_word', handleDrawerWord);
      socket.off('chat_message', handleChatMessage);
      socket.off('chat_history', handleChatHistory);
    };
  }, [id, playerId, nickname, joinRoom, router, setRoomId, setPlayers]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const isDrawer = gameState?.drawerId === playerId;
  const isPlaying = gameState?.status === 'playing';
  const canDraw = isPlaying && isDrawer;

  const emitStroke = (stroke: DrawStroke) => {
    getSocket().emit('draw_stroke', stroke);
  };

  const handleSubmitGuess = (e: React.FormEvent) => {
    e.preventDefault();
    const text = guess.trim();
    if (!text || isDrawer || connectionLabel !== 'live') return;
    getSocket().emit('submit_guess', text);
    setGuess('');
  };

  const beginStrokeAt = (clientX: number, clientY: number) => {
    if (!canDraw || !canvasRef.current) return;
    isDrawing.current = true;
    const { x, y } = getCanvasPoint(canvasRef.current, clientX, clientY);
    lastX.current = x;
    lastY.current = y;
  };

  const continueStrokeAt = (clientX: number, clientY: number) => {
    if (!canDraw || !isDrawing.current || !canvasRef.current) return;

    const { x, y } = getCanvasPoint(canvasRef.current, clientX, clientY);
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const stroke: DrawStroke = {
      fromX: lastX.current,
      fromY: lastY.current,
      toX: x,
      toY: y,
      color,
      size,
    };

    drawLine(ctx, stroke);
    emitStroke(stroke);
    lastX.current = x;
    lastY.current = y;
  };

  const endStroke = () => {
    isDrawing.current = false;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || e.pointerType === 'mouse' && e.button !== 0) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    activePointerId.current = e.pointerId;
    beginStrokeAt(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return;
    continueStrokeAt(e.clientX, e.clientY);
  };

  const handlePointerUpOrLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore release if capture already dropped */
    }
    activePointerId.current = null;
    endStroke();
  };

  const handleClearClick = () => {
    if (!canDraw || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      clearCanvas(ctx, canvasRef.current.width, canvasRef.current.height);
      getSocket().emit('clear_canvas');
    }
  };

  function handleCopyCode() {
    if (!id) return;
    navigator.clipboard.writeText(id).catch(() => {
      setSocketMessage('Clipboard access denied.');
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleLeaveRoom() {
    getSocket().emit('leave_room');
    router.push('/');
  }

  const sortedPlayers = [...players].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0)
  );

  const connectionBlocking = connectionLabel !== 'live';
  const blockingOverlay = connectionBlocking || !hydratedFromServer;

  return (
    <main className="min-h-screen min-h-[100dvh] bg-gray-950 text-white flex flex-col overflow-hidden">
      {socketMessage && (
        <div
          role="alert"
          className="flex items-center gap-2 px-3 py-2 sm:px-6 bg-amber-950/90 border-b border-amber-800 text-amber-100 text-sm shrink-0"
        >
          <AlertCircle className="w-4 h-4 shrink-0 flex-shrink-0" />
          <span className="flex-1 min-w-0">{socketMessage}</span>
          <button
            type="button"
            onClick={() => setSocketMessage(null)}
            className="text-amber-200 hover:text-white text-xs underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <header className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-6 py-3 border-b border-gray-800 shrink-0">
        <button
          type="button"
          onClick={handleLeaveRoom}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm hover:bg-gray-900 px-2 sm:px-3 py-2 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          Leave
        </button>

        <div className="flex items-center gap-2 order-last sm:order-none w-full sm:w-auto justify-center sm:justify-start">
          <span className="hidden sm:inline text-[10px] sm:text-xs text-gray-500 uppercase tracking-widest font-medium">
            Room
          </span>
          <div className="flex items-center gap-2 bg-gray-900 px-2 sm:px-4 py-2 rounded-lg max-w-[min(100%,14rem)]">
            <span className="font-mono text-blue-400 font-bold text-base sm:text-lg tracking-widest truncate">
              {id}
            </span>
            <button
              type="button"
              onClick={handleCopyCode}
              className="text-gray-400 hover:text-white transition-colors shrink-0"
              title="Copy room code"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 text-gray-400 text-xs sm:text-sm shrink-0">
          {persistStatus === 'ready' && (
            <span className="hidden md:flex items-center gap-1 text-green-500/90" title="Scores can sync to Supabase">
              <Cloud className="w-3.5 h-3.5" />
              <span className="sr-only">Cloud save on</span>
            </span>
          )}
          {connectionLabel === 'reconnecting' && (
            <span className="flex items-center gap-1 text-amber-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Reconnecting
            </span>
          )}
          {connectionLabel === 'error' && (
            <span className="flex items-center gap-1 text-red-400">
              <WifiOff className="w-3.5 h-3.5" />
              Offline
            </span>
          )}
          {gameState?.status === 'playing' && connectionLabel === 'live' && (
            <span className="font-mono text-amber-400 font-bold">{gameState.timeLeft}s</span>
          )}
          <span className="flex items-center gap-1 sm:gap-2">
            <Users className="w-4 h-4" />
            <span className="font-semibold text-white">{players.length}</span>
          </span>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 relative">
        {blockingOverlay && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-gray-950/85 backdrop-blur-sm px-4 text-center">
            {connectionLabel === 'error' ? (
              <>
                <WifiOff className="w-10 h-10 text-red-400" />
                <p className="text-gray-200 max-w-sm">Could not connect to the game server.</p>
                <p className="text-gray-500 text-sm max-w-sm">
                  Start it with <code className="text-gray-300">npm run server</code> and refresh.
                </p>
              </>
            ) : (
              <>
                <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                <p className="text-gray-200">
                  {connectionLabel === 'reconnecting' ? 'Reconnecting…' : 'Joining room…'}
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex-1 flex flex-col bg-gray-900 min-h-0 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 sm:px-6 py-3 border-b border-gray-800 bg-gray-950 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-wrap min-w-0">
              {isPlaying && (
                <span className="text-xs sm:text-sm text-gray-300 truncate">
                  {isDrawer ? (
                    <>
                      Draw:{' '}
                      <span className="text-green-400 font-bold uppercase">{drawerWord}</span>
                    </>
                  ) : (
                    <>
                      Guess:{' '}
                      <span className="font-mono tracking-widest text-white">
                        {gameState?.wordHint}
                      </span>
                    </>
                  )}
                </span>
              )}
              {!isPlaying && players.length < 2 && (
                <span className="text-xs sm:text-sm text-gray-500">Need 2+ players</span>
              )}
              <div
                className={`flex items-center gap-3 sm:gap-4 ${canDraw ? '' : 'opacity-40 pointer-events-none'}`}
              >
                <div className="flex items-center gap-2">
                  <label className="text-[10px] sm:text-xs text-gray-400 uppercase font-bold">
                    Color
                  </label>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded cursor-pointer border border-gray-700"
                  />
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <label className="text-[10px] sm:text-xs text-gray-400 uppercase font-bold shrink-0">
                    Size
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={size}
                    onChange={(e) => setSize(Number(e.target.value))}
                    className="w-20 sm:w-24 cursor-pointer min-w-0"
                  />
                  <span className="text-xs sm:text-sm text-gray-400 w-7 sm:w-8 shrink-0">{size}px</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClearClick}
              disabled={!canDraw}
              className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:scale-95 disabled:opacity-40 text-white font-semibold px-3 py-2 rounded-lg transition-all text-sm shrink-0 self-start sm:self-auto"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center overflow-hidden relative p-2 sm:p-4 min-h-[40vh] lg:min-h-0">
            <canvas
              ref={canvasRef}
              width={1200}
              height={800}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUpOrLeave}
              onPointerCancel={handlePointerUpOrLeave}
              onPointerLeave={handlePointerUpOrLeave}
              style={{ touchAction: 'none' }}
              className={`bg-white shadow-2xl max-w-full max-h-full w-auto h-auto object-contain select-none ${
                canDraw ? 'cursor-crosshair' : 'cursor-not-allowed'
              }`}
            />
            {isPlaying && !isDrawer && (
              <p className="absolute bottom-3 sm:bottom-4 text-xs sm:text-sm text-gray-400 bg-gray-950/80 px-2 py-1 rounded max-w-[90%] text-center">
                Watch the canvas — guess in the panel below
              </p>
            )}
          </div>
        </div>

        <div className="w-full lg:w-72 flex flex-col bg-gray-900 border-t lg:border-t-0 lg:border-l border-gray-800 overflow-hidden shrink-0 max-h-[45vh] lg:max-h-none">
          <div className="p-3 sm:p-4 border-b border-gray-800 shrink-0">
            <h3 className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-widest font-bold mb-2 sm:mb-3">
              Scoreboard
            </h3>
            <div className="space-y-2 max-h-32 sm:max-h-40 overflow-y-auto">
              {sortedPlayers.length === 0 ? (
                <p className="text-gray-600 text-sm">Waiting for players...</p>
              ) : (
                sortedPlayers.map((player) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-2 rounded-lg text-xs sm:text-sm ${
                      gameState?.drawerId === player.id
                        ? 'bg-amber-900/40 ring-1 ring-amber-600'
                        : 'bg-gray-800'
                    }`}
                  >
                    <span className="truncate text-white pr-2">
                      {player.nickname}
                      {playerId === player.id && ' (you)'}
                    </span>
                    <span className="font-bold text-blue-400 shrink-0">{player.score ?? 0}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 p-3 sm:p-4">
            <h3 className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-widest font-bold mb-2">
              Guesses
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2 mb-3 text-xs sm:text-sm min-h-0">
              {chatMessages.length === 0 ? (
                <p className="text-gray-600">No messages yet</p>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={
                      msg.type === 'system'
                        ? 'text-gray-500 italic'
                        : msg.correct
                          ? 'text-green-400'
                          : 'text-gray-300'
                    }
                  >
                    <span className="font-medium text-gray-400">{msg.nickname}: </span>
                    {msg.text}
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSubmitGuess} className="flex gap-2 shrink-0">
              <input
                type="text"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder={isDrawer ? 'You are drawing' : 'Type your guess...'}
                disabled={!isPlaying || isDrawer || connectionLabel !== 'live'}
                maxLength={40}
                autoComplete="off"
                inputMode="text"
                enterKeyHint="send"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder:text-gray-500 disabled:opacity-50 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={!isPlaying || isDrawer || !guess.trim() || connectionLabel !== 'live'}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg text-sm font-semibold shrink-0"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
