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

## Status

Repository initialization and product specification phase.