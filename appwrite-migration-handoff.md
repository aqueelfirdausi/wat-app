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
