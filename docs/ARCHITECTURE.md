# Hawelly Architecture

**Status:** Authoritative v1 architecture boundary

## 1. System shape

Hawelly should begin as a small monorepo with clear separation between backend, web, and Android sender client.

Recommended structure:

```text
Hawelly/
  apps/
    api/
    web/
    android-client/
  docs/
  scripts/
  package.json
```

Initial stack should stay close to proven XBUX choices where they remain suitable:

- Node.js/TypeScript API
- Express-style HTTP backend
- PostgreSQL
- Prisma
- Next.js web
- Android native client for sender
- private object storage for evidence

The architecture must remain backend-centric. Web and Android clients call Hawelly APIs; they do not directly manipulate financial database tables.

## 2. Trust boundaries

### Client boundary

Untrusted:

- sender web/browser;
- sender Android app;
- public internet;
- uploaded proof files;
- user-entered identifiers/references.

Trusted only after server-side authorization/validation:

- authenticated sender requests;
- authenticated staff/admin requests.

### Backend boundary

The API owns:

- authorization;
- state transitions;
- quote acceptance rules;
- financial snapshot integrity;
- proof URL issuance;
- staff/admin capability checks;
- audit logging;
- rate limiting;
- validation.

### Database boundary

Postgres stores operational truth. Clients never receive database credentials.

Supabase/Postgres RLS and database-role strategy must be reviewed before production. If the backend uses an owner/bypass role, RLS is defense-in-depth against direct Supabase API exposure rather than the primary API authorization mechanism. `FORCE ROW LEVEL SECURITY` must not be enabled blindly.

### Evidence storage boundary

Evidence bucket is private. Backend issues short-lived signed upload/read URLs or proxies operations. Service credentials never enter frontend bundles.

## 3. Core domain entities

Suggested initial model set:

### User

Fields/concepts:

- id
- role: `SENDER | STAFF | ADMIN`
- username/email/phone as applicable
- password hash / auth provider identity
- active state
- security/session metadata
- created/updated timestamps

### StaffProfile

- userId
- display name
- capabilities
- operational status

### Recipient

- ownerSenderId
- full name
- country
- phone/contact
- payout details needed for destination/method
- optional address/identity fields depending on policy

### TransferRequest

- senderId
- recipientId
- originCountry
- destinationCountry
- sendAmountMinor
- sendCurrency
- requestedPayoutMethod
- status
- quoteDueAt
- senderNote
- createdAt

Use integer minor units or Decimal consistently; do not maintain contradictory major/minor persisted values.

### Quote

Immutable financial snapshot after acceptance.

- transferRequestId
- version
- sendAmount
- sendCurrency
- feeAmount
- effectiveRate
- receiveAmount
- receiveCurrency
- expectedDeliveryAt or deliveryEstimate
- expiresAt
- status
- createdByStaffId
- senderFacingNote
- internalNote
- acceptedAt/rejectedAt

### FundingInstruction

- transferRequestId / acceptedQuoteId
- method
- amount/currency
- payee/account/provider fields
- sender reference
- instructions
- validUntil
- publishedBy

### FundingProof

- transferRequestId
- senderId
- reference
- amount/timestamp if supplied
- storage path / metadata
- review status
- reviewedBy
- review reason

### PayoutCase

- transferRequestId
- staffOwnerId
- associateContactId nullable
- amount/currency
- payout method
- expectedBy
- status
- externalReference
- internal notes

### PayoutEvidence

- payoutCaseId
- evidence type
- storage path / external reference
- metadata
- createdByStaffId

### TransferConfirmation

- transferRequestId
- source: `STAFF | SENDER | RECIPIENT`
- confirmedAt
- actor/reference identity
- note

### AssociateContact

Internal-only operational directory entry.

- country/cities
- business/person name
- contact channels
- methods/currencies
- active/trust status
- internal notes

No authenticated account relationship in v1.

### StaffNote

- transferRequestId
- authorStaffId
- text
- createdAt
- internal only

### Dispute

- transferRequestId
- openedBy
- reason/category
- status
- resolution
- timestamps

### ActivityEvent / AuditLog

Immutable operational/audit history.

