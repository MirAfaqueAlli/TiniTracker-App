'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ActivityPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings?tab=activity');
  }, [router]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--color-text-muted)' }}>
      Redirecting to Settings &gt; Activity Logs...
    </div>
  );
}
