import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getBlitzTag, getRatingTagClasses } from '../../utils/ratingTags';

const Avatar = ({ player, sizeClass, ringClass }) => {
    const initials = player?.username?.slice(0, 2).toUpperCase() || '??';
    return (
        <div className={`relative ${sizeClass} rounded-full overflow-hidden ${ringClass} bg-slate-300 dark:bg-slate-700`}>
            {player?.avatar ? (
                <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: `url('${player.avatar}')` }} />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200">
                    {initials}
                </div>
            )}
        </div>
    );
};

export default function Podium({ players = [] }) {
    if (players.length < 3) return null;
    const [first, second, third] = players;
    const navigate = useNavigate();
    const resolveTag = (player) => (player?.is_bot ? null : getBlitzTag(player?.rating_blitz ?? player?.rating));

    return (
        <div className="grid grid-cols-3 gap-3 items-end pt-4 pb-2">
            <button
                className="flex flex-col items-center gap-2"
                type="button"
                onClick={() => second?.username && navigate(`/profile/${second.username}`)}
            >
                <div className="relative">
                    <Avatar player={second} sizeClass="w-16 h-16" ringClass="ring-2 ring-slate-400 dark:ring-slate-500" />
                    <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-slate-400 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                        #2
                    </div>
                </div>
                <div className="text-center mt-1">
                    <div className="flex items-center justify-center gap-1">
                        {resolveTag(second) ? (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getRatingTagClasses(resolveTag(second))}`}>
                                {resolveTag(second)}
                            </span>
                        ) : null}
                        <p className="font-semibold text-sm truncate w-20">{second.username}</p>
                    </div>
                    <p className="text-xs text-primary font-bold">{second.rating}</p>
                </div>
            </button>

            <button
                className="flex flex-col items-center gap-2 -mt-4"
                type="button"
                onClick={() => first?.username && navigate(`/profile/${first.username}`)}
            >
                <div className="relative">
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[#FFD700]">
                        <span className="material-symbols-outlined" style={{ fontSize: 28 }}>crown</span>
                    </div>
                    <Avatar player={first} sizeClass="w-20 h-20" ringClass="ring-4 ring-[#FFD700] shadow-[0_0_15px_rgba(255,215,0,0.4)]" />
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#FFD700] text-black text-xs font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                        #1
                    </div>
                </div>
                <div className="text-center mt-2">
                    <div className="flex items-center justify-center gap-1">
                        {resolveTag(first) ? (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getRatingTagClasses(resolveTag(first))}`}>
                                {resolveTag(first)}
                            </span>
                        ) : null}
                        <p className="font-bold text-base truncate w-24">{first.username}</p>
                    </div>
                    <p className="text-sm text-primary font-bold">{first.rating}</p>
                </div>
            </button>

            <button
                className="flex flex-col items-center gap-2"
                type="button"
                onClick={() => third?.username && navigate(`/profile/${third.username}`)}
            >
                <div className="relative">
                    <Avatar player={third} sizeClass="w-16 h-16" ringClass="ring-2 ring-[#CD7F32]" />
                    <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-[#CD7F32] text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                        #3
                    </div>
                </div>
                <div className="text-center mt-1">
                    <div className="flex items-center justify-center gap-1">
                        {resolveTag(third) ? (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getRatingTagClasses(resolveTag(third))}`}>
                                {resolveTag(third)}
                            </span>
                        ) : null}
                        <p className="font-semibold text-sm truncate w-20">{third.username}</p>
                    </div>
                    <p className="text-xs text-primary font-bold">{third.rating}</p>
                </div>
            </button>
        </div>
    );
}
