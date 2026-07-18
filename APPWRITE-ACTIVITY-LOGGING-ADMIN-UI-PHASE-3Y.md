# Phase 3Y — Immutable Activity Logging and Admin Mutation UI

## Outcome

Phase 3Y is **PASS WITH FINDINGS**. The permanent `activity_logs` table,
durable server-side audit boundary, admin-only reader, and role-aware mutation
UI are implemented. The authenticated browser run proved the ordinary
category, product, merchandising, chosen-product, activity, authentication,
and role-denial paths. All disposable catalogue data, sessions, memberships,
and users were removed.

The browser upload surface could not grant the Chrome extension local-file
access, so the image/publication/hiding sequence was not repeated through the
new UI. Those service paths remain covered by the completed live Phase 3X
lifecycle and the Phase 3Y UI/file-validation plus consolidated lifecycle
tests. This limitation is not represented as completed browser evidence.

## 1. Starting state

- `appwrite-migration` local and remote:
  `8501e1a89ec01e6388158d3f3215722c2feba11b`
- ahead/behind: `0/0`; worktree: clean
- local/remote `main`:
  `83616bfd67534fdd090459230b373f23633bc81d`
- archive remote reference:
  `8d1a1ccee792f672864bc32827caefc43d5e7210`
- `.env.local`: ignored, untracked, and unstaged
- `WAT_BACKEND=appwrite`; committed/default mutation gate: false
- products/categories/files/Team memberships: `0/0/0/0`
- `activity_logs`, `analytics_events`, `broadcasts`, and Appwrite
  `team_contacts`: absent
- no Phase 3V–3X row, file, or chosen fixture remained

The narrow credentials could not recount users or platforms. Their prior zero
baseline was retained until the authorized Phase 3Y identity operations began.

## 2. Activity-log schema decision

The logical Phase 3U event is encoded into 17 physical columns:

- required varchar: `eventId(96)`, `eventType(96)`, `entityId(36)`,
  `actorUserId(36)`, `actorDisplayName(160)`, `requestId(128)`,
  `changedFields(1024)`
- required enum: `entityType(product|category|image)`,
  `actorRole(admin|product_editor)`,
  `result(succeeded|failed|compensated|compensation_failed)`,
  `fixtureClassification(ordinary|phase3y_verification)`
- required datetime: `occurredAt`
- optional bounded-by-application text: `beforeState`, `afterState`,
  `metadataSummary`
- optional varchar: `errorClassification(64)`,
  `compensationClassification(160)`

Before/after and metadata are deterministic JSON text produced only from
allow-listed scalar fields. Each serialized text value is rejected above
16,384 characters; critical identifiers are never truncated. No tenant field
was introduced.

## 3. Created table and indexes

The pre-create inspection classified `activity_logs` as absent. The guarded
apply created only that permanent table in database `wat_app`, then an exact
read-only comparison passed.

Indexes are:

- unique `activity_event_unique(eventId)`
- key `activity_occurred_at(occurredAt)`
- key `activity_entity(entityType, entityId)`
- key `activity_actor(actorUserId)`
- key `activity_event_type(eventType)`
- key `activity_request(requestId)`

`analytics_events`, `broadcasts`, and Appwrite `team_contacts` remain absent.

## 4. Permission and immutability model

The table has row security enabled and empty table permissions. Every activity
row has exactly `read("team:wat_staff/admin")`. Creation is available only
through the privileged server writer. The normal activity interface contains
only create/get/list operations; it exposes no update or delete method, and
the application has no audit edit/delete route or control.

`product_editor` receives neither navigation nor reader authorization. There
is no public read, browser direct write, client permission input, or Team-owner
bypass.

This is application-immutable under the approved server boundary;
infrastructure administrators remain technically capable of modification. It
is not cryptographic immutability.

## 5. Durable logging policy

Category and product services now use the durable writer by default while
dependency-injected fixtures remain isolated. Durable events cover create,
rename/update, attempted/blocked delete, delete, stale/dependency/business
failure, and compensated results.

The lifecycle service durably covers image upload/verification/attachment,
replacement/removal, orphan cleanup, publication/hiding, feed/featured/
status-pick changes, chosen select/replace/retry/failure/clear, and associated
cleanup classifications. The route boundary additionally persists authorized
image and visibility failures that occur before a service-specific
compensation event can be emitted.

Routine reads are never logged.

## 6. Failure and reconciliation policy

