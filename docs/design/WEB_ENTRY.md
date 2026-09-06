# Public web entry and sender registration

The public Hawelly origin is an honest entry to the working controlled-beta
product. It does not simulate a sender dashboard or render private transfer
records. Its primary action enters sender sign-in with
`/sender/new-transfer` as a strictly allowlisted intended destination; separate
links reach sender transfers, recipients, support, staff, and admin routes.

## Interaction design

The page retains Hawelly's navy, white, and teal visual language. A transfer
route ribbon is the identifying visual: request, staff review, sender decision.
It explains that a request does not move money and avoids invented rates,
balances, customer claims, contact channels, or availability promises. Desktop
uses a split entry composition; mobile reduces it to one linear action path.

`/support` provides beta reporting guidance, transfer-reference guidance,
privacy warnings, and duplicate-submission precautions. It directs testers to
the verified channel through which they received access because no public
support address is configured.

## Authentication boundary

- `/sign-in` supports sender, staff, and admin entry, but the authenticated
  account role determines the resulting portal.
- `/register` is sender-only; there is no staff or admin registration route.
- The `next` query is accepted only for known sender routes or the exact staff
  and admin roots. External, protocol-relative, query-bearing, fragment-bearing,
  backslash, and cross-portal values fall back to the role's portal root.
- `POST /api/auth/register` requires the exact web origin, reads at most 16 KiB,
  accepts exactly `fullName`, `email`, and `password`, and reconstructs the
  upstream JSON body from those fields.
- The BFF supplies its server-derived rate-limit identity, rejects any upstream
  registration session whose role is not `SENDER`, returns no tokens in JSON,
  and uses the existing secure HTTP-only strict-cookie session helper.
- `GET /api/auth/status` returns only whether a refresh cookie is present. This
  avoids anonymous protected-resource probes while keeping refresh and API role
  enforcement authoritative.

## Verification

`npm run qa:web:entry` performs bounded Playwright checks for public routes,
real CTA destinations, direct portal-to-auth transitions, desktop/mobile
overflow, console and request failures, support guidance, and accessible
registration validation. Screenshots are written only when
`WEB_QA_OUTPUT_DIR` is explicitly set, so local QA artifacts do not enter Git.

The focused security diff review is retained under ignored `.local` state. It
closed one pre-checkpoint issue by expanding the opaque anonymous auth-client
cookie path from login-only to `/api/auth`, allowing registration and login to
reuse the same non-production rate-limit identity. Production continues to use
the exact trusted-ingress client IP. No reportable finding remained after the
fix and targeted retest.
