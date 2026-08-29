# Milestone 9 — Android sender client

## Product boundary

Milestone 9 delivers a native Kotlin/Jetpack Compose application for senders.
It mirrors Hawelly's existing API-owned lifecycle: registration and login,
session restoration, transfer dashboard and timeline, recipient management,
transfer request, quote acceptance or rejection, funding instructions and
proof, payout progress, recipient confirmation, dispute creation, profile,
session security, and update discovery.

The application contains no staff, admin, associate, or agent mode. It does
not add crypto settlement, settlement batches, wallets, float, commission, or
reconciliation concepts. Identity, object ownership, authorization, monetary
values, workflow transitions, evidence policy, and update metadata remain
server-authoritative.

## Native architecture

The client uses a small layered structure: Compose screens and native Material
components call a lifecycle-aware view model, which calls a sender repository,
which in turn uses a bounded `HttpURLConnection` client and explicit JSON
parsers. Access tokens remain in process memory. The rotating refresh token is
encrypted with a non-exportable Android Keystore AES-GCM key before private
preferences storage. A mutex serializes concurrent refreshes while the API
continues to own token rotation and replay-family revocation.

Production API origins must be exact HTTPS origins without credentials, paths,
queries, or fragments. Debug HTTP is limited to emulator/loopback hosts in both
runtime validation and Android network security policy. The manifest disables
backup, requests only internet access, and exports only the launcher activity.

Evidence selection accepts JPEG, PNG, or PDF. Both provider-reported size and
streamed bytes are bounded to 8 MB before a signed upload URL is used. The API
still validates evidence ownership, state, signature, expiry, content type,
and byte length.

## Update and release contract

`GET /app-updates/android?versionCode=<positive integer>` is public, bounded,
and `no-store`. It reports the latest and minimum-supported version, release
notes, and optional download data. Runtime configuration accepts a download
only when a credential-free HTTPS URL and lowercase 64-character SHA-256 digest
are present together. The client opens the server-validated URL in Android's
platform handler and displays the digest; Android package signing remains the
installation authenticity boundary.

The repository builds an unsigned release APK. Protected production signing,
hosting, and publishing happen outside source control, and the published digest
must describe the exact signed APK bytes.

## Interface design

The final UI follows the requested frontend and Apple-oriented design guidance
without imitating iOS controls. It uses a cool neutral ground, one cyan action
accent, a route-inspired Hawelly signature, compact typography, native touch
feedback, and real vector navigation icons. Lists use unified surfaces and
hairline dividers instead of repetitive card grids. Authentication is cardless,
validation is repair-oriented and inline, status treatment stays neutral, and
destructive recipient deletion requires an explicit confirmation while keeping
the safe action visually primary.

The design deliberately avoids decorative glass, generic gradients, fake
device frames, excessive pills, letter-icon placeholders, and ornamental
animation. Native Material semantics and Android platform behavior provide the
interaction feedback.

## Security review and remediation

The proportional Milestone 9 diff review covered all 22 source inventory files
and the supporting CI, wrapper, tests, documentation, server authorization, and
evidence controls. TLS/origin enforcement, sender-only role acceptance,
Keystore storage, refresh serialization, upload bounds, update URL/digest
binding, manifest exposure, and server authority passed review.

The review found one low-severity failure-semantic issue: all-device sign-out
discarded an unsuccessful server revocation and then cleared local state. The
client now propagates revocation failure, preserves its retry capability, and
clears local state only after the server confirms success. Focused unit tests
cover both failure preservation and successful clearing. Single-device sign-out
retains its intentional local best-effort behavior, and the API's transactional
all-session revocation was not weakened.

No other reportable finding survived. The review confirmed that the mobile
client introduces no privileged role, client-authoritative financial action,
public evidence access, remote cleartext origin, secret logging, or prohibited
XBUX-derived settlement architecture.

## Verification

The repository gate passes Prisma validation/generation, lint, typecheck, 86
API tests, 79 web tests, and both production builds. A disposable empty
PostgreSQL database applied all 12 migrations, resulting in 21 public tables
and 12 completed migration records. Production-only and full npm audits both
report zero vulnerabilities; the package-lock clean-install dry run succeeds.

The Android gate passes six unit tests, Android lint, debug APK assembly, and
release APK assembly. CI now repeats unit tests, lint, and release assembly on
Linux with JDK 21. Emulator QA on a Pixel-class API 36 device verified the final
authentication layout, accessible text fields/actions, target-device fit, and
an empty crash buffer. No emulator, ADB daemon, development server, watcher,
scanner process, capture, local APK output, local SDK configuration, disposable
database, or security-scan artifact is tracked for the checkpoint.
