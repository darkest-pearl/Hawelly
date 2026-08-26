# Hawelly Product Specification

**Status:** Authoritative v1 product contract  
**Purpose:** Define what Hawelly v1 is, what it is not, and the semantics implementation agents must preserve.

## 1. Product vision

Hawelly is a staff-managed cross-border money-transfer coordination platform.

A sender does not receive an instant algorithmic remittance price. Instead, the sender submits a request and Hawelly operations prepare a quote within a short service window. The sender sees exactly what the recipient is expected to receive and the expected delivery time before committing.

After quote acceptance, Hawelly provides funding instructions. Hawelly staff coordinate payout with trusted external associates through approved external channels. Hawelly records the operational evidence and keeps the sender informed throughout the lifecycle.

The application is therefore a trusted pathway between:

- a sender;
- Hawelly operations;
- external payout/funding relationships coordinated by Hawelly; and
- the intended recipient.

The software manages the **case, evidence, state, accountability, and customer experience**. It does not attempt to automate every settlement relationship.

## 2. v1 principles

1. **Human-managed operations are intentional.** Staff may price, route, fund, and coordinate payouts manually.
2. **The sender sees a clear commitment before funding.** Accepted quote economics are immutable snapshots.
3. **Every financial state change is attributable.** Important changes record actor, timestamp, reason, and previous/next state.
4. **External associates are not application users in v1.** Hawelly communicates with them outside the platform.
5. **The sender experience remains simple.** Internal operational complexity must not leak into sender UI.
6. **Evidence matters.** Funding and payout evidence/references are retained when applicable.
7. **Confirmation is multi-signal.** Staff payout confirmation is authoritative operational evidence; sender/recipient confirmation provides an additional trust signal.
8. **No hidden repricing.** A quote accepted by the sender cannot be silently edited.
9. **Security and privacy are first-class.** Private financial data is backend-controlled and auditable.
10. **Compliance is a separate mandatory workstream.** Simplifying software does not remove legal/KYC/AML/sanctions/recordkeeping obligations.

## 3. Roles and permissions

### 3.1 Sender

Can:

- create and maintain their own account;
- create recipients they own;
- create transfer requests;
- view only their own requests/transfers;
- view quotes addressed to them;
- accept or reject active quotes;
- view funding instructions after quote acceptance;
- submit funding references/proofs where required;
- view timeline/status updates;
- confirm that their recipient reported receiving funds;
- open a support/dispute request;
- cancel when cancellation is allowed by lifecycle policy.

Cannot:

- set quote economics;
- mark funding received;
- mark payout completed;
- view internal notes;
- view other users' records;
- directly access private database/storage resources.

### 3.2 Staff

Can:

- view operational transfer queues;
- review transfer requests;
- prepare/send quotes;
- mark or expire quotes according to policy;
- publish/select funding instructions;
- review funding proof/reference;
- confirm funds received;
- assign/manage internal payout cases;
- record external associate/contact used;
- record payout progress;
- record payout completion and evidence;
- place transfers on hold with a reason;
- manage disputes according to assigned capability;
- communicate sender-facing status updates;
- add internal staff notes;
- perform operational actions granted by capability.

Staff cannot manage privileged security/runtime configuration unless granted admin capability.

### 3.3 Admin

Admin has all Staff capabilities plus:

- staff/user administration;
- role/capability management;
- supported-country/corridor configuration;
- quote SLA/default expiry configuration;
- funding-instruction templates/accounts;
- operational associate/contact directory;
- audit/risk/security views;
- controlled override/refund/cancellation actions;
- application runtime/release configuration where exposed;
- security and access management.

High-risk admin actions require explicit confirmation and an admin reason.

### 3.4 External associate

An external funding/payout associate is **not a Hawelly authenticated role in v1**.

Hawelly may store an internal contact record containing fields such as:

- name/business name;
- country/cities served;
- payout methods;
- currencies;
- contact channels;
- internal trust/status notes;
- active/inactive state.

These records are visible only to authorized staff/admins.

A future secure associate communication portal is explicitly deferred.

## 4. Primary workflow

### 4.1 Request creation

A sender creates a `TransferRequest` containing, at minimum:

- origin/sender country;
- destination/recipient country;
- send amount;
- send currency;
- recipient;
- requested payout method where relevant;
- optional sender note;
- request timestamp.

The system records a quote SLA deadline such as `quoteDueAt` based on configuration.

The sender UI should communicate a short promise such as:

- `Quote requested`
- `Expected within 1 hour`

Do not over-explain internal pricing or routing.

### 4.2 Staff review

Staff reviews the request and may:

- ask the sender for necessary missing information;
- reject/decline an unsupported request with a reason;
- place the request on hold;
- prepare a quote.

### 4.3 Quote

A quote is a versioned historical object. It must include a snapshot of agreed economics and timing.

Minimum quote fields:

