'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Crown } from 'lucide-react';
import { getBlitzTag, getRatingTagClasses } from '@/utils/ratingTags';

function Avatar({ player, sizeClass, ringClass, onClick }) {
  const initials = player?.username?.slice(0, 2).toUpperCase() || '??';
  return (
    <button
      type="button"
      className={`relative ${sizeClass} rounded-full overflow-hidden ${ringClass} bg-slate-300 dark:bg-slate-700 cursor-pointer hover:opacity-90 transition-opacity`}
      onClick={onClick}
    >
      {player?.avatar ? (
        <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${player.avatar}')` }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200">
          {initials}
        </div>
      )}
    </button>
  );
}

export default function Podium({ players = [] }) {
  const router = useRouter();
  if (players.length < 3) return null;
  const [first, second, third] = players;
  const resolveTag = (player) => (player?.is_bot ? null : getBlitzTag(player?.rating_blitz ?? player?.rating));

  const goToProfile = (username) => {
    if (username) router.push(`/profile/${username}`);
  };

  return (
    <div className="grid grid-cols-3 gap-3 items-end pt-4 pb-2">
      {/* 2nd place */}
      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          <Avatar player={second} sizeClass="w-16 h-16" ringClass="ring-2 ring-slate-400 dark:ring-slate-500" onClick={() => goToProfile(second?.username)} />
          <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-slate-400 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm pointer-events-none">
            #2
          </div>
        </div>
        <div className="text-center mt-1">
          <div className="flex items-center justify-center gap-1">
            {resolveTag(second) && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getRatingTagClasses(resolveTag(second))}`}>
                {resolveTag(second)}
              </span>
            )}
            <p className="font-semibold text-sm truncate w-20">{second.username}</p>
          </div>
          <p className="text-xs text-primary font-bold">{second.rating}</p>
        </div>
      </div>

      {/* 1st place */}
      <div className="flex flex-col items-center gap-2 -mt-4">
        <div className="relative">
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[#FFD700] pointer-events-none">
            <Crown size={28} className="text-[#FFD700]" />
          </div>
          <Avatar player={first} sizeClass="w-20 h-20" ringClass="ring-4 ring-[#FFD700] shadow-[0_0_15px_rgba(255,215,0,0.4)]" onClick={() => goToProfile(first?.username)} />
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#FFD700] text-black text-xs font-bold px-2.5 py-0.5 rounded-full shadow-sm pointer-events-none">
            #1
          </div>
        </div>
        <div className="text-center mt-2">
          <div className="flex items-center justify-center gap-1">
            {resolveTag(first) && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getRatingTagClasses(resolveTag(first))}`}>
                {resolveTag(first)}
              </span>
            )}
            <p className="font-bold text-base truncate w-24">{first.username}</p>
          </div>
          <p className="text-sm text-primary font-bold">{first.rating}</p>
        </div>
      </div>

      {/* 3rd place */}
      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          <Avatar player={third} sizeClass="w-16 h-16" ringClass="ring-2 ring-[#CD7F32]" onClick={() => goToProfile(third?.username)} />
          <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-[#CD7F32] text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm pointer-events-none">
            #3
          </div>
        </div>
        <div className="text-center mt-1">
          <div className="flex items-center justify-center gap-1">
            {resolveTag(third) && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getRatingTagClasses(resolveTag(third))}`}>
                {resolveTag(third)}
              </span>
            )}
            <p className="font-semibold text-sm truncate w-20">{third.username}</p>
          </div>
          <p className="text-xs text-primary font-bold">{third.rating}</p>
        </div>
      </div>
    </div>
  );
}
