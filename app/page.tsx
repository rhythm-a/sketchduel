'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/store';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';

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

export default function HomePage() {
  const router = useRouter();
  const { setNickname, nickname } = useGameStore();
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
    // Settings are sent to the server on join_room and persisted to DB there.
    // No need to encode them in the URL — the room page reads from sessionStorage.
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

  if (showNicknameInput) {
    return (
      <main className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <h1 className="text-3xl font-black text-white tracking-tight">SketchDuel</h1>
            <p className="text-[#666] text-sm mt-1">Draw. Guess. Win.</p>
          </div>
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-[#888] uppercase tracking-widest">
              Your name
            </label>
            <form onSubmit={handleSetNickname} className="space-y-3">
              <input
                type="text"
                value={tempNickname}
                onChange={(e) => setTempNickname(e.target.value)}
                placeholder="e.g. Picasso99"
                maxLength={20}
                autoFocus
                className="w-full px-4 py-3 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] focus:border-[#4f8ef7] focus:outline-none text-white placeholder:text-[#444] text-base transition-colors"
              />
              <button
                type="submit"
                disabled={!tempNickname.trim()}
                className="w-full bg-[#4f8ef7] hover:bg-[#3a7de6] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-all text-sm"
              >
                Continue
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <h1 className="text-3xl font-black text-white tracking-tight">SketchDuel</h1>
          <p className="text-[#666] text-sm mt-1">Draw. Guess. Win.</p>
        </div>

        <div className="space-y-5">
          {/* Identity */}
          <div className="flex items-center justify-between py-2 border-b border-[#1e1e1e]">
            <span className="text-[#888] text-sm">
              Playing as <span className="text-white font-semibold">{nickname}</span>
            </span>
            <button
              onClick={() => { setShowNicknameInput(true); setTempNickname(nickname || ''); }}
              className="text-xs text-[#555] hover:text-[#888] transition-colors"
            >
              Change
            </button>
          </div>

          {/* Create room block */}
          <div className="bg-[#141414] rounded-xl border border-[#1e1e1e] overflow-hidden">
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1a1a1a] transition-colors"
            >
              <div>
                <span className="text-sm font-semibold text-white">Room settings</span>
                <span className="ml-2 text-xs text-[#555]">
                  {settings.roundSeconds}s · {settings.maxPlayers} players
                  {activePackCount > 0 && ` · ${activePackCount} pack${activePackCount > 1 ? 's' : ''}`}
                </span>
              </div>
              {showSettings
                ? <ChevronUp className="w-4 h-4 text-[#555]" />
                : <ChevronDown className="w-4 h-4 text-[#555]" />
              }
            </button>

            {showSettings && (
              <div className="px-4 pb-4 space-y-5 border-t border-[#1e1e1e] pt-4">
                {/* Timer */}
                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-widest mb-2">
                    Round timer
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {TIMER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSettings((p) => ({ ...p, roundSeconds: opt.value }))}
                        className={`flex flex-col items-center py-2.5 rounded-lg border text-xs font-bold transition-colors ${settings.roundSeconds === opt.value
                          ? 'bg-[#4f8ef7]/10 border-[#4f8ef7] text-[#4f8ef7]'
                          : 'border-[#2a2a2a] text-[#666] hover:border-[#3a3a3a] hover:text-white'
                          }`}
                      >
                        <span className="text-sm font-black">{opt.label}</span>
                        <span className="font-normal opacity-70 text-[10px]">{opt.sublabel}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Max players */}
                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-widest mb-2">
                    Max players
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {PLAYER_OPTIONS.map((n) => (
                      <button
                        key={n}
                        onClick={() => setSettings((p) => ({ ...p, maxPlayers: n }))}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${settings.maxPlayers === n
                          ? 'bg-[#4f8ef7]/10 border-[#4f8ef7] text-[#4f8ef7]'
                          : 'border-[#2a2a2a] text-[#666] hover:border-[#3a3a3a] hover:text-white'
                          }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Word packs */}
                <div>
                  <label className="block text-[10px] font-bold text-[#555] uppercase tracking-widest mb-2">
                    Word packs
                    <span className="ml-2 normal-case text-[#333] font-normal">Basic always included</span>
                  </label>
                  <div className="space-y-1.5">
                    {ADDON_PACKS.map((pack) => {
                      const active = settings.wordPacks.includes(pack.id);
                      return (
                        <button
                          key={pack.id}
                          onClick={() => togglePack(pack.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${active
                            ? 'bg-[#4f8ef7]/10 border-[#4f8ef7]'
                            : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
                            }`}
                        >
                          <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${active ? 'bg-[#4f8ef7] border-[#4f8ef7]' : 'border-[#3a3a3a]'
                            }`}>
                            {active && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                          </div>
                          <div className="min-w-0">
                            <span className={`text-xs font-semibold block ${active ? 'text-white' : 'text-[#888]'}`}>
                              {pack.label}
                            </span>
                            <span className="text-[10px] text-[#444] block">{pack.description}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="px-4 pb-4 pt-3">
              <button
                onClick={handleCreateRoom}
                disabled={creating}
                className="w-full bg-[#4f8ef7] hover:bg-[#3a7de6] active:scale-[0.98] disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-all text-sm tracking-wide"
              >
                {creating ? 'Creating…' : 'Create Room'}
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#1e1e1e]" />
            <span className="text-xs text-[#444]">or join existing</span>
            <div className="flex-1 h-px bg-[#1e1e1e]" />
          </div>

          {/* Join room */}
          <form onSubmit={handleJoinRoom} className="space-y-3">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Room code"
              maxLength={8}
              className="w-full px-4 py-3 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] focus:border-[#4f8ef7] focus:outline-none text-white placeholder:text-[#444] font-mono text-base tracking-[0.2em] uppercase transition-colors"
            />
            <button
              type="submit"
              disabled={joining || !joinCode.trim()}
              className="w-full bg-[#1e1e1e] hover:bg-[#252525] border border-[#2a2a2a] hover:border-[#3a3a3a] active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-all text-sm"
            >
              {joining ? 'Joining…' : 'Join Room'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}