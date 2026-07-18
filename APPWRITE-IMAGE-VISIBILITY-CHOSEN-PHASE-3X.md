# Phase 3X — Image Lifecycle, Visibility, and Chosen Product

## Outcome

Phase 3X implements the bounded server-side Appwrite image lifecycle,
visibility transitions, merchandising flags, and chosen-product transaction.
Ordinary mutations remain disabled by `WAT_MUTATIONS_ENABLED=false`; the
Appwrite admin catalogue remains read-only and no mutation control was added.

Three corrected double-gated live disposable lifecycles passed from and back to
zero products, categories, and files. The first development run stopped on a
non-canonical live datetime passed by the verifier; its `finally` cleanup and an
independent recount both proved `0/0/0` before the verifier was corrected.

## 1. Starting state

The exact Phase 3W gate passed before edits:

- branch and local/remote HEAD: `appwrite-migration` at
  `fbf0f754a176f654e37374c57d14dc8ba9b15500`
- ahead/behind: `0/0`
- worktree: clean
- `.env.local`: ignored, untracked, and unstaged
- local/remote `main`: `83616bfd67534fdd090459230b373f23633bc81d`
- archive remote reference:
  `8d1a1ccee792f672864bc32827caefc43d5e7210`
- backend: Appwrite
- ordinary mutation gate: false
- products/categories/files: `0/0/0`
- core Team, database, bucket, and two core tables: reachable and locked
- `activity_logs`, `analytics_events`, and `broadcasts`: absent

No identity or platform operation occurred. The prior verified zero user,
membership, and platform baseline therefore remains applicable.

## 2. Image mutation boundary

`lib/appwrite/product-lifecycle.ts` is server-only and uses only the fixed
`wat_app`, `products`, `categories`, and `product_images` resources. It
implements:

- private upload and attachment;
- safe image replacement;
- image removal;
- uncached orphan reference checks and admin-only cleanup;
- storefront publication and hiding;
- feed, featured, and status-pick updates; and
- chosen-product selection using one TablesDB transaction.

The application routes are same-origin server seams:

- `/api/admin/product-images`
- `/api/admin/product-lifecycle`

Both return the mutation-disabled response before loading identity or data
services while the global gate is false. No browser Appwrite storage call, API
key, raw permission input, privileged download proxy, or active UI exists.

## 3. Authorization

Every ordinary service call requires Appwrite mode, the global gate, a valid
SSR-derived confirmed `wat_staff` identity, exactly one recognized application
role, and action authorization.

Both `admin` and `product_editor` may upload, replace, remove, publish, hide,
change merchandising flags, and select the chosen product. Only `admin` may
perform destructive orphan cleanup. Built-in Team owner alone remains denied.

The Phase 3X verifier uses a symbol-protected context with exact prefixed
product/file allow-lists. Its product-delete context permits only deletion and
only for its exact disposable product IDs.

## 4. File validation

Accepted input is limited to JPEG, PNG, and WebP and at most 1 MiB. Validation
rejects empty files, unsupported MIME types, signature mismatches, extension
mismatches, and oversized input before upload.

JPEG checks its SOI/EOI markers, PNG checks its eight-byte signature, and WebP
checks RIFF/WEBP markers. Server-generated normalized filenames contain only
the server file ID and canonical extension; product names, identities,
sessions, and client filenames are not copied into storage names.

Live PNG verification proved exact uploaded/downloaded bytes, MIME, size,
completion, bucket ID, file ID, and permissions. JPEG and WebP signature
contracts are fixture-tested.

## 5. Upload and attachment

Uploads begin with exactly:

- `read("team:wat_staff/admin")`
- `read("team:wat_staff/product_editor")`

The service re-reads metadata and verifies exact ID, bucket, MIME, size,
completion, and permissions before attachment. Attachment requires an existing
schema-valid private product with no current image and an exact canonical
`updatedAt` token. The file ID is server-derived in ordinary mode and exact
allow-listed in verification mode.

Product linkage is staged in a short TablesDB transaction and verified after
terminal commit. A failed attachment deletes the unreferenced upload and proves
absence. Same-key, same-file retries return the materialized result.

## 6. Replacement

Replacement records the old reference, creates and verifies the new private
file, attaches the new file transactionally, verifies linkage, applies public
permission when required, then privatizes and deletes the old file.

The old file is never deleted before the row safely references the new file.
If attachment fails, only the new file is deleted. If a later step fails while
the old file still exists, compare-before-write compensation restores the old
reference using the latest exact token, restores the required old permission,
and deletes the new file. It never restores over a changed image reference.

The disposable lifecycle proved private replacement, secure new linkage, and
eventual old-file absence. Public replacement compensation is failure-injection
tested but was not needed in the live lifecycle.

