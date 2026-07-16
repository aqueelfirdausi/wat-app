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
