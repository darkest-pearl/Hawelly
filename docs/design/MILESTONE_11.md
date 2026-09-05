# Milestone 11 — Release and operations tooling

## Outcome

Milestone 11 makes Hawelly's production path explicit and repeatable without
changing its backend-centric financial or authorization architecture. The
reference XBUX repository was inspected only for operational patterns. The safe
environment loading, PM2 update discipline, backup publication, and runbook
structure were adapted to Hawelly; no crypto settlement, agent portal, batch,
wallet, float, commission, or reconciliation components were imported.

## Release boundary

`scripts/release/withEnv.mjs` parses one or more dotenv files without shell
evaluation or interpolation, overlays later files deterministically, spawns an
argument-array command with `shell: false`, and enforces a bounded runtime. The
production examples remain placeholders and are rejected until operators
replace them outside version control.

PM2 7.0.4 is repository-pinned. The ecosystem runs the built API and web server
as single forked processes with bounded shutdown/listen timings. All approved
configuration restarts include `--update-env`. Redacted inspection exposes only
safe runtime fields and secret length/fingerprint summaries, so operators can
verify rotation without printing credentials.

The release audit enforces production mode, PostgreSQL URL shape, three strong
distinct secrets, HTTPS exact origins, absolute evidence storage, exact trusted
BFF peers, Android download/digest pairing, and a trusted web ingress header.
It does not connect to production or disclose configuration values.

## Health and recovery

The health checker calls liveness, database readiness, and private evidence
storage sequentially with a per-request timeout. The storage endpoint exercises
the configured adapter's write/delete healthcheck; evidence remains private and
is not served as static content.

The database helper uses libpq environment variables rather than credentialed
command arguments, writes a temporary custom-format dump, checks size and
catalog readability, publishes without overwrite, applies private file modes,
and writes a credential-free SHA-256 manifest. Database and evidence recovery
remain separate responsibilities.

## Verification evidence

- Eight release-tool unit/integration tests pass, including quoted env parsing,
  layered overrides, a real child receiving the final value, production audit,
  three health probes, URL-to-libpq conversion, and secret-safe PM2 summaries.
- A disposable PM2 process was started with `PORT=4101`, restarted using a
  second env file and `--update-env`, and observed at `PORT=4102`; its secret
  fingerprint changed without exposing the secret. The process and daemon were
  then stopped.
- A fresh PostgreSQL 18 database applied all 13 migrations. The helper produced
  a non-empty verified custom dump and SHA-256 manifest. `pg_restore
  --exit-on-error` restored it into a second empty database, where all 13
  migration records and the `TransferRequest` table were confirmed. The cluster
  and backup were removed afterward.
- Deployment, PM2, backup/restore, beta onboarding, and beta limitation runbooks
  define owners, ordering, verification, rollback, and known operational limits.

Final repository, dependency, live storage-health, and proportional security
gates are recorded at checkpoint completion.
