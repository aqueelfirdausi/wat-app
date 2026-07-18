# Appwrite Phase 3Z staging and cutover readiness

Decision: **NOT READY**

Phase 3Z stopped without a production cutover. Production Firebase, `watapp.pk`,
DNS, `main`, and the archive reference were not changed.

## 1. Starting state

- `appwrite-migration` started at `d10ce9d4da2d21cf15d0735e20425704f936de97`,
  aligned with its remote at `0/0`, with a clean worktree.
- `main` and `origin/main` were
  `83616bfd67534fdd090459230b373f23633bc81d`.
- `origin/archive/stage-5-pre-appwrite` was
  `8d1a1ccee792f672864bc32827caefc43d5e7210`.
- `.env.local` was ignored and untracked. Appwrite catalogue/files were `0/0/0`;
  users/memberships/platforms were `0/0/0`; 15 retained activity rows were
  classified `phase3y_verification`.

## 2. Authentication re-audit

Appwrite Email/Password is enabled. Phone, Magic URL, Email OTP, Anonymous,
OAuth providers, Team invites, and JWT are disabled. There is no public signup
UI and no Google sign-in in Appwrite mode. Firebase Google authentication
remains contained to Firebase mode. Login, recovery request, and recovery
completion are same-origin, server-mediated paths. The session cookie is
HTTP-only, SameSite=Lax, path-bounded, secure outside development, and not
available to client JavaScript. Recovery values are bounded, moved into a
short-lived HTTP-only cookie, excluded from logs, and handled with generic
failure responses.

## 3. Permanent owner establishment

One permanent Appwrite email/password owner exists for the trusted project
owner address. One confirmed `wat_staff` membership exists with exactly the
recognized application role `admin`; `product_editor` is not also assigned.
The owner successfully logged in, reached protected admin pages, performed
staging mutations, and read the admin-only activity log. Final retained
identity counts are one user and one Team membership.

## 4. Recovery verification

The real owner request returned the approved generic response, an unknown
address returned the same response, and the owner-controlled inbox received
the Appwrite email. The delivered link incorrectly targeted
`http://localhost:3000/admin/reset-password`. The owner opened it; the callback
was transferred without exposing its secret to the exact approved staging
host, and the owner completed the final password change personally. The
existing owner session remained valid and retained the exact admin role.
Malformed callbacks fail closed with a generic invalid/expired result.

This is not a clean end-to-end pass: the delivered hostname was wrong; direct
old-password rejection, new-password login, and live reused-link completion
rejection were not proven without asking for or handling the owner's password.
The Preview-scoped `APPWRITE_PASSWORD_RECOVERY_URL` was corrected in Vercel,
but Vercel requires a new Preview deployment for it to take effect. The exact
safe redeploy was prepared and then blocked by the browser's Vercel privacy
policy; no deployment was created.

## 5. Isolated staging deployment

The isolated Vercel project is `wat-app-preview`. The verified deployment is
Preview deployment `Q6tmFuKUaYbTq2rBoG9UMWiNgccK`, source commit
`ec58b2e48bd9dd430d29b2214055af46430698f6`, status Ready, duration 1m23s.
Its branch alias is
`wat-app-preview-git-appw-ead519-aqueel-ahmed-firdausis-projects.vercel.app`.
It is sourced from `appwrite-migration`, has no custom production domain, and
was not promoted. The corrected recovery variable is pending redeployment.

## 6. Appwrite Web platform configuration

Exactly one Appwrite Web platform is retained:

`wat-app-preview-git-appw-ead519-aqueel-ahmed-firdausis-projects.vercel.app`

No wildcard, localhost, `watapp.pk`, production subdomain, unrelated preview
hostname, or duplicate platform was added.

## 7. Staging environment and mutation gate

Committed/default `WAT_MUTATIONS_ENABLED=false` remains unchanged. The isolated
Preview branch alone has Preview-scoped `WAT_BACKEND=appwrite`,
`WAT_MUTATIONS_ENABLED=true`, and
`WAT_ACTIVITY_FIXTURE_CLASSIFICATION=phase3z_staging_verification`. Server API
keys remain server-only. Production variables were not edited. Staging may
remain mutation-enabled for the sole permanent admin while it contains no real
catalogue data, but it is not production authorization.

## 8. Complete browser workflow

Passed through the real staging UI: owner session, disposable category/product
creation, hidden-product exclusion, publication blocked without a verified
image, feed blocked while hidden, featured/status-pick independence, chosen
selection, exactly-one chosen evidence, chosen-product deletion block, chosen
clear, product deletion, category deletion, and final empty state. All fixtures
used unmistakable Phase 3Z names.

