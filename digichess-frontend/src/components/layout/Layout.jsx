import React from 'react';
import Header from './Header';
import BottomNav from './BottomNav';

export default function Layout({
    children,
    headerProps,
    showHeader = true,
    showBottomNav = true,
}) {
    return (
        <div className="bg-background-light dark:bg-background-dark min-h-screen font-display antialiased text-slate-900 dark:text-white overflow-x-hidden flex flex-col">
            {showHeader ? <Header {...headerProps} /> : null}

            {/* Main Content Area */}
            <main className="flex-1 min-h-0 flex flex-col relative z-0">
                {children}
            </main>

            {showBottomNav ? <BottomNav /> : null}
        </div>
    );
}