## 7. Removal and orphan cleanup

Removal requires an exact token and refuses a public or feed-visible product.
It transactionally clears `imageFileId`, verifies materialization, then deletes
the file and proves absence. A deletion failure reports `CLEANUP_FAILED` and
does not claim complete success.

Admin orphan cleanup first performs an uncached `ttl:0` query on
`products.imageFileId`. Referenced files are rejected. Live proof confirmed
editor denial, admin deletion, and no residual orphan.

## 8. Visibility state model

The four flags remain independent:

- `storefrontVisible`
- `feedVisible`
- `featured`
- `statusPick`

Chosen state remains solely in `chosenSelectionKey`. Featured and status-pick
do not publish a product or select it. Feed visibility requires storefront
visibility.

Publication validates the full product row, category snapshot, image metadata,
private file permissions, and exact optimistic token. Ordinary publication
requires an exact public category; the disposable verifier allows only its
exact private fixture category.

## 9. Publication ordering

Private-to-public ordering is:

1. uncached product, category, and image validation;
2. exact public/staff read permission on the file;
3. anonymous direct HTTP 200, MIME, and size verification;
4. transactional row flag and exact public/staff read permission;
5. terminal row materialization and uncached public query verification.

Exact public permissions are:

- `read("any")`
- `read("team:wat_staff/admin")`
- `read("team:wat_staff/product_editor")`

No public write is granted. A row-transition failure restores the image to
exact staff-only permission if the row remains private.

The live lifecycle proved direct anonymous delivery and inclusion through the
real public catalogue reader.

## 10. Hiding ordering

Public-to-private ordering is:

1. transactionally remove public row permission and set storefront/feed false;
2. verify the public query excludes the row;
3. remove public image permission;
4. verify exact staff-only file permission; and
5. verify anonymous access returns only 401, 403, or 404.

The row therefore becomes private before the image. If image privatization
cannot be confirmed, the product remains hidden and the service reports
`CLEANUP_FAILED` rather than restoring public row exposure.

The live lifecycle proved exclusion through the real public catalogue reader
and subsequent anonymous denial.

## 11. Feed, featured, and status-pick behavior

The merchandising contract accepts only the exact product ID, canonical
`updatedAt`, idempotency key, and one or more supported boolean flags.
`feedVisible=true` rejects private products. Featured and status-pick may
change on private products. All three preserve image, chosen, creation, and
unrelated product state. Same-result retries are outcome-idempotent.

Live proof set all three flags on a public fixture and verified chosen state
was unchanged. Hiding forced feed false.

## 12. Chosen-product transaction

Selection reads the target and current row uncached, rejects multiple current
rows, opens one short TablesDB transaction, re-reads both within the
transaction, changes the previous key to its own row ID, changes the target key
to `"current"`, commits, polls terminal state, and verifies exactly one current
row.

No client may submit `chosenSelectionKey`. Status-pick and every unrelated
field are preserved. No-current selection safely establishes the invariant.
Selecting the already-current target is outcome-idempotent.

The existing product-delete rule remains unchanged: a selected product cannot
be deleted, and deletion never auto-selects a replacement.

## 13. Concurrency and conflicts

Live TablesDB transactions committed and materialized after terminal polling.
The bounded concurrent-selection run had two fulfilled attempts and ended with
exactly one selected row. The cloud serialized/materialized the accepted
outcomes without exposing a duplicate-current state.

Fixtures prove stale target rejection, transaction conflict preservation,
multiple-current fatal rejection, and unknown-commit recovery only when an
uncached read proves the exact target and one-current invariant. Atomicity is
never simulated with sequential writes, and chosen compensation never restores
an older selection.

No live 409 unique-index or transaction-conflict response occurred, so its
exact cloud error subtype remains unobserved; fail-closed classification is
fixture-tested.

## 14. Compensation

Compensation is bounded, uncached, retry-safe, and compare-before-write:

- invalid input creates no file;
- failed attach deletes only an unreferenced new file;
- failed replacement restores the old reference only while the new reference
  is still exact and the old file exists;
- failed row publication restores a still-unreferenced public image to private;
- failed hiding never republishes the already-hidden row;
- failed removal reports the remaining orphan;
- orphan cleanup proves no product reference before delete; and
- unknown chosen commit outcomes are verified, never sequentially rolled back.

Partial cleanup is reported as `CLEANUP_FAILED`; it is never called a rollback.

## 15. Activity-event preparation

Server-only logical event contracts cover image uploaded/verified/attached/
replaced/removed, orphan cleanup attempted/completed, product published/hidden,
public image permission added/removed, chosen changed/failed, visibility
failed, compensation attempted/completed, and cleanup failed.

