# Phase 3V — Server-Side Appwrite Category Mutations

## Outcome

Status: **PASS WITH FINDINGS**.

Phase 3V implements only server-mediated Appwrite category create, rename, and
delete operations. The ordinary API remains unreachable while
`WAT_MUTATIONS_ENABLED=false`; no mutation UI was added. Two independent live
disposable lifecycles passed and restored products, categories, and files to
zero. No permanent Appwrite, Firebase, Vercel, domain, deployment, or
production resource changed.

The live proof exposed important Appwrite transaction lifecycle behavior:
commit and rollback requests can return before their materialized state is
safe to use, and rolling back an empty transaction produced failed/late
snapshot behavior. The implementation now polls terminal states, discards
empty transactions, disables list caching for mutation decisions, and
compensates a resurfaced unchanged delete only after a fresh reference check.

## 1. Starting state

- Branch: `appwrite-migration`.
- Local and remote starting HEAD:
  `ce65ad5753ed6e87904d05ba48d26bdb20739702`.
- Starting ahead/behind: `0/0`; worktree clean.
- Local and remote `main`:
  `83616bfd67534fdd090459230b373f23633bc81d`.
- Remote archive:
  `8d1a1ccee792f672864bc32827caefc43d5e7210`.
- `.env.local`: ignored, untracked, and unstaged.
- `WAT_BACKEND=appwrite`; `WAT_MUTATIONS_ENABLED=false`.
- Read-only bootstrap: exact Team, database, bucket, products table, and
  categories table; no conflict or write action.
- Initial products, categories, files, and Team members: `0`.
- Operational tables and Appwrite `team_contacts`: absent.
- Users and platforms retain the previously verified zero baselines because
  current narrow credentials cannot independently recount both and no identity
  or platform action occurred.

## 2. Existing category mutation audit

Firebase mode has no independent category-management boundary.
`upsertCategory` is a browser-side helper embedded in product create/update.
It derives a slug, uses that slug as a Firestore document ID, and merges name,
slug, and timestamp. It can silently create/overwrite a category during a
product save and has no separate authorization, idempotency, reference
protection, stale-write contract, narrow response, or compensation.

Before Phase 3V, Appwrite mode had only server-side public/admin category reads
and no category mutation route or service. Phase 3V does not reuse or alter the
Firebase mutation path.

## 3. Implemented server boundary

`lib/appwrite/category-mutations.ts` is server-only and exposes narrow
create/read-for-mutation/update/delete operations. Production defaults:

1. Require the strict backend selector to resolve Appwrite.
2. Require the global mutation gate for ordinary application calls.
3. Accept a symbol-protected Phase 3V verification context only for the
   dedicated double-gated script.
4. Authorize the normalized server identity for the requested action.
5. Validate through the Phase 3U pure planners before accessing Appwrite.
6. Use only the fixed `wat_app`, `categories`, and reference-check `products`
   IDs.
7. Return only narrow DTOs, never rows, permissions, transactions, or SDK
   objects.

`/api/admin/categories` provides POST, PATCH, and DELETE seams for future
integration. It is force-dynamic, same-origin JSON only, body-bounded,
SSR-session authorized, and no-store. It returns 503 before loading mutation
services while the global gate is false. No browser component calls it.

There is no Firebase fallback and no client Appwrite mutation SDK.

## 4. Authorization enforcement

Every ordinary request resolves the existing SSR Appwrite session and Phase 3S
authorization result. Missing session, invalid/expired session, inactive
account, absent/wrong/unconfirmed `wat_staff` membership, zero or multiple
application roles, owner-only, duplicate, malformed, or unknown roles remain
denied before a write.

| Action | `admin` | `product_editor` |
|---|---:|---:|
| Read category for mutation | Allow | Allow |
| Create category | Allow | Allow |
| Rename category | Allow | Allow |
| Delete category | Allow | Deny |
| Destructive fixture recovery | Dedicated verifier only | Deny |

UI visibility is not authorization. Tests exercise no session, missing Team,
zero roles, ambiguous roles, malformed identity, both allowed roles, and
product-editor delete denial.

## 5. Create behavior

Create accepts only `name`, optional `slug`, and `idempotencyKey`. It:

- trims and collapses whitespace;
- enforces the 160-character name and slug limits;
- derives canonical ASCII lowercase kebab-case when slug is omitted;
- rejects empty/malformed slugs, unknown fields, permissions, actors,
  Appwrite metadata, Firebase/tenant fields, and extra attributes;
- checks the unique slug using an uncached query;
- writes only `name`, `slug`, and server-owned `updatedAt`;
- supplies server-owned exact permissions;
- never changes a product; and
- returns `{ id, name, slug, updatedAt }`.

