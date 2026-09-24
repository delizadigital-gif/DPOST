'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';
import { authErrorMessage } from '@/lib/auth/errors';

type State = { kind: 'idle' } | { kind: 'sent' } | { kind: 'error'; message: string };

export function ResendVerificationButton({
  email,
  variant = 'outline',
  className = 'h-11 w-full rounded-lg text-[15px]',
}: {
  email: string;
  variant?: 'outline' | 'secondary';
  className?: string;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={variant}
        className={className}
        disabled={pending || state.kind === 'sent'}
        onClick={async () => {
          setPending(true);
          const { error } = await authClient.sendVerificationEmail({
            email,
            callbackURL: '/home?verified=1',
          });
          setPending(false);
          setState(error ? { kind: 'error', message: authErrorMessage(error) } : { kind: 'sent' });
        }}
      >
        {pending ? 'Sending…' : state.kind === 'sent' ? 'Email sent' : 'Resend the email'}
      </Button>
      <p role="status" className="text-sm text-muted-foreground">
        {state.kind === 'sent'
          ? 'A new link is on its way. Check your inbox and spam folder.'
          : null}
        {state.kind === 'error' ? <span className="text-destructive">{state.message}</span> : null}
      </p>
    </div>
  );
}
