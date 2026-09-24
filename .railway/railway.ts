// DPOST infrastructure, defined in code (https://docs.railway.com/infrastructure-as-code).
//
//   railway config plan    preview changes without touching Railway
//   railway config apply   apply them
//
// Everything runs in Singapore (asia-southeast1), the closest region to
// Bangladesh. Secrets are never written here: they are set once with
// `railway variables` and kept with preserve().
import {
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  redis,
  ref,
  service,
  volume,
} from 'railway/iac';

const REGION = 'asia-southeast1-eqsg3a';
const REPO = 'delizadigital-gif/DPOST';

export default defineRailway(() => {
  const Redis = redis('Redis', { region: REGION });
  Redis.deploy = {
    startCommand:
      '/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH"',
  };
  Redis.networking = { privateNetworkEndpoint: 'redis' };

  const Postgres = postgres('Postgres', { region: REGION });
  Postgres.networking = { privateNetworkEndpoint: 'postgres' };

  const redisVolume = volume('redis-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: REGION,
    sizeMB: 500,
  });
  const postgresVolume = volume('postgres-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: REGION,
    sizeMB: 500,
  });

  /** Settings both services need. Databases are reached over the private network. */
  const shared = {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info',
    APP_VERSION: '${{RAILWAY_GIT_COMMIT_SHA}}',
    DATABASE_URL: ref(Postgres, 'DATABASE_URL'),
    REDIS_URL: ref(Redis, 'REDIS_URL'),
  };

  const web = service('web', {
    source: { repo: REPO, branch: 'main' },
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile.web' },
    deploy: {
      region: REGION,
      // Applies pending migrations before the new version takes traffic.
      preDeployCommand: ['sh /app/migrate.sh'],
      healthcheckPath: '/api/health',
      healthcheckTimeout: 60,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 5,
    },
    variables: {
      ...shared,
      APP_URL: 'https://${{RAILWAY_PUBLIC_DOMAIN}}',
      CONTACT_EMAIL: 'delizadigital@gmail.com',
      EMAIL_FROM: 'DPOST <no-reply@dpost.local>',
      // Set with `railway variables`, never stored in this file.
      BETTER_AUTH_SECRET: preserve(),
      GOOGLE_CLIENT_ID: preserve(),
      GOOGLE_CLIENT_SECRET: preserve(),
      SMTP_URL: preserve(),
      ALLOW_MISSING_SMTP: preserve(),
    },
  });

  const worker = service('worker', {
    source: { repo: REPO, branch: 'main' },
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile.worker' },
    deploy: {
      region: REGION,
      restartPolicyType: 'ALWAYS',
    },
    variables: shared,
  });

  return project('DPOST', {
    resources: [Redis, Postgres, redisVolume, postgresVolume, web, worker],
  });
});
