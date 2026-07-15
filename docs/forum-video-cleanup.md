# Forum local-video cleanup

This process cleans local forum-video uploads from the exact hosted Supabase
project configured by `NEXT_PUBLIC_SUPABASE_URL`. Production must use project
`ycjuceortcduakxscfes`; an isolated non-production run may use its own valid
20-character Supabase project ref. It is deliberately conservative: dry-run is
the default, execute modes derive and require the exact configured project
confirmation, paths must match the feature's UUID layout, and every deletion
is preceded by fresh database state and post-reference checks.

The process never deletes `storage.objects` rows directly. It removes one
exact object at a time through the Supabase Storage API. Credentials are read
from the operator environment and must never be pasted, printed, committed, or
exposed through a `NEXT_PUBLIC_` variable.

## Lifetime and eligibility

Upload reservations expire two hours after creation. Cleanup adds a further
24-hour grace after `expires_at`, so a normal temporary reservation remains for
at least 26 hours after creation.

Finalized videos are not potential orphans until at least 30 days after
`finalized_at`. Age alone never proves that a video is safe to delete.

Expired-reservation mode considers only rows that are still `reserved`, have
matching `reservations/{admin UUID}/{year}/{month}/{video UUID}.{ext}` and
`videos/...` paths, and have no reference in either
`forum_posts.content_html` or `forum_posts.content_json`. It will remove only
the temporary object. A final-path object on a reserved row is blocked for
manual partial-finalization review.

Finalized-orphan mode considers only rows that are still `finalized`, at least
30 days old, have an existing exact final object, and have no reference in
either stored post field. Deleted, rejected, unapproved, and otherwise
non-public posts still count as references.

## Prerequisites

Before an execute run:

1. Confirm migration `20260715000002_forum_video_upload.sql` was separately
   reviewed and applied to the exact project named by
   `NEXT_PUBLIC_SUPABASE_URL`. For Production that exact origin is
   `https://ycjuceortcduakxscfes.supabase.co`.
2. Confirm the `forum-videos` bucket and tracking columns exist, including
   `upload_path`, `object_path`, `status`, `expires_at`, `finalized_at`, and
   `deleted_at`.
3. Run only in a protected operator environment where the Supabase
   service-role credential is already configured. Never paste or print it.
4. Keep `forum_local_video_upload.enabled_for` empty for the entire execute
   window. The script verifies this before execution and again immediately
   before every removal. The migration trigger blocks all newly added local
   video references while this flag is disabled; ordinary rich text, image
   uploads, and YouTube/Vimeo embeds remain available. Do not disable or alter
   the separate `forum_rich_text` flag for this cleanup.
5. Retain an independent media backup. Storage deletion is permanent.

Disabling the flag prevents new reservations, Storage moves, finalization, and
new post references. Supabase signed upload tokens already issued before the
flag change are not revoked and may still place temporary bytes until their
two-hour lifetime ends. This is why cleanup waits for reservation expiry and
then applies the additional 24-hour grace; such bytes cannot be finalized or
saved into a post while the flag remains disabled.

Do not run this process from a browser.

## Dry run

Dry-run is the default and performs no update or deletion:

```sh
node --env-file=.env.local scripts/cleanup-forum-videos.mjs
```

Limit review output when needed (maximum 100 per category):

```sh
node --env-file=.env.local scripts/cleanup-forum-videos.mjs --limit=10
```

Review every `candidate`, `blocked`, and `notice` result. Never bypass a
blocked row without investigating its tracking record, both object paths, and
all post content.

The execute examples below show the Production ref. For an approved isolated
non-production project, replace `--confirm-project` with the ref derived from
that environment's validated `NEXT_PUBLIC_SUPABASE_URL`; the script rejects a
mismatch.

## Remove expired temporary reservations

After a fresh dry run and after confirming local-video writes are disabled:

```sh
node --env-file=.env.local scripts/cleanup-forum-videos.mjs \
  --execute-expired-reservations \
  --confirm-project=ycjuceortcduakxscfes \
  --confirm-writes-paused \
  --limit=10
```

For each row, the script re-reads the tracking state, verifies eligibility and
both paths, confirms no final object exists, rescans all posts immediately
before removal, re-reads the row again, removes at most the exact temporary
object, verifies absence, and then marks the row `deleted` with `deleted_at`.
If the temporary object is already absent and no final object/reference exists,
only the tracking state is updated.

## Remove manually reviewed finalized orphans

This is a separate, higher-risk mode:

```sh
node --env-file=.env.local scripts/cleanup-forum-videos.mjs \
  --execute-finalized-orphans \
  --confirm-project=ycjuceortcduakxscfes \
  --confirm-writes-paused \
  --limit=10
```

Use it only after manually reviewing a current dry run and confirming the
independent local-video flag is disabled. The script rechecks the row, age,
path, object existence, and every post's HTML and TipTap JSON immediately
before deleting the exact final object. It then verifies absence and marks the
tracking row `deleted`.

## Partial failures and limits

Storage removal and the tracking-row update are not atomic. If removal succeeds
but the row update fails, stop: inspect the exact row, confirm the object is
absent, rescan both post content fields, and reconcile the row only after those
checks pass. A finalized row whose object is missing is reported as blocked and
is never changed automatically.

The independent database gate and post trigger prevent a new local-video
reference from appearing between the final post scan and Storage removal. The
`--confirm-writes-paused` argument confirms that reservations, finalization,
Storage moves, and new post references are paused; it does not revoke an
already-issued temporary upload token or pause general forum editing. The
script knows only the current
`forum_posts.content_html` and `content_json` references; extend it before
executing if another table or product begins referencing these objects. Public
CDN caches may briefly retain deleted bytes. A database backup does not restore
deleted Storage objects.

The script is intentionally unscheduled. Do not add unattended cron until
production history and an operational locking design justify it. A 30-day-old
unreferenced finalized object is still a business-retention decision requiring
manual review.

## Recovery

This script cannot restore Storage bytes. Recovery requires an independent
backup, an approved privileged upload to the exact intended immutable path,
verification of MIME, byte size, and signature, correction of tracking state
only after object verification, and rechecking both admin and public rendering.
Never restore unverified media into the public bucket.
