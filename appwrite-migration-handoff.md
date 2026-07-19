# Appwrite Migration Handoff

This document is the frozen architecture and branch-safety handoff for the Appwrite migration. It is authoritative when other repository documentation conflicts with it.

## Platform and scope

- Use the existing Appwrite project `watapp` in the Frankfurt region.
- This is a single-shop application. Do not add tenant abstractions, a `shopId`, or multi-tenant test scaffolding.
- Appwrite authentication is email/password only. Google OAuth is disabled.
- Use the Appwrite database `wat_app`.
- Use the Appwrite Team `wat_staff` with the roles `admin` and `product_editor`.
- Use the Appwrite Storage bucket `product_images`.
- Product images have a maximum size of 1 MB.

## Permanent data model

The migration has exactly five permanent tables:

1. `products`
2. `categories`
3. `activity_logs`
4. `analytics_events`
5. `broadcasts`

Appwrite Auth and the `wat_staff` Team provide staff identity and authorization; do not create a separate permanent users table. Configuration that does not belong in the five tables must remain application configuration unless a later approved architecture revision says otherwise.

Firebase `team_contacts` exists as legacy functionality. Its future handling is deferred: do not delete or migrate it, recreate it as an Appwrite table, or modify its Firebase data or application code without separate authorization.

Do not add a sixth permanent table, `team_contacts`, a tenants table, `shopId`, `tenantId`, or any multi-tenant field or abstraction.

### `products` schema

| Column | Approved definition |
|---|---|
| `name` | `varchar(160)`, required |
| `slug` | `varchar(160)` or `varchar(191)` depending on final Appwrite Console compatibility, required |
| `description` | `text`, required |
| `brand` | enum: `univercell`, `eko` |
| `preferredContactId` | `varchar(64)`, optional |
| `categoryId` | varchar, required |
| `categoryName` | varchar, required |
| `price` | integer, required |
| `currency` | enum: `PKR`; default `PKR` |
| `condition` | enum: `New`, `Like New`, `Used` |
| `stockStatus` | enum: `in_stock`, `low_stock`, `sold_out` |
| `featured` | boolean; default `false` |
| `statusPick` | boolean; default `false` |
| `storefrontVisible` | boolean |
| `feedVisible` | boolean |
| `sortPriority` | integer; default `0` |
| `chosenSelectionKey` | `varchar(36)`, required |
| `imageFileId` | `varchar(36)`, optional |
| `legacyImageUrl` | URL, optional |
| `createdAt` | datetime |
| `updatedAt` | datetime |
| `createdByName` | optional |
| `updatedByName` | optional |

Rejected product fields are `chosenForToday`, `shopId`, `tenantId`, `contactName`, `contactWhatsappNumber`, legacy image-path fields, and Firebase UID audit fields.

Approved indexes:

- `products_slug_unique`
- `products_updated_at`
- `products_chosen_unique`

The chosen-product invariant remains provisional until isolated transaction and concurrency tests pass:

- Selected product: `chosenSelectionKey = "current"`.
- Unselected product: `chosenSelectionKey` equals its own Appwrite row ID.
- The value is required, never null or empty, and covered by a unique index so at most one row has `"current"`.
- Selection must not derive from `statusPick`.

### `categories` schema

Approved columns are `name`, `slug`, and `updatedAt`. Do not create `productCount` or `createdAt`.

Approved indexes:

- `categories_slug_unique`
- `categories_name`

Categories are publicly readable; all writes are server-mediated.

### `activity_logs` schema

Approved columns are `action`, `entityType`, `entityId`, `entityName`, `actorUserId`, `legacyActorFirebaseUid`, `actorName`, `actorEmail`, `details`, optional `requestId`, and `createdAt`.

Approved index: `activity_logs_created_at`.

Activity logs are server-created and append-only. `entityType` remains varchar until historical Firebase values are inventoried.

### `analytics_events` schema

Approved core fields are `eventName`, `sessionId`, `productId`, `productSlug`, `category`, `context`, and `createdAt`.

Approved index: `analytics_events_created_at`.

Public events must enter through a validated, rate-limited server route. Direct public writes are prohibited.

### `broadcasts` schema

Approved columns are `title`, `body`, `sentAt`, `sentByUserId`, `sentByName`, `sentByEmail`, `productId`, `productSlug`, `productImageFileId`, and `legacyProductImageUrl`.

Approved index: `broadcasts_sent_at`.

Broadcasts are publicly readable. Only an admin server route may create or delete them; there is no update route. Product editors cannot create or delete broadcasts, and direct client writes are prohibited.

## Security and mutation boundaries

- All catalogue, operational-state, role-sensitive, logging, and storage mutations are server-mediated.
- Hidden product rows are private.
- Images belonging to hidden products are private.
- Authorization must preserve the `admin` and `product_editor` boundaries; only admins may permanently delete products.
- Do not expose Appwrite API keys, session secrets, credentials, or private test output to browser bundles or Git.

### Authentication boundary

- Appwrite authentication is email/password only; Google OAuth and all unapproved providers remain disabled.
- There is no public signup UI. Forgot-password and reset-password flows are required.
- Authentication uses a server-side SSR session cookie.
- Every protected request must verify an authenticated account, confirmed membership in `wat_staff`, and exactly one application role: `admin` or `product_editor`.
- Built-in Team `owner` alone grants no application-admin access. Zero or multiple application roles fail closed.
- Do not create real users until password establishment through recovery is verified. Never use administrator-known temporary passwords.

### Data and file permissions

The `products` table has row security enabled and empty table permissions. Visible product rows grant public read and read to the `wat_staff` roles `admin` and `product_editor`. Hidden rows grant read only to those staff roles. No client may directly create, update, or delete product rows.

The `product_images` bucket has empty bucket permissions and file security enabled. Visible files grant public and staff read; hidden files grant staff read only. Upload, replacement, permission changes, and deletion are server-mediated.

Visibility changes use these fail-closed sequences:

- Hide: make the image private, then make the product row private. If the row update fails, restore the image's public permission. If restoration fails, log an immutable compensation failure.
- Show: keep the image private, make the product row public, then make the image public. If image publication fails, revert the row to hidden.
- Every failure path must leave content fail-closed.

### API-key separation

The initial data/runtime key is limited to `rows.read`, `rows.write`, `files.read`, and `files.write`. Do not broaden it.

Current official Appwrite SSR guidance indicates that server-side session creation may require a separate narrowly scoped authentication/session key with `sessions.write`. This key is a candidate pending isolated testing and live-project verification. Do not create either key in this phase, combine their scopes, or document a key secret. Any key creation requires explicit approval.

### Deployment mutation gate

