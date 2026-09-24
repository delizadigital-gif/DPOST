'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      className="h-9 gap-2 rounded-lg"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.replace('/login');
        router.refresh();
      }}
    >
      <LogOut className="size-4" aria-hidden />
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
