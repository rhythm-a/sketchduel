'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Users, Plus, LogIn } from 'lucide-react';
import { useGameStore } from '@/lib/store';

export default function HomePage() {
  const router = useRouter();
  const { setNickname, nickname } = useGameStore();
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showNicknameInput, setShowNicknameInput] = useState(!nickname);
  const [tempNickname, setTempNickname] = useState('');

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
    if (!nickname) {
      setShowNicknameInput(true);
      return;
    }
    setCreating(true);
    const roomId = generateRoomId();
    router.push(`/room/${roomId}`);
  }

  function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname) {
      setShowNicknameInput(true);
      return;
    }
    if (!joinCode.trim()) return;
    setJoining(true);
    router.push(`/room/${joinCode.trim().toUpperCase()}`);
  }

  if (showNicknameInput) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-100 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <Pencil className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
              SketchDuel
            </h1>
          </div>

          <div className="bg-white rounded-3xl shadow-xl p-8 space-y-4">
            <h2 className="text-2xl font-bold text-gray-900">What's your name?</h2>
            <form onSubmit={handleSetNickname} className="space-y-4">
              <input
                type="text"
                value={tempNickname}
                onChange={(e) => setTempNickname(e.target.value)}
                placeholder="Enter your nickname"
                maxLength={20}
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 text-gray-900 placeholder:text-gray-400 transition-all"
              />
              <button
                type="submit"
                disabled={!tempNickname.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-all duration-150"
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
    <main className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-100 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Pencil className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
            SketchDuel
          </h1>
          <p className="text-gray-500 mt-2 text-center">
            Draw. Guess. Win. Play with friends in real time.
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-8 space-y-6">
          <div className="text-center">
            <p className="text-sm text-gray-600 font-medium">Playing as</p>
            <p className="text-lg font-bold text-blue-600">{nickname}</p>
            <button
              onClick={() => {
                setShowNicknameInput(true);
                setTempNickname(nickname || '');
              }}
              className="text-xs text-gray-400 hover:text-gray-600 mt-1 transition-colors"
            >
              Change name
            </button>
          </div>

          <div className="border-t border-gray-200 pt-6 space-y-4">
            <button
              onClick={handleCreateRoom}
              disabled={creating}
              className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60 text-white font-semibold text-lg py-4 rounded-2xl transition-all duration-150 shadow-md hover:shadow-lg"
            >
              <Plus className="w-5 h-5" />
              {creating ? 'Creating room...' : 'Create Room'}
            </button>

            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-sm text-gray-400 font-medium">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-3">
              <div className="relative">
                <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Enter room code"
                  maxLength={8}
                  className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 text-gray-900 placeholder:text-gray-400 font-mono text-lg tracking-widest transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={joining || !joinCode.trim()}
                className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-800 active:scale-[0.98] disabled:opacity-40 text-white font-semibold text-lg py-4 rounded-2xl transition-all duration-150"
              >
                <LogIn className="w-5 h-5" />
                {joining ? 'Joining...' : 'Join Room'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
