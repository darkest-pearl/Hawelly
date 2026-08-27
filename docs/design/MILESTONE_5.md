# Milestone 5 — Funding workflow and evidence

## Workflow contract

Funding starts only from an accepted quote. Staff with `FUNDING_REVIEW` select
an active funding template and publish a per-transfer snapshot. The expected
amount and currency are derived from the immutable accepted quote; account,
provider, payee, reference, instructions, and validity are copied into an
immutable `FundingInstruction` row. Template administration is intentionally
deferred to the Milestone 8 admin surface, while the model and operations
selection path are active now.

A sender can submit a reference-only proof or request a short-lived receipt
upload. Attachment requests begin in `PENDING_UPLOAD`; only a successful,
validated upload moves the proof and transfer to `SUBMITTED` and
`FUNDING_SUBMITTED`. Staff may verify, request resubmission, or reject the
submission. Verification still does not confirm money. A separate audited
staff action, requiring a verified proof on the same transfer, moves the
transfer to `FUNDS_CONFIRMED`.

## Private evidence boundary

Evidence is stored beneath the backend-only `EVIDENCE_STORAGE_ROOT`, never a
web public directory. Object keys are generated from transfer/proof UUIDs and a
fixed extension; sender filenames never become paths. Files are exclusively
created with private permissions. Upload and read URLs use an HMAC binding the
operation, proof, immutable object key, and expiration, with a configurable
60–900 second lifetime (300 seconds by default).

The upload stream is bounded by both declared metadata and the configured
maximum (8 MiB by default). Exact byte count, allowlisted MIME type, matching
filename extension, and PDF/PNG/JPEG magic bytes are verified. Reads are
ownership- or capability-authorized before URL issuance, forced to attachment,
marked `no-store` and `nosniff`, and protected by a sandbox content policy.
Signed URLs and storage keys are not written to audit metadata or sender API
projections.

`GET /health/storage` performs a constant-size create/write/delete check and
returns no path or account detail. The local adapter supports a private durable
volume for this release; production must configure an explicit root, an HTTPS
public evidence origin, and a distinct signing secret. Evidence is retained with its transfer record in
Milestone 5. There is no automatic deletion of submitted evidence; future
retention deletion requires an approved, audited policy workflow. Expired,
never-uploaded placeholders may be removed when a sender starts a replacement
upload.

## Integrity and authorization

Database constraints permit only one pending/submitted proof per transfer and
require consistent file, amount/currency, upload, and review metadata. Triggers
make instruction/proof snapshots immutable, enforce proof lifecycle
transitions, freeze review identity/reason/timestamps, and prevent deletion of
submitted proof history. Transfer row locks serialize publication, submission,
upload completion, review, and funds confirmation.

Sender operations use compound transfer/sender ownership predicates and return
404 for cross-sender access. Operations endpoints require `FUNDING_REVIEW`,
with denial auditing. The web BFF admits only exact funding route/method shapes;
signed binary upload/download requests go directly to the API capability URLs.

## Verification

Database-backed integration coverage exercises accepted-quote instruction
publication, cross-sender denial, capability denial/audit, immutable snapshots,
reference-only and receipt submission, bad content rejection, upload retry,
private signed reads, signature tampering, expiry, review, resubmission,
rejection, and the separate funds confirmation action. A focused independent
security review found no actionable authorization, storage, concurrency, or
financial-state issue; review history immutability was additionally hardened as
defense in depth.

Live QA completed the real sender submission → staff verification → staff funds
confirmation workflow at 1440px and 390px. Sender and operations views had no
horizontal overflow or authenticated workflow errors. Expected unauthenticated
bootstrap 401s occurred while establishing fresh browser sessions.
