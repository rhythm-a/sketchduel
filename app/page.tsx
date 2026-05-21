'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/store';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import { avatarData } from '@/lib/avatars';

const ADDON_PACKS = [
  { id: 'animals', label: 'Animals', description: 'Wildlife, pets & creatures' },
  { id: 'food', label: 'Food & Drink', description: 'Meals, snacks & beverages' },
  { id: 'sports', label: 'Sports', description: 'Games, sports & athletics' },
  { id: 'tech', label: 'Technology', description: 'Gadgets, software & internet' },
  { id: 'nature', label: 'Nature', description: 'Landscapes, weather & flora' },
  { id: 'popculture', label: 'Pop Culture', description: 'Movies, games & internet' },
];

const TIMER_OPTIONS = [
  { value: 30, label: '30s', sublabel: 'Fast' },
  { value: 60, label: '60s', sublabel: 'Normal' },
  { value: 80, label: '80s', sublabel: 'Relaxed' },
  { value: 120, label: '2m', sublabel: 'Chill' },
];

const PLAYER_OPTIONS = [4, 6, 8, 10, 16];

interface RoomSettings {
  roundSeconds: number;
  maxPlayers: number;
  wordPacks: string[];
}

// Inline avatar SVG component
function Avatar({ playerId, size = 36 }: { playerId: string; size?: number }) {
  const { bg, svgInner } = avatarData(playerId, size);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 88 88"
      style={{ flexShrink: 0 }}
    >
      <circle cx="44" cy="44" r="44" fill={bg} />
      <g dangerouslySetInnerHTML={{ __html: svgInner }} />
    </svg>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { setNickname, nickname, playerId } = useGameStore();
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showNicknameInput, setShowNicknameInput] = useState(!nickname);
  const [tempNickname, setTempNickname] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const [settings, setSettings] = useState<RoomSettings>({
    roundSeconds: 80,
    maxPlayers: 8,
    wordPacks: [],
  });

  function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  function handleSetNickname(e: React.FormEvent) {
    e.preventDefault();
    if (!tempNickname.trim()) return;
    setNickname(tempNickname.trim());
    setShowNicknameInput(false);
  }

  function handleCreateRoom() {
    if (!nickname) { setShowNicknameInput(true); return; }
    setCreating(true);
    const roomId = generateRoomId();
    sessionStorage.setItem(`room_settings_${roomId}`, JSON.stringify(settings));
    router.push(`/room/${roomId}`);
  }

  function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname) { setShowNicknameInput(true); return; }
    if (!joinCode.trim()) return;
    setJoining(true);
    router.push(`/room/${joinCode.trim().toUpperCase()}`);
  }

  function togglePack(id: string) {
    setSettings((prev) => ({
      ...prev,
      wordPacks: prev.wordPacks.includes(id)
        ? prev.wordPacks.filter((p) => p !== id)
        : [...prev.wordPacks, id],
    }));
  }

  const activePackCount = settings.wordPacks.length;

  // ── Nickname screen ──────────────────────────────────────────────────────────
  if (showNicknameInput) {
    return (
      <main className="min-h-screen bg-[#FFF7E8] flex flex-col items-center justify-center px-4"
        style={{ fontFamily: 'var(--font-dm-sans, sans-serif)' }}>
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="mb-12 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#FF5FA2] flex items-center justify-center text-2xl shadow-sm">
              ✏️
            </div>
            <div>
              <h1
                className="text-4xl font-bold text-[#3B3155] leading-none"
                style={{ fontFamily: 'var(--font-fredoka, sans-serif)', letterSpacing: '-0.5px' }}
              >
                SketchDuel
              </h1>
              <p className="text-[#9B6BFF] text-sm mt-1 font-medium">Draw. Guess. Win.</p>
            </div>
          </div>

          <div className="space-y-5">
            <label className="block text-xs font-bold text-[#9B6BFF] uppercase tracking-wider">
              Pick a name
            </label>
            <form onSubmit={handleSetNickname} className="space-y-4">
              <input
                type="text"
                value={tempNickname}
                onChange={(e) => setTempNickname(e.target.value)}
                placeholder="e.g. Picasso99"
                maxLength={20}
                autoFocus
                className="w-full px-4 py-3.5 rounded-xl bg-white border-2 border-[#E5DFD0] focus:border-[#FF5FA2] focus:outline-none text-[#3B3155] placeholder:text-[#C4B8A0] text-base transition-all shadow-sm"
              />
              {/* Live avatar preview while typing */}
              {tempNickname.trim() && playerId && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border-2 border-[#E5DFD0] shadow-sm">
                  <Avatar playerId={playerId} size={40} />
                  <div>
                    <p className="text-[#3B3155] text-sm font-semibold">{tempNickname.trim()}</p>
                    <p className="text-[#9B6BFF] text-xs">Your avatar</p>
                  </div>
                </div>
              )}
              <button
                type="submit"
                disabled={!tempNickname.trim()}
                className="w-full bg-[#FF5FA2] hover:bg-[#FF7CB5] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all text-base shadow-md"
                style={{ fontFamily: 'var(--font-fredoka, sans-serif)' }}
              >
                Let&apos;s Play
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  // ── Main lobby ───────────────────────────────────────────────────────────────
  return (
    <main
      className="min-h-screen bg-[#FFF7E8] flex flex-col items-center justify-center px-4 py-8"
      style={{ fontFamily: 'var(--font-dm-sans, sans-serif)' }}
    >
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-10 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#FF5FA2] flex items-center justify-center text-2xl shadow-sm">
            ✏️
          </div>
          <div>
            <h1
              className="text-4xl font-bold text-[#3B3155] leading-none"
              style={{ fontFamily: 'var(--font-fredoka, sans-serif)', letterSpacing: '-0.5px' }}
            >
              SketchDuel
            </h1>
            <p className="text-[#9B6BFF] text-sm mt-1 font-medium">Draw. Guess. Win.</p>
          </div>
        </div>

        <div className="space-y-5">

          {/* Identity row */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-white border-2 border-[#E5DFD0] shadow-sm">
            {playerId && <Avatar playerId={playerId} size={40} />}
            <div className="flex-1 min-w-0">
              <p className="text-[#3B3155] font-bold text-base truncate">{nickname}</p>
              <p className="text-[#9B6BFF] text-xs">Your avatar</p>
            </div>
            <button
              onClick={() => { setShowNicknameInput(true); setTempNickname(nickname || ''); }}
              className="text-sm text-[#57C7FF] hover:text-[#FF5FA2] transition-colors font-semibold shrink-0"
            >
              Change
            </button>
          </div>

          {/* Create room card */}
          <div className="rounded-xl border-2 border-[#E5DFD0] overflow-hidden bg-white shadow-md">

            {/* Settings toggle */}
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-[#FFF7E8] transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base font-bold text-[#3B3155]">Room settings</span>
                <span className="text-xs text-[#9B6BFF] truncate font-medium">
                  {settings.roundSeconds}s · {settings.maxPlayers} players
                  {activePackCount > 0 && ` · ${activePackCount} pack${activePackCount > 1 ? 's' : ''}`}
                </span>
              </div>
              {showSettings
                ? <ChevronUp className="w-5 h-5 text-[#9B6BFF] shrink-0" />
                : <ChevronDown className="w-5 h-5 text-[#9B6BFF] shrink-0" />
              }
            </button>

            {showSettings && (
              <div className="px-4 pb-5 space-y-6 border-t-2 border-[#E5DFD0] pt-5 bg-[#FFFCF5]">

                {/* Timer */}
                <div>
                  <label className="block text-xs font-bold text-[#9B6BFF] uppercase tracking-wider mb-3">
                    Round timer
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {TIMER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSettings((p) => ({ ...p, roundSeconds: opt.value }))}
                        className={`flex flex-col items-center py-3 rounded-lg border-2 text-xs font-bold transition-all ${settings.roundSeconds === opt.value
                          ? 'bg-[#FFD84D] border-[#FFD84D] text-[#3B3155] shadow-sm'
                          : 'border-[#E5DFD0] bg-white text-[#9B6BFF] hover:border-[#FFD84D]'
                          }`}
                      >
                        <span className="text-base font-black">{opt.label}</span>
                        <span className="font-semibold opacity-70 text-[10px]">{opt.sublabel}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Max players */}
                <div>
                  <label className="block text-xs font-bold text-[#9B6BFF] uppercase tracking-wider mb-3">
                    Max players
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {PLAYER_OPTIONS.map((n) => (
                      <button
                        key={n}
                        onClick={() => setSettings((p) => ({ ...p, maxPlayers: n }))}
                        className={`px-4 py-2 rounded-lg border-2 text-sm font-bold transition-all ${settings.maxPlayers === n
                          ? 'bg-[#57C7FF] border-[#57C7FF] text-white shadow-sm'
                          : 'border-[#E5DFD0] bg-white text-[#9B6BFF] hover:border-[#57C7FF]'
                          }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Word packs */}
                <div>
                  <label className="block text-xs font-bold text-[#9B6BFF] uppercase tracking-wider mb-3">
                    Word packs
                    <span className="ml-2 normal-case text-[#C4B8A0] font-medium text-xs">Basic always included</span>
                  </label>
                  <div className="space-y-2">
                    {ADDON_PACKS.map((pack) => {
                      const active = settings.wordPacks.includes(pack.id);
                      return (
                        <button
                          key={pack.id}
                          onClick={() => togglePack(pack.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all ${active
                            ? 'bg-[#71E36A]/10 border-[#71E36A]'
                            : 'border-[#E5DFD0] bg-white hover:border-[#5EE6B5]'
                            }`}
                        >
                          {/* Custom checkbox */}
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border-2 transition-all ${active ? 'bg-[#71E36A] border-[#71E36A]' : 'border-[#C4B8A0] bg-white'
                            }`}>
                            {active && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                          </div>
                          <div className="min-w-0">
                            <span className={`text-sm font-bold block ${active ? 'text-[#3B3155]' : 'text-[#9B6BFF]'}`}>
                              {pack.label}
                            </span>
                            <span className="text-xs text-[#C4B8A0] block">{pack.description}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="px-4 pb-4 pt-4">
              <button
                onClick={handleCreateRoom}
                disabled={creating}
                className="w-full bg-[#FF5FA2] hover:bg-[#FF7CB5] active:scale-[0.98] disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all text-base shadow-md"
                style={{ fontFamily: 'var(--font-fredoka, sans-serif)', fontSize: '1.125rem' }}
              >
                {creating ? 'Creating…' : 'Create Room'}
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-0.5 bg-[#E5DFD0]" />
            <span className="text-sm text-[#C4B8A0] font-medium">or join existing</span>
            <div className="flex-1 h-0.5 bg-[#E5DFD0]" />
          </div>

          {/* Join room */}
          <form onSubmit={handleJoinRoom} className="space-y-3">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={8}
              className="w-full px-4 py-3.5 rounded-xl bg-white border-2 border-[#E5DFD0] focus:border-[#57C7FF] focus:outline-none text-[#3B3155] placeholder:text-[#C4B8A0] font-mono text-base tracking-[0.25em] uppercase transition-all text-center shadow-sm"
            />
            <button
              type="submit"
              disabled={joining || !joinCode.trim()}
              className="w-full bg-white hover:bg-[#57C7FF] border-2 border-[#57C7FF] hover:border-[#57C7FF] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed text-[#57C7FF] hover:text-white font-bold py-3.5 rounded-xl transition-all text-base shadow-sm"
              style={{ fontFamily: 'var(--font-fredoka, sans-serif)' }}
            >
              {joining ? 'Joining…' : 'Join Room'}
            </button>
          </form>

        </div>
      </div>
    </main>
  );
}