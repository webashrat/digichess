'use client';

import { usePathname } from 'next/navigation';
import { useSidebar } from '@/lib/sidebar-context';

export default function MainContent({ children }) {
  const pathname = usePathname();
  const { expanded } = useSidebar();
  const isGame = pathname?.startsWith('/game/');
  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const noSidebar = isGame || isAuthPage;

  return (
    <main
      className={`min-h-screen flex flex-col transition-all duration-200 ${!noSidebar ? (expanded ? 'md:ml-56' : 'md:ml-16 lg:ml-20') : ''
        }`}
    >
      <div className={`flex-1 ${!noSidebar ? 'px-4 sm:px-6 md:px-10 pt-4 pb-20 md:pb-4' : ''}`}>
        {children}
      </div>
    </main>
  );
}
