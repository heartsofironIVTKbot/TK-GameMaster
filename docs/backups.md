# Database backups

GameMaster's database is on **Aiven for MySQL**. Aiven's Free plan keeps only
one backup for disaster recovery, so there are two more layers:

1. **Nightly, automatic** — the GitHub job `Database backup`
   (`.github/workflows/db-backup.yml`) runs every night at 03:17 UTC. It saves
   the whole GameMaster database (IronLegion's tables are skipped) and uploads
   it to a private **Backblaze B2** bucket. The newest 14 are kept.
2. **Manual, before every major update** — on the owner's PC:
   `py -3 scripts/copy_database.py --backup` writes
   `backups/gamemaster-<date>.json.gz` (never committed).

## Settings (GitHub → repo → Settings → Secrets and variables → Actions)

| Secret | Value |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Aiven connection details |
| `DB_CA` | Aiven's CA certificate (the whole `ca.pem`) |
| `B2_KEY_ID`, `B2_APP_KEY` | Backblaze application key (limited to the bucket) |
| `B2_BUCKET` | Bucket name |
| `B2_ENDPOINT` | The bucket's S3 endpoint, e.g. `s3.eu-central-003.backblazeb2.com` |

If the Aiven password changes, update `DB_PASSWORD` here too, or the job fails
(GitHub emails the repo owner when it does). GitHub pauses scheduled jobs after
60 days without commits; re-enable it under Actions → Database backup.

Run a backup now: Actions → Database backup → **Run workflow**.

## Restore

1. Download the backup: either from Backblaze (Buckets → Browse Files → the
   file → Download) or use a manual one from `backups/`.
2. Put it in the `backups` folder of the project on the PC.
3. `scripts/_copy.env` must have the `TARGET_*` lines for the database to
   restore into (the Aiven one).
4. Stop the bot (Apollo → Stop), so it doesn't write during the restore.
5. `py -3 scripts/copy_database.py --restore backups/<file name>` and type
   `yes`. Every table in the backup is replaced; other tables are untouched.
6. Start the bot again and check the website and a game in Discord.
