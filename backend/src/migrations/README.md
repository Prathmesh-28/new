# Database migrations

Forward-only, ordered SQL migrations applied **after** `db.js initDb()` on every boot
(see `lib/migrate.js`). `initDb()` remains the idempotent baseline; put **new** schema
changes here instead of hand-editing `initDb()`, so there's a recorded, ordered history.

## Adding a migration
Create a file named `NNNN_short_description.sql` (zero-padded, e.g. `0002_add_foo_index.sql`).
Files run in filename order, once each (tracked in the `schema_migrations` table), each in
its own transaction. A failure rolls back and is **not** recorded — boot fails loudly
rather than leaving a half-applied schema, so fix-and-redeploy is safe.

## Rules
- **Forward-only.** No down-migrations (a bad one is fixed by a new forward migration).
- **Idempotent-friendly.** Prefer `IF NOT EXISTS` / `IF EXISTS` so a manual partial run
  can't wedge things.
- **Keep them small and reviewable.** One concern per file.
- Don't edit a migration after it has shipped — it won't re-run; add a new one.
