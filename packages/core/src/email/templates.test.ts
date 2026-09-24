import { describe, expect, it } from 'vitest';
import { escapeHtml, resetPasswordMessage, verifyEmailMessage } from './templates';

describe('email templates', () => {
  it('escapes user-controlled values in HTML', () => {
    const message = verifyEmailMessage(
      'a@example.com',
      '<script>alert(1)</script>',
      'https://app.example/verify?token=abc&next="x"',
    );
    expect(message.html).not.toContain('<script>alert(1)</script>');
    expect(message.html).toContain('&lt;script&gt;');
    expect(message.html).toContain('token=abc&amp;next=&quot;x&quot;');
  });

  it('includes the link in both HTML and text versions', () => {
    const url = 'https://app.example/api/auth/reset-password/tok123';
    const message = resetPasswordMessage('a@example.com', 'Rahim', url);
    expect(message.to).toBe('a@example.com');
    expect(message.subject).toMatch(/reset/i);
    expect(message.html).toContain(url);
    expect(message.text).toContain(url);
    expect(message.text).toContain('Hi Rahim');
  });

  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});
