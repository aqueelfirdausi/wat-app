# Phase 3U — Mutation Architecture and Authorization Design

## Outcome

Phase 3U is fixture-only and design-focused. It adds pure authorization,
validation, transition-planning, compensation, and activity-event helpers plus
focused tests. It adds no Appwrite mutation service, route, SDK write, browser
control, or mutation UI. `WAT_MUTATIONS_ENABLED` remained `false`; no live row,
file, identity, Team, table, platform, Firebase, Vercel, domain, deployment, or
production resource was changed.

Status: **PASS WITH FINDINGS**. The design is ready for a separately bounded
category-mutation fixture phase. Live-project transaction capability/scopes
for chosen-product changes and the final physical representation/retention
policy for rich activity events remain `Needs verification`.

## Verified starting state

- Branch: `appwrite-migration`.
- Local and remote starting HEAD:
  `20ef67c8f3fbcbc399a8ae69e7fb25519489e370`.
- Starting ahead/behind: `0/0`; worktree clean.
- Local and remote `main`:
  `83616bfd67534fdd090459230b373f23633bc81d`.
- Remote archive reference:
  `8d1a1ccee792f672864bc32827caefc43d5e7210`.
- `.env.local`: ignored, untracked, and unstaged.
- `WAT_BACKEND=appwrite`; `WAT_MUTATIONS_ENABLED=false`.
- Read-only bootstrap: exact Team, database, bucket, products table, and
  categories table; no conflicts or write actions.
- Live totals: products `0`, categories `0`, files `0`, Team members `0`.
- `activity_logs`, `analytics_events`, and `broadcasts`: absent.
- Appwrite `team_contacts`: absent according to the clean Phase 3T baseline and
  unchanged resource inventory.
- The narrow identity key still cannot numerically list users, and platforms
  still require Console verification. Their last verified Phase 3T totals are
  both `0`; no identity or platform mutation occurred in or between the
  bounded repository checks. This limitation is a finding, not a reason to
  broaden or replace a key.

## Existing mutation-surface audit

| Mutation | Firebase behavior | Validation / side effects | Appwrite state and required correction |
|---|---|---|---|
| Category create/update | `upsertCategory` runs inside product create/update; document ID is the slug and writes `name`, `slug`, `updatedAt` | Trim and legacy `slugify`; merge can silently overwrite the same slug; no independent role, idempotency, conflict, or log boundary | No mutation path. Add explicit server contracts; never silently upsert from product save |
| Category delete | No catalogue category-delete path | No reference protection or rollback | Admin only; reject while any product references the category |
| Product create | Browser uploads image, upserts category, then `addDoc`; defaults visible/feed-visible | Minimal client validation; slug uniqueness not checked; uploaded file can orphan on row failure; actor profile and log are separate writes | Server only; verify category and unique slug; create hidden/private first; compensate file/row failures |
| Product update | Browser may delete old image before uploading the replacement, then updates row | A failed upload loses the old image; category may be implicitly created; no optimistic concurrency; slug conflict is late | Server only; require `expectedUpdatedAt`; upload/validate new private file first; never delete old before row attachment succeeds |
| Product delete | Admin role checked in the Firebase helper; image deleted before row | Row failure after image deletion leaves a broken product; logging is non-atomic | Admin only; hide/private first, delete row, then clean file; record cleanup failure for retry |
| Image upload | Browser Firebase Storage upload followed by download URL | Accepts `image/*`; no 1 MiB/MIME contract; filename includes time and original name | Server-mediated Appwrite upload; JPEG/PNG/WebP only, maximum 1 MiB, private-first, metadata and completion verification |
| Image replacement/removal | Old object deleted before replacement upload; no separate remove control | Unsafe ordering and no orphan ledger | Attach verified new file before retiring old; remove by detaching row before private/delete cleanup |
| Storefront/feed visibility | Browser writes booleans directly | Does not coordinate row/file permissions; bulk updates use independent promises | Plan permission and row transitions server-side with fail-closed compensation |
| Featured/status-pick/stock/priority | Browser writes partial Firestore updates | No server role check or stale-write token; separate activity write | Both roles allowed; validated server commands, optimistic concurrency, event outcome |
| Chosen product | Firestore batch clears prior `chosenForToday`, sets target, and also forces `statusPick=true` | Couples two independent concepts; query-plus-batch semantics do not map to Appwrite; no retry ownership | Use only unique `chosenSelectionKey`; never derive from or change `statusPick`; serialize and recover conflicts |
| Price/currency/category | Browser sends price and category name; currency defaults in client helper | Coercive number handling and embedded category creation | Integer PKR price only; category must already exist and server derives `categoryName` |
| Permissions/audit | Firebase clients write directly; actor fields come from client object; logs are best-effort after business write | Raw backend access, spoofable audit boundary, partial failures | Browser cannot send permissions or actor fields; server derives exact permissions and actor from verified session |