Authorization and validation occur before live mutation. A bounded safe
request ID is generated or accepted before mutation. Business state is
materialized before its success event is created, and the event is re-read
with exact content and permission verification.

- pre-mutation validation/authorization failure: no activity row
- business failure: durable classified failure where a safe entity/request
  correlation exists
- partial failure: fail-closed compensation classification
- business success plus audit failure: preserve the verified business result
  and return `AUDIT_PERSISTENCE_FAILED`
- unknown audit outcome: re-read the deterministic event row and accept only
  exact equivalent materialization
- equivalent duplicate: return the prior audit result
- conflicting event/request reuse: fail with `AUDIT_PERSISTENCE_FAILED`

The first live category create exposed Appwrite's equivalent datetime
normalization after the business and audit rows had both materialized. The
writer initially reported the outcome as unknown; comparison was corrected to
canonical timestamp equality and the preserved category was subsequently
handled normally. Durable business-request idempotency remains bounded rather
than a general distributed ledger.

## 7. Redaction

Only approved catalogue scalars and safe image metadata are serialized.
Secrets, API keys, sessions, cookies, passwords, recovery tokens,
authorization/full headers, raw permissions, SDK objects, stack traces, file
bytes, image contents, `.env.local`, and query-bearing direct URLs are
excluded. Fixture tests prove recursive secret rejection, allow-list mapping,
oversize rejection, and raw-SDK containment.

## 8. Activity read service

The server-only reader requires Appwrite mode and an authorized admin identity.
It returns a narrow DTO with action, entity, actor display name/role, time,
result, safe changed-field names, error/compensation classification, and
fixture classification. It omits actor IDs, raw snapshots, metadata JSON,
permissions, and Appwrite rows.

Ordering is `occurredAt` descending. Page size is capped at 50, offset at
5,000, queries use `ttl:0`, and entity/event/result filters are bounded. The
page and API are dynamic and uncached.

## 9. Admin UI changes

The protected Appwrite catalogue now supplies same-origin server-mediated
forms for:

- category create, rename, and admin delete
- product create, edit, and admin delete
- JPEG/PNG/WebP upload, replacement, and hidden-product removal
- storefront, feed, featured, and status-pick changes
- chosen select/replace and explicit verification cleanup

Forms use bounded DTO references rather than `$id`, raw rows, permissions,
`chosenSelectionKey`, or editable server-owned fields. They show pending,
success, validation, stale/conflict, dependency, audit-failure, and destructive
confirmation states and refresh server data after success.

## 10. Role-aware controls

Both roles can create/rename categories, create/edit products, manage approved
images/visibility/merchandising, and select the chosen product. Only admin can
delete products/categories, perform destructive cleanup, or read activity.
Server handlers enforce the same rules even if a request is crafted manually.

The editor browser session had no delete controls or activity navigation and
received a not-found protected activity page. Admin saw the read-only,
newest-first activity list.

## 11. Mutation-gate behavior

The committed/default value remains `WAT_MUTATIONS_ENABLED=false`. With it
false, mutation controls are removed and every ordinary mutation route refuses
before loading write services; the read-only catalogue and admin activity
reader remain available.

Only the temporary local development process received a process-scoped true
override. It was never written to a file and all three verified Node processes
were stopped. The final environment and mutation-gate tests prove the
fail-closed default.

## 12. Disposable identities

Two admin identities and one replacement editor identity were used after an
initial editor was removed during browser recovery. Every identity had an
unmistakable Phase 3Y name/ID, an exact single Team role, temporary sessions,
and no production email dependency.

Cleanup revoked sessions, removed all three remaining Team memberships, and
used the authenticated Appwrite Console bulk-delete confirmation for the three
remaining users. Console reported `3 users deleted` and returned to
`Create your first user`; the read-only Team recount returned zero.

## 13. Authenticated browser lifecycle

Proved through the local application:

- unauthenticated admin denial/redirect, invalid-login safety, admin/editor
  login, logout, and protected-session behavior
- admin and editor category create/rename
- admin product create/delete and editor product update
- server-derived category name
- admin-only delete controls and editor denial
- publication/feed dependency rejection without a verified image
- featured/status-pick independence
- chosen select and same-target retry, then invariant-safe clear for cleanup
- admin activity display with correct actor/role/entity/action/time/result
- editor activity navigation absence and protected-page denial

