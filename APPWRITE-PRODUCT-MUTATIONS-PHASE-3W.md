# Phase 3W — Server-Side Appwrite Product Mutations

## Outcome

Phase 3W implements only server-mediated Appwrite product create, update, and
delete operations. The ordinary application seam remains disabled by
`WAT_MUTATIONS_ENABLED=false`; the admin catalogue remains read-only and no
mutation UI was added.

Two consecutive double-gated live lifecycles passed with private disposable
fixtures. Each began and ended with zero products, categories, and files.

## 1. Starting state

The exact Phase 3V gate passed before edits:

- branch: `appwrite-migration`
- local and remote HEAD:
  `13db9f1b2266d5c05f5a6a854d04609578f5f553`
- ahead/behind: `0/0`
- worktree: clean
- `.env.local`: ignored, untracked, and unstaged
- local/remote `main`:
  `83616bfd67534fdd090459230b373f23633bc81d`
- archive:
  `8d1a1ccee792f672864bc32827caefc43d5e7210`
- backend: Appwrite
- mutation gate: false
- products/categories/files/Team memberships: `0/0/0/0`
- `activity_logs`, `analytics_events`, and `broadcasts`: absent
- Appwrite `team_contacts`: absent
- Phase 3V disposable-prefix matches: zero

The narrow key could not recount users and platform count remains Console-only.
The prior verified zero identity/platform values remain the baseline because
Phase 3W performed no identity or platform operation.

## 2. Existing Firebase product-mutation audit

The existing Firebase flow remains browser-driven in
`lib/firebase/firestore.ts`. It creates/updates Firestore products, implicitly
upserts categories, uploads/deletes Firebase Storage objects, updates stock and
operational flags, deletes products, and writes Firebase logs. Product forms
and manager components call those helpers directly in Firebase mode.

Phase 3W neither reuses nor alters those paths. The Appwrite service has no
Firebase fallback and is loaded only by the backend-selected server route.

## 3. Product mutation boundary

`lib/appwrite/product-mutations.ts` is server-only and uses only the fixed
`wat_app`, `products`, and `categories` resources. Ordinary calls require:

1. exact Appwrite backend selection;
2. the fail-closed global mutation gate;
3. an authenticated, authorized SSR-derived staff identity;
4. strict action-specific planning and validation;
5. uncached dependency and uniqueness reads;
6. terminal transaction polling and materialized-outcome verification.

The separately symbol-protected Phase 3W context bypasses only the global gate
for exact disposable product IDs. It cannot be constructed by browser input.
The service returns plain narrow DTOs and never raw rows, permissions,
transactions, SDK models, or API keys.

`/api/admin/products` supplies disabled POST/PATCH/DELETE seams for later UI
integration. It is same-origin, JSON-only, body-bounded, no-store, SSR-session
authorized, and returns 503 before loading write services while the mutation
gate is false.

## 4. Authorization

Both `admin` and `product_editor` may create and update ordinary product
fields. Only `admin` may delete. Missing/invalid sessions, missing or
unconfirmed Team membership, built-in owner-only membership, zero application
roles, multiple application roles, malformed identities, and unknown roles
fail before writes.

No client may submit raw permissions, actor metadata, timestamps, chosen state,
image lifecycle state, or public visibility. Built-in Team owner is not an
application role.

## 5. Create implementation

Create accepts the locked product input only. It normalizes whitespace,
derives or validates a canonical slug, validates brand/contact/category,
requires a positive safe-integer PKR price, validates condition/stock/booleans,
and requires non-negative safe-integer priority. Unknown and server-owned
fields are rejected.

The category is read and validated inside the transaction and its canonical
name is copied server-side. A deterministic 36-character SHA-256-derived row
ID provides same-key retry safety and is also assigned to
`chosenSelectionKey`. The service sets both timestamps and actor display fields
server-side, creates no image reference, forces storefront/feed visibility
false, and applies exact private permissions.

## 6. Update implementation

