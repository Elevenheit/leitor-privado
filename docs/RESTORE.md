# Backup verification and isolated restore rehearsal

Pause writes during backup and restoration verification: the SQL dump, table inventory and Storage downloads are separate snapshots. Retain the existing backup until the rehearsal passes. Never commit backup files or credentials.

1. Configure NOOK_BACKUP_URL, NOOK_BACKUP_SERVICE_KEY and PGSERVICE through a private shell/pg_service.conf/pgpass. Run `node scripts/backup.mjs`.
2. Run `node scripts/verify-backup.mjs backups/<timestamp>`. It verifies the dump checksum and parses it with pg_restore --list; checks every object, duplicate/path safety, counts, sizes and SHA-256. Missing or corrupted files fail. Use PostgreSQL tools compatible with the dump server version.
3. Create a disposable Supabase project. Record its ref and the production ref separately. Configure a pg_service entry named nook_restore_isolated and confirm its host points ONLY to that disposable project. Restore through an operator-reviewed pg_restore command targeting that service. Auth/Storage schemas are provider-managed: follow the provider's restore procedure, preserve Auth UUIDs, avoid overwriting provider roles, and re-upload actual object bytes with the original bucket/key. SQL Storage metadata alone does not restore files.
4. Configure NOOK_TEST_URL, NOOK_TEST_SERVICE_KEY, NOOK_TEST_PROJECT_REF and NOOK_PRODUCTION_PROJECT_REF. Run `node scripts/verify-restoration.mjs backups/<timestamp>`. This makes read-only calls to the isolated target and compares series, volumes, books, progress, bookmarks, favorites, comments, profiles and every Storage object. It checks content hashes as well as counts.
5. Record date, backup ID, isolated project ref, tool versions, comparison output and manual Auth/RLS checks. Remove the disposable project only after the evidence is saved securely.

No restore command is automated against the primary project. A file-verifier unit test is not a restore rehearsal. The remote rehearsal is pending because this workspace has no isolated project credentials or real backup configured.
