# Milestone 4 — Quote workflow

## Scope and contract

Milestone 4 connects the real operations queue to sender quote decisions. Staff
with both `TRANSFER_REVIEW` and `QUOTE_MANAGE` can create an immutable draft
snapshot and send it. Senders can view only non-draft quotes belonging to their
own transfer and accept or reject the single active, unexpired version.

The quote snapshot contains integer minor-unit send, fee, and receive amounts;
three-letter currency snapshots; a bounded decimal effective rate; expected
delivery and expiry timestamps; optional fee breakdown; and separate
sender-facing and internal notes. A fee breakdown, when supplied, must sum
exactly to the fee. The quoted send amount/currency must match the submitted
request. The default expiry is 30 minutes and is configurable from 5 through
1440 minutes with `QUOTE_DEFAULT_EXPIRY_MINUTES`.

## Lifecycle and integrity

Quote versions are allocated while holding the transfer row lock. One draft,
one sent quote, and one accepted quote may exist per transfer. A replacement
draft does not remove the current actionable quote; sending the replacement
atomically supersedes the prior sent version. Sender rejection moves the
transfer back to `QUOTING`; acceptance atomically marks the quote `ACCEPTED`,
links `acceptedQuoteId`, and moves the transfer to `QUOTE_ACCEPTED`. Expired
quotes cannot be accepted and move the transfer to `QUOTE_EXPIRED` when
observed.

Database triggers reject changes to every quote snapshot field after insert,
enforce lifecycle transitions, require consistent and immutable lifecycle
timestamps, and protect terminal statuses. Service transactions use row locks
for version creation, replacement send, expiry, and sender decisions. Accepted
economics therefore remain immutable even through direct database access or
concurrent requests.

## API and presentation

- `GET|POST /operations/transfers/:id/quotes` lists internal versions or creates a draft.
- `POST /operations/transfers/:id/quotes/:quoteId/send` sends a draft and supersedes an active version.
- `GET /transfers/:id/quotes` returns the owning sender's safe history without drafts, internal notes, or staff identity.
- `POST /transfers/:id/quotes/:quoteId/decision` accepts or rejects the active version.

The operations detail supports request review, quote preparation, retrying a
saved draft, and replacement quote creation. Sender detail emphasizes `You
send`, `Fee`, `Recipient gets`, effective rate, expected delivery, and expiry,
then requires confirmation before accept/reject. Quote-ready, decision, and
expiry events are sender-safe timeline/notification events.

## Verification and security review

Integration coverage verifies dual staff capabilities, cross-sender denial,
internal-note redaction, fee and request validation, deterministic versions,
rejection/requote, superseding, expiry, exactly-once concurrent acceptance,
accepted-quote linkage, and direct-database immutability. The focused security
pass traced staff capability and sender ownership checks through the BFF to the
database, confirmed denial auditing for both required staff capabilities,
challenged stale/racing versions and decisions, and checked that no internal
note or staff identity reaches sender projections.

Live database-backed QA completed the transfer request → staff quote → sender
review → acceptance flow at 1440px and 390px. The final surfaces have no
horizontal overflow or framework overlay. Expected unauthenticated bootstrap
401s occurred while switching roles; no authenticated workflow error remained.
