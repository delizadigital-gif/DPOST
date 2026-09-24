/** Reads emails from the local Mailpit inbox (docker-compose / CI service). */
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

interface MailpitSearch {
  messages: { ID: string; Subject: string }[];
}

/** Waits for an email to `to` whose subject matches, and returns the first link in it. */
export async function waitForEmailLink(to: string, subject: RegExp, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = (await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    ).then((response) => response.json())) as MailpitSearch;
    const match = search.messages.find((message) => subject.test(message.Subject));
    if (match) {
      const message = (await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`).then((response) =>
        response.json(),
      )) as { Text: string };
      const link = message.Text.match(/https?:\/\/\S+/)?.[0];
      if (!link) throw new Error(`Email "${match.Subject}" has no link`);
      return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No email to ${to} matching ${subject} within ${timeoutMs}ms`);
}