Blocked: Chrome opened the file chooser but rejected `setFiles` even after the
extension file-URL setting was reportedly enabled. Therefore upload, private
admin display, replacement ordering, public image delivery, publication,
published image-removal block, hide/privatize, anonymous denial, and UI image
removal/file deletion were not re-proven in Phase 3Z. The underlying service
paths remain covered by the passing Phase 3X live evidence and current tests,
but the required Phase 3Z UI repetition is incomplete.

## 9. Role and authorization verification

The permanent admin path passed. Automated authorization tests prove editor
create/update/image/visibility/chosen permissions, admin-only deletion/log
boundaries, crafted-request denial, owner-only denial, zero-role denial, and
ambiguous multi-role fail-closed behavior. Live activity verification confirms
editor activity reads are denied. A disposable live editor was not created, so
the complete live editor browser matrix was not repeated. No disposable user,
membership, or session remains.

## 10. Public and protected regression

The unauthenticated storefront loaded, rendered the empty baseline, and did
not expose the hidden fixture. The owner reached protected admin and activity
pages; the activity UI was read-only. Malformed recovery callbacks failed
closed. Tests cover missing/private/malformed rows, 404 behavior, Firebase
containment, narrow DTOs, no privileged Appwrite image proxy, and protected
server mediation. The published fixture/direct image/cache-deletion regression
could not be completed because file upload was blocked.

## 11. Build/runtime diagnostics

Local production build passed and emitted no missing vendor chunk. The verified
Preview deployment is Ready and its routes used during QA returned without a
runtime 500. Browser error/warning logs contained zero entries and zero
sensitive-pattern matches. Vercel connector runtime/build-log retrieval was
blocked by scope reauthentication, so a full server runtime-log secret scan is
not claimed.

The workspace-root warning is reproducible and environmental: a parent Desktop
lockfile causes root inference. The webpack cache snapshot warning is
reproducible locally but non-blocking; clean compilation succeeds. The
Edge/static-generation notice is expected for Edge routes and is non-blocking.
No broad dependency or configuration change is justified in this phase.

## 12. Production inventory

Production remains Firebase App Hosting, backend ID `wat-app`, Firebase project
`wat-app-727c6`, production branch `main`, live domain `watapp.pk`, and
`minInstances: 1`. The backend remains Firebase. Production authentication is
Firebase Auth/Google; catalogue and operational data are Firestore (database
`watapp`); images are Firebase Storage; messaging uses Firebase Messaging.
Firebase `broadcasts`, analytics events, notification tokens, and legacy
`team_contacts` remain rollback dependencies.

Application production variable names include `WAT_BACKEND`,
`WAT_MUTATIONS_ENABLED`, the `NEXT_PUBLIC_FIREBASE_*` set,
`NEXT_PUBLIC_FIREBASE_VAPID_KEY`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, and
`NEXT_PUBLIC_APP_URL`; Firebase App Hosting supplies server ADC. Values were
not read or changed. Build/deploy remains Firebase App Hosting source deploy
from `main`; rollback is a known-good Firebase deployment/commit plus the
Firebase selector and unchanged domain.

## 13. Cutover dependency map

| Dependency | Status | Evidence or required action |
| --- | --- | --- |
| Permanent owner and exact admin membership | Ready with finding | Exists and works; new-password login still needs direct proof |
| Email/password configuration | Ready | Email/password only; public signup/OAuth disabled |
| Recovery callback | Blocked | Correct Preview value saved but not deployed or freshly retested |
| Exact staging Web platform | Ready | One exact branch hostname |
| Catalogue/image/activity schemas | Ready | Locked live schemas; deferred tables intentionally absent |
| Catalogue and file baseline | Ready | `0/0/0` |
| Activity baseline | Ready | 34 rows, exact permissions, classified and redacted |
| Complete image/publication UI QA | Blocked | Chrome file handoff rejected |
| Live editor browser matrix | Ready with finding | Server/live-reader enforcement passes; browser repetition incomplete |
| Preview build/runtime | Ready with finding | Ready deployment; connector server-log scan unavailable |
| Production Appwrite variables | Deferred | Must be created only during approved cutover |
| Production Web platform/recovery hostname | Deferred | Add exact `watapp.pk` only at cutover |
| Mutation enablement | Deferred | Keep false until approved cutover point |
| `analytics_events` | Not applicable to first catalogue cutover | No Appwrite table; analytics must stay explicitly isolated/disabled |
| `broadcasts` | Deferred | Firebase-only feature boundary required or feature disabled |
| Appwrite `team_contacts` | Not applicable | Must remain absent; Firebase legacy boundary is explicit |
| Firebase rollback | Ready with finding | Infrastructure retained; divergence procedure required |
| Promotion/domain/DNS | Deferred | Explicit owner approval required |

