import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { SidebarProvider } from '@/lib/sidebar-context';
import Navbar from '@/components/Navbar';
import Sidebar from '@/components/Sidebar';
import MainContent from '@/components/MainContent';

export const metadata = {
  title: 'DigiChess',
  description: 'Play chess online',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-white antialiased font-display">
        <AuthProvider>
          <SidebarProvider>
            <Sidebar />
            <MainContent>
              <Navbar />
              {children}
            </MainContent>
          </SidebarProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