The ordinary row ID is a deterministic 36-character SHA-256-derived value from
the idempotency key. A same-key/same-result retry re-reads and returns the row,
including after an unknown network outcome. Same key/different content and a
different key with an existing slug are conflicts. The unique live index is
the concurrent-create backstop.

Appwrite normalizes stored datetime precision/offset. The service validates any
parseable returned datetime and emits one canonical UTC ISO token in the DTO.

## 6. Rename behavior

Rename requires `categoryId`, normalized name/slug, `expectedUpdatedAt`, and
`idempotencyKey`. It opens a short TablesDB transaction, reads and validates the
row within that transaction, compares the canonical concurrency token, checks
slug uniqueness uncached, stages the update with exact preserved permissions,
commits, polls to terminal `committed`, and re-reads the row.

A stale token returns `STALE_WRITE`. If a retry presents the old token but the
current row already exactly equals the intended name/slug, it returns the
current DTO as an outcome-idempotent retry. An empty transaction is discarded,
not rolled back. Concurrent commit/unique conflicts return `CONFLICT`.

Phase 3V does not rewrite product `categoryName` snapshots. The approved Phase
3V brief explicitly forbids automatic product rewrites here; future product
mutation architecture must define snapshot reconciliation.

## 7. Delete and reference protection

Delete is admin-only and requires `categoryId`, `expectedUpdatedAt`, and
`idempotencyKey`. It:

1. Opens a short transaction and validates the current locked row shape and
   exact permissions.
2. Rejects a stale concurrency token.
3. Queries `products.categoryId` uncached; stored counts are never trusted.
4. Returns `REFERENCE_CONFLICT` when any product references the row.
5. Stages category deletion and polls commit to terminal state.
6. Observes direct row absence for a bounded interval.
7. If the exact unchanged row resurfaces, rechecks references uncached, performs
   one compare-before-delete direct compensation, and proves sustained 404.

It never cascades, reassigns, or alters products. A changed resurfaced row or a
new reference prevents compensation. Missing rows return `NOT_FOUND`.

The live reference proof created one smallest schema-valid private product with
no image, public visibility, chosen state, or operational side effect. It was
deleted before category deletion and independently verified absent.

## 8. Permissions

Approved production categories are publicly readable, so ordinary rows receive
exactly:

- `read("any")`
- `read("team:wat_staff/admin")`
- `read("team:wat_staff/product_editor")`

The dedicated live verifier creates categories with staff read only:

- `read("team:wat_staff/admin")`
- `read("team:wat_staff/product_editor")`

Requests cannot supply permissions. Existing rows must match the expected
permission set exactly before update/delete. Responses never expose
permissions. No table, database, product, bucket, Team owner, or other
permission was broadened.

## 9. Idempotency and concurrency

- Create: deterministic row ID plus unique slug index.
- Unknown create outcome: exact deterministic row re-read.
- Same-key/different payload: `CONFLICT`.
- Rename retry: outcome-idempotent only when current name/slug already match.
- Rename/delete stale token: `STALE_WRITE`.
- Concurrent rename/unique conflict: transaction conflict or unique conflict.
- Referenced delete: `REFERENCE_CONFLICT`.
- Already deleted: `NOT_FOUND`.
- Cleanup retry: exact fixture IDs and prefixes; missing rows are success.

Transaction requests are not treated as complete until terminal state is
polled. Empty pre-write transactions are deleted rather than rolled back.
Mutation-critical list queries pass `ttl:0`, because Appwrite list caches are
not invalidated by row writes.

The live category-delete transaction exhibited delayed row resurfacing during
development. The final compare/reference-checked compensation is deliberately
bounded and recorded as a compensation result. It does not claim stronger
cross-resource atomicity. Product mutations remain disabled, and future product
creation must coordinate category existence/reference semantics.

## 10. Activity-event preparation

The service constructs logical Phase 3U events for:

- `category.created`
- `category.renamed`
- `category.deletion_attempted`
- `category.deleted`
- `category.mutation_failed`
- `category.cleanup_result`

The live lifecycle prepared created, renamed, deletion-attempted, and deleted
events in memory. Tests construct failure and cleanup-result events. Events
contain server-derived actor identity, correlation ID, safe snapshots, changed
fields, result/error classification, and compensation result.

No event is durably stored. `activity_logs` remains absent; no Firebase log or
alternate store was introduced. Durable logging and reconciliation remain
deferred.

## 11. Disposable lifecycle

`npm.cmd run appwrite:check-category-mutations` is read-only by default. Writes
require both:

- `--run-lifecycle`
- `--confirm-destructive-disposable-category-mutations`

Recovery of only exact prefixed fixtures requires:

- `--recover-disposable-orphans`
- `--confirm-destructive-disposable-category-mutations`