Update uses a partial action-specific allow-list plus product ID,
`expectedUpdatedAt`, and idempotency key. It validates the locked existing row
inside a short transaction, compares canonical Appwrite-normalized timestamps,
rejects stale writes, checks slug uniqueness with `ttl:0`, and validates a new
category inside the transaction.

Category reassignment always derives `categoryName` from the verified category.
The update preserves creation fields, image/legacy references, and
`chosenSelectionKey`; it changes only allowed fields plus server-owned
`updatedAt` and `updatedByName`. An old-token retry returns success only when
the materialized row already has the exact requested result.

## 7. Delete implementation

Delete is admin-only and uses compare-before-delete in a short transaction. It
rejects stale tokens and blocks deletion when:

- `imageFileId` is present;
- `chosenSelectionKey` is `"current"`;
- public visibility or public-read permission is detected; or
- the existing row is malformed.

It never deletes a file, changes chosen state, chooses a replacement, or
alters the category. After terminal commit it observes direct absence. An exact
unchanged resurfaced row receives one bounded compare-before-delete fallback;
a changed resurfaced row fails closed.

## 8. Permissions

Every Phase 3W-created product receives exactly:

- `read("team:wat_staff/admin")`
- `read("team:wat_staff/product_editor")`

There is no anonymous read, client-supplied permission, table/database/bucket
permission change, or permission field in a DTO. Categories keep their prior
permission model; the verifier uses private staff-readable categories only.

## 9. Idempotency

Create uses the deterministic row ID plus the unique slug index. Same
key/equivalent data returns the materialized prior row; same key/different data
and a different request with the same slug conflict.

Update is outcome-idempotent only when the requested patch is already the
current state. Stale different outcomes conflict. Delete retries after proven
absence return `NOT_FOUND`; no unapproved idempotency ledger or schema column
was added.

Transactions are never considered successful merely because commit was
accepted. The service polls terminal state, canonicalizes datetimes, and
re-reads the final row or sustained deletion. Empty transactions are discarded
instead of rolled back.

## 10. Product/category consistency

Product create and reassignment validate the category and derive its canonical
name in the same transaction as the product write. Category delete continues
to use transaction-local and `ttl:0` reference checks, while product create
reads the category in its own transaction so concurrent category removal
conflicts conservatively.

Phase 3V category rename did not propagate product snapshots. Phase 3W resolves
that contradiction with a bounded fail-closed rule: a category with any
uncached product reference cannot be renamed. No unapproved bulk rewrite was
introduced, and a successful rename can no longer create stale
`categoryName` snapshots.

The remaining boundary is that Appwrite transaction conflict detection and the
bounded post-commit compensation—not a new cross-resource lock—protect races.
Both consecutive live lifecycles passed without resurfacing.

## 11. Chosen-product invariant

New products use their own row ID as the required unique
`chosenSelectionKey`. Updates preserve it and reject direct input. Delete
refuses `"current"` and never selects a replacement. `statusPick` remains
independent. Chosen-product switching remains deferred.

## 12. Image and visibility boundaries

Phase 3W uploads, replaces, removes, publishes, and deletes no file.
`imageFileId`, `legacyImageUrl`, and public visibility are not accepted on
create/update. Existing image references are preserved on update, and an
Appwrite image reference blocks delete.

All new products are hidden and staff-only. Both visibility flags remain false
and no anonymous row/file permission is granted. Public-image resolution and
anonymous delivery behavior are unchanged.

## 13. Activity-event preparation

Server-only logical events can be built for created, updated,
deletion-attempted, deletion-blocked, deleted, mutation-failed, category
dependency failure, stale rejection, compensation, and cleanup outcomes.
Successful and delete-attempt/block paths emit only in-memory callbacks.

No `activity_logs` row or alternative durable log was created. Events exclude
secrets, sessions, raw permissions, headers, SDK objects, and client actor
metadata. Durable mapping remains deferred.

## 14. Disposable lifecycle

`npm.cmd run appwrite:check-product-mutations` is read-only by default. Writes
require both:

- `--run-lifecycle`
- `--confirm-destructive-disposable-product-mutations`

