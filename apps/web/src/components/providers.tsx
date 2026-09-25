'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

/** Light/dark theme, following the system setting unless the user picks one. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
