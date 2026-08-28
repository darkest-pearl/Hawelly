# Milestone 7 — Confirmation, dispute, and refund

## Completion policy

Payout reporting creates an immutable `STAFF` confirmation signal but keeps the
transfer at `PAYOUT_REPORTED`. Authorized payout staff explicitly request the
recipient-received signal, moving the transfer to `CONFIRMATION_PENDING`. The
owning sender can then confirm “My recipient received the money,” creating a
distinct immutable `SENDER` signal and atomically completing both the transfer
and payout case.

An administrator may complete from staff payout evidence without the sender
signal only through the explicit admin-completion action and a mandatory audit
reason. The confirmation history preserves which signals actually existed;
admin completion never fabricates a sender or recipient signal. Recipient
one-time links/OTP remain the optional post-v1 extension and are rejected by the
database until that authenticated capability is designed.

Confirmation rows require a real actor. Database enforcement checks that a
`SENDER` actor owns the transfer and that a `STAFF` actor has a staff/admin role,
then makes confirmation history immutable and non-deletable. Sender routes use
compound transfer/sender ownership predicates and return 404 cross-account.

## Disputes

The sender or authorized operations staff can open one active dispute during
payout or confirmation states. Opening stores the prior transfer state, moves
the transfer to `DISPUTED`, and pauses an in-progress payout case. Operations
staff require `DISPUTE_MANAGE` to claim or resolve work. Atomic conditional
claiming prevents two reviewers from overwriting ownership.

Resolution supports resuming the prior workflow, rejecting the dispute and
resuming, starting a refund, or—only for an administrator with a reason—marking
the transfer complete or failed. Financial transition rules remain centralized
in the transfer state machine. Dispute opening fields and terminal resolution
history are frozen by database triggers. Sender projections expose category,
status, action, and timestamps but omit internal resolution text.

## Refunds

Refund snapshots derive the amount/currency from the immutable accepted quote,
representing the sender’s committed funds. `REFUND_MANAGE` may move an eligible
transfer or resolved dispute to `REFUND_PENDING` with separate internal and
sender-facing reasons. Only an administrator can confirm `REFUNDED`, and must
provide an external refund reference, actual timestamp, and audit reason.

Database constraints enforce coherent pending/refunded metadata. Triggers make
refund economics and reasons immutable, permit only a pending-to-terminal
transition, and prevent history deletion. Sender projections expose refund
amount, status, sender-facing reason, and timing, while withholding internal
reason, external reference, and admin identity.

## Verification

Database-backed integration tests cover staff/sender signal ordering,
cross-sender denial, duplicate confirmation rejection, confirmation history
immutability, reasoned admin override, dispute capability denial, atomic review,
dispute-to-refund transition, staff denial for refund completion, admin refund
confirmation, immutable financial/history records, and sender projection
privacy.

The final focused security review identified and verified closure of four
issues: dispute-only staff can no longer initiate a refund, payout cases now
move to a coherent failed terminal state when a reported payout is refunded or
failed, transfer-first locking serializes dispute claim/resolution ownership,
and migrated disputes with an unverified prior-state snapshot cannot resume.
Database triggers also prevent dispute deletion and freeze the verified-snapshot
flag.

The complete milestone gate passes: Prisma validation/generation, lint,
typecheck, 80 API tests, 66 web tests, and both production builds. A disposable
PostgreSQL database was created from all 11 migrations, reported up to date, and
dropped. Representative 1440px staff and 390px sender browser QA passed with no
horizontal overflow; the sender view exposed no internal dispute reason. All QA
browsers and application processes were stopped and temporary captures/logs
were removed. No dependencies changed in this milestone.