The Appwrite admin presentation remains deliberately read-only. The protected
layout gate blocks Appwrite admin routes while mutations are disabled, and
there are no Appwrite mutation placeholders beyond the unavailable/read-only
boundary. Phase 3U does not reuse the Firebase client mutation architecture.

## Authorization matrix

Every action first requires an authenticated account, confirmed membership in
the exact `wat_staff` Team, and exactly one application role. Built-in `owner`
alone, zero roles, both roles, duplicate roles, and unknown roles fail closed.
Authorization is repeated in the server mutation handler; UI visibility is not
authorization.

| Action | `admin` | `product_editor` |
|---|---:|---:|
| Read products/categories | Allow | Allow |
| Create/rename category | Allow | Allow |
| Delete category | Allow | Deny |
| Create/edit product | Allow | Allow |
| Permanently delete product | Allow | Deny |
| Upload/replace/remove product image | Allow | Allow |
| Change storefront/feed visibility | Allow | Allow |
| Change featured/status-pick/stock state | Allow | Allow |
| Select, clear, or replace chosen product | Allow | Allow |
| Destructive cleanup | Allow | Deny |
| Read immutable activity records | Allow | Deny |

`lib/appwrite/mutation-design.ts` expresses this matrix as an exhaustive action
set. Tests prove all admin grants and the product-editor denials.

## Category mutation contracts

### Create

Request: `name`, optional explicit `slug`, and `idempotencyKey`. Unknown fields
are rejected. Name is trimmed, internal whitespace collapses, and the result
must be 1–160 characters. The default slug is deterministic ASCII lowercase
kebab-case; an explicit slug must already be canonical and at most 160
characters.

The server authorizes, checks the idempotency record/strategy, checks unique
slug, creates a public-readable row with no client write permission, verifies
the returned DTO, and emits `category.created`. A same-key/same-payload retry
returns the prior result; same key/different payload is `CONFLICT`. A unique
slug collision is `CONFLICT`. The response is only
`{ id, name, slug, updatedAt }`.

### Update

Request: `categoryId`, `name`, optional `slug`, `expectedUpdatedAt`, and
`idempotencyKey`. The server reads the current row, rejects a missing row,
rejects a stale timestamp, checks slug uniqueness excluding the row, updates
the category, and updates every referencing product's denormalized
`categoryName` under a bounded compensation plan.

Because Appwrite has no assumed cross-row transaction, the safe implementation
must either complete all product repairs or restore the category and already
updated products. Until that implementation is fixture-proven, rename remains
blocked. Event: `category.updated`; response is the narrow category DTO.

### Delete

Request: `categoryId`, `expectedUpdatedAt`, and `idempotencyKey`. Admin only.
The server rejects deletion when any product references the category; there is
no cascade, implicit reassignment, or orphaning. It rechecks references
immediately before deletion and returns `CONFLICT` if any exist. A missing row
is `NOT_FOUND`, except a confirmed same-key completed retry may return the
prior success. Event: `category.deleted`; response:
`{ id, deleted: true }`.

