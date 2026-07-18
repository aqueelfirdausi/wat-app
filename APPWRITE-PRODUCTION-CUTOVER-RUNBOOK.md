# WAT App future Appwrite production cutover runbook

Status: executable plan only. **Do not execute while Phase 3Z is NOT READY.**

## Authority and stop rules

Only the owner may authorize cutover or rollback. Stop immediately for a Git
reference mismatch, dirty or secret-bearing worktree, failed recovery, failed
image flow, unexpected Appwrite data/permission, runtime 500, missing chunk,
client secret, audit persistence failure, unsafe rollback, or any production
setting not matching the approved inventory. Never dual-write the catalogue.

## Pre-cutover

1. Record the approved migration commit and require
   `appwrite-migration...origin/appwrite-migration` at `0/0`.
2. Confirm `main`, `origin/main`, and
   `origin/archive/stage-5-pre-appwrite` match their approved hashes.
3. Require a clean worktree; prove `.env.local` ignored/untracked and scan
   tracked files and built client output against real secret values.
4. Verify current `watapp.pk` health, Firebase Google login, Firestore
   catalogue/admin writes, Firebase Storage images, broadcasts, notifications,
   and Firebase App Hosting rollback deployment.
5. Run `npm run lint`, `npm run typecheck`, `npm run build`, all Appwrite
   suites, mutation-gate tests, and Firebase containment tests.
6. Run `npm run appwrite:bootstrap`,
   `npm run appwrite:activity-schema`, `npm run appwrite:check-empty`,
   `npm run appwrite:check-activity`, and the read-only identity/platform
   inventory.
7. Require products/categories/files at the owner-approved migration baseline,
   exact locked schemas and permissions, exactly one permanent admin owner,
   and no disposable identities or rows.
8. Prove owner login, fresh password recovery to the exact production-candidate
   hostname, new-password login, old-password denial, malformed/reused-link
   denial, and unchanged Team role.
9. Repeat the complete staging category/product/image replacement/publication/
   chosen/hide/removal/deletion UI flow and the live editor denial matrix.
10. Confirm staging activity events are durable, redacted, classified, and
    admin-only; return staging catalogue/files to baseline.
11. Inventory production variable names and intended classifications without
    printing values. Prepare server-only Appwrite keys with least privilege.
12. Confirm the exact production Appwrite Web platform hostname and recovery
    callback to add. Do not use a wildcard.
13. Define the feature boundary for Firebase-only broadcasts, notifications,
    analytics, and `team_contacts`; disable any feature that cannot remain
    explicitly isolated. Catalogue fallback is forbidden.
14. Freeze content changes for the cutover window and capture Firebase and
    Appwrite counts plus a timestamped preservation record.
15. Assign operators, owner approver, observation duration, rollback decision
    deadline, and reconciliation owner.
16. Obtain explicit written owner approval for the exact commit, environment
    plan, platform hostname, mutation-enable point, feature boundary, and
    rollback plan.

## Cutover

1. Deploy only the approved commit to a non-live target using the approved
   production deployment mechanism. Do not move the live domain yet.
2. Configure production:
   `WAT_BACKEND=appwrite`; exact public Appwrite endpoint/project ID; server-only
   data/auth keys; fixed database/Team/bucket/table IDs; exact session cookie
   name; exact HTTPS `APPWRITE_PASSWORD_RECOVERY_URL`; empty
   `WAT_ACTIVITY_FIXTURE_CLASSIFICATION`.
3. Keep `WAT_MUTATIONS_ENABLED=false`.
4. Add exactly the approved production Web platform hostname in Appwrite and
   verify no wildcard, duplicate, localhost, or unrelated hostname exists.
5. Build and inspect deployment logs. Stop for missing chunks, runtime errors,
   secret output, or protected caching.
6. On the candidate host, smoke-test anonymous catalogue/empty state, missing
   product 404, owner login, recovery callback, protected redirects, activity
   read, and no Firebase catalogue traffic.
7. Verify client bundles contain no server key, cookie, credential, or
   privileged endpoint; verify images use direct Appwrite delivery.
8. At the explicitly approved point only, set
   `WAT_MUTATIONS_ENABLED=true` and redeploy/restart through the approved
   mechanism.
9. Run one bounded production smoke fixture: create category, create private
   product, upload/replace image, publish, verify catalogue/detail/direct image,
   verify feed/featured/status/chosen, hide, verify anonymous denial, remove
   image, delete product/category.
10. Confirm audit persistence and attribution for every operation; return
    catalogue/files to the approved baseline unless real migrated data was
    explicitly approved.
11. Recount identities, memberships, platforms, rows, files, chosen state, and
    activity rows.
12. Move the approved production alias/domain only after all candidate checks
    pass. Change DNS only if the approved architecture requires it.
13. Purge/invalidate storefront caches and service-worker state using the
    approved deployment controls.
14. Verify `watapp.pk`: anonymous catalogue/detail, owner login, one bounded
    mutation, direct image delivery, activity log, logout/protected denial,
    recovery request callback, and zero Firebase catalogue requests.

## Observation window

1. Watch authentication and recovery failures, 4xx/5xx rates, serverless/Edge
   errors, mutation and audit-persistence failures, image upload/delivery,
   catalogue caches, Appwrite usage/rate limits, and client console errors.
2. Keep Firebase App Hosting, Firebase data, credentials, and the last healthy
   deployment intact. Do not delete or mutate rollback resources.
3. Prohibit Firebase catalogue writes during the Appwrite write window. Record
   every Appwrite catalogue mutation needed for reconciliation.
4. Check activity-log growth and exact admin-only permissions at agreed
   intervals. Stop on an unexplained row or permission.
5. End the window only with owner acceptance and a recorded final inventory.

## Rollback

1. Owner declares rollback and records the trigger/time.
2. Immediately set the Appwrite production mutation gate false through the
   approved environment mechanism and confirm mutation endpoints return the
   disabled result.
3. Preserve Appwrite rows, files, activity logs, deployment logs, and counts.
   Do not delete or rewrite them.
4. List all Appwrite writes since cutover. Decide how each will be replayed or
   reconciled before Firebase writes resume.
5. Redeploy/restore the last healthy Firebase commit and production
   `WAT_BACKEND=firebase` configuration. Restore the previous alias/domain/DNS
   only if it changed.
6. Verify Firebase Google login, Firestore catalogue/detail, admin product and
   stock writes, Firebase Storage, broadcasts, notifications, and
   `team_contacts`.
7. Verify `watapp.pk`, HTTPS, cache/service worker, customer WhatsApp flow, and
   no Appwrite catalogue mutation traffic.
8. Resume Firebase writes only after the reconciliation decision prevents lost
   or duplicate changes.
9. Keep Appwrite frozen as incident evidence. Record cause, impact, actions,
   outstanding reconciliation, owner decision, and the next approval gate.