Recovery uses a separate mode with the same destructive confirmation. The
script is locked to mutation-disabled Frankfurt Appwrite mode and fixed IDs.

The live lifecycle creates two private categories and one private image-free
product; proves schema, normalization, category derivation, price/state,
timestamps, actor fields, private permissions, own-ID chosen key, deterministic
retry, duplicate slug, update, reassignment, stale rejection, forbidden input,
editor delete denial, selected/image/reference blocks, and admin delete.

The selected and fake-image states are fixture-only and restored before final
delete. No real file exists or is created. `finally` deletes exact products
before categories, then direct reads, uncached counts, prefix searches, and
file counts independently prove cleanup.

## 15. Tests and regression verification

- focused mutation suite: 50 passed
- full Appwrite foundation: 164 passed
- mutation gate: 17 passed
- Firebase inventory containment: 8 passed
- lint: passed
- typecheck: passed
- production build: passed
- `git diff --check`: passed
- two consecutive live Phase 3W lifecycles: passed

Known unrelated build findings remain: workspace-root inference from multiple
lockfiles, webpack cache snapshot warnings, and the Edge-runtime static
generation notice.

## 16. Cleanup proof

Both final lifecycles independently reported:

- starting products/categories/files: `0/0/0`
- ending products/categories/files: `0/0/0`
- recovered Phase 3W products/categories: `0/0`
- final product/category prefix matches: `0/0`
- files created: `0`

The final read-only inventory also confirms zero Team memberships, absent
operational tables, and absent Appwrite `team_contacts`.

## 17. Files changed

- `app/api/admin/products/route.ts`
- `lib/appwrite/category-mutations.ts`
- `lib/appwrite/category-verification-context.ts`
- `lib/appwrite/mutation-design.ts`
- `lib/appwrite/product-mutation-handlers.ts`
- `lib/appwrite/product-mutation-verification.ts`
- `lib/appwrite/product-mutations.ts`
- `lib/appwrite/product-permissions.ts`
- `lib/appwrite/product-verification-context.ts`
- `scripts/appwrite-product-mutation-verification.ts`
- `tests/appwrite-category-mutations.test.ts`
- `tests/appwrite-product-mutations.test.ts`
- `tests/mutation-gate.test.ts`
- `package.json`
- `APPWRITE-PRODUCT-MUTATIONS-PHASE-3W.md`
- `appwrite-migration-handoff.md`

## 18. Findings

1. The Phase 3V terminal polling, empty-transaction discard, `ttl:0`, and
   datetime normalization rules apply unchanged to product writes.
2. Live create/update/delete materialized correctly in two consecutive
   lifecycles; no Phase 3W row resurfaced.
3. Optional `imageFileId` can be fixture-staged and cleared without a physical
   file, allowing safe proof that deletion blocks linkage while file totals
   remain zero.
4. Category rename must remain blocked while referenced until an explicitly
   approved atomic snapshot-propagation design exists.
5. There is no permanent idempotency ledger; deterministic create and
   outcome-based update are the strongest behavior possible without a new
   table or column.
6. Logical activity events are not durable.

## 19. Final Git and live-resource state

The Phase 3W commit is the commit containing this report and handoff update;
its immutable hash is reported after commit and push because a commit cannot
contain its own hash.

The final branch must be `appwrite-migration`, aligned with
`origin/appwrite-migration` at `0/0`, with a clean worktree. `main` and the
archive reference remain frozen at the hashes in section 1.

No Firebase resource, Vercel resource, domain, deployment, production branch,
API key, identity, membership, platform, file, permanent product/category, or
operational table changed. `WAT_MUTATIONS_ENABLED` remains false.

## 20. Next safest recommended phase

Stop after Phase 3W. The next recommended consolidated phase is a separately
approved, double-gated implementation of image lifecycle, visibility
transitions, and chosen-product concurrency together, using only private
disposable fixtures and exact compare-before-write compensation.

Do not automatically begin that phase, activity-table creation, mutation UI,
deployment, real-user creation, or production cutover.