## Product mutation contracts

Create accepts only name, optional canonical slug, description, brand,
preferred contact ID, category ID, integer price, literal `PKR`, condition,
stock status, featured/status-pick/storefront/feed booleans, non-negative
integer priority, optional prevalidated image file ID, and idempotency key.
Feed-visible while storefront-hidden is rejected.

Update adds server route parameters `productId` and `expectedUpdatedAt`; partial
update DTOs must use an action-specific allow-list rather than passing raw
objects through the create parser. The server rejects unknown fields.

Server-owned or forbidden client fields include Appwrite IDs and metadata,
permission arrays, `categoryName`, `chosenSelectionKey`, legacy image URL,
timestamps, actor/audit fields, Firebase IDs/UIDs, `chosenForToday`,
`shopId`/`tenantId`, and all raw SDK objects. The server:

1. Resolves actor and role from the current SSR session.
2. Enforces the mutation deployment gate and action permission.
3. Normalizes and validates the request.
4. Reads and validates the referenced category and derives `categoryName`.
5. Checks the unique product slug and stale-write token.
6. Verifies any image reference against the fixed bucket and metadata policy.
7. Creates new products private/hidden first with
   `chosenSelectionKey` equal to their assigned Appwrite row ID.
8. Applies a separately planned visibility transition if publication was
   requested.
9. Returns a narrow internal product DTO, never raw permissions/SDK output.
10. Records the result and compensation outcome.

Product delete is admin-only. If chosen, it first clears selection to the row's
own ID. It then removes public row access/visibility, makes the image private,
deletes the row, and finally deletes the now-orphaned file. A cleanup failure
does not republish or recreate the row; it returns/records `CLEANUP_FAILED` for
bounded retry. Product errors use the shared classifications:
`VALIDATION_FAILED`, `AUTHORIZATION_FAILED`, `CONFLICT`, `NOT_FOUND`,
`DEPENDENCY_FAILED`, `CLEANUP_FAILED`, and `INTERNAL_ERROR`.

## Image mutation contracts

- Accepted MIME types: `image/jpeg`, `image/png`, `image/webp`.
- Maximum: 1 MiB exactly, checked before upload and against returned metadata.
- Filename: server-generated stable safe prefix plus random Appwrite file ID;
  the client filename is metadata only after sanitization and is not trusted
  for identity or paths.
- Upload starts private with exact staff read permissions and no public read.
- The server verifies bucket ID, file ID, completion state, MIME, byte count,
  deletion state, and exact permission class before linkage.
- Public files use direct anonymous Appwrite view URLs only after exact public
  permission validation. No privileged proxy is introduced.
- Replacement order: upload private → verify → publish new file if needed →
  attach with stale-write protection → make old private → delete old.
- Removal order: make row non-public if required → detach file reference →
  verify row → make old file private → delete it.
- An unattached new file is deleted on failure. Failure to delete is an orphan
  cleanup event and must be retryable by admin-only bounded cleanup.
- Retrying the same idempotency key returns the known attachment outcome; a
  different file under the same key conflicts.

Events are `image.uploaded`, `image.attached`, `image.replaced`,
`image.removed`, and `image.cleanup_failed`; they never contain bytes, signed
URLs, raw permissions, original sensitive metadata, or API responses.

## Visibility and permission-transition ordering

Public means either storefront or feed exposure. A public product row and its
linked file must both have exact anonymous read plus staff read. A hidden row
and its file have staff read only.

Publishing with an image:

1. Verify row, file, desired flags, and current exact permissions.
2. Grant exact public/staff read to the image.
3. Update visibility flags and exact public/staff row read.
4. Re-read both. If row publication fails, immediately restore the image to
   staff-only. Never leave an unattached public file.

Hiding:

