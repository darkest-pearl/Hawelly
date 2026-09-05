# Database backup and restore

The helper creates a PostgreSQL custom-format backup through `pg_dump`, checks
that it is non-empty, verifies its catalog with `pg_restore --list`, publishes
it without overwriting an existing file, and writes a mode-`0600` JSON manifest
containing size, SHA-256, client version, reason, and environment. Database
credentials are converted to libpq environment variables and are never passed
on the command line or written to the manifest.

## Create a backup

PostgreSQL client tools must be compatible with the server. Prefer a dedicated
backup role in `BACKUP_DATABASE_URL`; otherwise the helper uses `DATABASE_URL`.
The role must be able to read every application object. Run:

```powershell
npm run release:db:backup -- --environment production --reason "pre-release <change-id>"
```

The ignored `backups/` directory is the default target. Use
`--output-dir <approved-path>` to write directly to encrypted backup storage.
Copy both `.dump` and `.manifest.json` off-host, verify the SHA-256 after copy,
and apply the organization's retention and access policy. A successful local
file is not, by itself, a disaster-recovery backup.

## Restore drill or recovery

1. Announce a maintenance window and stop API/web writes. Preserve the damaged
   database and current evidence directory for investigation.
2. Verify the selected dump against its manifest SHA-256 and record who approved
   the restore and why.
3. Create a new empty PostgreSQL 18 database. Do not restore over the only copy
   of an existing database.
4. Restore with the same or newer compatible `pg_restore` client:

   ```powershell
   pg_restore --exit-on-error --no-owner --dbname <new-database-url> <backup.dump>
   ```

5. Point a maintenance instance at the restored database. Run
   `npm run db:migrate:deploy`, verify Prisma migration status, then run the
   schema/database integration tests against an isolated copy.
6. Verify record counts and representative transfers, quotes, funding proofs,
   payouts, resolutions, staff capabilities, runtime configuration history, and
   audit history. Verify the corresponding private evidence objects separately;
   database backup does not contain evidence file bytes.
7. Update the production database URL through the approved secret channel,
   restart with `--update-env`, compare the redacted fingerprint, and run all
   health probes before reopening traffic.

Restore drills should be scheduled and recorded. Never treat a manifest catalog
check as a substitute for a periodic full restore and application verification.
