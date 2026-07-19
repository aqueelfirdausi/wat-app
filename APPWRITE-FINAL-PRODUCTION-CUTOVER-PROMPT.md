# Final Appwrite production-cutover approval prompt

Status: **DO NOT EXECUTE WITHOUT EXPLICIT OWNER APPROVAL**

After the owner explicitly accepts every finding in
`APPWRITE-FINAL-MIGRATION-READINESS-CLOSEOUT.md`, approves one exact immutable
`appwrite-migration` commit, and authorizes cutover, execute only this bounded
procedure. Stop on any mismatch or failed check.

## Approved starting gate

1. Record the owner's written approval, approved commit, operators,
   observation window, rollback thresholds, and Firebase legacy-feature
   boundary.
2. Verify the approved commit is exactly aligned with
   `origin/appwrite-migration`, the worktree is clean, `.env.local` is ignored
   and unstaged, and the approved `main` and archive hashes are unchanged.
3. Reconfirm products/categories/files `0/0/0`, users/memberships `1/1`,
   owner role exactly `admin`, exact schemas/permissions, exact activity
   count, one approved Preview platform, no disposable/chosen/public residue,
   and deferred tables absent.
4. Verify committed/default `WAT_MUTATIONS_ENABLED=false`; scan tracked files
   and current client output for actual secret values.
5. Preserve the healthy Firebase production deployment, data, Storage,
   authentication, credentials, domain configuration, counts, and rollback
   record. Freeze catalogue entry for the cutover window.

## Candidate deployment and read-only checks

6. Merge or promote only the owner-approved migration commit using the
   repository's approved, non-destructive workflow. Stop for an unexpected
   commit, conflict, or unrelated change.
7. Deploy it first as a non-live production candidate. Do not remove or
   overwrite Firebase.
8. Configure production Appwrite endpoint/project identifiers and least-
   privilege server-only keys without printing values. Configure the exact
   database, Team, bucket, table, cookie, backend, and HTTPS recovery settings.
   Keep mutations disabled.
9. Add only the exact `watapp.pk` Web platform entry to Appwrite; add no
   wildcard, localhost, duplicate, preview replacement, or unrelated host.
10. Verify the production recovery callback targets exact HTTPS `watapp.pk`.
11. Before enabling writes, verify build/runtime health, anonymous catalogue
    behavior, protected redirects, owner login, activity read, direct
    Appwrite image architecture, no client secret, and no Firebase catalogue
    read/write fallback or mixed protected authentication.

## Approved mutation point and controlled smoke

12. Only at the owner-approved moment, enable the server-only production
    mutation gate through the approved environment/deployment mechanism.
13. Confirm owner-admin access, then create one unmistakably controlled
    category and private product.
14. The owner must manually upload, preview, publish, hide, and remove the
    first controlled production product image before broader catalogue entry.
15. Verify public catalogue/detail inclusion while published, direct
    anonymous Appwrite image delivery with no public write, row-first hiding,
    anonymous image denial after privatization, retained owner preview,
    chosen behavior, and immutable owner-attributed activity events.
16. Remove the controlled product/category and prove the approved
    product/category/file baseline, permissions, chosen state, and activity
    count. Verify zero Firebase catalogue traffic throughout.
17. Move the approved live alias/domain only after every candidate check and
    controlled smoke step passes. Change DNS only if separately and explicitly
    approved.

## Observation and rollback

18. Monitor Vercel/Firebase/Appwrite runtime health, authentication/recovery,
    `4xx/5xx`, missing chunks, exceptions, image operations/delivery,
    catalogue consistency, activity persistence/permissions, secrets, usage
    limits, and client errors for the approved observation window.
19. Immediately freeze Appwrite mutations and roll back on failed manual image
    smoke, unexpected credential acceptance or recovery-link reuse, public
    write/private-data exposure, authorization failure, audit loss, client
    secret, runtime `5xx`/missing chunk, inconsistent catalogue, unexpected
    Firebase catalogue traffic, or unsafe reconciliation.
20. For rollback, preserve Appwrite evidence and enumerate all writes before
    restoring the last healthy Firebase selector/deployment and any moved
    alias/domain. Reconcile before Firebase catalogue writes resume.
21. Keep Firebase and all rollback resources intact through the observation
    window. Stop before Firebase retirement, deferred-table creation, or
    expansion beyond the approved catalogue scope. Those require separate
    owner decisions.
