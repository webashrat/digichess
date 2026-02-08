import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createThread, sendFriendRequest } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { getBlitzTag, getRatingTagClasses } from '../../utils/ratingTags';

const PlayerRow = ({ player, rank }) => {
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
        } catch (err) {
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
        } catch (err) {
            setFriendState('idle');
        }
    };

    return (
        <div
            className={`group relative grid grid-cols-12 gap-2 items-center px-4 py-3 border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${player.isSelf ? 'bg-primary/5 dark:bg-primary/10 border-l-2 border-l-primary' : ''}`}
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
            <div className="col-span-1 text-sm font-bold text-slate-500 text-center">{rank}</div>
            <div className="col-span-6 flex items-center gap-3">
                <div className="relative shrink-0">
                    <div
                        className="w-8 h-8 rounded-full bg-slate-700 bg-cover bg-center flex items-center justify-center text-xs font-bold text-white"
                        style={player.avatar ? { backgroundImage: `url('${player.avatar}')` } : undefined}
                    >
                        {!player.avatar ? player.username?.slice(0, 2).toUpperCase() : null}
                    </div>
                </div>
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1">
                        {tag ? (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${tagClasses}`}>{tag}</span>
                        ) : null}
                        <span className="truncate font-medium text-sm">{player.username}</span>
                    </div>
                </div>
            </div>
            <div className="col-span-3 text-right font-bold text-slate-700 dark:text-slate-300 text-sm">{player.rating}</div>
            <div className="col-span-2 flex justify-end gap-2">
                {!isSelf && !player.is_bot ? (
                    <button
                        className={`p-1.5 rounded-lg transition-colors ${
                            friendState === 'sent'
                                ? 'text-green-500 bg-green-500/10'
                                : 'text-slate-400 hover:text-primary hover:bg-primary/10'
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
                        className="p-1.5 rounded-lg transition-colors text-slate-400 hover:text-primary hover:bg-primary/10"
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

export default function PlayerList({ players = [], startRank = 4 }) {
    if (!players || players.length === 0) return null;

    return (
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 uppercase">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-6">Player</div>
                <div className="col-span-3 text-right">Rating</div>
                <div className="col-span-2 text-right"></div>
            </div>
            {players.map((player, index) => (
                <PlayerRow key={player.id || index} player={player} rank={startRank + index} />
            ))}
        </div>
    );
}
