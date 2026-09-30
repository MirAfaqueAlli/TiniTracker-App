'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HospitalPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings?tab=hospital');
  }, [router]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--color-text-muted)' }}>
      Redirecting to Settings &gt; Hospital &amp; WhatsApp...
    </div>
  );
}
