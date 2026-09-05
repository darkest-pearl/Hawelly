# Milestone 12 — Full-system beta verification

## Outcome

Hawelly's beta workflow is verified end to end using its real HTTP handlers,
PostgreSQL schema, private evidence adapter, authorization services, financial
state transitions, and audit history. The milestone adds no product behavior or
new trust boundary; it consolidates the completed product into a named,
repeatable beta smoke gate.

## Core workflow smoke

The new uninterrupted smoke case performs this sequence without direct state
shortcuts:

```text
bootstrap admin
→ admin provisions capable staff
→ sender registers
→ sender creates recipient and request
→ request appears in staff queue
→ staff reviews, creates, and sends quote
→ sender accepts quote
→ admin creates confirmed funding template
→ staff publishes accepted-quote funding instructions
→ sender uploads private funding proof
→ staff verifies proof and confirms funds received
→ staff creates associate and payout case
→ staff uploads private payout evidence
→ staff places and releases an operational hold
→ staff reports the exact payout
→ staff requests recipient confirmation
→ sender confirms receipt
→ transfer reaches COMPLETED
→ admin audit contains the material actions
```

The case also verifies cross-sender transfer/evidence denial, sender denial from
admin routes, sender-safe projections, private storage health, and the absence
of associate contact, payout reference, funding account, and internal-note data
from the sender detail.

`npm run smoke:beta` runs the four database-backed beta suites. Together their
41 tests cover the full workflow plus registration/session security, quote
rejection and expiry, proof resubmission/rejection, cancellation rules,
hold/release, dispute/refund, concurrent transitions, staff capability denial,
cross-user and evidence denial, admin confirmation/reason requirements,
configuration history, audit entries, database immutability, and database
privilege denial.

## Rendered UI review

The production web build was reviewed in local Chrome through Playwright Core;
the dedicated Browser plugin skill was unavailable. A disposable PostgreSQL 18
database was seeded only through the beta integration workflow, then the built
API and built Next.js server were started on loopback.

The following surfaces passed at 1440×1000: sender transfer detail and activity,
staff queue/search/detail drawer, and admin risk/access/audit console. The sender
dashboard and expanded navigation also passed at 390×844. Page identity,
meaningful content, error-overlay absence, horizontal overflow, login, search,
detail opening, admin refresh, and mobile-navigation interaction were checked.
There were no relevant runtime warnings/errors. Eight expected anonymous `401`
resource messages occurred while the four login gates probed session state
before authentication; every subsequent login and data request succeeded.

Visual inspection found no clipping, overlapping controls, unreadable text,
unexpected domain language, or broken responsive state. Screenshots were kept
in the system temporary directory only for inspection and deleted afterward.

## Release and recovery evidence

- A fresh Milestone 12 production-style API/web environment passed
  `npm run release:audit` without printing secret values.
- The immediately preceding, unchanged Milestone 11 release checkpoint proved
  `/health`, `/health/ready`, and `/health/storage` against a live built API and
  fresh database; the storage probe performed and removed a real private file.
- That checkpoint also applied all 13 migrations to PostgreSQL 18, created a
  non-empty custom-format backup and SHA-256 manifest, restored it into a second
  database with `pg_restore --exit-on-error`, and verified all migrations plus
  the core transfer table. Milestone 12 changes only tests, package scripts, and
  documentation, so repeating the same backup implementation proof would add no
  coverage.
- Production runtime dependency audit remains zero at the high threshold; the
  full graph has no critical vulnerability. The recorded optional Prisma/MySQL
  tooling advisory and its non-applicability remain as documented in Milestone
  11.

## Known limitations

The operator/tester limitations remain current in
`docs/release/BETA_LIMITATIONS.md`: managed staff coordination, no agent or
crypto architecture, expiring quotes, staff-confirmed funding, best-effort
notifications, separately backed-up private evidence, controlled Android
distribution, runtime-limited corridors, and explicit legal/compliance approval
for any real funds or personal data.

## Cleanup and security review

No temporary browser script/session, screenshot, API/web server, PostgreSQL
cluster, evidence object, environment file, backup, log, or scan artifact is in
the checkpoint. Proportional diff review found no production-code,
authorization, credential, financial-integrity, or storage-boundary change.
