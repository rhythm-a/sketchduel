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
  AlertCircle,
  Pencil,
  Eraser,
  PaintBucket,
} from 'lucide-react';
import { useGameStore, type Player } from '@/lib/store';
import { getSocket } from '@/lib/socket';
import { drawLine, clearCanvas, getCanvasPoint, type DrawStroke } from '@/lib/canvas';
import type { ChatMessage, GameState } from '@/lib/game';
import { getSupabaseBrowser } from '@/lib/supabase/client';

type DrawTool = 'pencil' | 'eraser' | 'fill';

// Flood fill algorithm
function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColorHex: string,
  canvas: HTMLCanvasElement
) {
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  const toIndex = (x: number, y: number) => (y * canvas.width + x) * 4;

  const sx = Math.round(startX);
  const sy = Math.round(startY);
  const startIdx = toIndex(sx, sy);
  const startR = data[startIdx];
  const startG = data[startIdx + 1];
  const startB = data[startIdx + 2];
  const startA = data[startIdx + 3];

  const bigint = parseInt(fillColorHex.slice(1), 16);
  const fillR = (bigint >> 16) & 255;
  const fillG = (bigint >> 8) & 255;
  const fillB = bigint & 255;
  const fillA = 255;

  if (startR === fillR && startG === fillG && startB === fillB && startA === fillA) return;

  const matchesStart = (idx: number) =>
    Math.abs(data[idx] - startR) < 30 &&
    Math.abs(data[idx + 1] - startG) < 30 &&
    Math.abs(data[idx + 2] - startB) < 30 &&
    Math.abs(data[idx + 3] - startA) < 30;

  const stack: number[] = [sx + sy * canvas.width];
  const visited = new Uint8Array(canvas.width * canvas.height);

  while (stack.length > 0) {
    const pos = stack.pop()!;
    if (visited[pos]) continue;
    visited[pos] = 1;

    const x = pos % canvas.width;
    const y = Math.floor(pos / canvas.width);
    const idx = pos * 4;

    if (!matchesStart(idx)) continue;

    data[idx] = fillR;
    data[idx + 1] = fillG;
    data[idx + 2] = fillB;
    data[idx + 3] = fillA;

    if (x > 0) stack.push(pos - 1);
    if (x < canvas.width - 1) stack.push(pos + 1);
    if (y > 0) stack.push(pos - canvas.width);
    if (y < canvas.height - 1) stack.push(pos + canvas.width);
  }

  ctx.putImageData(imgData, 0, 0);
}

const PACK_LABELS: Record<string, string> = {
  animals: 'Animals', food: 'Food & Drink', sports: 'Sports',
  tech: 'Technology', nature: 'Nature', popculture: 'Pop Culture',
};