1. Remove public row read and set both public visibility flags false.
2. Re-read that anonymous row access is gone.
3. Remove public image read.
4. If image privatization fails, keep the row private and return
   `CLEANUP_FAILED`; do not republish the row merely to match the file.

Changing only feed visibility cannot make a hidden storefront row public.
Private drafts are created staff-only. Permission mismatches detected before a
transition are dependency failures requiring repair, not states to normalize
silently. Every compensation is compare-before-write so it cannot overwrite a
newer successful request.

## Compensation and rollback model

Each plan records ordered forward steps and a bounded inverse. Compensation
runs in reverse order, only when the resource still matches the failed
request's expected state. A stale or externally changed resource stops
compensation and produces `CLEANUP_FAILED` rather than overwriting newer data.

- Category create failure: delete only the row created by that idempotency key.
- Category rename failure: restore changed product snapshots, then category,
  unless a newer update is detected.
- Product create failure: privatize/delete created row, then delete unattached
  file.
- Product update failure: restore the prior row only if its update token still
  matches the attempted write.
- Image replacement failure before attachment: privatize/delete new file.
- Image cleanup failure after attachment: keep new linkage, keep old private,
  record cleanup retry.
- Publication failure: restore image private before returning failure.
- Hide cleanup failure: keep row hidden, retry file privatization.
- Log failure: see activity policy below; never claim a fully audited success.

## Chosen-product concurrency model

The invariant remains provisional:

- selected row: `chosenSelectionKey="current"`;
- unselected row: `chosenSelectionKey=<its own row ID>`;
- value required, unique, non-null, and independent of `statusPick`.

Selection reads the current row and target, checks `expectedUpdatedAt`, clears
the old row to its own ID, then sets the target to `"current"`. This ordering
creates a safe temporary state with no chosen row, never two chosen rows. The
unique index is the final backstop.

Current official Appwrite Cloud documentation states that TablesDB
transactions stage multiple row operations and commit them atomically with
conflict detection. Installed `node-appwrite` 27 types expose
`TablesDB.createTransaction`, transaction-aware row operations,
`createOperations`, and `updateTransaction`. The target design therefore uses
one short TablesDB transaction to read/stage the prior-row clear and target-row
selection, then commits both changes atomically. A process-local mutex is not
part of the design.

