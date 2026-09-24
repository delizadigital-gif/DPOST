'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

/** Confirms a just-verified email once, then removes `?verified=1` from the URL. */
export function VerifiedToast() {
  const router = useRouter();
  useEffect(() => {
    toast.success('Email confirmed. Thanks!');
    router.replace('/home');
  }, [router]);
  return null;
}
