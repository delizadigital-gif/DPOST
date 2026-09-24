import { describe, expect, it } from 'vitest';
import { CLIENT_IP_HEADER, clientIpFromHeaders, withClientIpHeader } from './http';

const headers = (value?: string) => new Headers(value ? { 'x-forwarded-for': value } : {});

describe('clientIpFromHeaders', () => {
  it('takes the address added by our proxy (rightmost), not a client-supplied one', () => {
    expect(clientIpFromHeaders(headers('1.1.1.1, 203.0.113.7'))).toBe('203.0.113.7');
  });

  it('handles a single address and stray whitespace', () => {
    expect(clientIpFromHeaders(headers(' 203.0.113.7 '))).toBe('203.0.113.7');
    expect(clientIpFromHeaders(headers('203.0.113.7, '))).toBe('203.0.113.7');
  });

  it('returns undefined without the header', () => {
    expect(clientIpFromHeaders(headers())).toBeUndefined();
  });
});

describe('withClientIpHeader', () => {
  it('sets the computed IP and discards a client-supplied value', async () => {
    const request = new Request('https://app.example/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '6.6.6.6, 203.0.113.7',
        [CLIENT_IP_HEADER]: '1.2.3.4',
      },
      body: '{"a":1}',
    });
    const rewritten = withClientIpHeader(request);
    expect(rewritten.headers.get(CLIENT_IP_HEADER)).toBe('203.0.113.7');
    expect(rewritten.method).toBe('POST');
    expect(await rewritten.text()).toBe('{"a":1}');
  });

  it('removes a spoofed header when there is no forwarded IP', () => {
    const request = new Request('https://app.example/', {
      headers: { [CLIENT_IP_HEADER]: '1.2.3.4' },
    });
    expect(withClientIpHeader(request).headers.get(CLIENT_IP_HEADER)).toBeNull();
  });
});
