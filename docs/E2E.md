# Isolated authenticated E2E

`npm run test:e2e` requires NOOK_TEST_URL, NOOK_TEST_ANON_KEY, NOOK_TEST_SERVICE_KEY, NOOK_TEST_PROJECT_REF, NOOK_PRODUCTION_PROJECT_REF and NOOK_ALLOW_TEST_WRITES=isolated-beta-only. Supply secrets only through the shell or a protected GitHub environment. The test project must differ from production. Missing configuration aborts before network traffic.

Use a disposable Supabase project with the complete migration sequence. Disable email confirmation in this isolated project so invited signup can establish a session without SMTP. The runner rebuilds the app with the isolated public configuration and starts its own server on 127.0.0.1:3100. Close any server on that port first.

The suite provisions unique invited users, a revoked account, an admin, and an original one-page PDF. It tests login, signup/denial, catalog, PDF, bookmarks, favorites, comments, profile, logout, admin publication/moderation, and mobile overflow. It removes its own fixtures after execution. If interrupted, locate the unique E2E title and example.test accounts in the isolated project and clean those fixtures manually. No production records are used.

Traces and screenshots are disabled in authenticated tests to avoid recording credentials or private URLs. Browser tests with local original reading files remain `npm run test:browser` and do not mutate remote data. Authenticated E2E execution remains pending until the isolated environment is provided.
