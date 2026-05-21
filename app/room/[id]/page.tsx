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
import { avatarData } from '@/lib/avatars';

type DrawTool = 'pencil' | 'eraser' | 'fill';

// ── Flood fill ─────────────────────────────────────────────────────────────────
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
    data[idx] = fillR; data[idx + 1] = fillG; data[idx + 2] = fillB; data[idx + 3] = fillA;
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

// Quick preset color swatches for the drawing toolbar
const COLOR_SWATCHES = [
  '#000000', '#ffffff', '#ef4444', '#f97316',
  '#fbbf24', '#4ade80', '#3b82f6', '#a855f7',
  '#ec4899', '#6b7280', '#92400e', '#0ea5e9',
];

// ── Avatar inline component ────────────────────────────────────────────────────
function Avatar({ playerId, size = 28 }: { playerId: string; size?: number }) {
  const { bg, svgInner } = avatarData(playerId, size);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 88 88"
      style={{ flexShrink: 0, borderRadius: '50%' }}
    >
      <circle cx="44" cy="44" r="44" fill={bg} />
      <g dangerouslySetInnerHTML={{ __html: svgInner }} />
    </svg>
  );
}

export default function RoomPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { playerId, nickname, setRoomId, setPlayers, players } = useGameStore();

  const creatorSettingsRef = useRef<object | null>(null);
  if (creatorSettingsRef.current === null && typeof window !== 'undefined' && id) {
    try {
      const raw = sessionStorage.getItem(`room_settings_${id}`);
      if (raw) {
        creatorSettingsRef.current = JSON.parse(raw);
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

  // Timer color: Ink Purple → Banana Yellow → Orange → Tomato Red as time runs low
  const timerColor = (() => {
    const t = gameState?.timeLeft ?? 999;
    if (t <= 10) return '#FF6B57';   // Tomato red
    if (t <= 20) return '#FF9F43';   // Orange
    if (t <= 30) return '#FFD84D';   // Banana yellow
    return '#3B3155';                 // Ink purple
  })();

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
      className="fixed inset-0 bg-[#FFF7E8] text-[#3B3155] flex flex-col overflow-hidden"
      style={{ height: '100dvh', fontFamily: 'var(--font-dm-sans, sans-serif)' }}
    >
      {/* Alert banner */}
      {socketMessage && (
        <div role="alert" className="flex items-center gap-2 px-4 py-3 bg-[#FF6B57] border-b-2 border-[#FF6B57]/60 text-white text-sm shrink-0 shadow-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1 min-w-0 font-medium">{socketMessage}</span>
          <button onClick={() => setSocketMessage(null)} className="text-white/80 hover:text-white ml-2 shrink-0 font-bold text-lg">✕</button>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-4 h-14 border-b-2 border-[#E5DFD0] shrink-0 bg-white shadow-sm">
        <button
          onClick={handleLeaveRoom}
          className="flex items-center gap-2 text-[#9B6BFF] hover:text-[#FF5FA2] transition-colors text-sm px-3 py-2 rounded-lg hover:bg-[#FFF7E8] font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Leave</span>
        </button>

        {/* Room code pill */}
        <button
          onClick={handleCopyCode}
          className="flex items-center gap-2 font-mono text-sm tracking-[0.2em] text-[#FF5FA2] hover:text-[#3B3155] transition-colors bg-[#FF5FA2]/10 hover:bg-[#FF5FA2]/20 px-4 py-2 rounded-lg border-2 border-[#FF5FA2]/30 font-bold shadow-sm"
        >
          {id}
          {copied
            ? <Check className="w-4 h-4 text-[#71E36A]" />
            : <Copy className="w-4 h-4 opacity-60" />
          }
        </button>

        {/* Right side: status + timer + players */}
        <div className="flex items-center gap-4 text-sm shrink-0">
          {connectionLabel === 'reconnecting' && (
            <span className="flex items-center gap-2 text-[#FF9F43] font-semibold">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="hidden sm:inline">Reconnecting</span>
            </span>
          )}
          {connectionLabel === 'error' && (
            <span className="text-[#FF6B57]">
              <WifiOff className="w-4 h-4" />
            </span>
          )}
          {isPlaying && connectionLabel === 'live' && (
            <span
              className="font-mono font-black tabular-nums min-w-[3.5rem] text-right text-lg transition-colors"
              style={{ color: timerColor }}
            >
              {gameState?.timeLeft}s
            </span>
          )}
          <span className="flex items-center gap-2 text-[#9B6BFF]">
            <Users className="w-4 h-4" />
            <span className="font-bold text-[#3B3155]">{players.length}</span>
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 relative">

        {/* Blocking overlay */}
        {blockingOverlay && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#FFF7E8]/95 backdrop-blur-sm">
            {connectionLabel === 'error' ? (
              <>
                <WifiOff className="w-10 h-10 text-[#FF6B57]" />
                <p className="text-[#9B6BFF] text-base font-semibold">Could not reach game server.</p>
                <code className="text-sm text-[#C4B8A0] bg-white px-4 py-2 rounded-lg border-2 border-[#E5DFD0] font-mono">npm run server</code>
              </>
            ) : (
              <>
                <Loader2 className="w-8 h-8 text-[#FF5FA2] animate-spin" />
                <p className="text-[#9B6BFF] text-base font-semibold">
                  {connectionLabel === 'reconnecting' ? 'Reconnecting…' : 'Joining room…'}
                </p>
              </>
            )}
          </div>
        )}

        {/* ── Canvas side ── */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">

          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b-2 border-[#E5DFD0] bg-white shrink-0 flex-wrap shadow-sm">

            {/* Game status label */}
            {isPlaying && (
              <div className="flex items-center mr-3 shrink-0">
                {isDrawer ? (
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className="text-[#9B6BFF]">Draw:</span>
                    <span
                      className="px-3 py-1 rounded-full text-white font-black uppercase tracking-wide text-sm shadow-sm"
                      style={{ background: '#FF5FA2', fontFamily: 'var(--font-fredoka, sans-serif)' }}
                    >
                      {drawerWord}
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-[#9B6BFF] flex items-center gap-2 font-medium">
                    <span>Guess:</span>
                    <span className="font-mono tracking-[0.2em] text-[#3B3155] font-bold text-base">{gameState?.wordHint}</span>
                  </span>
                )}
              </div>
            )}

            {/* Waiting message */}
            {!isPlaying && players.length < 2 && (
              <div className="flex items-center gap-2 mr-3 flex-wrap">
                <span className="text-sm text-[#C4B8A0] font-medium">Need 2+ players to start</span>
                {gameState?.settings && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs bg-[#FFD84D]/20 text-[#3B3155] px-2 py-1 rounded-md border border-[#FFD84D]/40 font-mono font-semibold">
                      {gameState.settings.roundSeconds}s
                    </span>
                    <span className="text-xs bg-[#57C7FF]/20 text-[#3B3155] px-2 py-1 rounded-md border border-[#57C7FF]/40 font-mono font-semibold">
                      {gameState.settings.maxPlayers} max
                    </span>
                    {gameState.settings.wordPacks?.map((p: string) => (
                      <span key={p} className="text-xs bg-[#5EE6B5]/20 text-[#3B3155] px-2 py-1 rounded-md border border-[#5EE6B5]/40 font-semibold">
                        {PACK_LABELS[p] ?? p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Drawing tools */}
            <div className={`flex items-center gap-2 ${canDraw ? '' : 'opacity-30 pointer-events-none'}`}>

              {/* Tool buttons */}
              <div className="flex items-center bg-[#FFF7E8] rounded-lg p-1 gap-1 border-2 border-[#E5DFD0]">
                <button
                  onClick={() => setTool('pencil')}
                  title="Pencil"
                  className={`p-2 rounded-md transition-all ${tool === 'pencil' ? 'bg-[#57C7FF] text-white shadow-sm' : 'text-[#9B6BFF] hover:text-[#3B3155] hover:bg-white'}`}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setTool('eraser')}
                  title="Eraser"
                  className={`p-2 rounded-md transition-all ${tool === 'eraser' ? 'bg-[#57C7FF] text-white shadow-sm' : 'text-[#9B6BFF] hover:text-[#3B3155] hover:bg-white'}`}
                >
                  <Eraser className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setTool('fill')}
                  title="Fill bucket"
                  className={`p-2 rounded-md transition-all ${tool === 'fill' ? 'bg-[#57C7FF] text-white shadow-sm' : 'text-[#9B6BFF] hover:text-[#3B3155] hover:bg-white'}`}
                >
                  <PaintBucket className="w-4 h-4" />
                </button>
              </div>

              {/* Color swatches */}
              <div className="flex items-center gap-1.5 flex-wrap max-w-[140px] sm:max-w-none">
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => { setColor(c); setTool('pencil'); }}
                    title={c}
                    className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110 shadow-sm"
                    style={{
                      backgroundColor: c,
                      borderColor: color === c && tool !== 'eraser' ? '#FF5FA2' : '#E5DFD0',
                      outline: color === c && tool !== 'eraser' ? '2px solid #FF5FA2' : 'none',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
                {/* Custom color picker */}
                <label
                  title="Custom color"
                  className="relative w-6 h-6 rounded-full cursor-pointer border-2 border-[#E5DFD0] overflow-hidden transition-all hover:scale-110 shadow-sm"
                  style={{
                    background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
                  }}
                >
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => { setColor(e.target.value); setTool('pencil'); }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </label>
              </div>

              {/* Size slider */}
              {tool !== 'fill' && (
                <div className="hidden sm:flex items-center gap-2">
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={size}
                    onChange={(e) => setSize(Number(e.target.value))}
                    className="w-24 accent-[#FF5FA2]"
                  />
                  <span className="text-[#9B6BFF] text-xs w-8 tabular-nums font-semibold">{size}px</span>
                </div>
              )}

              {/* Clear button */}
              <button
                onClick={handleClearClick}
                title="Clear canvas"
                className="flex items-center gap-1.5 text-[#9B6BFF] hover:text-[#FF6B57] transition-colors px-3 py-2 rounded-lg hover:bg-[#FF6B57]/10 text-sm font-semibold"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 flex items-center justify-center bg-[#FFF7E8] overflow-hidden relative p-4">
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
              className={`bg-white shadow-lg max-w-full max-h-full w-auto h-auto object-contain select-none rounded-lg ${toolCursor}`}
            />
          </div>
        </div>

        {/* ── Sidebar: scoreboard + chat ── */}
        <div
          className="w-full lg:w-72 xl:w-80 flex flex-col bg-white border-t-2 lg:border-t-0 lg:border-l-2 border-[#E5DFD0] shrink-0 overflow-hidden shadow-sm"
          style={{ height: '44vh', minHeight: '180px' }}
        >
          {/* Mobile tabs */}
          <div className="flex lg:hidden border-b-2 border-[#E5DFD0] shrink-0 bg-[#FFFCF5]">
            <button
              onClick={() => setMobileTab('chat')}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${mobileTab === 'chat' ? 'text-[#FF5FA2] border-b-2 border-[#FF5FA2]' : 'text-[#9B6BFF]'}`}
            >
              Guesses
            </button>
            <button
              onClick={() => setMobileTab('scores')}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${mobileTab === 'scores' ? 'text-[#FF5FA2] border-b-2 border-[#FF5FA2]' : 'text-[#9B6BFF]'}`}
            >
              Scores
            </button>
          </div>

          {/* Scoreboard */}
          <div className={`${mobileTab === 'scores' ? 'flex' : 'hidden'} lg:flex flex-col shrink-0 p-4 border-b-2 border-[#E5DFD0] max-h-[40%] lg:max-h-48 overflow-hidden bg-[#FFFCF5]`}>
            <h3
              className="text-xs text-[#9B6BFF] uppercase tracking-wider font-bold mb-3"
              style={{ fontFamily: 'var(--font-fredoka, sans-serif)' }}
            >
              Scoreboard
            </h3>
            <div className="overflow-y-auto space-y-2 flex-1">
              {sortedPlayers.length === 0 ? (
                <p className="text-[#C4B8A0] text-sm">Waiting for players…</p>
              ) : (
                sortedPlayers.map((player, i) => {
                  const isCurrentDrawer = gameState?.drawerId === player.id;
                  const isMe = playerId === player.id;
                  return (
                    <div
                      key={player.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${isCurrentDrawer
                        ? 'bg-[#FFD84D]/20 border-2 border-[#FFD84D]/50'
                        : 'bg-white border-2 border-[#E5DFD0]'
                        }`}
                    >
                      {/* Rank */}
                      <span className="text-[#C4B8A0] w-4 tabular-nums shrink-0 text-xs font-bold">{i + 1}</span>

                      {/* Avatar */}
                      <Avatar playerId={player.id} size={28} />

                      {/* Name */}
                      <span className="truncate text-[#3B3155] flex-1 min-w-0 flex items-center gap-1.5 font-semibold">
                        {player.nickname}
                        {isMe && <span className="text-[#9B6BFF] text-xs shrink-0">(you)</span>}
                        {isCurrentDrawer && <span className="text-xs text-[#FFD84D] shrink-0 font-normal">drawing</span>}
                      </span>

                      {/* Score */}
                      <span className="font-black text-[#71E36A] tabular-nums shrink-0 text-base">
                        {player.score ?? 0}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Chat / guesses */}
          <div className={`${mobileTab === 'chat' ? 'flex' : 'hidden'} lg:flex flex-col flex-1 min-h-0 p-4`}>
            <h3
              className="text-xs text-[#9B6BFF] uppercase tracking-wider font-bold mb-3 shrink-0"
              style={{ fontFamily: 'var(--font-fredoka, sans-serif)' }}
            >
              Guesses
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2 text-sm min-h-0 mb-3">
              {chatMessages.length === 0 ? (
                <p className="text-[#C4B8A0]">No guesses yet.</p>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={
                      msg.type === 'system'
                        ? 'text-[#C4B8A0] italic text-xs'
                        : msg.correct
                          ? 'flex items-center gap-2 bg-[#71E36A]/15 px-3 py-2 rounded-lg border-2 border-[#71E36A]/30'
                          : 'text-[#9B6BFF]'
                    }
                  >
                    {msg.correct && <span className="text-[#71E36A] text-lg leading-none">✓</span>}
                    <span className={`font-bold ${msg.correct ? 'text-[#3B3155]' : msg.type === 'system' ? 'text-[#C4B8A0]' : 'text-[#9B6BFF]'}`}>
                      {msg.nickname}:{' '}
                    </span>
                    <span className={msg.correct ? 'text-[#3B3155]' : ''}>{msg.text}</span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Guess input */}
            <form onSubmit={handleSubmitGuess} className="flex gap-2 shrink-0">
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
                className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-white border-2 border-[#E5DFD0] focus:border-[#57C7FF] text-[#3B3155] text-sm placeholder:text-[#C4B8A0] disabled:opacity-40 focus:outline-none transition-all shadow-sm"
              />
              <button
                type="submit"
                disabled={!isPlaying || isDrawer || !guess.trim() || connectionLabel !== 'live'}
                className="px-4 py-2.5 bg-[#57C7FF] hover:bg-[#FF5FA2] disabled:opacity-30 rounded-lg text-sm font-bold shrink-0 transition-all active:scale-[0.97] text-white shadow-sm"
              >
                →
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}