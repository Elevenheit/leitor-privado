# Profile media cleanup

Replacement uploads and validates the new object before changing the profile. Only then is the previous object removed. If it is still used by avatar/banner it is retained. Failed cleanup does not undo the new image.

Run `node scripts/profile-orphans.mjs` with the same server-only credentials used by backup. It reads all profile references and paginates Storage, writing `artifacts/profile-orphans.json`. It never deletes. Keep the report private and outside Git.

For manual cleanup: create and verify a backup; stop profile uploads during maintenance; generate a fresh report; verify each candidate is still absent from BOTH avatar_path and banner_path in all profiles; remove only the reviewed candidates from the profiles bucket using the Storage dashboard. Do not remove objects younger than 24 hours or objects with an unknown timestamp. Resume uploads after maintenance. Never use a stale report as deletion authorization.

The public identity view exposes id/nickname/avatar/avatar_path only; the RLS suite checks absence of email. No remote cleanup was executed as part of this change.
