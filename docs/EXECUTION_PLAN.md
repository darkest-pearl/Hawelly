# Hawelly Execution Plan

**Goal:** Build a beta-ready Hawelly implementation rapidly without inheriting obsolete XBUX domain complexity.

## Operating model

GPT-5.6 Sol/Codex acts as the primary implementation orchestrator.

For each milestone it may delegate parallel specialist work, but the milestone is not complete until the orchestrator has:

1. inspected relevant existing code and donor code;
2. written/updated the design for that milestone;
3. implemented it;
4. built/typechecked;
5. run tests;
6. diagnosed failures;
7. fixed failures;
8. rerun tests;
9. reviewed security/authorization implications;
10. verified milestone success criteria;
11. committed coherent changes before proceeding.

The orchestrator may write its own next-step prompts and continue automatically. It must not silently alter `docs/PRODUCT_SPEC.md` or `docs/ARCHITECTURE.md` to make an implementation easier. Requirement changes require explicit human approval.

## Donor strategy

Reference repository: `darkest-pearl/XBUX`

Target repository: `darkest-pearl/Hawelly`

XBUX is read/reference-only during the Hawelly implementation unless explicitly instructed otherwise.

Reuse means selective transplantation, not repository forking.

Before importing donor code, record:

- source path;
- Hawelly target path;
- dependencies;
- obsolete XBUX domain concepts removed;
- tests added/updated.

## Milestone 0 — Repository bootstrap

Deliver:

- npm workspace/monorepo structure;
- `apps/api`;
- `apps/web`;
- `apps/android-client` placeholder or initial sender shell;
- TypeScript/config/lint conventions;
- `.gitignore` / env examples;
- base CI/build scripts;
- README/dev setup;
- initial health endpoint.

Prefer compatible modern dependency versions rather than copying stale lockfiles wholesale.

Success criteria:

- clean install;
- API build passes;
- web build passes;
- health endpoint runs locally;
- no secrets committed.

## Milestone 1 — Database foundation + authentication

Deliver:

- Prisma schema for v1 core entities;
- initial migration;
- secure password login/session model;
- roles `SENDER | STAFF | ADMIN`;
- refresh/session revocation;
- login rate limiting;
- authenticated `/me` endpoint;
- basic staff/admin capability model;
- auth activity events.

Reuse XBUX auth/session patterns only after removing obsolete roles.

Success criteria:

- sender/staff/admin login works;
- invalid credentials are generic;
- inactive users denied;
- rate limiting tested;
- session revocation tested;
- role/capability boundaries tested.

## Milestone 2 — Shared web design system + portal shells

Deliver:

- Hawelly branding;
- compact UI primitives;
- sender shell;
- staff/admin shell;
- modal/detail pattern;
- compact tables/cards/forms;
- admin action confirmation pattern;
- responsive behavior.

Reuse XBUX UI style selectively.

Success criteria:

- no agent/settlement/float navigation exists;
- admin/staff and sender shells build;
- layouts are compact and professional;
- no long explanatory copy in operational tables.

## Milestone 3 — Recipients + transfer request

Deliver:

- recipient CRUD scoped to sender;
- create transfer request;
- supported origin/destination validation;
- amount/currency validation;
- quote SLA (`quoteDueAt`);
- sender request history/detail;
- staff new-request queue;
- `NEEDS_INFO`, decline, cancel/hold foundations;
- audit/timeline events.

Success criteria:

- cross-user recipient/transfer access denied;
- sender can submit valid request;
- staff sees it immediately;
- SLA is deterministic/configurable;
- state transition rules enforced centrally.

## Milestone 4 — Quote workflow

Deliver:

- quote versioning;
- draft/send quote;
- quote expiry;
- sender quote view;
- accept/reject;
- accepted quote immutability;
- re-quote/supersede path;
- notification events.

Success criteria:

- only active unexpired quote can be accepted;
- accepted quote financial fields are immutable;
- sender sees send/fee/receive/expected-by/expiry clearly;
- staff can issue replacement quote without rewriting history.

## Milestone 5 — Funding workflow + evidence

Deliver:

- funding-instruction configuration/template model;
- per-transfer funding instruction snapshot;
- sender funding reference/proof submission;
- private evidence storage;
- signed upload/read URL path;
- staff funding review;
- verify/resubmit/reject;
- funds-received confirmation.

Success criteria:

- proof submission alone never becomes funds-confirmed;
- private evidence not publicly accessible;
- sender cannot access another sender's evidence;
- staff review actions are audited;
- storage healthcheck available.

## Milestone 6 — Managed payout operations

Deliver:

- internal associate/contact directory;
- payout case creation after funds confirmation;
- staff ownership/status;
- external reference tracking;
- payout evidence;
- payout report/completion;
- expected delivery/SLA visibility;
- holds/exceptions.

No external associate login/portal.

Success criteria:

- payout cannot follow invalid state path;
- associate contact is internal-only;
- payout evidence/reference is auditable;
- sender receives only appropriate status information.

## Milestone 7 — Confirmation, dispute, refund

Deliver:

- staff confirmation signal;
- sender recipient-received confirmation;
- confirmation source history;
- dispute creation/management;
- hold/release;
- refund pending/refunded states;
- admin reasons/confirmations for dangerous actions.

Optional if capacity permits after minimum v1:

- recipient one-time confirmation token/OTP.

Success criteria:

- confirmation source preserved;
- disputes do not destroy original transaction history;
- refund/override actions auditable;
- sender/internal notes remain separated.

## Milestone 8 — Admin/staff configuration and operations

Deliver:

- staff management;
- capability management;
- supported countries/currencies/methods;
- quote SLA/default expiry;
- funding instruction templates;
- associate directory;
- audit/activity UI;
- operational risk/SLA dashboard;
- notification/broadcast configuration where appropriate.

Success criteria:

- dangerous admin changes require reason/confirmation;
- internal tables remain compact;
- overdue quote/funding/payout work is visible.

## Milestone 9 — Android sender client

Deliver sender-only Android workflow:

- auth;
- dashboard;
- recipient management;
- transfer request;
- quote decision;
- funding instruction/proof;
- transfer timeline;
- confirmation;
- profile/security;
- app update mechanism.

Success criteria:

- no agent role/mode exists;
- core sender flow matches web semantics;
- release APK builds;
- update metadata works.

## Milestone 10 — Security and data exposure hardening

Deliver:

- authorization review;
- Supabase/Postgres RLS/privilege audit;
- no unrestricted anon access to private financial tables;
- storage policy review;
- dependency audit;
- secret/env audit;
- request limits/input validation;
- audit redaction review;
- security-focused smoke/integration tests.

Success criteria:

- anon/public Supabase access cannot read private app tables;
- backend API still passes full smoke;
- service role not present in client bundles;
- evidence remains private;
- no known critical dependency vulnerability accepted without documented exception.

## Milestone 11 — Release/ops tooling

Deliver/adapt from XBUX:

- safe env loader;
- PM2 start/restart discipline;
- redacted env inspection;
- proof-storage healthcheck;
- DB backup helper;
- release audit;
- health/readiness;
- backup/restore runbook;
- beta tester onboarding/limitations docs.

Success criteria:

- repeatable deploy path;
- backup works with current DB server/client version;
- storage check passes;
- environment changes reliably reach running process.

## Milestone 12 — Full-system beta verification

Create a clean end-to-end smoke suite representing the actual Hawelly workflow:

```text
register/login sender
-> create recipient
-> submit request
-> staff quote
-> sender accept
-> funding instructions
-> sender proof
-> staff funding confirmation
-> payout case
-> payout evidence/report
-> sender confirmation
-> complete
```

Also test:

- quote rejection/expiry;
- proof resubmission;
- hold/release;
- cancellation policy;
- dispute/refund;
- authorization failures;
- staff capability failures;
- evidence access failures;
- admin audit entries.

Success criteria:

- all builds pass;
- all core smoke tests pass;
- release audit passes;
- storage healthcheck passes;
- backup succeeds;
- manual UI review completed;
- known limitations documented.

## Parallel work guidance

Parallelize only independent tasks.

Good parallel examples:

- UI shell work while API domain schema is being finalized;
- unit tests for state machine alongside API route implementation;
- Android UI after stable API contract exists;
- docs/release tooling after core runtime contracts stabilize.

Avoid parallel edits to the same central files (Prisma schema, transfer state machine, auth middleware) unless the orchestrator explicitly coordinates the merge.

## Stop conditions

The autonomous loop should stop and request human input only for:

- contradictory product requirements;
- irreversible/destructive production operation;
- real credential/payment/account authorization not available to Codex;
- legal/compliance decisions requiring human/business counsel;
- material product decision not covered by the authoritative docs.

Build/test failures are not stop conditions: diagnose and fix them.