- `WAT_MUTATIONS_ENABLED` is a server-only deployment safety switch. It must never use the `NEXT_PUBLIC_` prefix or be exposed to browser code.
- Only the exact value `true` enables approved server-side mutations. Missing, empty, malformed, and all other values fail closed.
- The gate does not bypass authentication, authorization, validation, or role checks; it is not a role-permission mechanism.
- Any future Vercel Preview must use `WAT_MUTATIONS_ENABLED=false`.
- Current Firebase production requires `WAT_MUTATIONS_ENABLED=true` before this branch can replace its running code without disabling gated writes.
- Future Appwrite mutations may be enabled only after explicit approval and successful permission tests.

## Migration and branch safety

- Firebase remains authoritative during the migration. Do not change production reads or writes until a separately approved cutover.
- `main` is the production branch and must remain unchanged by migration work.
- `appwrite-migration` is the active migration-development branch and is based directly on synchronized `main`.
- `archive/stage-5-pre-appwrite` is the preservation branch for the pre-Appwrite `stage-5` workspace.
- Never merge, rebase, or cherry-pick `stage-5` into `appwrite-migration`.
- The Vercel project `wat-app-preview` exists but must remain dormant. Its first controlled non-production-branch deployment was unexpectedly classified as Production and was deleted while initializing.
- No further Vercel deployment attempt is approved, including a bootstrap Production deployment. Do not create a second Vercel project, attach a custom domain, or change Vercel configuration.
- Resume Vercel work only after an official Support response or an explicit architecture decision by the owner. Any later approved Preview must keep `WAT_MUTATIONS_ENABLED=false`.
- Do not change Firebase, Appwrite, Vercel, domains, or deployments without explicit owner authorization.

## Phase 3A read-only capability audit

The frozen target remains implementable with Appwrite's required capability groups: email/password Auth for staff identity, the existing `wat_staff` Team for the two staff roles, Databases/Tables for exactly five permanent tables, Storage for the private `product_images` bucket, and server-side API-key access for migration and privileged operations. Client sessions must not receive API keys, and mutations remain server-mediated.

No Appwrite SDK, Appwrite environment configuration, or safely available Console session exists in this checkout. The next preflight is therefore a single owner-supplied Console capture. Copy these values once, without including secrets in Git or chat history beyond the secure handoff channel:

- Existing project: project ID and the Frankfurt API endpoint shown by the Console.
- Platforms: every existing Web platform hostname, including whether localhost is registered.
- Auth: whether email/password is enabled, and the enabled/disabled state of every other provider (Google must be disabled for the frozen target).
- Teams: all existing Team IDs/names, confirming the ID/name of `wat_staff` and any existing memberships or role labels.
- Databases: all existing database IDs/names, confirming whether `wat_app` already exists and listing any tables already inside it.
- Storage: all existing bucket IDs/names, confirming whether `product_images` already exists and its current file-size, extension, encryption, antivirus, and permission settings.
- Users: aggregate user count and whether any existing users must be preserved; do not copy emails, phone numbers, password data, or session tokens.
- API keys: key names/IDs, scopes, and expiry status only; never copy key secrets. Confirm whether a suitably scoped migration key already exists or must later be created with explicit approval.

## Phase 3K fast-track local foundation

The migration adopted a fast-track local strategy on `appwrite-migration`. The repository now has an explicit `WAT_BACKEND` selector accepting only `firebase` or `appwrite`. The selector is server-owned; Next.js exposes the same non-secret build-time value to browser modules so both sides select one backend consistently. Missing, malformed, padded, or uppercase values fail closed. The production branch and running Firebase application remain unchanged and undeployed.

Official Appwrite browser and Node SDKs are installed. Browser, server-data, server-authentication, and per-session clients initialize lazily and keep API keys out of browser bundles. The data and authentication clients remain separate; the data key retains only row/file scopes and the provisional authentication key retains only `sessions.write`.

The authentication foundation includes SSR cookie helpers, service interfaces, normalized staff identity, and fail-closed role decisions. It permits exactly one of `admin` or `product_editor` and denies missing/invalid sessions, blocked accounts, missing or unconfirmed `wat_staff` membership, zero or both application roles, built-in `owner` alone, and unknown roles. No login UI replacement, recovery execution, real account, Team membership, or live session was created in this phase.

The idempotent bootstrap command is read-only by default. Apply requires both `--apply` and `--confirm-create-missing`, an exact expected-project-ID match, and a separate temporary bootstrap key. It never deletes or rewrites existing resources, touches users, or creates/modifies keys. The currently safe apply subset can create only a missing fixed Team, database, or bucket. It inventories and compares the five permanent tables, but automatic table creation remains blocked because several Appwrite column types and sizes—and the product slug length—are not yet frozen. It will not create incomplete table shells or an Appwrite `team_contacts` table.

Firebase remains available only through explicit `WAT_BACKEND=firebase`. In Appwrite mode, the browser Firebase app and its Auth, Firestore, Storage, messaging, and listeners remain uninitialized; Firebase Admin and Firebase analytics/notification write loaders also fail closed before initialization. Catalogue and login adapters are intentionally not yet replaced, so Appwrite mode currently presents unavailable/foundation states instead of silently falling back to Firebase.

No Appwrite resource, API key, user, password recovery, Firebase data, Vercel setting, domain, deployment, or production configuration was created or changed during Phase 3K. See `APPWRITE-FAST-TRACK-LOCAL-RUNBOOK.md` for the safe local sequence.

Remaining requirements are live resource inventory, fixed-ID collision review, exact column type/size completion, public-signup prevention proof, recovery-based password establishment, SSR auth-key verification, Team role behavior, row/file permission tests, visibility compensation, and `chosenSelectionKey` transaction/concurrency proof.

## Phase 3L fast-track resource setup

Phase 3L locked the practical `products` and `categories` schemas against the installed Node SDK. Product slugs use `varchar(160)`, descriptions use the native text column, legacy image URLs use the native URL column, and the approved enum, boolean, integer, datetime, and index definitions are represented explicitly. The bootstrap may create only wholly missing core tables with row security enabled and empty table permissions. It never adjusts partial or incompatible tables automatically. The three operational tables remain part of the five-table architecture but their live creation is deferred until field limits are finalized.

The repository now includes a metadata-only connectivity command plus a separately double-gated disposable private-category lifecycle. It also includes server-only, validated product/category read adapters with no Firebase fallback. Appwrite data services no longer require the provisional authentication key merely to initialize a data-only client.

No Phase 3L Appwrite environment-variable names were present in the ignored local environment at implementation time. Consequently no live Appwrite inspection, resource creation, row lifecycle, local Appwrite-mode browser smoke run, user/key action, Firebase change, Vercel action, deployment, or domain change was performed. Live project state and resource existence remain unverified.

