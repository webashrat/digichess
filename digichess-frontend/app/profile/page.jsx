'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import ProfileContent from '@/components/profile/ProfileContent';

export default function ProfilePage() {
  const router = useRouter();
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-slate-500 mb-4">Sign in to view your profile.</p>
        <button type="button" className="px-4 py-2 rounded-lg bg-primary text-white font-semibold" onClick={() => router.push('/login')}>
          Log in
        </button>
      </div>
    );
  }

  return <ProfileContent username={user.username} isSelf />;
}
