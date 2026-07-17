# Appwrite Product Schema Diagnosis — Phase 3N

**Result:** PASS. The five Phase 3M product findings were comparator false positives. No live Appwrite mutation was required or performed.

## 1. Starting state

- Branch: `appwrite-migration`.
- HEAD and upstream: `ee2a2f59fe589b72721b60f735e38f1b1d0fc324`, ahead/behind `0/0`.
- Worktree: clean before Phase 3N.
- Local `main` and `origin/main`: `83616bfd67534fdd090459230b373f23633bc81d`.
- Archive reference: `8d1a1ccee792f672864bc32827caefc43d5e7210`.
- `.env.local`: ignored, untracked, and unstaged; values were not printed.
- Runtime safety: `WAT_BACKEND=appwrite` and `WAT_MUTATIONS_ENABLED=false`.

## 2. Relevant code paths

- `lib/appwrite/table-blueprints.ts` defines the locked expected columns.
- `scripts/appwrite-bootstrap.ts:createColumn` maps blueprint kinds to the corresponding Node SDK creation methods.
- `scripts/appwrite-bootstrap.ts:normalizeInventory` converts live SDK metadata into `BootstrapInventory`.
- `lib/appwrite/bootstrap.ts:appwriteColumnMatchesBlueprint` compares expected and normalized live columns.
- `lib/appwrite/bootstrap.ts:classifyTable` reports incompatible columns and blocks apply.
- `scripts/appwrite-schema-diagnose.ts` reads and sanitizes only the five reported columns and three compatible controls.
- `node-appwrite` 27.0.0 types model enum and URL columns with a generic `type: string` plus a specific `format` field.

## 3. Sanitized expected/live metadata

| Column | Expected | Live Appwrite metadata | Semantic result |
|---|---|---|---|
| `brand` | enum; required; `univercell`, `eko` | `type=string`, `format=enum`; required; same elements and order; default `null`; scalar; available | Exact semantic match |
| `currency` | enum; optional; `PKR`; default `PKR` | `type=string`, `format=enum`; optional; same singleton element; default `PKR`; scalar; available | Exact semantic match |
| `condition` | enum; required; `New`, `Like New`, `Used` | `type=string`, `format=enum`; required; same elements, case, spacing, and order; default `null`; scalar; available | Exact semantic match |
| `stockStatus` | enum; required; `in_stock`, `low_stock`, `sold_out` | `type=string`, `format=enum`; required; same elements and order; default `null`; scalar; available | Exact semantic match |
| `legacyImageUrl` | optional URL | `type=string`, `format=url`; optional; default `null`; scalar; available | Exact semantic match |
| `name` control | required varchar(160) | `type=varchar`; required; size 160; scalar; available | Exact match |
| `price` control | required integer | `type=integer`; required; scalar; available | Exact match |
| `featured` control | optional boolean; default false | `type=boolean`; optional; default false; scalar; available | Exact match |

The diagnostic emitted no endpoint, project credential, API-key value, row data, or unrelated raw SDK field. Empty defaults are returned by the live API as `null`; the bootstrap normalizer intentionally omits `null`, matching an absent expected default.

## 4. Creation payload versus returned metadata

The bootstrap sent the intended SDK operations:

- `brand`: enum creation with the two approved elements, required, no default.
- `currency`: enum creation with `PKR`, optional, default `PKR`.
- `condition`: enum creation with the three approved elements, required, no default.
- `stockStatus`: enum creation with the three approved elements, required, no default.
- `legacyImageUrl`: URL creation, optional, no default.

Appwrite preserved all values, order, required flags, defaults, and scalar shape. It serialized enum and URL columns through the shared string storage type and distinguished them using `format=enum` or `format=url`.

## 5. Column-by-column classification

- `brand`: **comparator false positive**.
- `currency`: **comparator false positive**.
- `condition`: **comparator false positive**.
- `stockStatus`: **comparator false positive**.
- `legacyImageUrl`: **comparator false positive**.

All five share one proven SDK/API representation cause. No enum ordering, singleton-enum, spacing, case, nullability, default, or live-schema defect was found.

## 6. Root cause

The live normalizer retained `type` but discarded `format`. The comparator then compared live `type=string` directly with expected `kind=enum` or `kind=url`. This made every correctly round-tripped enum and URL column fail.

The fix preserves `format` and canonicalizes only:

- `type=string` plus `format=enum` to expected kind `enum`.
- `type=string` plus `format=url` to expected kind `url`.

Other string formats remain strings and fail these comparisons. Scalar blueprints now also reject live array columns explicitly.

## 7. Repository changes

- Added the bounded sanitized schema diagnostic command.
- Preserved live `array` and `format` metadata during bootstrap normalization.
- Added narrow enum/URL kind canonicalization.
- Exported the focused column matcher for fixture tests.
- Added negative tests proving wrong format, elements, defaults, ordering, and array shape remain incompatible.

No Appwrite resource or authentication setting was changed in Phase 3N.

## 8. Verification

- Targeted bootstrap tests: 21 passed.
- Full Appwrite foundation suite: 50 passed.
- Mutation/containment suite: 15 passed.
- Firebase inventory safety suite: 8 passed.
- Lint: passed.
- Typecheck: passed.
- Production build: passed.
- `git diff --check`: passed; known Windows LF-to-CRLF warnings only.
- Tracked secret-value scan: passed.
- Tracked private-key marker scan: passed.
- Client static-bundle server-key name and secret-value scans: passed.

The build retained the existing warnings about workspace-root inference, webpack cache snapshots, and edge-runtime static generation.

## 9. Read-only bootstrap result

`npm.cmd run appwrite:bootstrap` was rerun without apply flags. It reported:

- Team, database, and bucket: exact match.
- `products`: exact match; schema, indexes, permissions, and row security match.
- `categories`: exact match.
- Three operational tables: still missing and intentionally deferred.
- Conflicts: none.
- Write actions: none.

## 10. Live correction and next phase

No live schema correction is needed. Do not delete, recreate, or modify `products`.

The next safest phase is a bounded continuation of the deferred Phase 3M validation: metadata connectivity, the double-gated disposable private-category lifecycle with verified cleanup, then local Appwrite-mode smoke and live Firebase-traffic containment with mutations disabled.
