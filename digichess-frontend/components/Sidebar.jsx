'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Home } from '@solar-icons/react';
import { Users, Trophy, BarChart3, PanelLeftClose, PanelLeftOpen, ChevronUp, User, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

import { useSidebar } from '@/lib/sidebar-context';

const navItems = [
  { id: 'home', href: '/', Icon: Home, label: 'Home', end: true },
  { id: 'social', href: '/social', Icon: Users, label: 'Social', end: false },
  { id: 'leaderboard', href: '/leaderboard', Icon: BarChart3, label: 'Leaderboard', end: false },
  { id: 'tournaments', href: '/tournaments', Icon: Trophy, label: 'Tournaments', end: false },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const { expanded, setExpanded } = useSidebar();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);

  const showSidebar = !pathname?.startsWith('/game/') && pathname !== '/login' && pathname !== '/signup';

  useEffect(() => {
    function handleClickOutside(e) {
      if (accountRef.current && !accountRef.current.contains(e.target)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setAccountOpen(false);
    await logout();
    router.push('/');
  };

  if (!showSidebar) return null;

  const avatarUrl = user?.profile_pic || user?.avatar || user?.image || '';
  const initials = user?.username?.slice(0, 2).toUpperCase() || 'DC';
  const displayName = user?.first_name
    ? `${user.first_name}${user.last_name ? ` ${user.last_name}` : ''}`
    : user?.username || 'User';
  const displayEmail = user?.email || '';

  // Bottom tab items for mobile (includes Profile)
  const mobileTabItems = [
    ...navItems,
    { id: 'profile', href: '/profile', Icon: User, label: 'Profile', end: false },
  ];

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <aside
        className={clsx(
          'fixed left-0 top-0 bottom-0 bg-surface-light dark:bg-surface-dark border-r border-slate-200 dark:border-slate-800 flex-col z-40 transition-all duration-200 ease-in-out hidden md:flex',
          expanded ? 'w-56' : 'w-16 sm:w-20'
        )}
      >
        {/* Logo section */}
        <div className={clsx('flex items-center px-4 py-4 border-b border-slate-200 dark:border-slate-800', !expanded && 'justify-center px-2')}>
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">DC</span>
            </div>
            {expanded && (
              <span
                className="text-base font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-primary via-purple-400 to-emerald-300 truncate"
                style={{ fontFamily: '"Calibri", "Lexend", sans-serif' }}
              >
                DigiChess
              </span>
            )}
          </Link>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 flex flex-col gap-1 px-2 py-3 overflow-y-auto no-scrollbar">
          {navItems.map((item) => {
            const isActive = item.end ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 rounded-lg transition-colors',
                  expanded ? 'px-3 py-2.5' : 'flex-col justify-center py-3 px-1',
                  isActive
                    ? 'text-primary bg-primary/10 dark:bg-primary/20 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
              >
                <item.Icon
                  size={expanded ? 22 : 28}
                  className={clsx(isActive && 'fill-current', !expanded && 'mx-auto')}
                />
                {expanded ? (
                  <span className="text-sm">{item.label}</span>
                ) : (
                  <span className="text-[10px] font-medium">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div className={clsx('px-2 py-2 border-t border-slate-200 dark:border-slate-800')}>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className={clsx(
              'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-slate-500 dark:text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors',
              !expanded && 'justify-center px-1'
            )}
          >
            {expanded ? (
              <>
                <PanelLeftClose size={20} />
                <span className="text-sm">Collapse</span>
              </>
            ) : (
              <PanelLeftOpen size={22} />
            )}
          </button>
        </div>

        {/* User account section at bottom */}
        {isAuthenticated && user && (
          <div className="relative border-t border-slate-200 dark:border-slate-800 px-2 py-2" ref={accountRef}>
            <button
              type="button"
              onClick={() => setAccountOpen((prev) => !prev)}
              className={clsx(
                'flex items-center w-full rounded-lg px-2 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors',
                !expanded && 'justify-center'
              )}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700 flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {initials}
                </div>
              )}
              {expanded && (
                <>
                  <div className="flex flex-col items-start ml-2.5 min-w-0 flex-1">
                    <span className="text-sm font-semibold truncate w-full text-left text-slate-800 dark:text-slate-100">{displayName}</span>
                    {displayEmail && (
                      <span className="text-[11px] text-slate-400 truncate w-full text-left">{displayEmail}</span>
                    )}
                  </div>
                  <ChevronUp className={clsx('w-4 h-4 text-slate-400 flex-shrink-0 transition-transform', accountOpen ? 'rotate-0' : 'rotate-180')} />
                </>
              )}
            </button>

            {/* Account popup menu */}
            {accountOpen && (
              <div className={clsx(
                'absolute bg-surface-light dark:bg-surface-dark border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 z-50',
                expanded ? 'bottom-full left-2 right-2 mb-1' : 'left-full bottom-0 ml-2 w-48'
              )}>
                <Link
                  href="/profile"
                  onClick={() => setAccountOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <User className="w-4 h-4" />
                  Profile
                </Link>
                <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-left text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4" />
                  Log Out
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Mobile bottom tab bar — shown only on mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface-light dark:bg-surface-dark border-t border-slate-200 dark:border-slate-800 flex md:hidden items-center justify-around px-0.5 py-0.5 safe-area-bottom">
        {mobileTabItems.map((item) => {
          const isActive = item.end ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              className={clsx(
                'flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-lg transition-colors min-w-0',
                isActive
                  ? 'text-primary'
                  : 'text-slate-400 dark:text-slate-500'
              )}
            >
              <item.Icon size={16} className={clsx(isActive && 'fill-current')} />
              <span className="text-[9px] font-medium leading-tight truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
