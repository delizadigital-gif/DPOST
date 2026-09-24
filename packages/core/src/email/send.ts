import { createTransport, type Transporter } from 'nodemailer';
import { getAuthEnv } from '@dpost/config';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  /** The mail server's ID for the message, for tracing a delivery. */
  messageId: string;
  /** What the server replied, e.g. "250 Accepted". */
  response: string;
  /** Recipients the server refused. */
  rejected: string[];
}

/**
 * Sends email over SMTP: Mailpit locally, Resend (SMTP interface) in
 * production. With no SMTP server configured (tests), messages go to an
 * in-memory outbox that tests can read.
 */
const outbox: EmailMessage[] = [];
let transport: Transporter | undefined;

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const { SMTP_URL, EMAIL_FROM } = getAuthEnv();
  if (!SMTP_URL) {
    outbox.push(message);
    return { messageId: 'outbox', response: 'stored in test outbox', rejected: [] };
  }
  transport ??= createTransport(SMTP_URL);
  const info = await transport.sendMail({ from: EMAIL_FROM, ...message });
  return {
    messageId: String(info.messageId ?? ''),
    response: String(info.response ?? ''),
    rejected: (info.rejected ?? []).map(String),
  };
}

/** Emails "sent" without an SMTP server. For tests only. */
export function getTestOutbox(): readonly EmailMessage[] {
  return outbox;
}