## Phase 3N product schema normalization diagnosis

Phase 3N proved that the five post-creation product findings were comparator false positives, not live-schema defects. Appwrite returns enum columns as `type=string` with `format=enum` and URL columns as `type=string` with `format=url`. The values, ordering, required flags, defaults, scalar shape, and availability of `brand`, `currency`, `condition`, `stockStatus`, and `legacyImageUrl` matched their creation inputs and the locked blueprint.

Bootstrap normalization now retains `format` and `array`. The comparison canonicalizes only the two verified string-format representations and explicitly rejects arrays for scalar blueprints. Negative tests continue to reject wrong formats, enum values, defaults, ordering, and array shapes. A read-only bootstrap rerun classified the Team, database, bucket, `products`, and `categories` as exact matches with no conflict or write action.

No live resource, column, index, permission, row, file, user, membership, key, authentication method, platform, Firebase resource, Vercel resource, deployment, or domain was changed during Phase 3N. See `APPWRITE-PRODUCT-SCHEMA-DIAGNOSIS-PHASE-3N.md` for the sanitized evidence.

## Phase 3O connectivity, disposable lifecycle, and local smoke

Phase 3O verified the existing live `wat_staff` Team, `wat_app` database,
`product_images` bucket, and locked `products` and `categories` tables through
read-only bootstrap and metadata checks. The three operational tables remain
missing and intentionally deferred. Read-only Console inspection confirmed zero
users, zero Team members, no platforms, and exactly the three approved local API
keys; no key secret was viewed.

The double-gated connectivity lifecycle created one private disposable category
row, verified create/read/update/delete behavior, and verified not found after
deletion. Aggregate checks showed zero products, zero categories, and zero image
files both before and after the lifecycle. No permanent row or file remains.

A real local Chrome smoke run found that two Firebase-only client effects still
attempted readers after Firebase initialization had correctly been suppressed
in Appwrite mode. Narrow `isBrowserFirebaseMode()` gates now suppress homepage
catalogue listeners and broadcast listeners. The clean retest rendered the
storefront Appwrite foundation state, server-enforced read-only admin/login
states, and an expected missing-product 404 without runtime overlays or console
errors. No Appwrite catalogue adapter or Firebase fallback was introduced.

The browser SDK was not invoked because public Appwrite catalogue wiring remains
deferred, so the absent Web platform was not required and none was created.
Configured Appwrite server key values and key names were absent from served HTML
and client static assets. `WAT_MUTATIONS_ENABLED` remained false and server-only.

No real user, membership, platform, product, file, operational table, Firebase
resource, Vercel resource, deployment, domain, production branch, or archive
state was changed. See `APPWRITE-CONNECTIVITY-AND-SMOKE-PHASE-3O.md` for the
sanitized evidence and next-phase boundary.

## Phase 3P read-only catalogue wiring

Phase 3P connected the existing Appwrite product/category adapters to the
public homepage and product-detail route through one server-only backend
selector. Firebase mode retains its existing client hydration/listeners for
rollback. Appwrite mode uses only the Node data client; it never invokes the
Firebase catalogue or Appwrite browser SDK and therefore requires no Web
platform.

Public Appwrite products must satisfy both `storefrontVisible=true` and exact
public row read permission. Malformed, hidden, private, missing, or invalid rows
fail closed. Categories also require valid public row permission. Dedicated
public DTOs use the unique slug as their presentation key and omit raw row IDs,
permissions, category IDs, selection keys, image file IDs, audit fields, and
server metadata. The existing public preferred-contact identifier remains
because the storefront WhatsApp chooser uses it.

The homepage remains dynamic and receives Appwrite catalogue data from the
server. Product detail and metadata now use the same selected public reader and
return 404 for non-public rows. The prior Firebase metadata `includeHidden`
escape hatch was removed. The Appwrite Open Graph image remains generic until a
separate media phase because its Edge route does not load the Node Appwrite
client.

No Appwrite files were created. Missing or Firebase-hosted legacy images map to
the existing placeholder in Appwrite mode; a raw `imageFileId` never reaches
the client. Fixture tests proved visible inclusion, hidden/private exclusion,
empty and malformed handling, category behavior, DTO filtering, safe image
fallback, and no cross-backend fallback. No live synthetic rows were required.

Real browser smoke verified the empty catalogue, empty feed, missing-product
404, and mutation-disabled admin/login states without console errors or runtime
overlays. Final live totals remained zero products, zero categories, and zero
files. Production HTML, client assets, source-map candidates, and tracked files
contained no configured server-key value or tested fragment.

No mutation API, login flow, admin CRUD, user, membership, operational table,
platform, Firebase change, Vercel change, deployment, domain, production branch,
or archive state was changed. See `APPWRITE-READ-ONLY-CATALOGUE-PHASE-3P.md` for
the complete sanitized flow map, verification evidence, and remaining media
boundary.

## Phase 3Q read-only product-image delivery

Phase 3Q adds a server-only, fail-closed product-image resolver. Public product
rows with valid `imageFileId` values receive a direct anonymous Appwrite file
view URL only after the existing data client confirms matching
`product_images` metadata, exact public file permission, accepted JPEG/PNG/WebP
MIME type, the 1 MiB size limit, complete upload state, and no deletion marker.
Hidden/private products and missing, malformed, private, mismatched, wrong
bucket, invalid MIME, oversized, incomplete, or deleted files retain the
existing placeholder. A malformed or failed file reference never falls back to
legacy media.

The data API key is used only for server metadata lookup and never fetches or
proxies file bytes. The public DTO still exposes only `imageUrl`; raw
permissions, file metadata, bucket selection, and server configuration remain
private. Browser delivery goes directly to Appwrite without a key, so Appwrite
file permission remains authoritative at request time. No privileged proxy or
browser SDK lookup was added.

The prior safe non-Firebase HTTPS legacy policy remains available only when no
file ID exists. Public hero, card, feed, and detail media use one scoped native
image component so those temporary hosts do not require a global Next.js
wildcard. In Appwrite mode, Next.js remote images are restricted to the exact
configured Appwrite hostname and fixed `product_images` path. Open Graph media
remains generic.

Fixture, browser, build, Firebase-containment, mutation-gate, and secret scans
passed. Live totals remained zero products, categories, and files, so no live
file lifecycle was needed or authorized. No Appwrite mutation, Firebase change,
Vercel action, deployment, domain, production-branch change, or archive change
occurred. See `APPWRITE-PRODUCT-IMAGE-DELIVERY-PHASE-3Q.md`.