Events use narrow snapshots and reject secrets, sessions, cookies, raw
permissions, SDK objects, and non-plain JSON. Fifteen logical events were
prepared in each live lifecycle. Nothing is durably stored and
`activity_logs` remains absent.

## 16. Disposable lifecycle

`npm.cmd run appwrite:check-product-lifecycle` is read-only by default. Writes
require both:

- `--run-lifecycle`
- `--confirm-destructive-disposable-product-lifecycle`

The script requires Appwrite mode, mutations false, a `0/0/0` baseline, exact
`phase3x_disposable_` IDs, and `try/finally`. It creates one private category,
three private products, and only tiny generated PNG files.

It proves private upload/bytes/metadata, retry, replacement, removal, invalid
input rejection, orphan authorization, publication, direct anonymous delivery,
public catalogue inclusion, merchandising independence, row-first hiding,
catalogue exclusion, anonymous denial, first/replacement/already-selected/stale
chosen behavior, selected-delete blocking, former-selected safe deletion, and
bounded concurrent selection.

Cleanup privatizes/deletes files, removes products atomically after returning
any current key to its own ID, deletes the category, recounts all resources,
searches every prefix, searches current fixtures, and checks every former
public URL.

## 17. Tests and regression verification

- focused Phase 3X lifecycle: 33 passed
- consolidated mutation suite: 83 passed
- full Appwrite foundation: 197 passed
- mutation gate: 18 passed
- Firebase inventory containment: 8 passed
- lint: passed
- typecheck: passed
- production build: passed
- `git diff --check`: passed
- tracked secret-value scan: zero matches
- client bundle secret-value scan: zero matches
- three corrected live Phase 3X lifecycles: passed

The known build findings remain workspace-root inference from multiple
lockfiles, webpack cache snapshot warnings, and the Edge-runtime static
generation notice. One parallel lint/build run raced generated `public/sw.js`
and returned a transient `ENOENT`; the sequential lint rerun passed.

## 18. Cleanup proof

Every corrected live lifecycle reported:

- starting products/categories/files: `0/0/0`
- ending products/categories/files: `0/0/0`
- product/category/file prefix matches: `0/0/0`
- selected fixture matches: `0`
- former public URLs denied: true
- cleanup verified: true

The initial datetime-format development failure also returned to `0/0/0` in
`finally` and was independently recounted before any rerun.

## 19. Files changed

- `app/api/admin/product-images/route.ts`
- `app/api/admin/product-lifecycle/route.ts`
- `lib/appwrite/product-lifecycle-context.ts`
- `lib/appwrite/product-lifecycle-contracts.ts`
- `lib/appwrite/product-lifecycle-handlers.ts`
- `lib/appwrite/product-lifecycle-permissions.ts`
- `lib/appwrite/product-lifecycle-verification.ts`
- `lib/appwrite/product-lifecycle.ts`
- `lib/appwrite/product-mutations.ts`
- `lib/appwrite/product-verification-context.ts`
- `scripts/appwrite-product-lifecycle-verification.ts`
- `tests/appwrite-product-lifecycle.test.ts`
- `tests/mutation-gate.test.ts`
- `package.json`
- `APPWRITE-IMAGE-VISIBILITY-CHOSEN-PHASE-3X.md`
- `appwrite-migration-handoff.md`

## 20. Findings

1. Raw live Appwrite datetimes must be canonicalized before use as application
   concurrency tokens, matching the Phase 3V/3W finding.
2. The exact file and row public-read format is `read("any")` plus both scoped
   staff-role reads; no public write is needed.
3. Live chosen transactions supported atomic multi-row changes and terminal
   polling. The concurrent run ended with exactly one current row.
4. Cloud did not emit a live chosen unique/transaction conflict in the bounded
   run; fixture conflict and unknown-outcome handling remain the exact evidence.
5. No durable idempotency or activity ledger exists.
6. Physical activity logging, normal mutation UI, and authenticated
   end-to-end ordinary mutation flows remain deferred.

## 21. Final Git and live-resource state

The Phase 3X commit is the commit containing this report and handoff update.
Its immutable hash is reported after commit and push because a commit cannot
contain its own hash.

The final branch must be `appwrite-migration`, aligned with
`origin/appwrite-migration` at `0/0`, with a clean worktree. `main` and the
archive reference remain frozen at the starting hashes.

No user, membership, platform, permanent row/file, table, Firebase resource,
Vercel resource, domain, deployment, production branch, or API key changed.
`WAT_MUTATIONS_ENABLED` remains false.

## 22. Next safest recommended phase

Stop after Phase 3X. The next recommended consolidated phase is physical
immutable activity logging plus fully connected role-aware admin mutation UI
and end-to-end authenticated mutation verification.

Do not begin that phase, enable global mutations, create a real owner, deploy,
cut over, or retire Firebase without separate approval.
