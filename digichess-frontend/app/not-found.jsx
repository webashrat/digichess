'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link href="/" className="text-primary font-semibold hover:underline">
        Go home
      </Link>
    </div>
  );
}
