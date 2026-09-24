import type { EmailMessage } from './send';

/**
 * Transactional email templates. Plain functions producing matching HTML and
 * text versions: the HTML uses inline styles and tables because many email
 * clients ignore <style> blocks. Every interpolated value is escaped.
 */

const BRAND = '#5b3df5';
const INK = '#14121f';
const MUTED = '#57546a';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

interface LayoutInput {
  preheader: string;
  heading: string;
  paragraphs: string[];
  action: { label: string; url: string };
  footnote: string;
}

function layout({ preheader, heading, paragraphs, action, footnote }: LayoutInput): string {
  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${MUTED}">${escapeHtml(p)}</p>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#faf9fd;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9fd;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #eceaf3;border-radius:16px">
<tr><td style="padding:32px 32px 8px">
<div style="font-size:20px;font-weight:700;color:${INK};letter-spacing:-0.02em">D<span style="color:${BRAND}">POST</span></div>
</td></tr>
<tr><td style="padding:16px 32px 32px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:${INK}">${escapeHtml(heading)}</h1>
${body}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:12px;background:${BRAND}">
<a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 20px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px">${escapeHtml(action.label)}</a>
</td></tr></table>
<p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${MUTED}">If the button doesn't work, copy this link into your browser:</p>
<p style="margin:0 0 24px;font-size:13px;line-height:20px;word-break:break-all"><a href="${escapeHtml(action.url)}" style="color:${BRAND}">${escapeHtml(action.url)}</a></p>
<p style="margin:0;font-size:13px;line-height:20px;color:${MUTED}">${escapeHtml(footnote)}</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#8e8aa3">DPOST by DelizaDigital</p>
</td></tr></table>
</body></html>`;
}

function text(input: LayoutInput): string {
  return [
    input.heading,
    '',
    ...input.paragraphs,
    '',
    `${input.action.label}: ${input.action.url}`,
    '',
    input.footnote,
  ].join('\n');
}

function message(to: string, subject: string, input: LayoutInput): EmailMessage {
  return { to, subject, html: layout(input), text: text(input) };
}

export function verifyEmailMessage(to: string, name: string, url: string): EmailMessage {
  return message(to, 'Confirm your email for DPOST', {
    preheader: 'One click to confirm your email address.',
    heading: `Welcome to DPOST, ${name}`,
    paragraphs: [
      'Please confirm your email address. It keeps your account secure and lets you connect your Facebook Page.',
    ],
    action: { label: 'Confirm email', url },
    footnote:
      "This link expires in 24 hours. If you didn't sign up for DPOST, you can ignore this email.",
  });
}

export function resetPasswordMessage(to: string, name: string, url: string): EmailMessage {
  return message(to, 'Reset your DPOST password', {
    preheader: 'Choose a new password for your account.',
    heading: 'Reset your password',
    paragraphs: [
      `Hi ${name}, we received a request to reset your DPOST password.`,
      'After you choose a new one, you will be signed out on all your other devices.',
    ],
    action: { label: 'Choose a new password', url },
    footnote:
      "This link expires in 30 minutes and works once. If you didn't ask for this, you can ignore this email: your password won't change.",
  });
}
