# Phase 3T — Read-Only Appwrite Admin Catalogue

## Starting state

Phase 3T started on `appwrite-migration` at
`390008d735e296b68496ed919308e42ee381de20`, aligned with
`origin/appwrite-migration` at ahead/behind `0/0` and with a clean worktree.
Local and remote `main` were
`83616bfd67534fdd090459230b373f23633bc81d`; the archive reference remained
`8d1a1ccee792f672864bc32827caefc43d5e7210`. `.env.local` was ignored,
untracked, and unstaged. The configured backend was Appwrite and application
mutations were disabled.

Read-only bootstrap, metadata, and empty-state checks confirmed exact matches
for `wat_staff`, `wat_app`, `product_images`, `products`, and `categories`.
The operational tables and `team_contacts` were absent. Initial live totals
were zero users, Team members, products, categories, files, and platforms.
None of the read-only checks proposed or performed a write.

## Existing admin data-flow audit

The protected layout already selected Firebase or Appwrite on the server and
performed the Phase 3S SSR-session and exact-role checks. In Appwrite mode,
however, the layout rendered a generic verification shell without its route
children, so `/admin` and `/admin/products` had no catalogue presentation.

The existing dashboard, product pages, category counts, search, filters,
sorting, loading states, image controls, and product mutation controls were
Firebase-specific client components backed by Firestore listeners. Reusing
those components in Appwrite mode would have mixed backends and exposed
mutation affordances. Firebase mode therefore retains those components
unchanged for rollback, while Appwrite mode uses a separate server-rendered
read-only presentation.

## Backend-selected admin catalogue boundary

`lib/appwrite/admin-catalogue.ts` is the single server-only Appwrite admin
catalogue service. `loadBackendAdminCatalogue` returns without initializing an
Appwrite client for Firebase mode; Appwrite mode performs only server-side
Appwrite reads. The existing strict backend selector remains authoritative, so
missing or malformed values fail before a backend can be selected. There is no
cross-backend fallback and no browser-side privileged Appwrite reader.

The protected layout remains `force-dynamic`, resolves the current staff
identity on every protected request, and passes route children into the narrow
Appwrite shell. `/admin` and `/admin/products` dynamically import the
Appwrite-only server presentation only when the exact backend is Appwrite.
Firebase mode still dynamically imports the original Firebase components.

## Admin product reader

The Appwrite product reader:

- requires a normalized authorized identity with exactly `admin` or
  `product_editor`;
- reads with the dedicated server data service;
- paginates in bounded 100-row pages with a 1,000-row ceiling;
- accepts public, private, and hidden rows available to the server key;
- validates every required product field without unsafe coercion;
- omits malformed rows;
- derives public-read and chosen-selection states;
- classifies public, private, unavailable, legacy-public, and absent images;
- emits a safe public preview URL only for a validated public file;
- sorts by `sortPriority`, then descending update time, then slug; and
- performs no writes or Firebase fallback.

The shared image metadata classifier preserves the Phase 3Q public resolver's
exact validation while allowing the admin reader to distinguish a valid
private file from an invalid or unavailable file. Private file URLs and file
contents are never emitted.

## Admin category reader

The category reader uses the same authorization and bounded pagination
boundary. It validates the locked `name`, `slug`, `updatedAt`, row ID, and
permission shape, omits malformed rows, and sorts by name then slug. Associated
product counts are derived in memory from validated products; the live schema
was not changed and no `productCount` column was created.

## Admin DTO contract

The internal product DTO contains only catalogue presentation fields:
name, slug, description, brand, category identity and display name, price,
currency, condition, stock state, presentation flags, derived visibility,
derived chosen state, derived image state, an optional safe public image URL,
timestamps, and optional display-name audit fields.

The category DTO contains only a presentation key, name, slug, derived
public-read state, derived product count, and update time. Raw Appwrite rows,
permission arrays, SDK response objects, selection keys, image file IDs,
private file URLs, accounts, memberships, cookies, sessions, environment
values, and internal errors are excluded.

## Read-only presentation

The Appwrite catalogue view provides:

- totals for products, categories, public and hidden/private products,
  stock states, and products with images;
- an explicit `Mutations disabled` state;
- product name and slug, category, price/currency, condition, stock,
  storefront visibility, feed visibility, image state, flags, and update time;
- a minimal category panel with name, slug, derived product count, and derived
  public/staff-only state; and
- supported empty states for zero products and zero categories.

Appwrite navigation contains only catalogue overview and products. It has no
Quick Stock, create, edit, delete, publish, visibility, upload, reorder,
chosen-product, or category-mutation affordance. The presentation contains no
mutation API URL or client data loader. Existing server mutation gates remain
unchanged and fail closed because `WAT_MUTATIONS_ENABLED=false`.

## Role behavior

Fixture verification proved that both `admin` and `product_editor` receive the
same read-only catalogue, while an unrecognized role is denied before any
catalogue call. The Phase 3S resolver continues to deny missing/invalid
sessions, inactive accounts, absent or unconfirmed Team membership, zero or
multiple application roles, unknown roles, malformed membership state, and
built-in `owner` alone.

One live disposable membership used exactly the `admin` application role.
The real login flow displayed the normalized role in the shell. A second live
identity was unnecessary because product-editor behavior is isolated in
fixtures and the shared Phase 3S authorization tests.

## Fixture coverage

