'use client';

import { useParams } from 'next/navigation';
import ProfileContent from '@/components/profile/ProfileContent';

export default function ProfileUsernamePage() {
  const params = useParams();
  const username = params?.username;

  if (!username) return null;

  return <ProfileContent username={username} isSelf={false} />;
}