export default function RoomPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { playerId, nickname, setRoomId, setPlayers, players } = useGameStore();

  // Settings are written to sessionStorage by the home page when creating a room.
  // We read them once on mount — no searchParams dependency, no re-render loop.
  const creatorSettingsRef = useRef<object | null>(null);
  if (creatorSettingsRef.current === null && typeof window !== 'undefined' && id) {
    try {
      const raw = sessionStorage.getItem(`room_settings_${id}`);
      if (raw) {
        creatorSettingsRef.current = JSON.parse(raw);
        // Clean up so the key doesn't linger across sessions
        sessionStorage.removeItem(`room_settings_${id}`);
      }
    } catch { /* ignore */ }
  }

  const [copied, setCopied] = useState(false);
  const [hydratedFromServer, setHydratedFromServer] = useState(false);
  const [connectionLabel, setConnectionLabel] = useState<'connecting' | 'live' | 'reconnecting' | 'error'>('connecting');
  const [socketMessage, setSocketMessage] = useState<string | null>(null);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [drawerWord, setDrawerWord] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [guess, setGuess] = useState('');

  const [mobileTab, setMobileTab] = useState<'chat' | 'scores'>('chat');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activePointerId = useRef<number | null>(null);

  const [color, setColor] = useState('#000000');
  const [size, setSize] = useState(4);
  const [tool, setTool] = useState<DrawTool>('pencil');
  const isDrawing = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);

  // Stable join callback — only depends on primitive id/playerId/nickname, plus
  // the ref (which never changes identity). No creatorSettings in the dep array.
  const joinRoom = useCallback(() => {
    if (!id || !nickname) return;
    getSocket().emit('join_room', {
      roomId: id,
      playerId,
      nickname,
      ...(creatorSettingsRef.current ? { settings: creatorSettingsRef.current } : {}),
    });
  }, [id, playerId, nickname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    sb.from('room_scores').select('room_id').limit(1);
  }, []);

  useEffect(() => {
    if (!id || !nickname) { router.push('/'); return; }

    setRoomId(id);
    const socket = getSocket();
    const markHydrated = () => setHydratedFromServer(true);

    const onConnect = () => { setConnectionLabel('live'); setSocketMessage(null); joinRoom(); };
    const onDisconnect = (reason: string) => {
      setHydratedFromServer(false);
      if (reason === 'io client disconnect') { setConnectionLabel('connecting'); }
      else { setConnectionLabel('reconnecting'); setSocketMessage('Connection lost. Rejoining…'); }
    };
    const onReconnectAttempt = () => { setConnectionLabel('reconnecting'); setSocketMessage('Reconnecting…'); };
    const onConnectError = (err: Error) => {
      setConnectionLabel('error');
      setSocketMessage(err?.message || 'Cannot reach game server. Is it running (npm run server)?');
    };
    const onAppError = (payload: { message?: string }) => setSocketMessage(payload?.message ?? 'Something went wrong.');

    const handlePlayersUpdated = (updatedPlayers: Player[]) => { setPlayers(updatedPlayers); markHydrated(); };
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
      if (state.drawerId !== playerId) setDrawerWord(null);
      markHydrated();
    };
    const handleDrawerWord = ({ word }: { word: string }) => setDrawerWord(word);
    const handleChatMessage = (message: ChatMessage) => setChatMessages((prev) => [...prev, message]);
    const handleChatHistory = (history: ChatMessage[]) => { setChatMessages(history); markHydrated(); };
    const handleFillStroke = (payload: { x: number; y: number; color: string }) => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) floodFill(ctx, payload.x, payload.y, payload.color, canvasRef.current);
    };

    if (socket.connected) { setConnectionLabel('live'); joinRoom(); }
    else setConnectionLabel('connecting');

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
    socket.on('fill_stroke', handleFillStroke);

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
      socket.off('fill_stroke', handleFillStroke);
    };
  }, [id, playerId, nickname, joinRoom, router, setRoomId, setPlayers]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, []);

  const isDrawer = gameState?.drawerId === playerId;
  const isPlaying = gameState?.status === 'playing';
  const canDraw = isPlaying && isDrawer;

  const activeColor = tool === 'eraser' ? '#ffffff' : color;
  const activeSize = tool === 'eraser' ? Math.max(size * 3, 20) : size;

  const emitStroke = (stroke: DrawStroke) => getSocket().emit('draw_stroke', stroke);

  const handleSubmitGuess = (e: React.FormEvent) => {
    e.preventDefault();
    const text = guess.trim();
    if (!text || isDrawer || connectionLabel !== 'live') return;
    getSocket().emit('submit_guess', text);
    setGuess('');
  };

  const beginStrokeAt = (clientX: number, clientY: number) => {
    if (!canDraw || !canvasRef.current) return;
    if (tool === 'fill') {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      const { x, y } = getCanvasPoint(canvasRef.current, clientX, clientY);
      floodFill(ctx, x, y, color, canvasRef.current);
      getSocket().emit('fill_stroke', { x, y, color });
      return;
    }
    isDrawing.current = true;
    const { x, y } = getCanvasPoint(canvasRef.current, clientX, clientY);
    lastX.current = x;
    lastY.current = y;
  };

  const continueStrokeAt = (clientX: number, clientY: number) => {
    if (!canDraw || !isDrawing.current || !canvasRef.current || tool === 'fill') return;
    const { x, y } = getCanvasPoint(canvasRef.current, clientX, clientY);
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const stroke: DrawStroke = {
      fromX: lastX.current, fromY: lastY.current,
      toX: x, toY: y,
      color: activeColor, size: activeSize,
    };
    drawLine(ctx, stroke);
    emitStroke(stroke);
    lastX.current = x;
    lastY.current = y;
  };

  const endStroke = () => { isDrawing.current = false; };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    activePointerId.current = e.pointerId;
    beginStrokeAt(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return;
    e.preventDefault();
    continueStrokeAt(e.clientX, e.clientY);
  };

  const handlePointerUpOrLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
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
    navigator.clipboard.writeText(id).catch(() => setSocketMessage('Clipboard access denied.'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleLeaveRoom() {
    getSocket().emit('leave_room');
    router.push('/');
  }

  const sortedPlayers = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const blockingOverlay = connectionLabel !== 'live' || !hydratedFromServer;

  const toolCursor = !canDraw
    ? 'cursor-default'
    : tool === 'fill'
      ? 'cursor-cell'
      : tool === 'eraser'
        ? 'cursor-cell'
        : 'cursor-crosshair';

  return (
    <main
      className="fixed inset-0 bg-[#0f0f0f] text-white flex flex-col overflow-hidden"
      style={{ height: '100dvh' }}
    >
      {socketMessage && (
        <div role="alert" className="flex items-center gap-2 px-4 py-2 bg-amber-950 border-b border-amber-800/60 text-amber-200 text-xs shrink-0">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 min-w-0">{socketMessage}</span>
          <button onClick={() => setSocketMessage(null)} className="text-amber-400 hover:text-white ml-2 shrink-0">✕</button>
        </div>
      )}

      <header className="flex items-center justify-between gap-3 px-3 h-12 border-b border-[#1e1e1e] shrink-0 bg-[#141414]">
        <button
          onClick={handleLeaveRoom}
          className="flex items-center gap-1.5 text-[#666] hover:text-white transition-colors text-sm px-2 py-1.5 rounded hover:bg-[#1e1e1e]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Leave</span>
        </button>

        <button
          onClick={handleCopyCode}
          className="flex items-center gap-2 font-mono text-sm tracking-widest text-[#4f8ef7] hover:text-white transition-colors bg-[#1a2540] hover:bg-[#1e2d4d] px-3 py-1.5 rounded"
        >
          {id}
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-[#4f8ef7]" />}
        </button>

        <div className="flex items-center gap-3 text-[#555] text-xs shrink-0">
          {connectionLabel === 'reconnecting' && (
            <span className="flex items-center gap-1 text-amber-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden sm:inline">Reconnecting</span>
            </span>
          )}
          {connectionLabel === 'error' && (
            <span className="flex items-center gap-1 text-red-400">
              <WifiOff className="w-3.5 h-3.5" />
            </span>
          )}
          {gameState?.status === 'playing' && connectionLabel === 'live' && (
            <span className="font-mono text-amber-400 font-bold tabular-nums w-8 text-right">
              {gameState.timeLeft}s
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            <span className="font-semibold text-white">{players.length}</span>
          </span>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 relative">

        {blockingOverlay && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#0f0f0f]/90 backdrop-blur-sm">
            {connectionLabel === 'error' ? (
              <>
                <WifiOff className="w-8 h-8 text-red-400" />
                <p className="text-[#999] text-sm">Could not reach game server.</p>
                <code className="text-xs text-[#666] bg-[#1a1a1a] px-3 py-1.5 rounded">npm run server</code>
              </>
            ) : (
              <>
                <Loader2 className="w-7 h-7 text-[#4f8ef7] animate-spin" />
                <p className="text-[#666] text-sm">
                  {connectionLabel === 'reconnecting' ? 'Reconnecting…' : 'Joining room…'}
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex items-center gap-1 sm:gap-2 px-3 py-2 border-b border-[#1e1e1e] bg-[#141414] shrink-0 flex-wrap">
            {isPlaying && (
              <div className="flex items-center mr-2 shrink-0">
                {isDrawer ? (
                  <span className="text-xs font-semibold">
                    Draw: <span className="text-green-400 font-black uppercase tracking-wide">{drawerWord}</span>
                  </span>
                ) : (
                  <span className="text-xs text-[#888]">
                    Guess: <span className="font-mono tracking-[0.15em] text-white font-bold">{gameState?.wordHint}</span>
                  </span>
                )}
              </div>
            )}
            {!isPlaying && players.length < 2 && (
              <div className="flex items-center gap-3 mr-2 flex-wrap">
                <span className="text-xs text-[#555]">Need 2+ players to start</span>
                {gameState?.settings && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] bg-[#1a1a1a] text-[#666] px-2 py-0.5 rounded font-mono">
                      {gameState.settings.roundSeconds}s
                    </span>
                    <span className="text-[10px] bg-[#1a1a1a] text-[#666] px-2 py-0.5 rounded font-mono">
                      {gameState.settings.maxPlayers} max
                    </span>
                    {gameState.settings.wordPacks?.map((p: string) => (
                      <span key={p} className="text-[10px] bg-[#1a2540] text-[#4f8ef7] px-2 py-0.5 rounded">
                        {PACK_LABELS[p] ?? p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={`flex items-center gap-1 sm:gap-2 ${canDraw ? '' : 'opacity-30 pointer-events-none'}`}>
              <div className="flex items-center bg-[#1a1a1a] rounded-md p-0.5 gap-0.5">
                <button
                  onClick={() => setTool('pencil')}
                  title="Pencil"
                  className={`p-1.5 rounded transition-colors ${tool === 'pencil' ? 'bg-[#4f8ef7] text-white' : 'text-[#666] hover:text-white hover:bg-[#252525]'}`}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setTool('eraser')}
                  title="Eraser"
                  className={`p-1.5 rounded transition-colors ${tool === 'eraser' ? 'bg-[#4f8ef7] text-white' : 'text-[#666] hover:text-white hover:bg-[#252525]'}`}
                >
                  <Eraser className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setTool('fill')}
                  title="Fill bucket"
                  className={`p-1.5 rounded transition-colors ${tool === 'fill' ? 'bg-[#4f8ef7] text-white' : 'text-[#666] hover:text-white hover:bg-[#252525]'}`}
                >
                  <PaintBucket className="w-4 h-4" />
                </button>
              </div>

              <label
                title="Color"
                className="relative w-8 h-8 rounded cursor-pointer border-2 border-[#2a2a2a] hover:border-[#4f8ef7] transition-colors overflow-hidden shrink-0"
                style={{ backgroundColor: color }}
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </label>

              {tool !== 'fill' && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={size}
                    onChange={(e) => setSize(Number(e.target.value))}
                    className="w-16 sm:w-24 accent-[#4f8ef7]"
                  />
                  <span className="text-[#555] text-xs w-7 tabular-nums">{size}px</span>
                </div>
              )}

              <button
                onClick={handleClearClick}
                title="Clear canvas"
                className="flex items-center gap-1.5 text-[#666] hover:text-red-400 transition-colors px-2 py-1.5 rounded hover:bg-[#1e1e1e] text-xs font-medium ml-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center bg-[#181818] overflow-hidden relative">
            <canvas
              ref={canvasRef}
              width={1200}
              height={800}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUpOrLeave}
              onPointerCancel={handlePointerUpOrLeave}
              onPointerLeave={handlePointerUpOrLeave}
              style={{ touchAction: 'none', userSelect: 'none' }}
              className={`bg-white shadow-2xl max-w-full max-h-full w-auto h-auto object-contain select-none ${toolCursor}`}
            />
          </div>
        </div>

        <div
          className="w-full lg:w-64 xl:w-72 flex flex-col bg-[#141414] border-t lg:border-t-0 lg:border-l border-[#1e1e1e] shrink-0 overflow-hidden"
          style={{ height: '44vh', minHeight: '180px' }}
        >
          <div className="flex lg:hidden border-b border-[#1e1e1e] shrink-0">
            <button
              onClick={() => setMobileTab('chat')}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${mobileTab === 'chat' ? 'text-white border-b-2 border-[#4f8ef7]' : 'text-[#555]'}`}
            >
              Guesses
            </button>
            <button
              onClick={() => setMobileTab('scores')}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${mobileTab === 'scores' ? 'text-white border-b-2 border-[#4f8ef7]' : 'text-[#555]'}`}
            >
              Scores
            </button>
          </div>

          <div className={`${mobileTab === 'scores' ? 'flex' : 'hidden'} lg:flex flex-col shrink-0 p-3 border-b border-[#1e1e1e] max-h-[40%] lg:max-h-44 overflow-hidden`}>
            <h3 className="text-[10px] text-[#444] uppercase tracking-widest font-bold mb-2">Scoreboard</h3>
            <div className="overflow-y-auto space-y-1 flex-1">
              {sortedPlayers.length === 0 ? (
                <p className="text-[#444] text-xs">Waiting for players…</p>
              ) : (
                sortedPlayers.map((player, i) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs ${gameState?.drawerId === player.id
                      ? 'bg-amber-950/50 ring-1 ring-amber-700/50'
                      : 'bg-[#1a1a1a]'
                      }`}
                  >
                    <span className="truncate text-[#ccc] pr-2 flex items-center gap-1.5">
                      <span className="text-[#444] w-3 tabular-nums">{i + 1}</span>
                      {player.nickname}
                      {playerId === player.id && <span className="text-[#555] text-[10px]">(you)</span>}
                    </span>
                    <span className="font-bold text-[#4f8ef7] tabular-nums shrink-0">{player.score ?? 0}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={`${mobileTab === 'chat' ? 'flex' : 'hidden'} lg:flex flex-col flex-1 min-h-0 p-3`}>
            <h3 className="text-[10px] text-[#444] uppercase tracking-widest font-bold mb-2 shrink-0">Guesses</h3>
            <div className="flex-1 overflow-y-auto space-y-1.5 text-xs min-h-0 mb-2">
              {chatMessages.length === 0 ? (
                <p className="text-[#333]">No guesses yet.</p>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={
                      msg.type === 'system'
                        ? 'text-[#444] italic'
                        : msg.correct
                          ? 'text-green-400 font-semibold'
                          : 'text-[#888]'
                    }
                  >
                    <span className={`font-semibold ${msg.correct ? 'text-green-300' : 'text-[#666]'}`}>
                      {msg.nickname}:{' '}
                    </span>
                    {msg.text}
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSubmitGuess} className="flex gap-1.5 shrink-0">
              <input
                type="text"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder={isDrawer ? 'You are drawing…' : 'Type a guess…'}
                disabled={!isPlaying || isDrawer || connectionLabel !== 'live'}
                maxLength={40}
                autoComplete="off"
                inputMode="text"
                enterKeyHint="send"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] focus:border-[#4f8ef7] text-white text-xs placeholder:text-[#333] disabled:opacity-40 focus:outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={!isPlaying || isDrawer || !guess.trim() || connectionLabel !== 'live'}
                className="px-3 py-2 bg-[#4f8ef7] hover:bg-[#3a7de6] disabled:opacity-30 rounded-lg text-xs font-bold shrink-0 transition-colors"
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