`Needs verification`: the existing Frankfurt project's deployed capability,
the narrow data-key transaction scopes, exact error codes, and unique-index
behavior within staged operations must be proven in an isolated, disposable
concurrency phase before chosen mutation is enabled. See the official
[Appwrite transaction documentation](https://appwrite.io/docs/products/databases/transactions).

On transaction or unique conflict the request rolls back and re-reads
`"current"`. If it is already the target, the retry succeeds idempotently;
otherwise it returns `CONFLICT`. A losing request never restores an older
chosen row over a newer winner. Manual restoration is only relevant before a
transaction is entered; once staged, rollback is authoritative. Clearing
stages only the prior-row reset. Deleting the chosen product clears it in the
same transaction as row deletion and leaves no selection unless an explicit
replacement is in that transaction.

## Immutable activity-log requirements

The logical event requires event ID/type, entity type/ID, actor user ID/display
name/role, timestamp, request/correlation ID, before/after snapshots, changed
fields, result, error classification, compensation result, and optional safe
metadata. Actor values are server-derived. Passwords, recovery values, API
keys, cookies, sessions/tokens, file bytes, private URLs, raw permissions,
emails beyond approved actor identity fields, and raw SDK objects are never
recorded.

Events are append-only, server-created, and admin-readable only. Application
routes receive no update/delete capability. A pending event is prepared before
the business write; the final outcome is appended after success or
compensation. For catalogue writes, failure to persist the required final log
must not be reported as ordinary success. Until an atomic outbox exists, the
handler returns `DEPENDENCY_FAILED`, preserves the safe business state, emits
an operator-visible correlation ID, and requires bounded reconciliation.
Rolling back a safe completed business mutation solely because logging failed
can itself cause unsafe exposure and is not automatic.

`Needs verification`:

- retention duration and legal/business policy;
- whether immutable archival/export is required;
- final limits/redaction for snapshots;
- reconciliation alerting and retry ownership;
- physical schema mapping. The frozen `activity_logs` columns do not include
  separate before/after/result columns. Rich event data may fit a versioned,
  redacted `details` envelope, but this must be reconciled with the approved
  schema before table creation. Phase 3U does not change the blueprint or
  create the table.

## Validation and DTO boundaries

The pure helper rejects malformed primitives, unknown fields, noncanonical
slugs, unsafe visibility combinations, non-integer prices/priorities, raw
permissions, raw Appwrite metadata, client actor/audit values, Firebase IDs,
tenant fields, and sensitive activity-event keys. It normalizes bounded text
and creates predictable error classifications.

Routes must return only action DTOs plus `{ requestId }` and a public error
shape `{ code, message, field? }`. They never return API keys, permission
arrays, cookies, sessions, internal exception text, stack traces, SDK models,
or cleanup credentials. Conflict responses may include the current safe DTO
only when the caller is still authorized.

## Fixture tests

`tests/appwrite-mutation-design.test.ts` covers:

- exhaustive admin authorization and forbidden product-editor actions;
- valid/invalid category create, update, and delete plans;
- product normalization and malformed-field rejection;
- forbidden server-owned, permission, actor, Firebase, and tenant fields;
- canonical slug and conflict classification;
- publication/hide ordering and compensation;
- image replacement ordering, cleanup, and retry safety;
- chosen selection, clear, idempotent retry, conflict, and restoration rules;
- activity changed-field construction and nested secret/permission rejection.

All fixtures are pure and perform no Appwrite call.

## Findings and next bounded phase

1. Chosen-product TablesDB transaction behavior/scopes in the live Frankfurt
   project remain `Needs verification`; do not replace it with a process-local
   lock.
2. The rich logical activity event must be mapped to the frozen physical
   activity schema and retention policy before table creation.
3. Category rename is a multi-row denormalized repair with no assumed
   transaction and needs isolated compensation fixtures.
4. The narrow identity key cannot independently recount users; platform count
   remains a Console-only check. Do not broaden runtime keys for reporting.
5. The current Firebase image replacement and deletion ordering is unsafe, but
   Firebase remains authoritative and was intentionally not changed.

The next safest phase is a separately approved, double-gated **category
mutation implementation using disposable fixtures only**. It should implement
server-only create/update/delete services and route contracts behind
`WAT_MUTATIONS_ENABLED`, keep the deployed/local default false, prove role and
idempotency behavior, exercise only unmistakably disposable private fixtures,
and guarantee cleanup. Do not automatically proceed to product, image, chosen,
activity-table, UI, deployment, or cutover work.

## Files changed

- `lib/appwrite/mutation-design.ts`
- `tests/appwrite-mutation-design.test.ts`
- `package.json`
- `APPWRITE-MUTATION-ARCHITECTURE-PHASE-3U.md`
- `appwrite-migration-handoff.md`

## Commands and checks

- `git fetch origin --prune`
- branch/HEAD/upstream/main/archive/worktree checks
- ignored environment name/value checks for the backend selector and mutation
  gate only (no secrets printed)
- `npm.cmd run appwrite:bootstrap` (read-only)
- `npm.cmd run appwrite:check-empty`
- `npm.cmd run appwrite:check-auth` (read-only)
- `npm.cmd run appwrite:check-admin-catalogue` (read-only)
- `npm.cmd run test:appwrite-mutations`
- `npm.cmd run test:appwrite-foundation`
- `npm.cmd run test:mutation-gate`
- `npm.cmd run test:firebase-inventory`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- diff, secret-containment, client-bundle, branch, and final Git checks

The final commit, push, alignment, and exact final state are recorded after the
verification gate below and in the handoff.
