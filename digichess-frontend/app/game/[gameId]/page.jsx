'use client';

import { useParams } from 'next/navigation';
import GamePage from '@/components/game/GamePage';

export default function GameRoute() {
  const params = useParams();
  const gameId = params?.gameId;

  if (!gameId) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-slate-500">Invalid game.</p>
      </div>
    );
  }

  return <GamePage />;
}
