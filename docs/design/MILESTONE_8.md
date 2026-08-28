# Milestone 8 — Administration and runtime configuration

## Administrative boundary

The administration API is mounted behind authenticated `ADMIN` role checks and
repeats the role assertion inside the service layer. Staff capability names do
not grant access to admin routes. Staff creation, suspension/reactivation,
capability grant/revoke, configuration activation, and funding-template status
changes require explicit confirmation and a bounded audit reason.

Staff status and capability changes increment the affected user's session
version and revoke active sessions in the same transaction. The next request
therefore reloads authoritative role, status, operational status, session
version, and capabilities instead of trusting stale browser state. Admin
responses omit password hashes, tokens, evidence object keys, and internal
session records.

## Versioned runtime policy

Each configuration activation creates a new snapshot. A serializable
transaction and advisory lock allocate versions and switch the single active
row. A partial unique index permits only one active snapshot, while a database
trigger prevents deletion, modification of historical policy fields, and
reactivation of an inactive snapshot.

Snapshots define supported origin/destination countries, currencies, payout
methods by destination, quote SLA and default expiry, evidence content types
and byte limit, optional transfer limits by currency, and broadcast or
maintenance copy. Activation validates country/currency/enum mappings and may
only narrow the environment-owned evidence ceilings. Broadcast and maintenance
copy is retained as configuration; it is not presented to senders until a
separate notification delivery surface is designed.

A single database-backed runtime provider supplies the active policy to
recipient/transfer validation, quote expiry, funding evidence, and payout
evidence. Environment defaults remain the fallback before the first snapshot.
Submitted transfer and quote economics remain immutable snapshots and are not
rewritten when policy changes.

## Operations administration

The admin console provides compact staff/capability, funding-template,
associate-directory, configuration, and immutable activity tables. The risk
dashboard exposes overdue quote work, funding attention, overdue payouts,
active disputes, and pending refunds with actionable references and due times.
The responsive layout keeps wide administrative tables horizontally contained
without expanding the document viewport.

Funding instruction templates are internal, version-independent operational
records. Creation and activation changes are audited. Associate administration
uses the existing capability-checked payout directory boundary; status changes
require confirmation and reason, and payout reporting revalidates the selected
associate against the live route, currency, method, and status.

## Security review

The proportional Milestone 8 review traced every changed file across the web
BFF allowlist, admin router/service, authentication state, configuration
storage, and all four runtime consumers. No reportable security finding
survived review. Verified controls include authoritative admin-only server
authorization, strict request schemas, reason/confirmation enforcement,
immediate session invalidation after access changes, immutable version history,
one-active configuration enforcement, audit redaction/immutability, and
environment ceilings on evidence policy.

The review also confirmed that the flattened country/currency policy is an
intentional product model rather than a hidden corridor matrix. No crypto
settlement, agent portal, settlement batch, wallet, float, commission, or
reconciliation architecture was introduced.

## Verification

The complete milestone gate passes: Prisma validation/generation, lint,
typecheck, 83 API tests, 79 web tests, and both production builds. A disposable
PostgreSQL database was created from all 12 migrations, reported up to date,
and verified to contain the admin configuration table, one-active index, and
snapshot immutability trigger before being dropped.

Production browser QA passed at 1440×1000 and 390×844. Admin login, responsive
navigation, activity anchoring, refresh, risk cards, and compact queue rows all
worked without framework errors or horizontal document overflow. Temporary
servers, browser processes, captures, QA scripts, and the disposable database
were removed. No dependencies changed in this milestone; the shared lockfile's
production audit also passed in the immediately preceding green `main` CI run.
