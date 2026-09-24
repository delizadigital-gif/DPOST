/**
 * Where to send the user after signing in. Only same-site paths are allowed:
 * a `next` of `https://evil.example` or `//evil.example` would otherwise turn
 * our login page into an open redirect for phishing.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/home'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return fallback;
  }
  return next;
}
