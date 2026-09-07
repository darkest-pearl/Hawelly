# Android recipient, transfer, profile, and brand v3

## Shipped design

Version 3 keeps all financial and corridor decisions on the Hawelly API. Android
and web render the authenticated sender-options projection and submit ISO codes,
currency codes, and payout-method enum values received from that projection.
Neither client adds corridors or silently substitutes a destination when the
effective configuration is empty.

Recipient entry now accepts culturally inclusive Unicode names, normalizes
repeated whitespace, treats a blank phone as absent, validates supplied phones
in international format, and requires the exact fields for the selected payout
method. Local and server validation remain field-specific, and a failed save
keeps the editor open with its entered values. Successful saves update local UI
state immediately before a best-effort list refresh.

Transfer submission uses a UUID idempotency key retained in `SavedStateHandle`
only while the result is ambiguous. The API binds that key to the authenticated
sender and a canonical request fingerprint, serializes concurrent use, creates
the transfer and key record in one transaction, replays the committed transfer,
and rejects payload mismatch with `409`. Android also blocks rapid repeat taps,
shows the committed reference immediately, and treats later list/detail hydration
failure as a secondary warning instead of falsely reporting creation failure.

The sender Profile surface supports inclusive full-name updates, current-password
verified password changes, all-session revocation, support and safety guidance,
non-sensitive app diagnostics, update status, and per-device/all-device sign-out.
Password values use ephemeral Compose state and never enter activity-restoration
state. Android backup remains disabled, and the API audit trail records outcomes
without names, password values, hashes, access tokens, or refresh tokens.

## Brand assets

The user-supplied 1024-pixel artwork is retained under `docs/brand/source`. The
deterministic PowerShell generator removes only the upper-left AI badge, preserves
the interwoven H, and produces the clean master, 512-pixel store image, transparent
adaptive foreground, Android 13 monochrome layer, legacy density icons, round
icons, and Android 12+ splash asset. Regeneration instructions and asset roles are
documented in `docs/brand/README.md`.

Rendered Pixel launcher QA verified the production mark as a circular color icon,
light and dark themed monochrome home-screen icons, the recent-apps icon, and the
H-only navy splash. The adaptive foreground remains centered inside the safe
circle without the removed badge, a white square, clipping, or lost ribbon depth.
No standalone physical Android device was available for this checkpoint.

## Authorization and security review

- `/me`, `/me/change-password`, recipient routes, sender options, and transfer
  routes remain protected by server-side authentication and role/ownership checks.
- Password change verifies the current Argon2 hash, rate limits failed proof,
  atomically updates the hash and session version, revokes every active session,
  and emits credential-free activity records.
- Transfer idempotency is sender-scoped in both the primary key and composite
  transfer foreign key. PostgreSQL advisory locks and constraints protect
  concurrent requests without relying on the Android tap guard.
- Client field messages are treated as presentation only. The web client retains
  string values only, React escapes them, and the API exposes an approved field
  message set rather than raw validation internals.
- Release builds require an HTTPS API origin. Emulator-local cleartext remains
  limited to the debug build and Android network security configuration.
- A focused Codex Security diff review covered all 35 changed source/config/test
  files. It produced no reportable findings. One local-device-only defense-in-depth
  candidate—saveable password-dialog state—was rejected by attack-path policy and
  nevertheless removed before the final gate.

## Verified state

- The complete repository gate passed: Prisma validation/generation, lint,
  API/web typechecks and tests, release-tool tests, production builds, and the
  tracked/generated client-boundary check.
- A brand-new PostgreSQL database was created from all 15 migrations. The full
  database-backed beta suite passed 49 tests, including sender isolation,
  idempotent replay, concurrent exactly-once transfer creation, profile/password
  changes, and migration/schema integrity.
- Android unit tests, lint, debug assembly, and release assembly passed for
  `versionCode 3`, `versionName 1.0.2-beta`, application ID
  `com.hawelly.sender`, and `https://hawellybeta.duckdns.org`.
- Rendered emulator QA created a Uganda bank recipient with a normalized inclusive
  name, displayed Egypt/Uganda/Ethiopia from the isolated server policy, left phone
  blank, persisted the recipient, submitted with a deliberate rapid double tap,
  observed one sender transfer, displayed its exact Hawelly reference, updated the
  profile name, and rendered support, safety, diagnostics, and session controls.
- `npm audit --audit-level=high` reported zero vulnerabilities and `npm ls --all`
  completed successfully; platform-specific optional packages were absent only
  where not applicable to Windows.
- Temporary emulator, API, and isolated PostgreSQL processes were stopped after
  QA. Production runtime configuration, signing material, secrets, and XBUX were
  not accessed or changed during this implementation checkpoint.
