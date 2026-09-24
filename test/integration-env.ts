// Connection settings for integration tests. They default to the separate
// test database and Redis database 1 from docker-compose.yml, so tests never
// touch development data. CI overrides them with its service containers.
// No SMTP_URL: emails go to an in-memory outbox that tests read.
export const integrationEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'fatal',
  APP_URL: 'http://localhost:3000',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? 'postgresql://dpost:dpost@localhost:5432/dpost_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1',
  BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters-long',
};
