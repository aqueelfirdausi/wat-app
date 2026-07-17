# Phase 3O — Appwrite connectivity and local smoke

## 1. Starting State

- Branch: `appwrite-migration`
- Starting commit: `a17eb366ed9c67ac460c0d5081c07939c5275d6e`
- Upstream: `origin/appwrite-migration`, ahead `0`, behind `0`
- `main` and `origin/main`: `83616bfd67534fdd090459230b373f23633bc81d`
- `origin/archive/stage-5-pre-appwrite`: `8d1a1ccee792f672864bc32827caefc43d5e7210`
- The worktree was clean.
- The ignored `.env.local` selected Appwrite on the server and browser, kept
  `WAT_MUTATIONS_ENABLED=false`, and contained the three required server key
  variables. No value was printed or committed.

## 2. Read-Only Foundation Verification

`npm run appwrite:bootstrap` was executed without apply flags. It classified the
existing `wat_staff` Team, `wat_app` database, `product_images` bucket,
`products` table, and `categories` table as exact matches. The three operational
tables remained missing and deferred. There were no conflicts and no planned or
executed writes.

The Appwrite Console was inspected read-only:

- Users: zero.
- Teams: only `wat_staff`, with zero members.
- Platforms: none.
- API keys: exactly the three approved local keys, with 1, 4, and 12 scopes
  respectively. No secret was viewed.

No user, membership, platform, permanent row, file, or operational table was
created.

## 3. Metadata Connectivity

`npm run appwrite:check` completed in its default metadata-only mode. The Team,
database, bucket, `products`, and `categories` resources were reachable and
their locked security settings matched. The deferred operational tables
returned not-found responses as expected.

## 4. Disposable Lifecycle

The lifecycle command was run only with both required flags:

```text
npm run appwrite:check -- --apply --confirm-disposable-check
```

It created one unmistakably disposable, private row in `categories`, read it,
updated it, deleted it, and verified that a final read returned not found. The
implementation uses an empty permission list and a unique
`migration-disposable-<timestamp>` identifier. Its `finally` path also attempts
cleanup if an earlier verification fails.

## 5. Cleanup Verification

A new read-only count command, `npm run appwrite:check-empty`, queried only
aggregate totals for `products`, `categories`, and `product_images`.

| Dataset | Before lifecycle | After lifecycle |
| --- | ---: | ---: |
| `products` rows | 0 | 0 |
| `categories` rows | 0 | 0 |
| `product_images` files | 0 | 0 |

The disposable row was fully removed. No permanent data or file remains.

## 6. Local Start

The Next.js 15 development server started from the repository with `.env.local`
loaded and became ready at `http://localhost:3000`. The only startup finding was
the existing multiple-lockfile workspace-root warning. PWA support remained
disabled in development. No deployment or external hosting action occurred.

## 7. Browser Routes Tested

A real signed-in Chrome session tested:

| Route | Result |
| --- | --- |
| `/` | Rendered the storefront and the Appwrite foundation notice |
| `/admin` | Rendered the read-only “Admin mutations are disabled” state |
| `/admin/login` | Rendered the same server-enforced read-only state |
| `/product/phase-3o-missing` | Returned the expected not-found page |

The clean retest had no runtime overlay and no browser-console errors.

## 8. Smoke Result

The first storefront load exposed a bounded migration bug: Firebase-only
catalogue and broadcast readers were invoked even though Appwrite mode had
correctly left the Firebase client uninitialized. This caused a local Next.js
runtime overlay but no Firebase backend request.

The smallest safe correction gates those Firebase-only effects with
`isBrowserFirebaseMode()`. Appwrite mode now renders an empty, read-only
foundation state without initializing listeners or silently falling back to
Firebase. Appwrite catalogue wiring remains deferred.

## 9. Appwrite Network Evidence

Live Appwrite connectivity was proven through:

- metadata reads for Team, database, bucket, and both core tables;
- not-found reads for the three intentionally deferred tables;
- aggregate row/file counts before and after the lifecycle; and
- the double-gated create/read/update/delete/not-found disposable lifecycle.

The browser did not invoke the Appwrite browser SDK because public catalogue
adapters are intentionally not wired yet. Therefore the absence of a Web
platform did not cause a CORS or SDK failure and did not authorize platform
creation.

## 10. Firebase Traffic Containment

In Appwrite mode, the Firebase app remained uninitialized. After the bounded
mode gate, the clean storefront and protected-route runs produced no Firebase
configuration error and no browser-console error. Existing mutation-gate tests
also prove that Appwrite mode never calls the Firebase analytics writer, never
loads Firebase notification services, and blocks the legacy Firebase image
proxy before fetch.

No Firebase configuration, data, authentication, Storage, messaging, or
deployment state was changed.

## 11. Firebase Runtime Suppression

The browser-side Firebase configuration is usable only when
`NEXT_PUBLIC_WAT_BACKEND=firebase`. In Appwrite mode:

- Firebase app/Auth/Firestore/Storage initialization returns null;
- homepage product/category reads and subscriptions do not start;
- broadcast subscriptions do not start;
- messaging stays suppressed;
- server Firebase loaders and mutation paths fail closed.

No Firebase fallback was added.

## 12. Client Secret Containment

The served homepage HTML and generated `.next/static` client assets were scanned
against the configured bootstrap, data, and authentication key values. No
configured secret value was present. The three server key variable names and
`WAT_MUTATIONS_ENABLED` were also absent from client static assets/HTML.

Only the explicitly public Appwrite endpoint, project ID, and backend selector
are eligible for browser exposure. No API-key secret was printed, viewed in
Console, added to source, or committed.

## 13. Tests and Build

The following gates passed:

- focused Appwrite connectivity tests: 3/3;
- Appwrite foundation tests: 50/50;
- mutation-gate tests: 15/15;
- Firebase inventory read-only tests: 8/8;
- lint;
- typecheck;
- production build.

## 14. Files Changed

- `components/homepage-client.tsx`
- `components/storefront/broadcast-drawer.tsx`
- `scripts/appwrite-empty-state-check.ts`
- `package.json`
- `APPWRITE-CONNECTIVITY-AND-SMOKE-PHASE-3O.md`
- `appwrite-migration-handoff.md`

## 15. Commit and Push

Phase 3O is committed and pushed only after all final verification gates pass.
The exact commit is recorded in the final handoff.

## 16. Findings

- The locked live foundation is reachable and exact.
- The disposable lifecycle and cleanup are safe and repeatable.
- All permanent product, category, and image datasets remain empty.
- Appwrite mode previously suppressed Firebase initialization but did not
  suppress two Firebase-only effects; the narrow mode gate corrects that local
  runtime defect.
- Public Appwrite reads are still not wired into the storefront.
- No Web platform exists, but none is required until browser SDK traffic is
  introduced.
- The three operational tables remain intentionally deferred.

## 17. Next Safest Phase

The next phase should wire read-only Appwrite product/category adapters into the
storefront and product detail path, with explicit empty-state and hidden-row
tests. Before the first actual browser SDK request, obtain separate owner
authorization to create the narrowly scoped localhost Web platform if live
testing proves it is required. Do not add mutations, real users, memberships,
operational tables, files, or cutover behavior in that phase.

## 18. Final State

**PASS WITH FINDINGS**

The live core foundation, metadata connectivity, disposable lifecycle, cleanup,
local fail-closed browser behavior, Firebase containment, and client-secret
containment are verified. The only finding was the bounded Firebase-only effect
invocation, which is corrected and covered by the successful browser retest.
No unapproved Appwrite, Firebase, Vercel, domain, deployment, production branch,
or archive action occurred.
