import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';

function captureLogger() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const logger = createLogger({ service: 'test', level: 'debug', destination });
  return { logger, lines };
}

describe('createLogger', () => {
  it('writes structured JSON with the service name', () => {
    const { logger, lines } = captureLogger();
    logger.info({ jobId: 'job_1' }, 'hello');
    const entry = JSON.parse(lines[0] ?? '{}');
    expect(entry).toMatchObject({ level: 'info', service: 'test', jobId: 'job_1', msg: 'hello' });
  });

  it('redacts tokens and credentials', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        accessToken: 'EAAB-page-token',
        channel: { token: 'nested-token' },
        req: { headers: { authorization: 'Bearer abc', cookie: 'session=xyz' } },
        password: 'hunter2',
      },
      'secrets',
    );
    const output = lines.join('');
    for (const secret of [
      'EAAB-page-token',
      'nested-token',
      'Bearer abc',
      'session=xyz',
      'hunter2',
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('[redacted]');
  });
});
