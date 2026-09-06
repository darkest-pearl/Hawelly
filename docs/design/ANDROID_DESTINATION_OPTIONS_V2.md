# Android destination options v2

## Design

The sender-options response now includes a configuration version and exact
send-currency, receiving-currency, and payout-method values for each effective
corridor. The database stores send currencies by origin and receiving
currencies and payout methods by destination. A new activation must supply an
exact, non-empty mapping for every supported country, and every mapped currency
must also be in the snapshot's supported-currency list.

Android and web build their destination selectors only from this authenticated
projection. Labels use `Country name (CODE)` while form state and API requests
retain the ISO code. Changing destination reconciles receiving currencies and
payout methods. Android keeps the selected code and editor-open state across
Compose activity recreation. Loading, API-error, empty-policy, unavailable
saved-route, and disabled states remain explicit; no active configuration means
no sender corridors rather than a Philippines fallback.

## Authorization and integrity review

Runtime activation remains admin-only, confirmed, reasoned, versioned, and
audited. The new mapping fields are covered by the immutable database snapshot
trigger. Recipient and transfer writes remain sender-owned and server-validated.
Staff quote creation now rejects a receiving currency outside the active
destination mapping. Incomplete pre-migration snapshots fail closed and expose
no effective corridors. No new public or privileged trust boundary was added.

## Verification

- Fresh PostgreSQL creation applied all 14 migrations successfully.
- Full repository gate passed: 104 API tests, 102 web tests, lint, typecheck,
  release-tool tests, API/web production builds, and the client-boundary check.
- Android passed 12 unit tests, lint, debug assembly, and release assembly
  against `https://hawellybeta.duckdns.org`.
- Rendered web QA passed at 1280×900 and 390×844. It verified Egypt, Uganda,
  and Ethiopia labels and destination-dependent currencies and payout methods.
- Rendered Android emulator QA verified the accessible dropdown, all three full
  labels, dependent UGX/mobile-money controls in a disposable fixture, and
  selection preservation through activity recreation.
- `npm audit --omit=dev` reported zero vulnerabilities; the lockfile install
  dry-run completed successfully.

The rendered payout methods above were disposable local fixtures, not a
production corridor activation or operational claim. Production activation is
intentionally pending explicit approval of the payout-method mapping for EG,
UG, and ET.