Lifecycle rows use `phase3v_disposable_` IDs,
`__wat_phase_3v_disposable__` names, and
`wat-phase-3v-disposable-` slugs. The script is locked to Frankfurt, fixed
resource IDs, Appwrite mode, and `WAT_MUTATIONS_ENABLED=false`.

It proves create/read/rename/stale/delete-role/reference/admin-delete behavior
inside `try/finally`. Finally always attempts idempotent cleanup of the exact
generated IDs, even when create returned an unknown outcome. Final proof uses
uncached totals, direct 404 checks, and independent prefix searches.

During development, several early failed attempts surfaced one private
disposable category each because an empty transaction rollback restored an earlier
snapshot after the later cleanup decision. Each row matched the exact fixture
ID/name/slug/private-permission contract and was removed through the
double-gated prefix recovery. Products and files remained zero. After the fix,
two consecutive complete lifecycles passed with `recoveredOrphans=0/0`.

No user, membership, session, file, platform, permanent row, or public fixture
was created.

## 12. Tests and verification

Focused category/design suite: 33 passed. It covers valid create, whitespace,
invalid name/slug, unknown/permission/actor rejection, both allowed create and
rename roles, admin delete, editor denial, malformed identity, duplicate slug,
deterministic retry, stale update/delete, referenced delete, missing row,
narrow DTO, raw-row containment, logical events, lifecycle refusal/double
gates, successful cleanup, and failure cleanup.

Final regression gate:

- Appwrite foundation: 147 passed.
- Mutation gate: 16 passed.
- Firebase inventory safety: 8 passed.
- Lint: passed.
- Typecheck: passed.
- Production build: passed.
- `git diff --check`: passed.
- Secret and client-bundle containment: passed.
- Two consecutive final live disposable lifecycles: passed.
- Final uncached totals and prefix absence: passed.

Known build warnings remain: workspace-root inference from multiple lockfiles,
webpack cache snapshot warnings, and Edge-runtime static-generation notice.

## 13. Cleanup proof

Final independent state:

- products: `0`
- categories: `0`
- product files: `0`
- Team members: `0`
- Phase 3V product prefix matches: `0`
- Phase 3V category prefix matches: `0`
- operational tables: absent
- Appwrite `team_contacts`: absent

Every live fixture was private. Recovery was restricted to rows matching the
exact Phase 3V ID, name, slug, and permission contract. No unexplained row was
deleted.

## 14. Files changed

- `app/api/admin/categories/route.ts`
- `lib/appwrite/category-mutation-handlers.ts`
- `lib/appwrite/category-mutation-verification.ts`
- `lib/appwrite/category-mutations.ts`
- `lib/appwrite/category-permissions.ts`
- `lib/appwrite/category-verification-context.ts`
- `lib/appwrite/mutation-design.ts`
- `scripts/appwrite-category-mutation-verification.ts`
- `tests/appwrite-category-mutations.test.ts`
- `tests/mutation-gate.test.ts`
- `package.json`
- `APPWRITE-CATEGORY-MUTATIONS-PHASE-3V.md`
- `appwrite-migration-handoff.md`

## 15. Findings

1. Transaction commit/rollback API responses require terminal-status polling.
2. Empty transactions must be discarded; rolling them back produced failed and
   late snapshot behavior in live verification.
3. Mutation/reference/cleanup list queries must explicitly use `ttl:0`.
4. Appwrite datetime output must be canonicalized before use as the concurrency
   DTO token.
5. Category delete required a compare/reference-checked compensation for a row
   that resurfaced after terminal commit. This is safe under the current
   product-mutation-disabled boundary but must be revisited with product writes.
6. Idempotency has no permanent ledger because no extra table/column is
   approved. Create is deterministic; rename is outcome-idempotent; completed
   delete retries are `NOT_FOUND`.
7. Logical events are not durable until `activity_logs` is approved and created.

## 16. Final Git and live-resource state

The Phase 3V commit is the commit containing this report and handoff update;
its immutable hash is recorded in the final handoff response after commit and
push (a Git commit cannot literally contain its own hash).

Final branch must be `appwrite-migration`, aligned with
`origin/appwrite-migration` at `0/0`, with a clean worktree. `main` and the
archive reference remain at their frozen hashes above.

No Firebase resource, Vercel resource, domain, deployment, production branch,
API key, identity, platform, file, permanent category/product, or operational
table changed. The global mutation gate remains false.

## 17. Next safest recommended phase

Stop after Phase 3V. The next recommended phase is a separately approved,
consolidated server-side product-mutation implementation. It must keep normal
mutations disabled, use private disposable fixtures, coordinate category
references and image/visibility compensation, and explicitly revisit category
delete concurrency. Do not automatically begin product, image, activity-table,
UI, staging, deployment, or cutover work.