Not repeated through the Phase 3Y browser UI: file upload/replace/removal,
publication/direct anonymous delivery/hiding/anonymous denial, a forced stale
write, and chosen A-to-B replacement. Chrome's extension could not access the
local fixture file. The underlying live lifecycle was completed in Phase 3X,
and the Phase 3Y server/UI contracts are covered by tests, but this remains a
browser-evidence finding.

## 14. Activity verification

The dedicated read-only verifier proved:

- exact admin-only row permissions
- 15 retained rows, all `phase3y_verification`
- deterministic newest-first ordering and two non-overlapping bounded pages
- admin read success and editor denial
- no update/delete normal boundary
- sensitive-text scan pass

Retained types/counts are:

- category created/renamed/deleted: `2/2/2`
- product created/updated/deleted: `1/1/1`
- product deletion attempted: `1`
- chosen selected/retried/cleared: `1/1/1`
- featured/status-pick changed: `1/1`

## 15. Tests and regression verification

- focused Phase 3Y: 16 passed
- consolidated mutations: 83 passed
- Appwrite foundation: 197 passed
- mutation gate: 18 passed
- Firebase inventory containment: 8 passed
- lint: passed
- typecheck: passed
- production build: passed
- exact live activity schema: passed
- live activity reader/permission/redaction verification: passed
- `git diff --check`: passed

The known build findings remain workspace-root inference from multiple
lockfiles, webpack cache snapshot warnings, and the Edge-runtime static
generation notice.

## 16. Cleanup proof

Final independent state:

- products/categories/files: `0/0/0`
- Team memberships: `0`
- users: Console empty-state confirmed
- selected disposable product: none
- temporary mutation-enabled processes: stopped
- no disposable image or former Phase 3Y public image URL existed
- only classified immutable Phase 3Y activity evidence remains

## 17. Retained fixture-audit policy

All 15 rows are retained as legitimate migration audit evidence and explicitly
classified `phase3y_verification`. They contain synthetic actor labels and no
personal data or secrets. They are not deleted through normal application
code, and no immutability permission was weakened for cleanup.

## 18. Files changed

- activity table/writer/reader:
  `lib/appwrite/table-blueprints.ts`,
  `lib/appwrite/activity-logs.ts`,
  `scripts/appwrite-activity-schema.ts`,
  `scripts/appwrite-activity-verification.ts`
- mutation integration:
  category/product/lifecycle services and handlers plus image/lifecycle routes
- admin UI:
  protected logs page, activity component, mutation component, catalogue,
  shell, activity API, and scoped CSS
- tests/package:
  Phase 3Y activity/UI tests, updated catalogue test, and package scripts
- documentation:
  this report and `appwrite-migration-handoff.md`

## 19. Findings

1. Appwrite datetime strings must be compared by canonical instant rather than
   byte-for-byte encoding after materialization.
2. The first preserved create correctly surfaced the distinct audit-unknown
   policy; no false rollback was claimed.
3. Complete image/publication browser evidence could not be repeated because
   the Chrome extension lacked local-file access. Service live evidence and
   automated coverage pass.
4. A temporary credential appeared only in transient browser diagnostic
   state during the run. Every associated session/user was revoked/deleted,
   no value was committed or retained, and secret scans passed.
5. Infrastructure administrators remain technically capable of modifying
   activity rows.
6. General-purpose durable business idempotency remains deferred.

## 20. Git state

The Phase 3Y commit is the commit containing this report and the handoff
update. Its immutable hash is reported after commit and push because a commit
cannot contain its own hash.

Only `appwrite-migration` may be committed and pushed. `main` and the archive
reference remain frozen.

## 21. Final Appwrite resource state

- project/database/Team/bucket: existing Frankfurt `watapp` / `wat_app` /
  `wat_staff` / `product_images`
- permanent tables: exactly five, now including exact-match `activity_logs`
- activity rows: 15, all `phase3y_verification`, admin-read-only
- products/categories/files/users/Team memberships: `0/0/0/0/0`
- `analytics_events`, `broadcasts`, Appwrite `team_contacts`: absent
- no Web platform, provider setting, API key, Firebase, Vercel, domain,
  deployment, production, `main`, or archive change
- ordinary mutations: disabled

## 22. Next safest recommended phase

Stop after Phase 3Y. The next separately approved phase should create the real
owner through the approved recovery flow, verify recovery, prepare an isolated
Appwrite-backed deployment and Web platform/hostname, run staging QA and a
production-readiness audit, and produce explicit cutover/rollback plans.

Do not create the owner, deploy, configure domains/platforms, enable production
mutations, cut over, or remove Firebase without the next owner approval gate.
