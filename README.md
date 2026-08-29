# Hawelly

Hawelly is a managed cross-border money-transfer coordination platform.

The product connects senders with Hawelly's internal operations team. A sender submits a transfer request, receives a staff-prepared quote, accepts or rejects it, follows funding instructions, and tracks the transfer until payout is confirmed. Hawelly staff coordinate external payout associates outside the application during the initial release.

## Product model

Hawelly is intentionally **not** an automated crypto-settlement network and **not** an agent self-service platform.

Initial roles:

- **Sender** — creates transfer requests, reviews quotes, follows funding instructions, uploads proof when required, tracks status, and confirms recipient receipt.
- **Staff** — reviews requests, prepares quotes, confirms funding, coordinates payout externally, records payout evidence, manages exceptions, and communicates operational updates.
- **Admin** — has all staff capabilities plus user/staff management, configuration, security, audit, and operational oversight.

External payout/funding associates are operational contacts, not Hawelly users in v1. Communication with them happens through approved external channels such as WhatsApp, phone, or bank channels.

## Core workflow

1. Sender submits a transfer request.
2. Hawelly staff prepare a time-limited quote.
3. Sender accepts or rejects the quote.
4. On acceptance, Hawelly provides funding instructions.
5. Sender funds and submits proof/reference when applicable.
6. Staff confirm receipt of funds.
7. Staff coordinate payout with an external associate.
8. Staff record payout completion and evidence.
9. Sender and/or recipient confirmation provides an additional trust signal.
10. Transfer is completed, disputed, held, cancelled, or refunded as appropriate.

## Repository strategy

This repository is a clean implementation target. The existing `darkest-pearl/XBUX` repository is a **reference/donor only**.

Reusable XBUX concepts may be selectively ported after dependency review, including:

- authentication/session hardening
- compact web design system and modal patterns
- sender/admin portal layout concepts
- proof storage and signed URL patterns
- activity/audit logging
- release/env/PM2 tooling
- backup and proof-storage health checks
- smoke-test structure
- Android release/update mechanics

The following XBUX architecture must **not** be ported into Hawelly v1:

- crypto settlement rails
- settlement batches/reconciliation
- agent float and enforcement
- payout/funding agent portals
- crypto wallets
- agent commissions
- autonomous agent settlement workflows

## Engineering rules

- `docs/PRODUCT_SPEC.md` is the authoritative product contract.
- `docs/ARCHITECTURE.md` is the authoritative technical boundary document.
- `docs/EXECUTION_PLAN.md` defines milestone order and success criteria.
- Business semantics must not be silently changed by implementation agents.
- Every milestone must build, test, diagnose, fix, and re-test before the next milestone begins.
- Financial/audit actions must be explicit, attributable, and historically recoverable.
- Frontends must not directly access private financial database tables.

## Development

Prerequisites:

- Node.js 22.19.x (see `.nvmrc`)
- npm 10.x
- PostgreSQL 18.x (CI uses `postgres:18-alpine`)

Install and verify the complete workspace:

```powershell
npm ci
npm run db:migrate:deploy
npm run check
npm run smoke:health
```

Set `DATABASE_URL`, `AUTH_ACCESS_SECRET`, and `AUTH_RATE_LIMIT_PEPPER` before
running the API. The two auth secrets must be distinct and contain at least 32
bytes. Development placeholders in `apps/api/.env.example` are intentionally
rejected until replaced.

Database integration tests are enabled only by an explicit `TEST_DATABASE_URL`.
For safety, it must use PostgreSQL on a loopback host and name a database with a
`test` segment (for example, `hawelly_test`). The integration suites truncate
their isolated test data between cases and never fall back to `DATABASE_URL`.

Start the API and web application together:

```powershell
npm run dev
```

Local endpoints:

- Web: `http://127.0.0.1:3000`
- API liveness: `http://127.0.0.1:4000/health`
- API readiness: `http://127.0.0.1:4000/health/ready`
- Sender registration: `POST http://127.0.0.1:4000/auth/register`
- Login: `POST http://127.0.0.1:4000/auth/login`
- Current user: `GET http://127.0.0.1:4000/me`

Copy each app's `.env.example` to a local ignored env file only when configuration changes are needed. Every `NEXT_PUBLIC_*` web variable is bundled into browser code and must never contain credentials or private service configuration.

Public registration creates sender accounts only. Staff and admin accounts must
be provisioned through an explicitly authorized operational path; Hawelly does
not expose public privileged-role registration.

The native sender-only Android client lives in `apps/android-client`. With JDK 21
and Android SDK Platform 35 installed, its complete local gate is:

```powershell
cd apps/android-client
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleRelease --no-daemon
```

See `apps/android-client/README.md` for API-origin, release-signing, evidence,
session-storage, and update-distribution requirements.

## Status

Milestones 0 through 10 are complete. The working product now includes
sender-scoped recipient management, transfer requests, sender timelines, and
the staff new-request review queue, plus versioned staff quotes and sender
acceptance/rejection. Staff can now publish accepted-quote-derived funding
instructions, senders can submit a reference or private receipt, and authorized
staff can review proof and separately confirm funds received. Authorized staff
can now activate an accepted-quote-derived payout case after funds confirmation,
coordinate against an internal associate directory, retain private payout
evidence, hold/release the case, and report payout without prematurely marking
the transfer complete. Staff and sender confirmation signals, sender disputes,
audited operations resolution, immutable refund tracking, and admin-confirmed
completion/refunds now close the managed transfer lifecycle. Administrators can
now manage staff access and capabilities, activate immutable runtime-policy
versions, maintain funding templates and associates, review audit activity, and
monitor quote, funding, payout, dispute, and refund risk queues. A native,
sender-only Android client now mirrors the real sender lifecycle from account
access and recipient management through transfer request, quote decision,
funding proof, payout tracking, recipient confirmation, and dispute support.
It also consumes integrity-aware public update metadata without adding an
agent mode or any crypto, wallet, float, commission, settlement-batch, or
reconciliation architecture. The production boundary now also includes
deny-by-default PostgreSQL privileges, strong and separated server secrets,
private evidence filesystem modes, bounded sender resource creation, audit
redaction, HTTP request hardening, and a build-time client-secret gate.
