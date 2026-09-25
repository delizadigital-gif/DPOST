'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

/** Confirms a just-verified email once, then removes `?verified=1` from the URL. */
export function VerifiedToast() {
  const router = useRouter();
  useEffect(() => {
    // A fixed id: React may run this effect twice (Strict Mode, or a remount
    // during navigation), and sonner then updates the same toast instead of
    // stacking a second identical one.
    toast.success('Email confirmed. Thanks!', { id: 'email-verified' });
    router.replace('/home');
  }, [router]);
  return null;
}