- transfer/request ID;
- send amount;
- send currency;
- fee amount;
- optional fee breakdown;
- applied FX rate or effective rate;
- recipient amount;
- recipient currency;
- expected payout/delivery time or deadline;
- quote creation time;
- expiry time;
- staff creator;
- status;
- optional concise sender-facing note;
- optional internal rationale/notes separate from sender-facing text.

Quote status examples:

- `DRAFT`
- `SENT`
- `ACCEPTED`
- `REJECTED`
- `EXPIRED`
- `SUPERSEDED`

Rules:

- Only one quote can be the currently actionable quote for a request.
- An accepted quote becomes immutable for financial fields.
- Repricing requires a new quote/version; never edit the accepted historical record.
- Expired quotes cannot be accepted.
- Sender acceptance records exact timestamp and quote snapshot.

### 4.4 Quote decision

Sender can:

- accept;
- reject;
- allow it to expire.

On acceptance, the transfer transitions toward funding.

The sender should see only the most decision-relevant economics:

- `You send`
- `Fee`
- `Recipient gets`
- `Expected by`
- `Quote expires`

### 4.5 Funding instructions

Funding instructions are shown only after the applicable quote is accepted unless staff deliberately publishes them earlier under a future policy.

Funding instruction fields may include:

- funding method type;
- account/person/business name;
- bank/provider;
- account/IBAN/reference information;
- physical handoff instructions where legally/operationally permitted;
- amount/currency expected;
- transfer-specific reference;
- expiration or validity period;
- concise sender instructions.

Sensitive internal details must not be exposed unless necessary for the sender to fund.

### 4.6 Funding submission

Depending on funding method, sender may submit:

- transaction reference;
- receipt image/PDF;
- transfer timestamp;
- amount paid;
- optional sender note.

Submission does **not** mean Hawelly has received the money.

Distinct states must exist for:

- proof/reference submitted;
- funds verified/received.

### 4.7 Funding confirmation

Authorized staff confirms whether funds were received.

Staff actions may include:

- verify;
- request resubmission/more information;
- reject invalid proof/reference;
- place on hold.

Financial processing toward payout must not proceed as `FUNDS_CONFIRMED` until an authorized staff action confirms receipt.

### 4.8 Payout case

Once funds are confirmed, Hawelly creates or activates an internal `PayoutCase`.

The payout case may store:

- transfer ID;
- payout amount/currency;
- expected delivery deadline;
- payout method;
- external associate/contact used;
- staff owner;
- status;
- external reference;
- internal notes;
- sender-visible status note where appropriate.

External coordination happens outside Hawelly in v1.

The application is used to record operational truth, not to pretend the external communication occurred inside the system.

### 4.9 Payout completion

Authorized staff records payout completion with fields such as:

- completed amount;
- currency;
- completed timestamp;
- payout method;
- associate/contact;
- external transaction/reference number where applicable;
- payout evidence/receipt where applicable;
- staff note;
- optional sender-facing note.

This produces a staff-side payout confirmation event.

### 4.10 Sender/recipient confirmation

Hawelly should support an additional confirmation signal.

v1 minimum:

- sender can confirm: `My recipient received the money`.

Recommended v1.1 extension:

- recipient can receive a secure one-time confirmation link/OTP without creating a full account.

Confirmation records must identify confirmation source:

- `STAFF`
- `SENDER`
- `RECIPIENT`

Completion policy should allow staff payout evidence to move the transaction to `PAYOUT_REPORTED` while retaining a distinct confirmation state. Final `COMPLETED` may occur according to configured policy, but the history must preserve exactly which confirmations were received.

## 5. Transfer lifecycle

Canonical primary states:

1. `REQUESTED`
2. `NEEDS_INFO`
3. `QUOTING`
4. `QUOTED`
5. `QUOTE_ACCEPTED`
6. `FUNDING_PENDING`
7. `FUNDING_SUBMITTED`
8. `FUNDS_CONFIRMED`
9. `PAYOUT_IN_PROGRESS`
10. `PAYOUT_REPORTED`
11. `CONFIRMATION_PENDING`
12. `COMPLETED`

Exceptional/terminal states:

- `ON_HOLD`
- `DECLINED`
- `QUOTE_EXPIRED`
- `CANCELLED`
- `DISPUTED`
- `REFUND_PENDING`
- `REFUNDED`
- `FAILED`

The implementation must centralize and validate allowed transitions. Controllers/routes must not invent arbitrary transitions.

The exact state-transition matrix is maintained in `docs/ARCHITECTURE.md` or a dedicated state-machine module once implementation starts.

## 6. Internal operations workspace

Admin/staff UI should be a compact operations console.

Primary queues:

- New requests
- Quote due soon / overdue
- Quotes awaiting sender
- Funding awaiting sender
- Funding proofs awaiting review
- Funds received / payout required
- Payout in progress
- Payout confirmation pending
- Holds / disputes / exceptions

