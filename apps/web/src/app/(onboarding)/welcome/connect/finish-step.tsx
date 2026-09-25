'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { previousStepHref } from '@/lib/onboarding';
import { finishOnboarding } from '../actions';

/** Ends the wizard and takes the user into the product. */
export function FinishStep() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const [finishing, setFinishing] = useState(false);

  const finish = async () => {
    setFinishing(true);
    const result = await finishOnboarding(false);
    if (!result.ok) {
      setFinishing(false);
      toast.error(result.error.message);
      return;
    }
    router.push('/home');
  };

  return (
    <div className="mt-8 flex items-center gap-3">
      <Button variant="ghost" size="lg" asChild className="h-11 px-3">
        <Link href={previousStepHref('connect') ?? '/welcome/voice'}>
          <ArrowLeft className="size-4" aria-hidden />
          {t('back')}
        </Link>
      </Button>
      <Button
        size="lg"
        onClick={finish}
        disabled={finishing}
        className="ml-auto h-11 rounded-lg px-5"
      >
        {finishing ? t('saving') : t('connect.finish')}
        <ArrowRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
