# Milestone 0 design record

## Bootstrap approach

- One npm workspace and one root lockfile for `apps/api` and `apps/web`.
- Strict shared TypeScript defaults, workspace-local build/typecheck commands, and a root verification facade.
- Express API split into configuration, app construction, and process startup so the public health surface is integration-testable without binding a port.
- Next.js App Router shell based on the saved Hawelly sender concept at `docs/design/milestone-0-web-concept.png`.
- Android directory reserved for the sender-only native application scheduled in Milestone 9.
- CI installs from the lockfile, runs lint/typecheck/tests/build, smoke-tests the built API, and audits production dependencies.

## Donor reuse record

Reference commit inspected: XBUX `4aa38b0f439c243fb9b013340f0a65204a0f4604`.

Adapted concepts:

- npm workspace shape and aggregate scripts;
- strict ESM TypeScript API build and `tsx` development loop;
- separate liveness/readiness endpoints and a built-process healthcheck;
- nested build/env/secret ignore conventions;
- split API and web environment examples.

Deliberately excluded:

- XBUX lockfiles and circular `file:../..` app dependencies;
- database bootstrap/seed side effects;
- all crypto settlement, agent portal, settlement batch, wallet, float, commission, and reconciliation modules, models, routes, migrations, scripts, and UI;
- XBUX credentials, local artifacts, debug SQL, proof-storage configuration, and product branding.

No donor source file was copied wholesale.

## Visual verification ledger

The accepted concept and implementation were compared directly at a 1440x1000 desktop viewport. A 390x844 mobile render was also inspected.

| Comparison point | Result |
| --- | --- |
| Visible copy and navigation order | Exact match; no extra above-the-fold copy |
| Header, hero, workflow, and recent-transfer hierarchy | Matched |
| True-white/cool-gray, navy, and ocean-teal palette | Matched |
| Typography scale, control weight, and line length | Matched within browser font rendering |
| Open layout and single bordered empty-state container | Matched; no added card grid or decorative chrome |
| Workflow step/link anatomy | Matched on desktop; intentionally collapses to a readable vertical timeline on mobile |
| Primary action interaction | Verified to navigate to the recent-transfers section |
| Responsive behavior | No horizontal overflow at 390px |

Render evidence:

- `docs/design/milestone-0-web-render.png`
- `docs/design/milestone-0-web-render-mobile.png`

The in-app browser was unavailable during verification, so the repository's Playwright Core QA script used the installed local Chrome executable as the documented fallback.

## Verified success criteria

- `npm ci`: passed from the committed root lockfile.
- `npm run check`: lint, strict typechecks, 9 API/config tests, API build, and Next.js production build passed.
- `npm run smoke:health`: launched the built API on an ephemeral loopback port and passed.
- `npm ls --all --omit=optional --depth=0`: dependency tree completed without invalid or missing packages. npm reports two installed Sharp/WASM platform fallbacks as extraneous only when optional packages are expanded; both are lockfile-declared optional packages.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities.
- `npm audit --audit-level=high`: zero vulnerabilities.
- Source, Git history, generated browser bundle, and lockfile scans found no credential patterns, server-only environment names, private keys, or Git/file dependencies.
- Authorization/data-exposure review: no business data routes exist yet; clients have no database/storage SDK or credentials; XBUX non-goal architecture is absent.
