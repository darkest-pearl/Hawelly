# Milestone 1 — Database foundation and authentication

## Outcome

Milestone 1 establishes the PostgreSQL/Prisma domain foundation and a
database-checked authentication boundary for the only supported roles:
`SENDER`, `STAFF`, and `ADMIN`.

The API exposes sender-only registration, password login, rotating refresh
sessions, targeted logout, logout-all, and an authenticated `/me` projection.
Staff capabilities are current database grants; admin access is an explicit
policy bypass, and senders can never inherit a staff capability from a stray
grant row.

## Donor decisions

The XBUX repository remained read-only. Hawelly reused only general patterns:

- database-checked sessions and current account status;
- generic credential failures;
- short-lived access tokens and rotating refresh sessions;
- request correlation and durable activity events;
- role and capability middleware structure.

Hawelly independently replaced donor weaknesses with Argon2id, unknown-user
dummy verification, database-backed rate limits, refresh-family replay
detection, issuer/audience/type-bound JWT verification, secret validation, and
metadata redaction.

No XBUX crypto settlement, authenticated agent/recipient portal, settlement
batch, wallet, float, commission, or reconciliation component was imported.
External associates remain staff-managed contact records and are not users.

## Data and authorization model

- Money is stored in integer minor units; FX rates use fixed precision.
- Email, country, currency, amount, session-lifetime, recipient-ownership, and
  uniqueness invariants are enforced in the database where practical.
- Accepted quote financial fields, status, and acceptance timestamp are
  immutable through PostgreSQL triggers. Composite constraints keep accepted
  quotes, funding instructions, and funding proofs on their owning transfer and
  sender.
- `ActivityEvent` is append-only through database update/delete guards.
- Access tokens contain user/session/version identifiers, not authoritative
  role or capability claims.
- Every protected request reloads the active session, current account role and
  status, and current staff capability grants.
- Inactivation, logout, logout-all, role changes, and capability revocation take
  effect for already-issued access tokens.

## Authentication controls

- Argon2id uses 19 MiB memory, two iterations, and one degree of parallelism.
- Access tokens expire after 15 minutes by default.
- Refresh tokens contain 256 bits of random secret material; only SHA-256 token
  hashes are persisted.
- Refresh tokens rotate once. The first detected reuse or concurrent loser
  revokes the complete session family and increments the user session version;
  a persisted replay marker makes repeated submissions idempotent.
- Registration admission is serialized and counted before Argon2 work.
- Login throttling uses transaction-scoped advisory locks and atomic PostgreSQL
  counters keyed by HMAC-derived IP, normalized IP-plus-identifier, and
  identifier-only values. Raw IP and email values are not stored in limiter
  keys, and the account bucket follows attempts across changing source IPs.
- Authentication errors use generic public messages and `Cache-Control:
  no-store`; audit metadata recursively redacts credential-like keys.
- Forwarded IP headers are ignored because Express trusted-proxy support is
  disabled.

## Verification evidence

- Prisma schema validation and client generation pass.
- The initial migration deploys from an empty PostgreSQL database.
- Seventeen PostgreSQL tests cover registration admission, all three role
  logins, generic failures, inactive denial, sequential/concurrent/distributed
  rate limiting, refresh rotation/replay/racing, idempotent replay response,
  targeted and global revocation, live capability removal, sender/admin
  boundaries, audit redaction, immutable activity events, and transfer/quote/
  funding ownership invariants.
- The complete API suite contains 35 tests and runs both with and without a
  configured database. Database cases require a loopback, test-named
  `TEST_DATABASE_URL` and skip when it is absent.
- Workspace lint, typecheck, builds, built-API health smoke, production and full
  dependency audits, and secret/forbidden-domain scans pass at the checkpoint.

## Operational notes

Production startup requires an explicit PostgreSQL URL and distinct auth
secrets of at least 32 bytes. CI starts PostgreSQL, applies the real migration,
then runs the complete check and built-process health smoke. Public privileged
account creation is intentionally absent; staff/admin provisioning belongs to a
later explicitly authorized administrative workflow.
