import { graphRequest } from './client';

/**
 * Connecting a Facebook Page, step by step:
 *
 * ```
 * 1. authorize URL  → the user picks Pages and grants permissions on Meta
 * 2. callback code  → a short-lived user token
 * 3. exchange       → a long-lived user token (about 60 days)
 * 4. /me/accounts   → the Pages they manage, each with its own Page token
 * ```
 *
 * Page tokens derived from a long-lived user token don't expire on a timer,
 * but they do stop working when the person changes their password, removes
 * the app, or loses their role on the Page — which is why there is a daily
 * health check as well as error handling at publish time.
 */

/** The least we can ask for and still publish and read back what we posted. */
export const REQUIRED_SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
] as const;

/** Asked for as well, so Analytics has data when Phase 10 arrives. */
export const OPTIONAL_SCOPES = ['read_insights'] as const;

export interface AuthorizeUrlInput {
  appId: string;
  redirectUri: string;
  state: string;
  /** A Facebook Login for Business configuration, when one is set up. */
  configId?: string | undefined;
  scopes?: readonly string[];
}

export function buildAuthorizeUrl({
  appId,
  redirectUri,
  state,
  configId,
  scopes = [...REQUIRED_SCOPES, ...OPTIONAL_SCOPES],
}: AuthorizeUrlInput): string {
  const url = new URL('https://www.facebook.com/v23.0/dialog/oauth');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  if (configId) url.searchParams.set('config_id', configId);
  else url.searchParams.set('scope', scopes.join(','));
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface ExchangeCodeInput {
  code: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
  graphVersion?: string;
}

/** Step 2: the one-time code becomes a short-lived user token. */
export async function exchangeCodeForToken(input: ExchangeCodeInput): Promise<TokenResponse> {
  const { data } = await graphRequest<TokenResponse>({
    path: 'oauth/access_token',
    // No token yet — this call authenticates with the app's own credentials.
    token: '',
    params: {
      client_id: input.appId,
      client_secret: input.appSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
    },
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.graphVersion ? { graphVersion: input.graphVersion } : {}),
    // The app secret is already a parameter here; signing would be circular.
    appSecret: '',
  });
  return data;
}

export interface LongLivedInput {
  token: string;
  appId: string;
  appSecret: string;
  fetchImpl?: typeof fetch;
  graphVersion?: string;
}

/** Step 3: about sixty days instead of about an hour. */
export async function exchangeForLongLivedToken(input: LongLivedInput): Promise<TokenResponse> {
  const { data } = await graphRequest<TokenResponse>({
    path: 'oauth/access_token',
    token: '',
    params: {
      grant_type: 'fb_exchange_token',
      client_id: input.appId,
      client_secret: input.appSecret,
      fb_exchange_token: input.token,
    },
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.graphVersion ? { graphVersion: input.graphVersion } : {}),
    appSecret: '',
  });
  return data;
}

export interface ManagedPage {
  id: string;
  name: string;
  accessToken: string;
  category?: string;
  avatarUrl?: string;
  /** What Facebook says this person may do on the Page. */
  tasks: string[];
}

interface AccountsResponse {
  data: {
    id: string;
    name: string;
    access_token: string;
    category?: string;
    tasks?: string[];
    picture?: { data?: { url?: string } };
  }[];
}

/**
 * Step 4: the Pages this person manages.
 *
 * Only Pages where they can actually create content are returned — offering
 * a Page we would be refused on is a promise the product can't keep.
 */
export async function listManagedPages(input: {
  userToken: string;
  fetchImpl?: typeof fetch;
  graphVersion?: string;
}): Promise<ManagedPage[]> {
  const { data } = await graphRequest<AccountsResponse>({
    path: 'me/accounts',
    token: input.userToken,
    params: { fields: 'id,name,access_token,category,tasks,picture{url}', limit: 100 },
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.graphVersion ? { graphVersion: input.graphVersion } : {}),
  });

  return (data.data ?? [])
    .filter((page) => (page.tasks ?? []).includes('CREATE_CONTENT'))
    .map((page) => ({
      id: page.id,
      name: page.name,
      accessToken: page.access_token,
      tasks: page.tasks ?? [],
      ...(page.category ? { category: page.category } : {}),
      ...(page.picture?.data?.url ? { avatarUrl: page.picture.data.url } : {}),
    }));
}

export interface TokenHealth {
  valid: boolean;
  scopes: string[];
  expiresAt: Date | null;
  /** Present when Meta says why the token is no longer good. */
  reason?: string;
}

/** What the daily health check asks Meta about a stored token. */
export async function debugToken(input: {
  token: string;
  appId: string;
  appSecret: string;
  fetchImpl?: typeof fetch;
  graphVersion?: string;
}): Promise<TokenHealth> {
  const { data } = await graphRequest<{
    data?: {
      is_valid?: boolean;
      scopes?: string[];
      expires_at?: number;
      error?: { message?: string };
    };
  }>({
    path: 'debug_token',
    token: `${input.appId}|${input.appSecret}`,
    params: { input_token: input.token },
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.graphVersion ? { graphVersion: input.graphVersion } : {}),
    appSecret: '',
  });

  const info = data.data ?? {};
  return {
    valid: info.is_valid === true,
    scopes: info.scopes ?? [],
    // `expires_at: 0` means "does not expire", which is what Page tokens say.
    expiresAt: info.expires_at ? new Date(info.expires_at * 1000) : null,
    ...(info.error?.message ? { reason: info.error.message } : {}),
  };
}

/**
 * Hands the permissions back when someone disconnects. Doing this rather
 * than just forgetting the token means the person's Facebook settings show
 * the truth: DPOST no longer has access.
 */
export async function revokePermissions(input: {
  userToken: string;
  fetchImpl?: typeof fetch;
  graphVersion?: string;
}): Promise<void> {
  await graphRequest({
    path: 'me/permissions',
    method: 'DELETE',
    token: input.userToken,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    ...(input.graphVersion ? { graphVersion: input.graphVersion } : {}),
  });
}
