# Milestone 3 — Recipients and transfer requests

## Scope

Milestone 3 introduces the first authenticated Hawelly workflow backed by the
database:

- sender-owned recipient creation, listing, detail, update, and deletion;
- sender-owned transfer-request creation, history, detail, and cancellation;
- a staff/admin new-request queue and request review actions;
- deterministic corridor, currency, payout-method, amount, and quote-SLA rules;
- sender-safe transfer timelines derived from immutable activity events; and
- one central transfer state-transition policy for this and later milestones.

Quote economics, quote acceptance/rejection, funding, payout, and settlement
work remain outside this milestone. XBUX remains reference-only, and no agent,
wallet, float, commission, reconciliation, settlement-batch, or crypto
architecture is introduced.

## API contract

All routes require a current database-backed access session. Sender routes also
require the `SENDER` role. Object lookups include the authenticated sender ID in
the database predicate so route parameters can never grant ownership.

| Route | Authority | Result |
| --- | --- | --- |
| `GET /recipients` | sender | bounded list of owned recipients |
| `POST /recipients` | sender | create an owned recipient |
| `GET /recipients/:id` | owning sender | recipient detail; otherwise `404` |
| `PATCH /recipients/:id` | owning sender | update mutable recipient fields |
| `DELETE /recipients/:id` | owning sender | delete only when not referenced |
| `GET /transfers` | sender | bounded history of owned requests |
| `POST /transfers` | sender | create a validated request and quote SLA |
| `GET /transfers/:id` | owning sender | sender-safe detail and timeline |
| `POST /transfers/:id/cancel` | owning sender | centrally validated cancellation |
| `GET /operations/transfers` | staff/admin + `TRANSFER_REVIEW` | bounded new-request queue |
| `GET /operations/transfers/:id` | staff/admin + `TRANSFER_REVIEW` | operational request detail |
| `POST /operations/transfers/:id/review` | staff/admin + `TRANSFER_REVIEW` | request information, begin quoting, or decline |

Staff capability checks are authoritative. Admin receives capabilities through
the existing authentication service. UI navigation or route choice is never
treated as authorization evidence.

## Validation and configuration

The transfer workflow receives a validated configuration object at startup.
It contains a positive quote-SLA duration and explicit origin/destination
corridors with allowed send currencies and destination payout methods. The
default beta corridor is `AE -> PH`, sending `AED`, with bank transfer, cash
pickup, and mobile money payout. Deployments can provide a validated JSON
corridor list and SLA through environment configuration; later admin
configuration work can supply the same service contract without changing route
or domain logic.

Country and currency codes are normalized uppercase ISO-style codes. Monetary
input is a positive base-10 minor-unit string, avoiding JavaScript number
rounding. Recipient payout details use strict method-specific schemas; unknown
keys are rejected. Recipient country and payout method must be supported by at
least one configured destination corridor, and a transfer recipient's country
and payout method must exactly match the requested destination and method. Each
request stores an immutable JSON snapshot of the selected recipient's identity
and payout instructions, so later recipient edits affect only future requests
and cannot rewrite operational history.

`quoteDueAt` is computed once as `service clock + configured SLA minutes` inside
the creation transaction. Tests inject both clock and configuration so the
deadline is deterministic.

## State and audit contract

Every status change goes through the transfer domain module. Routes and
services request an action; the module resolves its target state or rejects the
transition. Milestone 3 exposes:

- sender cancellation where the lifecycle permits it;
- staff request-for-information (`REQUESTED -> NEEDS_INFO`);
- staff begin-quoting (`REQUESTED|NEEDS_INFO -> QUOTING`); and
- staff decline from the request-review states with a required reason.

Hold rules are encoded centrally for the later operational states allowed by
the architecture, but Milestone 3 does not invent a `REQUESTED -> ON_HOLD`
transition. Releasing a hold requires preserved prior-state context and remains
a later operational workflow.

Recipient mutations, request submission, state changes, denied object access,
and material failures write append-only activity events. State events include
safe previous/next state snapshots and a reason where required. Sender timeline
responses use an explicit action allowlist and projection; they never return
raw audit metadata, internal notes, actor identity, IP hashes, or staff-only
reasons.

## Response and privacy rules

- BigInt money values are serialized as decimal strings.
- Sender transfer projections exclude internal notes, staff identities,
  capability data, audit metadata, and future internal quote rationale.
- Staff queue results include only decision-critical sender, recipient,
  corridor, amount, status, creation, and SLA fields.
- Cross-user recipient and transfer identifiers return the same `404` shape as
  nonexistent identifiers.
- Validation and conflict errors use stable public codes and do not expose
  Prisma errors, SQL, or configuration secrets.
- Recipient deletion returns a conflict while the recipient is referenced by a
  transfer request; transfer history is never cascaded away.

## Verification target

The milestone gate requires unit tests for configuration and the complete state
matrix, database integration tests for CRUD/workflow/audit behavior, explicit
cross-sender and capability-denial attacks, a sender-to-staff workflow smoke
path, web interaction and responsive-browser checks, Prisma validation and
migration reconstruction, lint/typecheck/tests/build, dependency audit and
integrity checks, a proportional security diff review, artifact hygiene, and a
clean checkpoint merged into `main`.
