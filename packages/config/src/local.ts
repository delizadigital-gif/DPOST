/**
 * Is this server reachable by real people?
 *
 * Several settings are safe in development and dangerous in a deployment —
 * the AI stub, local file storage. Keying those rules on `NODE_ENV` alone
 * gets it wrong, because the end-to-end tests run the real production build
 * on purpose, on localhost. `NODE_ENV` says how the code was built; the
 * address says who can reach it.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export function isLocalAppUrl(appUrl: string | undefined): boolean {
  if (!appUrl) return false;
  try {
    return LOCAL_HOSTS.has(new URL(appUrl).hostname.replace(/^\[|\]$/gu, ''));
  } catch {
    return false;
  }
}

/**
 * True when this is a deployment real users can reach — a production build
 * on an address that is not localhost. With no address to judge by, the
 * answer is yes: the safe assumption for anything that could leak.
 */
export function isPublicDeployment(nodeEnv: string, appUrl: string | undefined): boolean {
  return nodeEnv === 'production' && !isLocalAppUrl(appUrl);
}
