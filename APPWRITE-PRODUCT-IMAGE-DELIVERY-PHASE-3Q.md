# Phase 3Q — Read-only Appwrite product-image delivery

## 1. Starting state

- Branch: `appwrite-migration`
- Starting local and remote commit:
  `6a69bab87b2854619f62b7fc78bb592911894470`
- Upstream: `origin/appwrite-migration`, ahead `0`, behind `0`
- Local `main` and `origin/main`:
  `83616bfd67534fdd090459230b373f23633bc81d`
- `origin/archive/stage-5-pre-appwrite`:
  `8d1a1ccee792f672864bc32827caefc43d5e7210`
- Worktree: clean
- `.env.local`: ignored, untracked, and unstaged
- Runtime: Appwrite selected and mutations disabled
- Required public configuration and three separated server-key variables were
  present. No key value was printed.

## 2. Live foundation reconfirmation

The read-only bootstrap classified `wat_staff`, `wat_app`, `product_images`,
`products`, and `categories` as exact matches. There were no conflicts or write
actions. The three operational tables remained missing and intentionally
deferred.

The metadata-only connectivity check reached the locked Team, database, bucket,
and core tables. The bucket retained empty bucket permissions, file security,
and the 1 MiB limit. Aggregate totals remained:

- products: 0
- categories: 0
- files: 0

No disposable lifecycle or file operation was run.

## 3. Image-flow audit

Before Phase 3Q:

- hero picks, product cards, feed cards, and product detail consumed only the
  public DTO's `imageUrl`;
- Appwrite `imageFileId` was validated as a scalar but discarded;
- safe non-Firebase HTTPS legacy URLs could populate `imageUrl`;
- Firebase, Google API, Firebase Storage, Realtime Database, and insecure legacy
  URLs mapped to the existing empty-string placeholder state;
- cards/feed used the “Photo coming soon” placeholder and product detail used
  the existing category placeholder;
- the Firebase image proxy was already blocked before fetch in Appwrite mode;
- status-image export could use that proxy only in Firebase mode;
- product Open Graph rendering stayed generic in Appwrite mode; and
- Next.js allowed every HTTPS remote image hostname.

Admin Firebase media paths remain legacy rollback-only paths and are unavailable
while Appwrite mode has mutations disabled.

## 4. Selected delivery architecture

The selected path is a direct Appwrite file-view URL:

```text
{configured HTTPS endpoint}/storage/buckets/product_images/files/{validated file ID}/view?project={validated project ID}
```

The server data client reads metadata only. It does not fetch file bytes. After
strict validation, the public DTO receives only the resolved URL. The browser
then requests Appwrite anonymously, so Appwrite's file permission remains the
enforcement point at delivery time. If a file becomes private after mapping,
the direct request fails at Appwrite rather than being served through a
privileged application proxy.

The URL contains no API key, token, cookie, session header, raw permission
array, bucket choice, or row-supplied endpoint. No new application endpoint was
added.

## 5. Resolver rules

`lib/appwrite/product-image.ts` is the narrow server-only resolver. It requires:

- visible product state;
- exact `read("any")` product-row permission;
- an Appwrite-valid scalar file ID;
- successful metadata lookup in fixed bucket `product_images`;
- matching metadata file and bucket IDs;
- exact `read("any")` file permission;
- JPEG, PNG, or WebP MIME type;
- original size no greater than 1 MiB;
- a complete chunk count; and
- no deleted marker.

Filename and unrelated metadata do not affect authorization. Missing,
malformed, private, wrong-bucket, mismatched, deleted, incomplete, invalid MIME,
oversized, collection-like, or lookup-failed metadata returns the existing
empty image state.

Only the absence of `imageFileId` permits the existing safe non-Firebase HTTPS
legacy URL policy. A malformed or failed Appwrite reference does not fall back
to a legacy URL.

## 6. Permission semantics

The shared permission helper accepts only an array of scalar strings containing
the exact permission `read("any")`. Reordered and duplicate valid permissions
are deterministic. Staff-only, missing, malformed, unrelated, and
string-contains lookalikes are rejected.

