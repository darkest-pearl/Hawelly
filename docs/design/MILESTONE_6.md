# Milestone 6 — Managed payout operations

## Operational workflow

Authorized staff start a payout case only after funds are confirmed. The case
copies the recipient amount/currency from the accepted quote and the payout
method from the transfer snapshot. Those committed economics and the transfer
association are immutable. Starting the case moves the transfer from
`FUNDS_CONFIRMED` to `PAYOUT_IN_PROGRESS` under a transfer row lock.

The internal associate directory records supported countries, cities, payout
methods, currencies, contact channels, status, and trust notes. It has no login
or external portal. Associate list/create/update routes require explicit
`ASSOCIATE_VIEW` or `ASSOCIATE_MANAGE` capability. Payout actions require
`PAYOUT_MANAGE`; capability denials and all material mutations are audited.

Payout cases track staff ownership, compatible associate, expected delivery,
external reference, internal notes, and a deliberately separate sender-facing
note. Staff can update an active case. Placing or releasing a hold additionally
requires `TRANSFER_HOLD` and a reason, so payout authority alone cannot disrupt
or resume processing. Staff can release that payout-specific hold back to its
prior in-progress state. The
sender sees the delivery target and sender-facing status only—not associate
identity/contact details, external references, internal notes, staff ownership,
or evidence metadata.

## Evidence and reporting

Staff can record an external payout reference, a PDF/JPEG/PNG receipt, or both.
Receipts use the same backend-only evidence root and bounded content validation
as funding proof, but have distinct UUID-derived payout object keys and signed
URL routes. Signed grants bind operation, evidence ID, immutable object key,
and expiry. Read grants require `PAYOUT_MANAGE`; raw storage keys never enter API
projections.

Payout reporting locks and revalidates that the assigned associate remains
active and compatible, then requires an uploaded receipt or retained external
reference. The completed amount and currency must
exactly match the accepted-quote-derived payout commitment, and completion time
cannot predate the case or be materially in the future. Reporting atomically
moves the payout case to `REPORTED` and transfer to `PAYOUT_REPORTED`. This is a
staff operational confirmation that payout was sent; it intentionally does not
mark the transfer `COMPLETED`. Sender confirmation remains Milestone 7.

Database constraints require coherent completion and evidence metadata.
Triggers enforce payout-case state transitions, freeze financial and completion
snapshots, freeze evidence metadata after creation/upload, and prevent deletion
of recorded payout evidence history.

## Verification

Database-backed integration coverage exercises invalid-state rejection,
capability denial/audit, accepted-quote payout derivation, sender isolation and
projection privacy, signed receipt upload/read and tamper rejection, holds and
release, exact-economics reporting, immutable snapshots, retained evidence, and
terminal-state rejection. A focused independent review identified two gaps:
hold actions lacked the separate `TRANSFER_HOLD` gate and reporting did not
revalidate a suspended associate. Both controls were added and independently
exercised before the final gate.

The complete lint, typecheck, database-backed test, and production-build gate
passes. A disposable database was created from all ten migrations and removed
after successful reconstruction. Live QA covered the populated staff payout
case at 1440px and the sender payout/timeline at 390px with no horizontal
overflow or page errors. The only browser console noise was the expected
unauthenticated bootstrap 401 before each fresh context established a session.
