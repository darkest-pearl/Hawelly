# Milestone 10 — Security and data exposure hardening

## Outcome

Milestone 10 closes the production-facing authorization, database privilege,
evidence storage, secret, request-abuse, audit, dependency, and client-bundle
boundaries without changing Hawelly's backend-centric financial architecture.
The web and Android clients still call Hawelly APIs only; neither contains a
database client, database credential, Supabase service role, or server signing
secret.

## Authorization and database boundary

The route and service review traced sender ownership, staff capability, admin
authorization, session freshness, BFF forwarding, evidence access, and
financial-state transitions. No surviving API authorization bypass was found.
Server-side role and capability checks remain authoritative.

Migration `20260829110000_database_privilege_hardening` revokes existing schema,
table, sequence, function, and type access from `PUBLIC`, plus `anon` and
`authenticated` when those managed-platform roles exist. It also revokes the
corresponding default privileges so future migration-created objects do not
silently reopen the boundary. Hawelly does not ship Supabase client access and
does not add permissive RLS policies. `FORCE ROW LEVEL SECURITY` is deliberately
not enabled because the API currently connects through the schema-owning
backend role; production deployment must still verify its real role membership
and grants.

A disposable PostgreSQL 18 database created solely from the 13 migrations was
reported up to date. Catalog integration tests confirm that `PUBLIC`, `anon`,
and `authenticated` have no effective public-schema object privileges declared
by the migration set.

## Evidence, secrets, and audit data

The local evidence adapter confines UUID-derived object keys beneath the
configured root, creates directories with mode `0700` and files with mode
`0600` on permission-capable systems, and never mounts that root as public web
content. Production requires an absolute `EVIDENCE_STORAGE_ROOT`. Upload and
read capabilities remain short-lived, operation/object/expiry-bound HMACs and
are issued only after ownership or capability authorization. Automatic
retention deletion remains intentionally absent; backups and any future object
store must preserve equivalent private access controls and an approved audited
retention policy.

Server secrets now use one shared validator with a minimum 32-byte requirement
and explicit placeholder/example rejection. The evidence signing secret cannot
reuse the access-token secret or rate-limit pepper. `NODE_ENV` accepts only
`development`, `test`, or `production`, preventing misspelled production modes
from activating development defaults.

Audit metadata, state snapshots, and free-text reasons redact credential, PII,
financial-reference, object-key, bearer/JWT, query-secret, and private-key
material before truncation and persistence. Tests verify that raw credentials,
tokens, and sensitive values are absent.

## Request and resource controls

Express rejects malformed JSON with a stable `400`, oversized bodies with a
stable `413`, applies no-store and baseline browser security headers globally,
and production adds HSTS. The Node server bounds header, request, keep-alive,
and per-socket request lifetimes.

Authenticated sender writes now have configurable recipient totals, recipient
creation windows, active-transfer totals, and transfer creation windows.
Transaction-scoped PostgreSQL advisory locks serialize checks and writes per
sender so concurrent requests cannot overrun a quota. Velocity rejection uses
`429` plus `Retry-After`; active/total resource exhaustion uses a stable `409`.
The race test proves exactly one concurrent recipient create succeeds at a
one-write window and exactly one transfer create succeeds at a one-active-work
limit.

## Client and supply-chain boundary

`npm run security:client-boundary` scans tracked web/Android inputs and generated
web/Android artifacts for database URLs, service-role identifiers, auth and
evidence secrets, rate-limit peppers, and risky public environment names. It is
part of the root check and CI, and passed against 80 tracked client files and
191 generated artifacts. CI action runtimes use the maintained Node 24-based
major versions.

Both production-only high-severity and complete critical-severity npm audits
reported zero vulnerabilities. `npm ci --dry-run --ignore-scripts` confirmed
lockfile/install integrity.

## Security scan and remediation verification

The standard Codex Security scan pinned revision
`a96de4b25106eb0ba3737f83452b4730ebd6c72f`, inventoried all 191 tracked files,
and completed with no deferred source coverage. It identified three unique
medium-severity control failures:

1. migration-owned database privilege denial was absent;
2. the documented evidence signing placeholder passed production validation;
3. sender recipient/transfer creation had no aggregate resource budget.

The generated workbench report contains six entries because the three initial
checkpoint identities were retained beside their enriched equivalents during
final report assembly. They map one-to-one to the three candidate families
above; there are no additional unique findings. Each family was independently
revalidated against the current working tree and is closed by the migration,
secret tests, and concurrent quota tests described above. The scan was against
the original Milestone 9 snapshot, so its findings correctly describe the
pre-remediation revision.

## Verification evidence

- Prisma validation and generation, lint, API/web typecheck, all 94 API tests,
  all 79 web tests, both production builds, and the client-boundary scan pass.
- Built API health smoke passes with a bounded child process.
- A fresh database applies all 13 migrations and all three schema/ACL tests
  pass.
- Android debug unit tests, lint, and release assembly pass with a no-daemon
  Gradle invocation.
- Production and full dependency audits report zero vulnerabilities; the
  package-lock dry-run install succeeds.
- No dev server, watcher, browser, emulator, scanner, disposable database,
  local evidence file, APK/build output, log, secret, or scan artifact is part
  of the milestone checkpoint.