The Phase 3T fixtures cover public, private, hidden, feed-visible, featured,
status-pick, in-stock, low-stock, sold-out, public-image, private-image, and
no-image products; public and private categories; empty tables; malformed
rows; invalid enum, price, visibility, permission, and chosen-selection
values; duplicate sort values; deterministic tie-breaking; summaries; derived
category counts; both authorized roles; unauthorized access; backend
selection; Firebase non-invocation; DTO containment; dynamic rendering; and
mutation-control absence.

The lifecycle fixtures prove the two explicit apply gates, bounded hold value,
successful cleanup order, baseline restoration, and cleanup after row
verification failure.

## Disposable identity and catalogue lifecycle

The live lifecycle used only unmistakably synthetic identifiers beginning
with `PHASE-3T-DISPOSABLE-`. It created one disposable user, one confirmed
`wat_staff` membership with one application role, one application session,
one public category, one public/visible product, and one private/hidden
product. No file was needed because fixture coverage already validates image
state mapping.

The row lifecycle command is read-only by default. Live apply requires both
`--apply` and `--confirm-disposable-admin-catalogue`, verifies the exact
Frankfurt endpoint and fixed resource IDs, requires Appwrite mode with
mutations disabled, records starting counts, validates row permissions and
totals, and cleans hidden product, public product, then category in `finally`.
It verifies deleted rows are not found and final counts match the baseline.

Two browser-hold attempts reached their bounded deadline after completing the
browser work; both still completed `finally` cleanup and independent empty
checks. A final immediate-signal lifecycle completed the success path and
reported verified rows, browser coordination, and cleanup. Temporary
credentials were cleared after use and were not stored in the repository,
logs, screenshots, documentation, or browser-readable application output.

## Browser verification

The real server-mediated Appwrite login flow and protected catalogue were
verified at:

- `/admin/login`
- `/admin`
- `/admin/products`
- the public homepage
- the public disposable product detail route
- the hidden disposable product detail route
- logout and post-logout `/admin`

At 1280×844, the navigation and catalogue panels rendered without horizontal
overflow. At 390×844, the shell collapsed to the mobile layout, both product
states remained readable, and the document remained within the viewport.
There were no browser console errors, hydration errors, runtime overlays, or
indefinite loading states.

During the live rows, authorized staff saw both products and the category,
with the public and hidden/private states distinguished. The summary showed
two products, one category, one public product, one hidden/private product,
and the expected stock/flag/image counts. No create, add, edit, delete,
publish, hide, show, upload, or reorder button was present.

After catalogue cleanup, a fresh authorized login showed zero summaries and
the explicit `No Appwrite products yet` and `No Appwrite categories yet`
states. Logout succeeded and the protected route returned to login.

## Public storefront regression

While the disposable rows existed, the public/visible product appeared on the
homepage and its detail route loaded. The private/hidden product did not
appear publicly and its detail route returned not found without revealing its
name. Admin-only audit fixture text did not appear on public surfaces. No
Firebase fallback or mutation occurred. After cleanup, the storefront
returned to the valid empty Appwrite state.

## Rendering and cache behavior

The protected layout is explicitly `force-dynamic` and reads the SSR session
cookie during request processing. No `revalidate` or module-level catalogue
cache was added. Appwrite catalogue reads therefore occur per authenticated
request, are not executed at build time, and cannot be frozen in public build
output or shared across users. Public routes retain their existing independent
dynamic Appwrite reader behavior; no global cache setting or unrelated route
mode changed.

## Network and containment verification

Browser asset inspection on the protected catalogue found no Firebase,
Firestore, Identity Toolkit, Secure Token, Firebase Storage, or privileged
Appwrite-key URL. No Appwrite browser SDK or client-side catalogue loader was
introduced. Login, catalogue, and logout remain server mediated.

Protected HTML and client assets contained no data, authentication, or
bootstrap API key, server environment value, raw session, cookie value,
recovery secret, private permission array, or private image URL. Repository,
diff, staged-content, build-output, and client-bundle scans are part of the
final gate. Public Appwrite endpoint/project identifiers remain intentionally
non-secret.

## Cleanup and final live totals

Every disposable application session was revoked through logout. The
disposable products and category were deleted and verified absent by the
lifecycle. The confirmed membership and disposable user were deleted in the
signed-in Console. No disposable file or Web platform was created.

Final independent checks confirmed:

- users: 0
- Team members: 0
- products: 0
- categories: 0
- files: 0
- platforms: 0
- operational tables: absent
- `team_contacts`: absent

Temporary server logs, lifecycle coordination data, and browser tabs were
cleaned. No resource beginning with `PHASE-3T-DISPOSABLE-` remains.

## Repository changes

Phase 3T adds the server-only admin catalogue reader and disposable verifier,
current-staff helper, read-only Appwrite catalogue presentation, responsive
styles, tests, package scripts, this phase record, and the handoff update. It
also extends the existing product-image validation with an admin-safe derived
public/private/invalid classification.

Firebase code, production configuration, Appwrite permanent resources, API
keys and scopes, Vercel, domains, deployments, `main`, and the archive
reference were not changed.

## Findings and next phase

The admin catalogue is intentionally bounded at 1,000 validated rows. A later
phase should introduce deliberate server pagination before the catalogue can
exceed that ceiling; this phase must not silently perform an unbounded read.
Malformed live rows are omitted fail closed rather than exposing partial raw
records.

The safest next phase is an isolated design and fixture phase for
server-mediated catalogue mutations, exact role/action authorization,
visibility compensation, image replacement cleanup, immutable activity
logging, and `chosenSelectionKey` concurrency. It must keep the deployment
mutation gate false until a separately approved live lifecycle proves every
failure path and cleanup boundary.
