# Data and type foundation

## Supabase types

`src/lib/types.ts` contains application domain shapes. It is not a generated Supabase schema file: it also has UI-only state (`Series.is_favorite`) and does not describe every table, view, function, or relationship. The TypeScript client is currently untyped because there is no versioned Supabase CLI config or local database definition in this repository. Treating hand-maintained domain types as generated database types would hide schema drift.

The checked-in migrations and `supabase/schema.sql` are the schema source. After applying the current migrations to a disposable/staging Supabase project, generate a database snapshot with the Supabase CLI and review it before committing:

```sh
npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" --schema public,storage > src/lib/database.types.ts
```

Keep domain/UI types separate from the generated snapshot. Then parameterize `createClient<Database>` in `src/lib/supabase.ts` and replace casts at repository boundaries with `Tables<"books">`, `Tables<"series">`, and the relevant generated view/function types. Do not generate from production as part of routine development; the output must match the reviewed migrations.

## Data modules

`src/lib/data/` is the client data boundary. UI components may own presentation state, but query shape, persistence operations, Storage compensation, and error classification belong in these modules. Keep RLS as the authorization authority; owner IDs passed from the UI are filters and do not grant access.

- `catalog.ts`: catalog reads.
- `progress.ts`: cross-device reading progress.
- `favorites.ts`: per-account saved works.
- `bookmarks.ts`: reading markers.
- `comments.ts`: paginated conversation and moderation input.
- `uploads.ts`: duplicate checks, metadata registration, Storage cleanup, and partial delete reporting.
- `admin.ts`: administrative catalog reads.
- `errors.ts`: session, network, Storage, authorization, partial, and unknown failure classification.

Multi-step writes must report partial completion. For example, if media upload succeeds but metadata insertion fails, the repository removes the uploaded object; if cleanup also fails it returns a `partial` error with the object path so an administrator can reconcile it.