Table rows should be compact and show only decision-critical fields. Full details/actions belong in modal/detail views.

Potential summary columns:

- reference;
- sender;
- corridor;
- amount;
- recipient gets;
- state;
- SLA/due time;
- owner;
- latest action.

## 7. Sender experience

Sender UI must be simpler than staff UI.

Primary screens:

- Home/dashboard
- New transfer request
- Quote decision
- Funding instructions/proof submission
- Transfer timeline/details
- Recipients
- Notifications
- Profile/security
- Support/dispute

The sender should never see:

- internal associate identities unless operationally required;
- internal risk notes;
- staff notes;
- routing logic;
- margins/profit calculations;
- internal audit metadata.

## 8. Notifications

Initial notification channels may include in-app and provider-backed SMS/email/push as implemented.

Important events:

- request received;
- quote ready;
- quote expiring soon;
- quote accepted;
- funding instructions ready;
- proof needs attention;
- funds confirmed;
- payout started;
- payout reported;
- recipient confirmation requested;
- completed;
- hold/dispute update;
- refund update.

Notification failures must not corrupt transfer state.

## 9. Evidence and storage

Private evidence can include:

- funding receipts;
- payout receipts;
- bank/provider transaction confirmations;
- supporting dispute evidence.

Requirements:

- private bucket/storage;
- short-lived signed upload/read URLs;
- backend-controlled issuance;
- content type/size validation;
- audit of evidence metadata access where practical;
- no public object URLs;
- lifecycle/retention policy documented.

## 10. Audit and history

Every material operation should create an immutable audit/activity record containing appropriate fields:

- actor user ID;
- actor role;
- action type;
- entity type/ID;
- timestamp;
- request ID/correlation ID;
- previous state/value where material;
- next state/value where material;
- admin/staff reason where required;
- safe operational metadata.

Never audit:

- plaintext passwords;
- raw authentication tokens;
- encryption keys;
- raw OTP/pickup secrets;
- private service credentials.

## 11. Configuration

Admin configuration should support, at minimum:

- quote SLA duration;
- quote default expiry;
- supported origin countries;
- supported destination countries;
- supported currencies;
- supported payout methods by destination;
- sender transfer limits where policy requires;
- funding instruction templates/accounts;
- notification/broadcast content;
- maintenance/support messages;
- evidence size/format limits where appropriate.

Configuration changes affecting financial or access behavior require audit and confirmation.

## 12. Compliance/security requirements

The software architecture must allow the business to implement jurisdiction-appropriate:

- KYC;
- AML monitoring;
- sanctions screening;
- transaction limits;
- record retention;
- suspicious activity escalation;
- consumer disclosures;
- dispute/refund processes.

These requirements must not be falsely represented as complete unless explicitly implemented and verified.

Technical security baseline:

- backend-only private DB access;
- least-privileged authenticated routes;
- secure password hashing/session lifecycle;
- brute-force/rate-limit protection;
- audit logging;
- private evidence storage;
- secret rotation;
- database RLS/privilege strategy documented and verified;
- no secrets committed;
- production env audit;
- backups and restore procedures;
- dependency security review.

## 13. Non-goals for Hawelly v1

Do not implement unless this specification is deliberately revised:

- crypto settlement;
- blockchain wallet management;
- automatic cross-border treasury settlement;
- settlement batches between payout agents;
- agent float limits;
- agent commission engine;
- funding-agent portal;
- payout-agent portal;
- associate self-service authentication;
- automated reconciliation between agent balances;
- autonomous external payout execution;
- public direct database access.

## 14. Reuse policy from XBUX

XBUX is a donor/reference repository only.

Before copying any module:

1. identify its dependencies;
2. remove XBUX-specific settlement/agent semantics;
3. rename product/domain language to Hawelly;
4. add tests for Hawelly semantics;
5. ensure no obsolete Prisma models/enums/routes are introduced transitively.

Good reuse candidates include UI primitives, auth/session patterns, audit helpers, storage helpers, release tooling, backup tooling, and test harness patterns.

## 15. v1 success criteria

Hawelly v1 is beta-ready when all are true:

- sender can register/login securely;
- sender can create/manage recipients;
- sender can submit transfer request;
- request appears in staff queue with quote SLA;
- staff can create/send quote;
- sender can accept/reject/expire quote correctly;
- accepted quote economics are immutable;
- sender can view funding instructions;
- sender can submit proof/reference;
- staff can verify funds received;
- staff can manage payout case and record evidence;
- sender can see status timeline;
- staff can record payout reported/completed;
- sender can confirm recipient receipt;
- hold/dispute/refund paths are auditable;
- admin can manage staff/configuration;
- evidence storage is private;
- authorization tests prevent cross-user access;
- audit history captures material actions;
- production build passes;
- end-to-end smoke suite passes;
- release/env/security audit passes;
- backup and restore procedure is documented/tested;
- no v1 non-goal architecture is required for normal operation.