## Phase 3R autonomous live file verification

Phase 3Q was closed, committed, and pushed as `5374efc`. Phase 3R adds a
read-only-by-default, double-gated disposable file verification command. The
bounded command creates a one-pixel PNG privately, accepts only 401/403/404 as
anonymous-denial evidence, publishes it with exact public and staff read
permissions, and verifies anonymous HTTP 200, `image/png`, and byte-for-byte
delivery.

One disposable public category and product then exercise the real Phase 3Q
server resolver. Real browser checks proved the homepage and detail page loaded
the direct Frankfurt Appwrite file-view URL at natural 1×1 dimensions without
console errors, Firebase traffic, the Appwrite browser SDK, the legacy image
proxy, or a privileged media endpoint.

Cleanup always runs product, category, then file in a `finally` path. Two
bounded browser lifecycles both independently verified cleanup. Final direct
file and product routes returned 404, and aggregate totals returned to zero
products, zero categories, and zero files. The application still exposes no
file mutation path. See `APPWRITE-LIVE-FILE-VERIFICATION-PHASE-3R.md`.

## Phase 3S Appwrite authentication and SSR session

Phase 3S adds server-mediated Appwrite email/password login, an HTTP-only SSR
session cookie, current-account resolution, exact confirmed `wat_staff`
membership validation, and fail-closed authorization requiring exactly one of
`admin` or `product_editor`. Built-in Team `owner`, unknown, missing,
duplicate, malformed, and ambiguous roles remain denied.

Protected admin routes now share a server boundary. Appwrite mode renders a
narrow role-aware read-only shell; Firebase mode retains legacy components for
rollback. Appwrite login has no signup or Google/OAuth path. Logout deletes
only the current session and expires the cookie. Recovery request and
completion use generic responses and server-only handling; live email delivery
still needs verification with a controlled inbox.

One disposable synthetic user, confirmed Team membership, and email/password
session were exercised through the signed-in Console and local application.
Invalid and valid login, protected routing, mobile and desktop shells, logout,
post-logout denial, recovery UI, and invalid callback handling were verified.
The session, membership, and user were deleted. Final totals were zero users,
Team members, products, categories, files, and platforms.

The repository also contains a read-only-default, double-gated identity
lifecycle command. Its lifecycle and cleanup are fixture-tested. Live apply
refuses before mutation because the deliberately narrow existing setup key
cannot establish numeric user and platform baselines; no key was broadened or
replaced. See `APPWRITE-AUTH-SSR-SESSION-PHASE-3S.md`.

## Phase 3T read-only admin catalogue

Phase 3T connects the protected Appwrite admin routes to one server-only,
backend-selected read boundary. Firebase mode preserves the existing Firebase
dashboard and product components for rollback. Appwrite mode never starts a
Firebase listener or privileged browser Appwrite reader.

Authorized `admin` and `product_editor` identities may read validated public,
private, and hidden products and categories. The internal DTO derives public
permission, visibility, chosen-selection, and image states while excluding raw
rows, permission arrays, image file IDs, selection keys, accounts, memberships,
cookies, sessions, and server configuration. Product and category reads are
bounded, malformed rows fail closed, sorting is deterministic, and all summary
and category counts are derived in memory.

The protected Appwrite presentation includes catalogue summaries, read-only
product and category panels, and supported zero-row states. It contains no
create, edit, delete, publish, visibility, upload, reorder, chosen-product, or
category mutation control. The protected route remains request-dynamic and
session-dependent, with no catalogue cache or build-time private read.

One disposable user, confirmed single-role membership, session, category,
public product, and private/hidden product exercised the real login, protected
catalogue, public storefront, responsive layout, logout, and empty-state flows.
No file or Web platform was required. The session, rows, membership, and user
were deleted; final totals returned to zero users, Team members, products,
categories, files, and platforms.

No permanent Appwrite resource, API key or scope, Firebase resource, Vercel
resource, deployment, domain, production branch, or archive reference changed.
See `APPWRITE-READ-ONLY-ADMIN-CATALOGUE-PHASE-3T.md`.

## Phase 3U mutation architecture and authorization design

Phase 3U adds a fixture-only, pure mutation contract layer. It freezes an
exhaustive role/action matrix: both recognized roles may manage ordinary
catalogue, image, visibility, merchandising, stock, and chosen-selection
changes; only `admin` may permanently delete products or categories, perform
destructive cleanup, or read immutable activity records. Every future handler
must still resolve a valid SSR session, confirmed `wat_staff` membership, and
exactly one application role. Built-in Team `owner` alone remains denied.

Narrow category and product planners normalize bounded values and reject
unknown fields, raw permission arrays, raw Appwrite metadata, server-owned
selection/timestamp/audit fields, client-controlled actors, Firebase IDs,
tenant fields, malformed values, and unsafe visibility combinations. Update
and delete contracts require optimistic concurrency tokens; all writes require
idempotency keys and predictable validation, authorization, conflict,
not-found, dependency, cleanup, and internal error classifications.

Visibility and image plans publish a verified image before a row, hide a row
before privatizing its image, upload replacements privately, attach the new
file before retiring the old one, and use compare-before-write compensation.
The chosen design preserves the provisional unique
`chosenSelectionKey="current"` invariant independently of `statusPick`.
Current official Appwrite Cloud documentation and installed SDK types expose
atomic TablesDB transactions, so the target uses one short transaction rather
than a process-local lock. Live Frankfurt capability, key scopes, conflict
codes, and unique-index behavior remain `Needs verification`.

The logical immutable activity event includes actor, correlation, snapshots,
changed fields, result, error, and compensation state while rejecting secrets,
sessions, raw permissions, and SDK objects. Its physical mapping and retention
remain `Needs verification` because the frozen activity table has a narrower
approved column set. The operational table was not created or changed.

Focused fixtures cover the authorization matrix, category/product validation,
forbidden fields, slug conflict classification, visibility/image/chosen
transition and compensation plans, idempotency behavior, and activity-event
construction. No Appwrite SDK write, mutation route, UI, live row/file,
identity, membership, platform, operational table, Firebase resource, Vercel
resource, deployment, domain, production branch, or archive change occurred.
`WAT_MUTATIONS_ENABLED` remained false.

See `APPWRITE-MUTATION-ARCHITECTURE-PHASE-3U.md`. The next safe phase is a
separately approved, double-gated server category-mutation implementation using
only disposable private fixtures. Do not automatically begin product, image,
chosen-selection, activity-table, mutation-UI, deployment, or cutover work.

## Phase 3V server-side category mutations