The same helper now protects public product rows, categories, and image files.

## 7. Public DTO and rendering boundary

The existing `PublicProduct.imageUrl` contract is preserved. Raw Appwrite file
metadata, permissions, bucket configuration, and server configuration are not
sent to client components. The file ID appears only as the necessary encoded
path segment in an approved resolved URL.

One scoped `PublicProductImage` component now renders resolved media for:

- homepage hero live picks;
- catalogue product cards;
- feed/status cards; and
- product detail.

It uses a native image element because the temporary legacy contract permits
safe HTTPS hosts that cannot be enumerated narrowly. Appwrite mode's Next.js
remote-image configuration is restricted to the configured HTTPS Appwrite
hostname and fixed product-image path. Firebase rollback mode retains its
existing dynamic-host policy. Placeholder layout and styling were not
redesigned.

## 8. Open Graph

Appwrite product Open Graph rendering remains generic. The Edge route does not
load the Node Appwrite data client, does not fetch product media, and does not
fall back to Firebase in Appwrite mode. Social-card image expansion remains
deferred.

## 9. Fixture validation

Fixture tests cover:

- visible public product with public file;
- visible public product with private file;
- hidden or private product with public file;
- missing file;
- malformed file ID;
- mismatched file ID;
- wrong bucket;
- deleted or incomplete file;
- malformed permissions;
- invalid MIME type;
- oversized metadata;
- no image;
- Firebase legacy URL rejection;
- safe non-Firebase HTTPS legacy support;
- deterministic URL construction; and
- public DTO exclusion of file metadata and permissions.

Only the valid public combination receives an Appwrite URL. Every unsafe
combination receives the existing placeholder state. No live file was needed
or authorized.

## 10. Browser and network smoke

A local Appwrite-mode browser run with mutations disabled verified:

- `/` rendered the empty catalogue/feed state;
- `/product/phase-3q-missing` returned the expected 404;
- `/admin` rendered the mutations-disabled state; and
- `/admin/login` rendered the mutations-disabled state.

There were no browser console warnings/errors, overlays, or hydration findings.
The empty state had no horizontal overflow at 360, 390, 414, or 1280 CSS-pixel
viewport widths.

Observed homepage assets were same-origin Next.js assets, local branding,
development hot-reload assets, and the same-origin disabled analytics beacon.
There were no Firebase, Firestore, Auth, Storage, Google sign-in, Messaging,
Installations, FCM, Appwrite browser SDK, image-proxy, privileged proxy, or
public Appwrite file requests. No file request was expected because live
products and files remained empty.

## 11. Secret containment

Production HTML and 46 client-static files were scanned. Configured server-key
values and 16-character beginning/middle/end fragments were absent. Server key
variable names, `WAT_MUTATIONS_ENABLED`, and `.env.local` were absent after
removing an unrelated legacy Firebase setup message from the client.

Tracked files contained no configured key value. `.env.local` remained ignored,
untracked, and unstaged. Public endpoint and project ID remain the only allowed
Appwrite configuration in public URLs.

## 12. Verification

Passed:

- catalogue tests: 20
- Appwrite foundation tests: 66
- focused connectivity tests: 3
- mutation-gate tests: 15
- Firebase inventory tests: 8
- lint
- typecheck
- production build
- real browser route and responsive smoke
- client HTML/static secret scan

The production build retained the known multiple-lockfile, webpack-cache, and
Edge-runtime warnings.

## 13. Scope and final state

No upload, replacement, delete, permission update, image processing, admin
image UI, user, Team membership, operational table, platform, API key,
Firebase resource, Vercel resource, deployment, domain, production branch, or
archive state was created or changed.

**PASS WITH FINDINGS**

The read-only delivery architecture is implemented and fixture-proven. Live
file permission behavior remains intentionally untested because no file exists
and Phase 3Q did not authorize creating one. The next media mutation phase must
separately authorize and test upload/permission sequencing before any product
image is created.
