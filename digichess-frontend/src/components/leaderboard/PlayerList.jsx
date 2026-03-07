import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createThread, sendFriendRequest } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { getBlitzTag, getRatingTagClasses } from '../../utils/ratingTags';

const PlayerRow = ({ player, rank, ratingLabel = 'Rating' }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [friendState, setFriendState] = useState('idle');
    const isSelf = user?.id && player.id === user.id;
    const blitzRating = player.rating_blitz ?? player.blitz_rating ?? player.rating;
    const tag = player.is_bot ? null : getBlitzTag(blitzRating);
    const tagClasses = tag ? getRatingTagClasses(tag) : '';

    const handleMessage = async (event) => {
        event.stopPropagation();
        if (isSelf || player.is_bot) return;
        try {
            const thread = await createThread(player.id);
            if (thread?.id) {
                navigate(`/messages?thread=${thread.id}`);
            }
        } catch {
            // ignore for now
        }
    };

    const handleFriendRequest = async (event) => {
        event.stopPropagation();
        if (isSelf || player.is_bot || friendState === 'sent' || friendState === 'loading') return;
        setFriendState('loading');
        try {
            await sendFriendRequest(player.id);
            setFriendState('sent');
        } catch {
            setFriendState('idle');
        }
    };

    return (
        <div
            className={`group relative grid grid-cols-[2.75rem_minmax(0,1fr)_4.75rem_5.25rem] gap-2 sm:grid-cols-[3.25rem_minmax(0,1fr)_5.5rem_6.25rem] items-center rounded-2xl border px-3 py-3 sm:px-4 sm:py-3.5 shadow-sm transition-all cursor-pointer ${
                isSelf
                    ? 'border-primary/30 bg-primary/5 dark:bg-primary/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white/75 dark:bg-slate-900/55 hover:border-primary/25 hover:bg-white dark:hover:bg-slate-900/80'
            }`}
            role="button"
            tabIndex={0}
            onClick={() => {
                if (player.username) navigate(`/profile/${player.username}`);
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter' && player.username) {
                    navigate(`/profile/${player.username}`);
                }
            }}
        >
            <div className="flex items-center justify-center">
                <span className={`inline-flex min-w-10 h-10 items-center justify-center rounded-xl text-sm font-bold ${
                    isSelf
                        ? 'bg-primary text-white shadow-md shadow-primary/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}>
                    {rank}
                </span>
            </div>
            <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                    <div
                        className="w-9 h-9 rounded-full bg-slate-700 bg-cover bg-center flex items-center justify-center text-xs font-bold text-white ring-2 ring-white dark:ring-slate-800"
                        style={player.avatar ? { backgroundImage: `url('${player.avatar}')` } : undefined}
                    >
                        {!player.avatar ? player.username?.slice(0, 2).toUpperCase() : null}
                    </div>
                </div>
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                        {tag ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${tagClasses}`}>{tag}</span>
                        ) : null}
                        <span className="truncate font-semibold text-sm sm:text-[15px]">{player.username}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500">
                        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-semibold uppercase tracking-[0.14em]">
                            {player.countryCode || 'INT'}
                        </span>
                        <span className="truncate">
                            {isSelf ? 'You' : player.is_bot ? 'Bot' : 'Player'}
                        </span>
                    </div>
                </div>
            </div>
            <div className="pr-0.5 text-right">
                <div className="text-sm sm:text-base font-bold text-slate-700 dark:text-slate-200 tabular-nums">{player.rating}</div>
                <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                    {ratingLabel}
                </div>
            </div>
            <div className="flex justify-end items-center gap-2">
                {!isSelf && !player.is_bot ? (
                    <button
                        className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-colors ${
                            friendState === 'sent'
                                ? 'text-green-500 bg-green-500/10 border-green-500/20'
                                : 'text-slate-400 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:text-primary hover:border-primary/25 hover:bg-primary/10'
                        }`}
                        type="button"
                        onClick={handleFriendRequest}
                        title={friendState === 'sent' ? 'Request sent' : 'Add friend'}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                            {friendState === 'sent' ? 'check' : 'person_add'}
                        </span>
                    </button>
                ) : null}
                {!isSelf && !player.is_bot ? (
                    <button
                        className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 transition-colors text-slate-400 hover:text-primary hover:border-primary/25 hover:bg-primary/10"
                        type="button"
                        onClick={handleMessage}
                        title="Message"
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>mail</span>
                    </button>
                ) : null}
            </div>
        </div>
    );
};

export default function PlayerList({ players = [], startRank = 4, ratingLabel = 'Rating' }) {
    if (!players || players.length === 0) return null;

    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark p-2 sm:p-3 shadow-sm">
            <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_4.75rem_5.25rem] sm:grid-cols-[3.25rem_minmax(0,1fr)_5.5rem_6.25rem] gap-2 px-2 sm:px-3 pb-2 text-[10px] sm:text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.16em]">
                <div className="text-center">Rank</div>
                <div>Player</div>
                <div className="text-right">{ratingLabel}</div>
                <div className="text-right">Actions</div>
            </div>
            <div className="space-y-2">
                {players.map((player, index) => (
                    <PlayerRow
                        key={player.id || index}
                        player={player}
                        rank={player.rank ?? (startRank + index)}
                        ratingLabel={ratingLabel}
                    />
                ))}
            </div>
        </div>
    );
}
