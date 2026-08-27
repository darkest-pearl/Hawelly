# Milestone 2 — Shared web design system and portal shells

## Visual specification

The implementation is governed by five saved concepts:

- `milestone-2-sender-concept.png` — desktop sender shell;
- `milestone-2-sender-mobile-concept.png` — responsive sender shell;
- `milestone-2-operations-concept.png` — desktop staff/admin shell and detail drawer;
- `milestone-2-operations-mobile-concept.png` — responsive operations shell;
- `milestone-2-hold-modal-concept.png` — reason-required dangerous-action state.

They extend the Milestone 0 Hawelly language: true white, deep navy, ocean
teal, cool-gray hairlines, open layouts, disciplined sans-serif typography, and
restrained status color. Sender surfaces are calm and economics-led. Operations
surfaces are denser, hierarchical, and table-led.

The operations concept includes a `New transfer` button, but this conflicts with
the authoritative product workflow in which senders create transfer requests.
It is intentionally omitted from implementation. Product requirements override
visual concept details.

## Design system inventory

### Tokens

- Background `#ffffff`; subtle surface `#f7f9fc`; selected surface `#eef7ff`.
- Ink `#071d3b`; muted ink `#5d6b7d`; border `#d7dee7`.
- Accent `#0788a8`; hover `#05748f`; visible focus `#4bb5cf`.
- Status pairs: blue/info, amber/due, violet/review, green/success,
  gray/hold, and sober red/danger.
- Four-pixel spacing rhythm, 6–8px radii, 36–44px compact controls, and
  low-elevation neutral shadows only for dialogs/drawers.

### Typography and icons

Inter/system sans with deliberate UI sizes: 14–16px operational chrome,
18–24px section hierarchy, and 44–56px sender page headings. Icons are
code-native current-color SVGs with a consistent 1.8px rounded stroke. Text
glyphs are not used for navigation or close/chevron controls.

### Component families

- Buttons: primary, outline, ghost, and danger; compact and full-width variants.
- Status labels: concise semantic tones without embedding business transitions.
- Sender header and operations sidebar/top bar.
- Quote economics summary, transfer progress, recent-transfer rows.
- Metric strip, full-width operational table, selected-row detail drawer.
- Native modal dialog and reason-required confirmation form.

Cards are used only for the single dominant sender transfer surface and compact
operations metrics shown in the concepts. Operational records remain a table or
line-separated list rather than a card grid.

## Visible-copy and navigation lock

Sender navigation is limited to `Transfers`, `Recipients`, and `Support`.
Operations navigation is limited to `Overview`, `Transfers`, `Funding`,
`Payouts`, and `Exceptions`. Admin-only navigation adds `Users`,
`Configuration`, and `Activity`.

No agent, settlement, batch, float, wallet, crypto, commission, or
reconciliation navigation or copy is permitted. Sender views exclude internal
notes, associate details, audit metadata, and unpublished funding details.

## Responsive contract

- Sender desktop uses a centered 1320px shell, horizontal quote economics and
  progress. At 760px and below, navigation becomes a menu, economics become a
  two-column grid, actions stack, progress becomes vertical, and recent records
  become line-separated rows.
- Operations desktop uses a 234px rail, full-width table, and 312px detail
  drawer. Below 960px, navigation becomes an off-canvas menu, the table scrolls
  within its own region, and detail becomes a full-width bottom sheet.
- Page-level horizontal overflow is prohibited. Interactive touch targets are
  at least 44px where space permits, focus remains visible, and motion respects
  `prefers-reduced-motion`.

## Interaction and authorization contract

The Milestone 2 shell uses fictional display data and demonstrates only local
navigation, selection, drawer, search, and dialog behavior. It makes no domain
mutation or financial API call.

Navigation visibility is presentation, not authorization. Future routes and
endpoints must continue to use current database-backed role/capability checks;
hidden controls never replace server enforcement. Sender, staff, and admin
shells are explicit routes, and admin navigation is rendered only for the admin
variant.

The hold dialog uses native modal behavior, labelled title/description,
required reason input, inline error association, Escape cancellation, focus
restoration, and whitespace rejection. Confirmation does not perform a fake
transfer transition in this milestone.

## Donor decision

XBUX was inspected from a shallow temporary read-only checkout. Hawelly adapts
only shell anatomy, compact table density, selected-row detail state, and the
reason-required confirmation pattern. No donor file or dependency is copied.
Pages Router/auth helpers, warm/gradient branding, and every agent, wallet,
settlement, batch, float, commission, or reconciliation surface are rejected.

## Verification ledger

Verified on 27 August 2026 against the Milestone 1 checkpoint `df2b4bb`:

- Clean dependency install: `npm ci --ignore-scripts` passed; Prisma client
  regeneration then passed.
- Workspace gate: Prisma validate/generate, lint, API and web typechecks,
  35 API tests, 6 web policy tests, API build, and Next production build passed.
- Production routes: `/`, `/sender`, `/staff`, and `/admin` were statically
  generated successfully.
- Browser QA: desktop and mobile sender/operations shells, role navigation,
  search/selection, native modal behavior, whitespace reason rejection,
  Escape cancellation, focus restoration, responsive menus, and page-level
  overflow checks passed against the production server.
- Visual QA: all five saved concept/render pairs were directly inspected. The
  implementation preserves the approved layout, density, hierarchy, color,
  responsive behavior, and modal pattern. The unsupported operations-side
  `New transfer` concept action remains intentionally omitted.
- Dependency security: full and production-only `npm audit` both reported zero
  vulnerabilities. `npm ls --all --omit=optional` passed; absent platform
  packages are expected optional dependencies, and the installed Windows
  native packages are resolved.
- Security/authorization review: the complete 17-file source inventory,
  supporting lockfile, client bundle, QA process boundary, and rendered role
  surfaces were reviewed. The sealed scan
  `df2b4bb_m2_20260827T020000Z` has complete coverage and zero findings.
- Data boundary: fixtures are fictional and display-only; policy tests reject
  internal sender fields and executable/remote fixture values. Route-selected
  roles affect presentation only, and no API fetch, credential, persistence,
  unsafe HTML, or financial mutation path exists in this milestone.
- Artifact hygiene: local PostgreSQL data, Next/Prisma generated outputs,
  dependency directories, browser processes, donor checkout, and scan artifacts
  remain outside the checkpoint. Only the intentional design concepts and
  verified renders are included.

Milestone 2 success criteria are satisfied: the role shells build, layouts are
compact and professional, operational records remain concise tables/rows, and
no agent, settlement, float, wallet, commission, or reconciliation navigation
is rendered.
