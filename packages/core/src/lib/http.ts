/**
 * The client's IP address from proxy headers.
 *
 * Proxies append to X-Forwarded-For, so the rightmost entry is the one our
 * own host added, and it can't be faked. Earlier entries come from the
 * client and can be anything, so using the first entry would let anyone
 * dodge per-IP rate limits by sending a made-up header.
 *
 * This assumes exactly one proxy (the host's) in front of the app. If a CDN
 * is added in front of it later, this must be revisited, or every visitor
 * would share the CDN's IP.
 */
export function clientIpFromHeaders(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for');
  if (!forwarded) return undefined;
  const entries = forwarded
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.at(-1);
}

/**
 * Header carrying the client IP we computed, for libraries that read the IP
 * from a header (Better Auth). Set only by our own code.
 */
export const CLIENT_IP_HEADER = 'x-dpost-client-ip';

/**
 * Returns a copy of the request whose CLIENT_IP_HEADER holds the IP from
 * `clientIpFromHeaders`. Any value the client sent in that header is
 * discarded first, so it can't be spoofed.
 */
export function withClientIpHeader(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete(CLIENT_IP_HEADER);
  const ip = clientIpFromHeaders(request.headers);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);

  // Built from parts rather than `new Request(request, init)`: Next.js's
  // request subclass can't be copied that way in its production server.
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return new Request(request.url, {
    method: request.method,
    headers,
    signal: request.signal,
    ...(hasBody ? { body: request.body, duplex: 'half' } : {}),
  } as RequestInit);
}
