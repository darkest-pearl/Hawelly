# Hawelly Android sender client

This is Hawelly's native, sender-only Android application. It mirrors the
backend-owned sender workflow without adding an agent role, settlement rail,
wallet, float, commission, batch, or reconciliation mode.

## Supported workflow

- sender registration, login, session restore, and device/all-device logout;
- transfer dashboard and timeline;
- recipient create, edit, and delete;
- transfer request creation;
- quote acceptance or rejection;
- funding instructions and JPEG, PNG, or PDF proof upload;
- payout progress, recipient confirmation, and dispute creation;
- profile, session-security guidance, and Android update metadata.

The server remains authoritative for identity, ownership, authorization,
workflow transitions, monetary values, evidence policy, and update metadata.

## Build and verify

Prerequisites are JDK 21 and Android SDK Platform 35. Keep the SDK path in the
ignored `local.properties` file.

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleRelease --no-daemon
```

The debug APK uses `http://10.0.2.2:4000`, the Android emulator alias for the
host API. Cleartext traffic is limited to emulator-local hosts by both the
network security policy and runtime origin validation.

Release builds accept an exact HTTPS API origin through a Gradle property:

```powershell
.\gradlew.bat :app:assembleRelease -PHAWELLY_API_BASE_URL=https://api.example.com --no-daemon
```

The repository produces an unsigned release APK. Production distribution must
apply the organization's protected signing key outside source control.

## Security boundaries

- Only `SENDER` sessions are accepted by the client.
- Access tokens remain in memory. The rotating refresh token is encrypted with
  an Android Keystore AES-GCM key before it enters private preferences.
- Concurrent token refreshes are serialized in the client, while the API is
  still authoritative for rotation and replay-family revocation.
- All-device sign-out clears local session state only after the API confirms
  that every server session was revoked; failures remain visible and retryable.
- Android backup is disabled. The manifest requests only internet access.
- Evidence is bounded to 8 MB and restricted to JPEG, PNG, or PDF before the
  server performs its own validation and issues a signed upload URL.
- Production API and download origins require HTTPS. Secrets, tokens, request
  bodies, and evidence are never logged by the client.

## Updates

The public `GET /app-updates/android?versionCode=<integer>` endpoint publishes
the latest and minimum-supported versions. A download URL is accepted only when
paired with a 64-character SHA-256 digest; the client displays the digest and
opens only the server-validated HTTPS download URL. The release pipeline must
sign the APK and publish the digest for those exact bytes.

Configure the API with the `ANDROID_UPDATE_*` variables documented in
`apps/api/.env.example`. Restart the app after installing an update so Android
can load the new signed package and version code.