Phase 3V implements a server-only Appwrite category create, rename, and delete
boundary plus a disabled `/api/admin/categories` integration seam. Ordinary
calls require Appwrite mode, the exact SSR authorization boundary, the Phase
3U role/action matrix, and the global mutation gate. Because
`WAT_MUTATIONS_ENABLED=false`, the route returns 503 before loading mutation
services and no UI calls it.

Create validates strict narrow input, uses a deterministic SHA-256-derived row
ID for same-key retry safety, enforces the unique slug, sets server time and
permissions, and returns only a category DTO. Rename and delete use canonical
`updatedAt` concurrency tokens and short TablesDB transactions. Delete is
admin-only and rejects any uncached `products.categoryId` reference without
cascade or reassignment.

Ordinary categories retain the approved exact public/staff read permissions.
The double-gated verifier creates only staff-readable private categories. No
request can supply permissions or actor metadata, and raw rows, permission
arrays, SDK objects, API keys, sessions, or transaction state never enter
responses or client props.

Live verification established that transaction commit/rollback calls must be
polled to terminal state, empty transactions must be discarded instead of
rolled back, mutation-critical list queries require `ttl:0`, and Appwrite
datetimes require canonical UTC normalization. A terminally committed category
delete may briefly resurface; the service uses a bounded, compare-before-delete
and uncached reference-recheck compensation before reporting success.

Development failures created private fixture categories after unknown service
outcomes. The lifecycle was corrected to clean exact generated IDs
unconditionally in `finally`. Every orphan matched the exact Phase 3V ID,
name, slug, and staff-only permission contract and was removed through the
double-gated recovery mode. Two consecutive final lifecycles then passed with
no recovery, proving create/read/rename, stale rejection, product-editor delete
denial, referenced-delete rejection, admin delete, prepared logical events,
direct absence, zero counts, and zero prefix matches.

Logical category created/renamed/deletion-attempted/deleted/failure/cleanup
events are prepared with Phase 3U helpers but not durably stored.
`activity_logs` remains absent and no Firebase or alternate log was added.

Final verification passed 33 focused category/design tests, 147 Appwrite
foundation tests, 16 mutation-gate tests, 8 Firebase inventory tests, lint,
typecheck, production build, diff checks, and secret/client containment.
Products, categories, files, and Team members are zero; operational tables and
Appwrite `team_contacts` remain absent. `main`, archive, Firebase, Vercel,
domains, deployment, and production remain unchanged.

See `APPWRITE-CATEGORY-MUTATIONS-PHASE-3V.md`. The exact Phase 3V commit is the
commit containing this handoff section and is reported after push; a commit
cannot contain its own hash. The next recommended phase is a separately
approved consolidated server-side product-mutation implementation. Do not
automatically begin product, image, activity-table, UI, staging, deployment, or
cutover work.

## Phase 3W server-side product mutations

Phase 3W implements server-only Appwrite product create, update, and delete
plus a disabled `/api/admin/products` seam. Ordinary calls require exact
Appwrite selection, SSR-derived staff authorization, action authorization, and
the fail-closed global mutation gate. `WAT_MUTATIONS_ENABLED=false`, so no
ordinary UI or route write is active.

Create uses a deterministic 36-character row ID for retry safety, derives the
canonical category snapshot in a transaction, sets the provisional chosen key
to the row ID, forces both visibility flags false, attaches no image, sets
server timestamps/actor fields, and applies exact staff-only read permissions.
Update uses a strict partial allow-list and canonical `updatedAt` token,
preserves creation/image/chosen state, and derives changed category names
server-side. Admin-only delete rejects stale, selected, image-linked, public,
or malformed rows and verifies sustained absence after terminal commit.

Product create/update/delete reuse the Phase 3V safety findings: terminal
transaction polling, empty-transaction discard, `ttl:0` mutation-critical
queries, canonical Appwrite datetimes, and bounded compare-before-write
compensation. Same-key create is deterministic; update is outcome-idempotent;
completed delete retry is `NOT_FOUND`. No new ledger/table/column was added.

To prevent stale denormalized product snapshots, category rename now rejects
any uncached product reference. Product create/reassignment always reads the
category within the product transaction and copies its canonical name.
Category delete remains reference-protected with `ttl:0`; product create's
transactional category read makes concurrent removal fail conservatively.

The double-gated verifier is read-only by default and creates only exact
Phase 3W-prefixed private categories/products. Two consecutive live lifecycles
proved create/retry/duplicate-slug behavior, ordinary update, category
reassignment, stale and forbidden-input rejection, product-editor delete
denial, selected/image/reference blocks, admin delete, and product-before-
category cleanup. Both began and ended at products/categories/files `0/0/0`,
recovered no orphan, left zero prefix match, and created no file.

Final verification passed 50 focused mutation tests, 164 Appwrite foundation
tests, 17 mutation-gate tests, 8 Firebase inventory tests, lint, typecheck,
production build, diff checks, and secret/client containment. Team memberships
remain zero; operational tables and Appwrite `team_contacts` remain absent.
No Firebase, Vercel, domain, deployment, production, main, or archive state
changed.

Logical product events are prepared but not durable; `activity_logs` remains
absent. See `APPWRITE-PRODUCT-MUTATIONS-PHASE-3W.md`. The exact Phase 3W commit
is the commit containing this handoff section and is reported after push
because a commit cannot contain its own hash.

Stop after Phase 3W. The next recommended consolidated phase is a separately
approved, double-gated image-lifecycle, visibility-transition, and chosen-
product-concurrency implementation using private disposable fixtures and exact
compensation. Do not automatically begin it, activity logging, mutation UI,
deployment, real-user creation, or production cutover.

## Phase 3X image lifecycle, visibility, and chosen concurrency

Phase 3X implements one server-only Appwrite boundary for private-first product
image upload/attachment, safe replacement/removal, admin-only orphan cleanup,
image-first publication, row-first hiding, feed/featured/status-pick changes,
and atomic chosen-product selection. The ordinary image and lifecycle routes
remain disabled by `WAT_MUTATIONS_ENABLED=false`; no admin mutation control was
added.

Accepted images are JPEG, PNG, and WebP up to 1 MiB, with signature and
extension agreement. Files begin with exact staff-role reads. Public files and
rows use exactly `read("any")`, `read("team:wat_staff/admin")`, and
`read("team:wat_staff/product_editor")`, with no public write. Upload metadata,
completion, MIME, size, bucket, ID, and permissions are re-read before
attachment. Replacement never deletes the old file before secure new linkage;
all compensation is compare-before-write and reports incomplete cleanup.

Publication proves direct anonymous file HTTP delivery before making the row
public. Hiding removes row visibility and public permission before
privatizing the image, and failure leaves the row hidden. Feed visibility
requires storefront visibility. Featured and status-pick remain independent
from publication and chosen selection.

