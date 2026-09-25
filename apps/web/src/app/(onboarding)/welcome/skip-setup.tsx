'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { finishOnboarding } from './actions';

/**
 * Leaves setup without answering. It records that the wizard was dismissed
 * rather than completed, so nothing later claims the AI knows this business.
 */
export function SkipSetup() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const skip = async () => {
    setLeaving(true);
    const result = await finishOnboarding(true);
    if (!result.ok) {
      setLeaving(false);
      toast.error(result.error.message);
      return;
    }
    router.push('/home');
  };

  return (
    <Button variant="ghost" size="sm" onClick={skip} disabled={leaving} className="h-9 px-3">
      {t('skipSetup')}
    </Button>
  );
}
