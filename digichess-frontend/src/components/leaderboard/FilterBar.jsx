import React from 'react';
import { Search, SlidersHorizontal, ChevronDown, Globe, BadgeCheck } from 'lucide-react';

export default function FilterBar() {
    return (
        <div className="shrink-0 bg-background-light dark:bg-background-dark pt-4 px-4 pb-2 z-40">
            {/* Search Input */}
            <div className="relative mb-4">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search size={20} className="text-slate-400" />
                </div>
                <input
                    type="text"
                    className="block w-full pl-10 pr-3 py-2.5 border-none rounded-xl bg-white dark:bg-surface-dark text-sm placeholder-slate-400 focus:ring-2 focus:ring-primary shadow-sm outline-none"
                    placeholder="Search for players, streamers..."
                />
                <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
                    <button className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-primary">
                        <SlidersHorizontal size={20} />
                    </button>
                </div>
            </div>

            {/* Filter Chips (Horizontal Scroll) */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                <button className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-xs font-medium whitespace-nowrap active:scale-95 transition-transform">
                    <span>Rating Range</span>
                    <ChevronDown size={16} />
                </button>
                <button className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium whitespace-nowrap active:scale-95 transition-transform">
                    <span>Country: All</span>
                    <Globe size={16} />
                </button>
                <button className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-xs font-medium whitespace-nowrap active:scale-95 transition-transform">
                    <span>Title: GM</span>
                    <BadgeCheck size={16} className="text-red-500" />
                </button>
                <button className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-xs font-medium whitespace-nowrap active:scale-95 transition-transform">
                    <span>Online Only</span>
                </button>
            </div>

            {/* List Header */}
            <div className="flex items-center px-2 py-2 mt-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <div className="w-8 text-center">#</div>
                <div className="flex-1 pl-3">Player</div>
                <div className="w-16 text-right mr-3">Rating</div>
                <div className="w-8"></div>
            </div>
        </div>
    );
}