Chosen selection uses one short TablesDB transaction: the prior row returns to
its own unique key and the target receives `"current"`. Commit is polled to a
terminal state and the service verifies exactly one current row uncached.
Already-selected retries are outcome-idempotent, stale targets reject, unknown
commit outcomes succeed only after exact invariant proof, and multiple current
rows fail closed. Selected-product deletion remains blocked and never chooses
a replacement.

The double-gated lifecycle uses only exact `phase3x_disposable_` resources and
requires `--run-lifecycle` plus
`--confirm-destructive-disposable-product-lifecycle`. Three corrected live
runs proved exact private bytes/metadata, retry, replacement/removal, invalid
rejection without residual files, editor/admin orphan authorization, public
catalogue inclusion, direct image delivery, merchandising independence,
catalogue exclusion and anonymous denial after hiding, chosen replacement and
retry, selected-delete blocking, former-selected deletion, and bounded
concurrent selection with exactly one final current row.

One initial verifier run stopped because it passed a raw Appwrite datetime
instead of a canonical UTC token. Its `finally` cleanup and an independent
recount proved `0/0/0` before the verifier was corrected. All corrected runs
started and ended with products/categories/files `0/0/0`, zero product,
category, file, and selected prefix matches, and every former public URL
denied.

Final verification passed 33 focused Phase 3X tests, 83 consolidated mutation
tests, 197 Appwrite foundation tests, 18 mutation-gate tests, 8 Firebase
inventory tests, lint, typecheck, production build, diff checks, and tracked/
client secret-value scans. Live TablesDB multi-row chosen transactions
committed and materialized after terminal polling. Both bounded concurrent
attempts were accepted and the exact one-current invariant held; no live
unique/transaction conflict code was observed, so those fail-closed paths
remain fixture-proven.

Logical lifecycle events are prepared but not durable. `activity_logs`,
`analytics_events`, `broadcasts`, and Appwrite `team_contacts` remain absent.
Products, categories, files, and Team memberships remain zero; no identity or
platform operation occurred. Firebase, Vercel, domains, deployments,
production, `main`, and the archive reference remain unchanged.

See `APPWRITE-IMAGE-VISIBILITY-CHOSEN-PHASE-3X.md`. The exact Phase 3X commit
is the commit containing this handoff section and is reported after push
because a commit cannot contain its own hash.

Stop after Phase 3X. The next recommended consolidated phase is physical
immutable activity logging plus fully connected role-aware admin mutation UI
and end-to-end authenticated mutation verification. Do not automatically begin
it, enable ordinary mutations, create a real owner, deploy, cut over, or retire
Firebase.

## Phase 3Y immutable activity logging and admin mutation UI

Phase 3Y creates the permanent `activity_logs` table within the frozen
five-table target, with row security enabled, empty table permissions, 17
locked columns, and six indexes. Required
columns are `eventId(96)`, `eventType(96)`,
`entityType(product|category|image)`, `entityId(36)`, `actorUserId(36)`,
`actorDisplayName(160)`, `actorRole(admin|product_editor)`, `occurredAt`,
`requestId(128)`, `result(succeeded|failed|compensated|compensation_failed)`,
`changedFields(1024)`, and
`fixtureClassification(ordinary|phase3y_verification)`. Optional columns are
bounded redacted `beforeState`, `afterState`, `metadataSummary`,
`errorClassification(64)`, and `compensationClassification(160)`.

Indexes are unique `activity_event_unique(eventId)` plus
`activity_occurred_at(occurredAt)`,
`activity_entity(entityType,entityId)`, `activity_actor(actorUserId)`,
`activity_event_type(eventType)`, and `activity_request(requestId)`. The final
read-only schema check classified the live table as `exact_match`.
`analytics_events`, `broadcasts`, and Appwrite `team_contacts` remain absent.

Every activity row has exactly `read("team:wat_staff/admin")`. The normal
server boundary exposes create/get/list only; there is no update/delete method,
route, or UI. Product editors and the public cannot read. This is
application-immutable under the approved server boundary; infrastructure
administrators remain technically capable of modification.

Category, product, image, visibility, merchandising, chosen, failure, blocked,
and compensation outcomes now use the durable writer. Equivalent event retry
is accepted only after exact row/permission verification; conflicting reuse
fails. A verified business result is preserved if audit persistence fails and
the response is distinctly `AUDIT_PERSISTENCE_FAILED`. Logical state and
metadata pass scalar allow-lists, deterministic JSON encoding, and a 16,384
character application bound; secrets, raw permissions/SDK objects, headers,
sessions, credentials, file bytes, and query-bearing URLs are excluded.

The protected Appwrite catalogue now has same-origin server-mediated category,
product, image, visibility, merchandising, and chosen controls. Admin-only
delete and activity controls are absent for product editors and remain
server-enforced. Activity is dynamically read newest-first through a narrow
DTO with page size at most 50, bounded offset, `ttl:0`, and no protected cache.
`WAT_MUTATIONS_ENABLED=false` remains the default; the temporary enabled
development process was stopped and never persisted.

Authenticated browser verification proved admin/editor login and logout,
invalid-login safety, protected access, category and product mutations,
server-derived category names, editor update and delete/activity denial,
featured/status-pick independence, chosen selection/retry/clear, admin delete,
and admin activity display. Chrome local-file access prevented repeating the
image/publication/hiding sequence through the Phase 3Y UI. Those underlying
live flows passed in Phase 3X, and Phase 3Y file/UI plus lifecycle tests pass;
the missing browser repetition remains a documented finding rather than a
claimed pass.

The first live category create exposed equivalent Appwrite datetime
normalization during audit re-read. Business and audit rows had materialized,
so the distinct audit-unknown policy was returned without a false rollback.
Canonical instant comparison corrected the verifier.

Final live state is products/categories/files/Team memberships `0/0/0/0`.
Appwrite Console reported `3 users deleted` and returned to its empty user
state. All temporary sessions were revoked. Fifteen immutable audit rows remain
as synthetic migration evidence, all explicitly
`phase3y_verification`, with exact admin-only permissions and a passing
sensitive-text scan.

Final verification passed 16 focused Phase 3Y tests, 83 consolidated mutation
tests, 197 Appwrite foundation tests, 18 mutation-gate tests, 8 Firebase
inventory tests, lint, typecheck, production build, live exact-schema,
live activity reader/permission/redaction checks, diff checks, and tracked/
client containment checks. Known build warnings remain workspace-root
inference, webpack cache snapshot warnings, and the Edge static-generation
notice.

