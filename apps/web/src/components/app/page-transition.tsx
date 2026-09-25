'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * A short fade-up when moving between sections, so a new page reads as a
 * change rather than a flash. Keyed by path to replay on each navigation.
 * Global CSS disables this for `prefers-reduced-motion`.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <div
      key={usePathname()}
      className="animate-in duration-200 ease-(--ease-out-quint) fade-in slide-in-from-bottom-2"
    >
      {children}
    </div>
  );
}
