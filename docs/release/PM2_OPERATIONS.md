# PM2 operations

PM2 is pinned in the repository and invoked through `node_modules`; do not rely
on an unversioned global installation. `ecosystem.config.cjs` runs one API and
one Next.js web process in fork mode with bounded shutdown/listen timings and
memory restarts.

## Start, restart, and verify

Build first. Start a missing process:

```powershell
npm run release:pm2:api:start
npm run release:pm2:web:start
```

After changing an ignored environment file, validate it and restart explicitly:

```powershell
npm run release:audit
npm run release:pm2:api:restart
npm run release:pm2:web:restart
npm run release:pm2:env -- --process hawelly-api
npm run release:pm2:env -- --process hawelly-web
```

The restart scripts use `--update-env`; a plain `pm2 restart` is not an approved
configuration-change procedure. Compare secret fingerprints with the approved
rotation record, never with a copied secret value. The inspection command does
not print database URLs or server secrets.

Run `npm run release:health -- --url <public-api-origin>` before saving the PM2
state. If a process crash-loops, stop the release, inspect bounded recent logs,
and fix the configuration or application revision. Do not disable restart,
health, authorization, or storage controls to make a process appear healthy.

Useful bounded commands:

```powershell
node node_modules/pm2/bin/pm2 status
node node_modules/pm2/bin/pm2 logs hawelly-api --lines 100 --nostream
node node_modules/pm2/bin/pm2 logs hawelly-web --lines 100 --nostream
node node_modules/pm2/bin/pm2 delete hawelly-api
node node_modules/pm2/bin/pm2 delete hawelly-web
```

Use a dedicated unprivileged operating-system account. Keep PM2 home, source,
environment files, logs, and evidence storage readable only by that account and
the authorized operations group. Log retention and forwarding are host policy;
logs must not include credentials, raw evidence, or full financial references.