### AdminConfiguration

Singleton or versioned configuration record for operational defaults.

## 4. State machine

State transitions must live in one domain module, e.g. `transferState.ts`, not be distributed as arbitrary route updates.

Canonical state transitions:

```text
REQUESTED
  -> NEEDS_INFO
  -> QUOTING
  -> DECLINED
  -> CANCELLED

NEEDS_INFO
  -> REQUESTED/QUOTING
  -> CANCELLED
  -> DECLINED

QUOTING
  -> QUOTED
  -> NEEDS_INFO
  -> DECLINED
  -> CANCELLED

QUOTED
  -> QUOTE_ACCEPTED
  -> QUOTE_EXPIRED
  -> QUOTING        (new quote/version path)
  -> CANCELLED

QUOTE_ACCEPTED
  -> FUNDING_PENDING
  -> ON_HOLD
  -> CANCELLED      (only if allowed before funds receipt)

FUNDING_PENDING
  -> FUNDING_SUBMITTED
  -> ON_HOLD
  -> CANCELLED

FUNDING_SUBMITTED
  -> FUNDING_PENDING   (resubmission requested)
  -> FUNDS_CONFIRMED
  -> ON_HOLD

FUNDS_CONFIRMED
  -> PAYOUT_IN_PROGRESS
  -> ON_HOLD
  -> REFUND_PENDING

PAYOUT_IN_PROGRESS
  -> PAYOUT_REPORTED
  -> ON_HOLD
  -> DISPUTED
  -> FAILED

PAYOUT_REPORTED
  -> CONFIRMATION_PENDING
  -> COMPLETED          (policy may allow staff evidence completion)
  -> DISPUTED

CONFIRMATION_PENDING
  -> COMPLETED
  -> DISPUTED

ON_HOLD
  -> prior valid operational state via explicit release action
  -> CANCELLED/REFUND_PENDING/DISPUTED as policy permits

DISPUTED
  -> PAYOUT_IN_PROGRESS / CONFIRMATION_PENDING / REFUND_PENDING / COMPLETED / FAILED

REFUND_PENDING
  -> REFUNDED
  -> FAILED
```

Exceptional transitions require staff/admin reason and audit trail.

## 5. Quote integrity

Quote economics are critical financial data.

Rules:

- quote versions are append-only for historical accuracy;
- `SENT` quote can be superseded by a new version;
- `ACCEPTED` quote financial fields are immutable;
- transfer processing references `acceptedQuoteId`;
- funding amount and payout amount should derive from accepted quote snapshot;
- staff/admin override after acceptance must create an explicit adjustment/requote workflow, not mutate history.

Database constraints and service-layer validation should reinforce this.

## 6. Money representation

Choose one authoritative representation.

Preferred:

- integer minor units for fiat amounts where currency minor-unit semantics are known, plus currency code;
- Decimal for FX rates.

Never persist two independently editable representations of the same amount.

Always capture quote currency and payout currency snapshots.

## 7. API modules

Suggested modules:

- `/auth`
- `/users`
- `/recipients`
- `/transfers`
- `/quotes`
- `/funding`
- `/payouts`
- `/confirmations`
- `/disputes`
- `/staff`
- `/admin/configuration`
- `/admin/associates`
- `/admin/audit`
- `/evidence`
- `/health`
- `/public/mobile-release`

Sender routes must scope by authenticated sender ownership.

Staff/admin routes use role + capability checks.

## 8. Authorization model

Do not encode every operational permission purely as role checks if staff capabilities will differ.

Recommended:

- role establishes broad boundary;
- capabilities establish privileged operational actions.

Potential staff capabilities:

- `QUOTE_MANAGE`
- `FUNDING_REVIEW`
- `PAYOUT_MANAGE`
- `DISPUTE_MANAGE`
- `TRANSFER_HOLD`
- `REFUND_MANAGE`
- `ASSOCIATE_VIEW`

Admins bypass capability restrictions only through explicit admin policy.

## 9. Web architecture

Reuse the good XBUX UI language selectively:

- compact cards;
- compact tables;
- modal detail/actions instead of permanent side panels;
- short operational labels;
- confirmation modal with required reason for risky actions;
- consistent page shell/navigation.

