import { describe, expect, it } from 'vitest';
import { isAiConfigured, parseAiEnv } from './ai-env';

describe('AI settings', () => {
  it('runs without an API key, with the features reported as unconfigured', () => {
    const env = parseAiEnv({});
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(isAiConfigured(env)).toBe(false);
  });

  it('is configured once a key is present', () => {
    expect(isAiConfigured(parseAiEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' }))).toBe(true);
  });

  it('defaults the two model slots', () => {
    const env = parseAiEnv({});
    expect(env.LLM_MODEL_SMART).toContain('claude');
    expect(env.LLM_MODEL_FAST).toContain('claude');
  });

  it('lets the models be swapped without a code change', () => {
    expect(parseAiEnv({ LLM_MODEL_SMART: 'claude-opus-5-5' }).LLM_MODEL_SMART).toBe(
      'claude-opus-5-5',
    );
  });

  it('allows the stub provider outside production, with no key', () => {
    const env = parseAiEnv({ AI_PROVIDER: 'stub' });
    expect(isAiConfigured(env)).toBe(true);
  });

  it('allows the stub in a production build served on localhost, as the e2e tests are', () => {
    const env = parseAiEnv({
      NODE_ENV: 'production',
      AI_PROVIDER: 'stub',
      APP_URL: 'http://localhost:3000',
    });
    expect(env.AI_PROVIDER).toBe('stub');
  });

  it('refuses the stub provider on a deployed site', () => {
    expect(() =>
      parseAiEnv({
        NODE_ENV: 'production',
        AI_PROVIDER: 'stub',
        APP_URL: 'https://web-production-6737e.up.railway.app',
      }),
    ).toThrow(/never serve a deployed site/);
  });

  it('refuses the stub in production when there is no address to judge by', () => {
    expect(() => parseAiEnv({ NODE_ENV: 'production', AI_PROVIDER: 'stub' })).toThrow(
      /never serve a deployed site/,
    );
  });
});
