# Phase 3R — Autonomous live Appwrite file verification

## 1. Phase 3Q closeout

Phase 3Q began from the expected uncommitted worktree at
`6a69bab87b2854619f62b7fc78bb592911894470`. Every changed file was part of the
image resolver, public rendering boundary, containment fix, configuration,
tests, or documentation. There were no unrelated edits.

The complete unstaged and staged diffs passed `git diff --check`. Live
foundation metadata remained exact and totals remained zero. Catalogue,
foundation, mutation-gate, Firebase-inventory, lint, typecheck, build, and
secret-containment gates passed.

Phase 3Q was committed and pushed:

- Commit: `5374efc`
- Message: `feat: add read-only Appwrite product image delivery`
- Remote: `origin/appwrite-migration`

## 2. Objective

Phase 3R converts the remaining fixture-only media finding into bounded live
evidence without adding an application mutation path. It proves:

- a private Appwrite file is denied anonymously;
- the disposable file is delivered only after exact public read permission;
- delivered bytes and MIME type match the uploaded disposable PNG;
- the Phase 3Q resolver maps a real public product/file combination;
- homepage and product detail load the direct Appwrite URL;
- no privileged proxy, browser SDK, Firebase path, or API key is used;
- deletion removes the public product route and direct file URL; and
- cleanup restores zero products, categories, and files.

## 3. Safety design

`npm run appwrite:check-file` is read-only by default. Live execution requires
both flags:

```powershell
npm.cmd run appwrite:check-file -- --apply --confirm-disposable-file-check
```

An optional bounded `--hold-seconds=1..120` window keeps the disposable public
product available for real browser verification. It is rejected outside
confirmed apply mode.

The command independently requires exact Appwrite mode, exact
`WAT_MUTATIONS_ENABLED=false`, the existing separated data-key variable, and
the fixed core resource IDs. It cannot redirect to arbitrary resources. It uses
generated `p3r-*` IDs and unmistakable `PHASE 3R DISPOSABLE` labels.

## 4. Disposable data

The only file content was a one-pixel PNG embedded in the local verification
script. It was not a real or production-like product image.

Each bounded lifecycle created one private PNG file, one public disposable
category after file-permission verification, and one public disposable product
pointing to the file. The product used the locked schema and its own row ID as
`chosenSelectionKey`. Every ID was unique.

## 5. Private and public file proof

The data-key client created the file with an exact empty permission list.
Metadata confirmed the expected file ID and private state.

An anonymous direct file-view request returned an expected authorization
denial. The command accepts only 401, 403, or 404 as valid denial evidence; a
generic server error does not count.

The command then applied exact public and staff read permissions. Metadata
confirmed exact `read("any")`. A second anonymous request returned HTTP 200,
`image/png`, and bytes exactly matching the disposable PNG.

No API key, session, token, cookie, or privileged header was included in either
anonymous request.

## 6. Live application proof

The first bounded lifecycle verified the homepage:

- live summary changed from zero to one product/category;
- hero, featured, and catalogue surfaces rendered the disposable product;
- three observed product images completed successfully;
- each image had natural dimensions 1×1; and
- each source was the direct Frankfurt Appwrite file-view URL.

The initial detail navigation landed immediately after the first lifecycle's
60-second cleanup boundary and correctly returned unavailable. A second
independent bounded lifecycle was run solely for the detail proof. It verified
the exact product heading and metadata title, one completed 1×1 product image,
the direct Appwrite URL, and no console warning or error.

The retry was not a cleanup recovery. The first lifecycle had already reported
complete, independently verified cleanup and zero totals.

## 7. Browser network containment

Observed browser assets contained the direct Appwrite image request and
same-origin application assets. Filtering found no Firebase/Firestore endpoint,
Firebase Auth/Storage/Messaging/Installations/FCM endpoint, Google API fallback,
`/api/image-proxy`, Appwrite browser SDK catalogue request, API-key indicator,
or privileged application media proxy.

The public Appwrite endpoint and project query parameter are intentionally
non-secret.

## 8. Cleanup

Every lifecycle uses a `finally` cleanup sequence:

1. delete disposable product;
2. delete disposable category;
3. delete disposable file.

Unit fixtures prove cleanup still runs after browser-verification failure and
unexpected private-file exposure. Live execution independently verified all
three resources returned not found.

After both live lifecycles:

- deleted product route: HTTP 404;
- deleted direct file URL: HTTP 404;
- products: 0;
- categories: 0; and
- product images: 0.

No test resource remains.

## 9. Repository additions

- `lib/appwrite/file-verification.ts`
- `scripts/appwrite-file-verification.ts`
- `tests/appwrite-file-verification.test.ts`
- `appwrite:check-file` package command
- runbook, migration handoff, and this report

The application itself still has no upload, delete, permission mutation, admin
image UI, or public write endpoint.

## 10. Final state

**PASS**

Live Appwrite file permission and delivery behavior matches the Phase 3Q
resolver contract. The test was autonomous, bounded, double-gated, non-secret,
and fully cleaned. Firebase, Vercel, domains, deployments, users, memberships,
keys, authentication methods, operational tables, `main`, and the archive
reference were untouched.