See `APPWRITE-ACTIVITY-LOGGING-ADMIN-UI-PHASE-3Y.md`. The exact Phase 3Y commit
is the commit containing this handoff section and is reported after push
because a commit cannot contain its own hash.

Stop after Phase 3Y. The next separately approved phase is real-owner recovery
establishment, isolated Appwrite deployment/Web platform preparation, staging
QA, production-readiness review, and explicit cutover/rollback approval. Do
not automatically create the owner, deploy, configure domains, enable
production mutations, cut over, or retire Firebase.

## Phase 3Z owner, isolated staging, and cutover readiness

Phase 3Z established the permanent owner as the only retained Appwrite user and
the only confirmed `wat_staff` member, with exactly the recognized application
role `admin`. Email/password remains enabled while Phone, Magic URL, Email OTP,
Anonymous, OAuth, Team invites, and JWT remain disabled. Protected admin,
mutation, and admin-only activity access passed.

The isolated Vercel project `wat-app-preview` has a Ready Preview deployment of
commit `ec58b2e48bd9dd430d29b2214055af46430698f6` and the exact branch alias
`wat-app-preview-git-appw-ead519-aqueel-ahmed-firdausis-projects.vercel.app`.
Exactly that hostname is the sole Appwrite Web platform. No production alias,
custom domain, DNS, Firebase, `main`, or archive state changed. Preview alone
uses Appwrite mode, enabled mutations, and the server-controlled
`phase3z_staging_verification` activity classification; committed defaults
remain fail-closed.

Recovery request existence privacy and real inbox delivery passed, and the
owner personally completed a password reset. The delivered callback
incorrectly targeted localhost, however. The secret was not printed; the
callback was safely transferred to the approved Preview host for completion.
Malformed callbacks fail closed and the existing owner session retained its
role. The Preview-scoped recovery URL has been corrected in Vercel, but the
required exact Preview redeploy was blocked by browser policy and did not
occur. Fresh delivery to the staging hostname, new-password login,
old-password denial, and live reused-link rejection remain unproven.

Real staging UI checks passed category/product creation, hidden-row privacy,
publication/feed dependency guards, featured/status/chosen independence,
chosen deletion blocking, chosen clear, deletion, owner-attributed immutable
activity display, and final cleanup. Chrome still rejected the file handoff,
so the complete upload/replacement/publication/direct-delivery/hide/
privatization/removal UI sequence was not repeated. The live disposable editor
browser matrix and Vercel server runtime-log scan also remain incomplete.

Final Appwrite catalogue/files are `0/0/0`; users/memberships are `1/1` with
exact role `admin`; platforms are `1`; chosen state and all disposable
identities/fixtures are absent. Activity rows are 34: 15
`phase3y_verification` plus 19 `phase3z_staging_verification`. Exact admin-only
permissions, newest-first owner read, editor denial, no update/delete boundary,
and sensitive-text absence pass.

Verification passed 17 Phase 3Z activity/UI tests, 197 Appwrite foundation
tests, 83 consolidated mutation tests, 18 mutation-gate tests, 8 Firebase
inventory tests, lint, typecheck, production build, exact live schema and
empty-state checks, live activity verification, diff checks, and actual-value
tracked/client secret scans. The build has only the known workspace-root,
webpack-cache, and Edge/static warnings; no vendor-chunk failure recurred.

The readiness decision is **NOT READY**. See
`APPWRITE-STAGING-CUTOVER-READINESS-PHASE-3Z.md` and
`APPWRITE-PRODUCTION-CUTOVER-RUNBOOK.md`. Before reassessment, deploy and retest
the corrected recovery callback, pass the full image/publication UI flow,
repeat the live editor matrix, and inspect Preview server runtime logs. Do not
execute the production runbook, add `watapp.pk` to Appwrite, enable production
mutations, move aliases/DNS, merge to `main`, or retire Firebase without a new
explicit owner approval.

## Phase 3Z-R blocker-closure reassessment

Phase 3Z-R added the server-controlled
`phase3zr_blocker_closure` classification to the application, verifier, tests,
locked blueprint, and live `activity_logs` enum without altering the retained
Phase 3Y or Phase 3Z classifications. Implementation commit
`3ead35ae9d858449af3e71f918ff8ffae85da365` was pushed and deployed to the
isolated Preview as `dpl_9tAD88rLZETtt4AmFFc36P7s3KyV`. The deployment reached
Ready, retained the exact branch alias and sole Appwrite Web platform, and was
not promoted. Production Firebase, `watapp.pk`, DNS, `main`, and the archive
were not changed.

The owner personally completed a fresh recovery and logged in on the retained
Preview hostname. Malformed recovery completion failed closed. Direct
previous-password denial and consumed-link reuse were not independently
observed, so the recovery proof remains incomplete under the Phase 3Z-R
standard.

The owner and one disposable `product_editor` exercised the deployed catalogue
UI. Editor login, protected catalogue access, category create/rename, product
create/edit, merchandising independence, chosen select/clear, UI deletion
denial, and activity denial passed. Chrome again denied actual file handoff, so
the image upload/replacement/publication/direct-delivery/hide/privatize/removal
workflow and the editor image subset did not run. Crafted product/category
delete denial, destructive orphan denial, and logout protection also remain
incomplete. The exact deployment's Vercel runtime-log API returned
`403 Forbidden`, so no full server-log scan is claimed.

Cleanup was not completed. The Codex approval service rejected the narrowly
gated cleanup after reporting the account usage limit reached. The last
directly observed state is products/categories/files `2/2/0` and
users/memberships `2/2`; both products are hidden, image-free, and unchosen.
The permanent owner retains exact `admin`, and the synthetic editor retains
exact `product_editor`. These fixtures must be removed and the `0/0/0`,
`1/1`, exact activity, and sensitive-scan baselines reverified before any
further readiness reassessment.

The Phase 3Z-R decision is **NOT READY**. See
`APPWRITE-CUTOVER-BLOCKER-CLOSURE-PHASE-3Z-R.md`. Do not execute the production
runbook, add `watapp.pk` to Appwrite, enable production mutations, move
aliases/DNS, merge to `main`, or retire Firebase.

## Phase 3Z-R2 emergency cleanup and recovery

Phase 3Z-R2 recovered the incomplete Phase 3Z-R live state before resuming
blocker work. Uncached reads identified only the two exact synthetic products
and categories. Both products were hidden, feed-hidden, unchosen, image-free,
and non-public. They were deleted through the deployed owner admin boundary.
One category was deleted through the same boundary; after the UI did not
settle for the final exact unreferenced category, a compare-before-delete
privileged fallback removed only that row and uncached reads proved absence.

