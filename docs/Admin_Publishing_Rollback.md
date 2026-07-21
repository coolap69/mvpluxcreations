# Admin Publishing Architecture Rollback

The rollback checkpoint for the Admin publishing rebuild is:

`df63f6c042dce5e93bae7fb90e6ed53f060f63fa`

The rebuild stores one recovery-only snapshot in the `admin-global` `site_edits` row under `adminPublishingMigrationBackupV1`. The backup contains the pre-migration Admin state, page-specific `site_edits` rows, the published settings document, the fallback product catalog, and the category display-card defaults. The application must never use this backup as an active data source.

## Activation safety sequence

Normal Admin page loading performs no backup, migration, activation, save, or publish writes. The protected workflow requires four separate human actions:

1. **Create and Verify Recovery Backup** captures every current `site_edits` row and the published snapshot, reads the saved backup back from Supabase, and verifies its row identifiers, collection counts, deterministic SHA-256 checksum, and complete source digest.
2. **Prepare New Admin Data** rechecks the backup and current source, acquires a short-lived revision-checked migration lock, and prepares normalized private data. It does not activate the new readers.
3. **Activate New Admin Locally** is available only when the verified backup and prepared migration have the same checksum. It changes only the private Admin feature flag and does not publish.
4. **Publish Changes** remains a separate action in the Publish section.

If private Admin data changes after the backup, verification fails and preparation/activation remain blocked until a new explicit backup is created. If another browser tab holds the preparation lock, the second tab stops without writing migration data. If the published settings file cannot be read, backup creation stops before any write.

## Disable the new readers

Preferred Admin action: open `admin.html#recovery-advanced`, choose **Roll Back to Old Readers**, and confirm. This only changes the private feature flag and preserves normalized data and the migration backup.

If the new Admin architecture must be stopped, use the Supabase SQL Editor while signed into the correct project and run this non-destructive update:

```sql
update public.site_edits
set edits = jsonb_set(
  coalesce(edits, '{}'::jsonb),
  '{adminArchitectureV2,enabled}',
  'false'::jsonb,
  true
)
where page_key = 'admin-global';
```

This keeps the migration backup and all new normalized data. It only directs the website back to the legacy readers that existed at the rollback checkpoint.

## Restore the previous tracked website version locally

If code rollback is also required, first preserve all current work in a new Git branch. Then restore only tracked website files from the checkpoint without using `git reset --hard` or `git clean`:

```bash
git branch backup-admin-publishing-rebuild HEAD
git restore --source=df63f6c042dce5e93bae7fb90e6ed53f060f63fa --worktree --staged -- .
```

This does not remove untracked images or `supabase/.temp/`. Do not commit or publish the restored files until the feature flag is disabled and the storefront has been verified.

## Recovery rules

- Never delete `adminPublishingMigrationBackupV1` during the rollback period.
- Never restore the backup automatically during normal page loading.
- Export the current private and published states before any manual restoration.
- Do not run partial JSON updates if the `admin-global` row cannot first be backed up.
- Do not publish while unresolved migration conflicts exist.

## Full backup restoration

The protected **Restore Migration Backup** action in Recovery / Advanced restores the captured `admin-global` and page-specific rows through revision-checked `save_site_edits` calls. It retains `adminPublishingMigrationBackupV1` and disables the new reader flag. Use it only after exporting both the current private state and published snapshot. A failed row write stops restoration and reports the Supabase error; it must not be treated as a successful rollback.