Do not port XBUX domain-specific pages for agents, settlements, float, wallets, commissions, or reconciliation.

### Staff/admin web primary routes

- `/admin` or `/ops`
- `/ops/requests`
- `/ops/quotes`
- `/ops/funding`
- `/ops/payouts`
- `/ops/exceptions`
- `/ops/associates`
- `/admin/staff`
- `/admin/configuration`
- `/admin/audit`

Use full-width compact queues. Row click opens a modal/detail route.

### Sender web primary routes

- `/sender`
- `/sender/new-transfer`
- `/sender/transfers`
- `/sender/transfers/:id`
- `/sender/recipients`
- `/sender/notifications`
- `/sender/profile`

## 10. Android architecture

Android v1 is sender-only.

Reuse XBUX sender Android concepts selectively after auditing dependencies.

No funding-agent/payout-agent Android modes.

Required sender capabilities should mirror sender web semantics, including quote review/acceptance and proof upload.

## 11. Storage architecture

Private evidence bucket(s), preferably separated by purpose if useful:

- `funding-proofs`
- `payout-evidence`

Or a single private `transfer-evidence` bucket with structured object prefixes.

Object path shape should be deterministic and non-public, e.g.:

```text
transfers/<transferId>/funding/<proofId>/<filename>
transfers/<transferId>/payout/<evidenceId>/<filename>
```

Never use sender-controlled raw object paths without validation.

## 12. Database/RLS strategy

Initial rule:

- clients do not query private tables directly;
- API uses DB connection;
- Supabase service key stays server-side;
- enable RLS/privilege restrictions defensively after verifying the backend role;
- no anon/authenticated Supabase role receives financial-table policies unless deliberately designed.

Security implementation should inventory all public tables and remove `Unrestricted` exposure before production, without blindly using `FORCE ROW LEVEL SECURITY` against the backend owner role.

## 13. Notifications

Notification dispatch is asynchronous/best-effort relative to core financial transaction state.

Persist notification intent/log state. A provider outage must not roll back valid financial transitions unless the operation explicitly requires delivery confirmation.

## 14. Observability

Minimum:

- request IDs;
- structured API failure logs;
- health/readiness endpoints;
- activity/audit events;
- login failure/rate-limit events;
- operational SLA queries for quote/funding/payout aging;
- release/storage/database health tooling.

## 15. Reuse map from XBUX

Likely donor areas to inspect, not blindly copy:

- `apps/web/components/productUi.tsx`
- portal layout/navigation primitives
- authentication/session helpers
- activity/audit logging helpers
- Supabase proof-storage patterns
- release env loader / PM2 tooling
- backup helper / storage healthcheck
- smoke harness conventions
- Android update endpoint/client

Every imported file must remove XBUX branding and obsolete domain dependencies.

## 16. Forbidden architectural imports from XBUX

Do not introduce these models/modules into Hawelly v1 without an approved spec change:

- Settlement
- SettlementItem
- PayoutObligation as agent settlement debt
- LedgerCorridor
- WalletAddress / crypto wallet domain
- agent float configuration
- settlement rail enums
- funding/payout agent authenticated roles
- agent commission payout domain
- crypto chain/token configuration

## 17. Migration/deployment philosophy

- additive/expand-contract migrations where feasible;
- no destructive migration without backup and explicit review;
- migration status checked before release;
- production release must have health + smoke checks;
- secrets are external environment state, never committed.

## 18. Testing architecture

Each milestone requires:

- type/build validation;
- domain unit tests for state/quote invariants;
- authorization tests;
- API integration tests;
- smoke/E2E workflow tests;
- regression checks for prior milestones.

Critical invariant tests:

- sender cannot access another sender's transfer/recipient/evidence;
- expired quote cannot be accepted;
- accepted quote financial fields cannot mutate;
- funding submission cannot mark funds confirmed;
- payout cannot be reported before funds confirmation except an explicit admin recovery path;
- staff action without capability is denied;
- internal notes never appear in sender responses;
- signed evidence URLs expire and are ownership/capability scoped.
