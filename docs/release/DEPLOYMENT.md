# Production deployment

This is the repeatable single-host deployment path for the Hawelly API and web
applications. PostgreSQL and private evidence storage remain external durable
state. Run commands from the repository root at an immutable reviewed revision.

## First deployment

1. Install Node.js 22 and npm 10, PostgreSQL 18 client tools, and access to the
   PostgreSQL 18 server.
2. Run `npm ci`.
3. Copy `apps/api/.env.production.example` to the ignored `apps/api/.env` and
   `apps/web/.env.production.example` to the ignored `apps/web/.env`. Supply
   database credentials and three independently generated secrets through the
   approved secret-management channel. Never commit either file.
4. Create the absolute evidence directory outside the repository, restrict it
   to the API service account, and include it in the host backup policy.
5. Run `npm run release:audit`. It validates production origins, private storage,
   database configuration, secret strength/separation, ingress identity, and
   Android update integrity without printing secret values.
6. Run `npm run check` and `npm run build`.
7. Before a migration, run the backup procedure in `BACKUP_RESTORE.md`. Then run
   `npm run db:migrate:deploy`.
8. Start the services with `npm run release:pm2:api:start` and
   `npm run release:pm2:web:start`.
9. Run `npm run release:health -- --url https://api.example.com`. All three
   liveness, database readiness, and private-storage probes must pass.
10. Inspect the loaded runtime configuration with
    `npm run release:pm2:env -- --process hawelly-api` and the corresponding web
    process. Secret fields show only length and a short SHA-256 fingerprint.
11. Run `node node_modules/pm2/bin/pm2 save` only after verification. Configure
    host startup using PM2's operating-system-specific startup command and the
    dedicated service account.

## Subsequent release

1. Fetch and check out the reviewed revision; retain the prior immutable
   revision for application rollback.
2. Run `npm ci`, `npm run release:audit`, `npm run check`, and `npm run build`.
3. Create and verify a pre-release database backup.
4. Run `npm run db:migrate:deploy`.
5. Restart the API and web processes with the `release:pm2:*:restart` scripts.
   These always pass PM2's `--update-env` option.
6. Inspect the environment summaries, then run the external health check.
7. Save the healthy PM2 process list.

Application rollback means checking out the prior compatible revision, running
`npm ci` and `npm run build`, then using the same restart and verification flow.
Do not reverse or edit an applied migration ad hoc. A database restore is a
maintenance-window recovery operation described separately.

The edge proxy must terminate TLS, preserve the configured exact origins, set
the single trusted client-IP header, and replace rather than append untrusted
copies of that header. The API should be reachable only by the web BFF and
approved operators; the evidence directory must never be served as static
content.