Appwrite Console showed one synthetic editor with exactly `product_editor` and
one active session. All sessions were revoked, then the membership and user
were deleted. The permanent owner is again the sole user and sole `wat_staff`
member with exactly `admin`. The four files under the exact local fixture
directory were removed.

The certified recovered baseline is products/categories/files `0/0/0`,
users/memberships `1/1`, no chosen or disposable prefix, one exact Preview Web
platform, and `51` immutable activity rows: `15` Phase 3Y, `19` Phase 3Z, and
`17` Phase 3Z-R. `activity_logs` remains an exact schema match;
`analytics_events`, `broadcasts`, and Appwrite `team_contacts` remain absent.
Committed/default mutations remain disabled. Preview isolation, production
Firebase, `watapp.pk`, DNS, aliases, `main`, and the archive are unchanged.

A broad activity scan matched the benign fixture-description word
`authorization` in six immutable fields; it did not identify
credential-shaped authorization data. The scanner precision correction and
rerun remain part of blocker closure.

See `APPWRITE-EMERGENCY-CLEANUP-AND-RECOVERY-PHASE-3Z-R2.md`. Cleanup is
certified, but Phase 3Z-R2 remains **NOT READY** while password reuse/denial,
the deployed image lifecycle, the remaining editor matrix, runtime logs, and
final activity verification remain incomplete. No production cutover is
authorized.

The Stage 2 attempt retained the recovered baseline and closed activity
verification. The final uncached state is products/categories/files `0/0/0`
and users/memberships `1/1`, with only the permanent owner holding exactly
`admin`. The corrected credential-shaped sensitive-text verifier passed
against `55` retained activity rows: `15` Phase 3Y, `19` Phase 3Z, and `21`
Phase 3Z-R.

The exact tested Preview deployment was
`dpl_DagmYasUx7kqBpoRF3L6MdsaumFu` at
`6185967bd7883f23c8840ab2f1e9d888635f8e6b`. Its available signed-in Vercel
dashboard window showed successful Phase 3Z-R2 mutations and no warning,
error, fatal, or `5xx` event. Chrome rejected handoff to the real file input
with `Not allowed`, so no upload request reached the application and the image
lifecycle remains unverified. Previous-password denial and consumed-link
reuse also remain unproven; the dependent editor cases were not rerun.

Phase 3Z-R2 is therefore **NOT READY**. Do not execute the production runbook,
enable production mutations, add `watapp.pk` to Appwrite, move aliases or DNS,
merge to `main`, or retire Firebase. Explicit owner cutover approval remains a
separate future gate after all blockers close.

## Phase 3Z-R3 automation-based final blocker attempt

Phase 3Z-R3 began at
`1f3240c7fe7ec7f0a1042884df99156f84200011`, aligned `0/0`, with a clean
worktree and the certified products/categories/files `0/0/0`,
users/memberships `1/1`, and 55-row activity baseline.

Locally installed Python Playwright could not attach to the authenticated
Chrome profile; Chrome also refused a localhost-only DevTools port. Real
native chooser automation left the deployed file input empty. Extension
`setFiles` was deliberately not repeated. The permanent owner created one
exact hidden category/product pair through the deployed UI, but no upload
request reached the application.

Exact compare-before-delete cleanup removed the hidden, feed-hidden, unchosen,
image-free product before its category. Final products/categories/files are
`0/0/0`; users/memberships remain `1/1`; no disposable identity was created;
activity is `57` rows (`15` Phase 3Y, `19` Phase 3Z, `23` blocker closure).

The exact Ready deployment for the tested commit is
`5oUwJSxjASYCPUCHTKGdfwDrsUrs`. Its available 15:47-16:17 Asia/Karachi
dashboard window showed successful fixture creates, no warning/error/fatal
events, no `5xx`, and no message output. No image or dependent authorization
request exists because those workflows could not run.

Phase 3Z-R3 is **NOT READY**. Previous-password denial, consumed-link reuse,
the full deployed image lifecycle, dependent editor/logout cases, and runtime
evidence for them remain open. See
`APPWRITE-FINAL-BLOCKER-CLOSURE-PHASE-3Z-R3.md`. No production cutover is
authorized.

## Phase 3Z-F final migration closeout

Phase 3Z-F performed documentation-only evidence reconciliation from the
certified post-Phase-3Z-R3 state. No browser experiment, identity, recovery
request, catalogue/file mutation, deployment, production configuration,
domain/DNS/alias action, backend switch, or deferred-table creation occurred.

The verified baseline remains products/categories/files `0/0/0`,
users/memberships `1/1` with the permanent owner holding exactly `admin`, and
`57` immutable activity rows (`15` Phase 3Y, `19` Phase 3Z, `23` Phase 3Z-R).
The live schemas and permanent resources remain exact; one isolated Preview
Web platform remains; `analytics_events`, `broadcasts`, and Appwrite
`team_contacts` remain absent. Production remains Firebase at `watapp.pk`,
committed/default mutations remain disabled, and `main` plus the archive are
unchanged.

The complete live Phase 3X Appwrite image/permission/chosen lifecycle and
cleanup evidence is authoritative backend proof. Phase 3Y onward supplies the
connected UI/server, validation, role, mutation-gate, security, test, build,
owner, recovery, editor, activity, deployment, and bounded runtime evidence.
The later inability to assign a local file to deployed Chrome stopped before
application submission and is classified as an external automation limit, not
an unimplemented image lifecycle.

Successful corrected-host recovery and new-password login are proven;
old-password rejection and consumed-link reuse were not independently
repeated. The live editor non-image matrix and automated server authorization
matrix passed; editor image, every deployed crafted request, and logout were
not repeated live. Full historical Vercel logs remain unavailable, while the
exact available deployment windows were clean. These and the explicitly
deferred operational features are recorded with mitigations in the closeout.

The final decision is **READY WITH ACCEPTED FINDINGS FOR OWNER CUTOVER
APPROVAL** for the narrow Appwrite authentication/catalogue/image/activity
scope. It is conditional on explicit owner acceptance and on the owner
manually uploading, previewing, publishing, hiding, and removing one controlled
first production image before broader catalogue entry. Any failure freezes
Appwrite mutations and triggers rollback.

See `APPWRITE-FINAL-MIGRATION-READINESS-CLOSEOUT.md` for the evidence and risk
classification and `APPWRITE-FINAL-PRODUCTION-CUTOVER-PROMPT.md` for the
separate executable procedure. Do not execute that procedure, merge to
`main`, add `watapp.pk` to Appwrite, enable production mutations, alter
production routing, switch away from Firebase, or retire rollback resources
without explicit owner approval of the exact migration commit and safeguards.
