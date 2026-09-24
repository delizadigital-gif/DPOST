import { createTransport, type Transporter } from 'nodemailer';
import { getAuthEnv } from '@dpost/config';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends email over SMTP: Mailpit locally, Resend (SMTP interface) in
 * production. With no SMTP server configured (tests), messages go to an
 * in-memory outbox that tests can read.
 */
const outbox: EmailMessage[] = [];
let transport: Transporter | undefined;

export async function sendEmail(message: EmailMessage): Promise<void> {
  const { SMTP_URL, EMAIL_FROM } = getAuthEnv();
  if (!SMTP_URL) {
    outbox.push(message);
    return;
  }
  transport ??= createTransport(SMTP_URL);
  await transport.sendMail({ from: EMAIL_FROM, ...message });
}

/** Emails "sent" without an SMTP server. For tests only. */
export function getTestOutbox(): readonly EmailMessage[] {
  return outbox;
}