## 14. Recommended first cutover scope

After blockers close, the smallest cutover is Appwrite email/password auth,
categories, products, product images, server-mediated admin mutations, and
activity logs. Keep Firebase infrastructure intact for rollback. Keep
Firebase-only broadcasts, notifications, analytics, and `team_contacts`
explicitly feature-scoped or disabled; do not allow catalogue fallback or dual
writes. If those boundaries cannot be kept explicit, the cutover remains
blocked.

## 15. Rollback plan

Freeze Appwrite mutations first, preserve all Appwrite rows/files/logs, revert
the production selector/deployment to the last healthy Firebase release, and
restore the previous domain/alias only if it moved. Validate Firebase login,
catalogue, images, admin writes, messaging, and `watapp.pk`. Record Appwrite
writes made during the observation window and reconcile them before Firebase
writes resume. Never dual-write or destructively clean Appwrite during an
incident. The owner authorizes rollback.

## 16. Cutover runbook

The executable future procedure is in
`APPWRITE-PRODUCTION-CUTOVER-RUNBOOK.md`. It was not executed.

## 17. Activity-log evidence

Starting rows: 15 `phase3y_verification`. Added rows: 19
`phase3z_staging_verification`. Final rows: 34. Every row has exact admin Team
read permission; newest-first reading, owner admin read, editor read denial,
no update/delete boundary, and sensitive-text absence all pass. The UI
attributes Phase 3Z events to the permanent owner as `admin`.

## 18. Cleanup proof

Final products/categories/product-image files are `0/0/0`. Chosen state is
cleared. No disposable category, product, file, editor, membership, session,
platform, local fixture, or local server remains. The permanent owner and one
exact admin membership are retained. Classified activity evidence is retained.

## 19. Tests and verification

Passed: Phase 3Z/3Y activity/UI tests `17/17`; Appwrite foundation `197/197`;
consolidated mutations `83/83`; mutation gate `18/18`; Firebase inventory
`8/8`; lint; typecheck; production build; live bootstrap/schema comparison;
live empty-state recount; live activity schema and reader/permission/redaction
checks; `git diff --check`; actual-value tracked and client bundle scans
(`0` hits across three keys). Browser QA passed the non-image subset.

Incomplete or blocked: Phase 3Z file upload/publication UI sequence, full live
editor browser matrix, fresh corrected recovery delivery/new-password login/
reuse proof, and Vercel server runtime-log retrieval.

## 20. Files changed

Checkpoint `ec58b2e` changed `.env.example`, `package.json`,
`lib/appwrite/activity-logs.ts`, `lib/appwrite/table-blueprints.ts`,
`scripts/appwrite-activity-verification.ts`, and
`tests/appwrite-activity-logs.test.ts`. This handoff adds this report,
`APPWRITE-PRODUCTION-CUTOVER-RUNBOOK.md`, and the Phase 3Z handoff section.
No environment or credential file is tracked.

## 21. Git state

The pushed implementation checkpoint is
`ec58b2e48bd9dd430d29b2214055af46430698f6` on
`origin/appwrite-migration`, initially verified at `0/0`. `main` and the archive
reference remain unchanged. The final documentation commit is the commit
containing this report and is reported after commit/push because a commit
cannot contain its own hash.

## 22. Exact final Appwrite state

- Project/database/Team/bucket: existing Frankfurt `watapp`, `wat_app`,
  `wat_staff`, `product_images`.
- Permanent tables: `products`, `categories`, `activity_logs`,
  `analytics_events`, and `broadcasts`; the last two remain intentionally
  absent/deferred under the frozen blueprint. Appwrite `team_contacts` is
  absent.
- Products/categories/files: `0/0/0`.
- Users/memberships: `1/1`; recognized application role exactly `admin`.
- Platforms: one exact isolated Preview hostname.
- Activity rows: 34 (`15` Phase 3Y, `19` Phase 3Z).
- Auth: email/password enabled; all prohibited methods disabled.

## 23. Readiness decision

**NOT READY.** The required complete image/publication UI flow did not pass,
the corrected recovery callback is not deployed/retested, and the full live
editor browser matrix and server runtime-log scan remain incomplete. These are
not acceptable as non-blocking findings under the Phase 3Z READY criteria.

## 24. Explicit remaining approval gate

This result is not permission to cut over. Before a new readiness decision:
deploy the corrected Preview recovery value safely from the exact migration
commit, prove fresh email delivery to the exact staging hostname plus new
password login and reused-link rejection, enable Chrome file handoff and pass
the complete UI image/publication/hide/removal workflow, repeat the live editor
matrix, inspect Preview server logs, and confirm final `0/0/0` and `1/1`
baselines. Production cutover still requires a separate explicit owner
approval after those blockers close.
