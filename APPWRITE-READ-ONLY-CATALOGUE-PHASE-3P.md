# Phase 3P — Read-only Appwrite catalogue

## 1. Starting State

- Branch: `appwrite-migration`
- Starting local and remote commit:
  `2f38a4c1283acc551fee1147bb05a23766567580`
- Upstream: `origin/appwrite-migration`, ahead `0`, behind `0`
- Local `main` and `origin/main`:
  `83616bfd67534fdd090459230b373f23633bc81d`
- `origin/archive/stage-5-pre-appwrite`:
  `8d1a1ccee792f672864bc32827caefc43d5e7210`
- Worktree: clean
- `.env.local`: ignored, untracked, and unstaged
- Runtime: Appwrite selected and mutations disabled
- Required endpoint, project, and separated key variables were present. No
  value or fragment was printed.

Read-only bootstrap classified `wat_staff`, `wat_app`, `product_images`,
`products`, and `categories` as exact matches with no conflicts or write
actions. The three operational tables remained missing and deferred. Metadata
connectivity succeeded. Initial live totals were zero products, zero categories,
and zero files.

## 2. Existing Catalogue Data Flow

Before Phase 3P:

- `/` was dynamic but `HomepageClient` performed Firebase product/category
  reads and listeners only in Firebase mode.
- Appwrite mode deliberately skipped those effects and rendered an empty
  foundation state; the existing Appwrite server adapters were not connected.
- Category filtering, brand counts, search-by-view, and feed mode all derive
  from the homepage product/category arrays. There is no separate public
  category route or free-text search route.
- `/product/[slug]` used the Firebase REST metadata reader on the server and
  then repeated the lookup with the Firebase browser SDK.
- The product Open Graph image route also used the Firebase metadata reader and
  previously permitted hidden-product metadata.
- Appwrite image-file delivery was not implemented. Product cards and detail
  views already had safe empty-image placeholders.
- Admin paths still import the legacy Firebase catalogue services, but the
  server mutation gate prevents those components from rendering while
  mutations are disabled.

## 3. Backend Selection Design

`lib/catalogue/read.ts` is the narrow server-only selection boundary.

- Exact `firebase` mode preserves the existing homepage client hydration and
  listener path.
- Exact `appwrite` mode calls only the existing Node Appwrite adapters.
- Product detail uses the selected server reader in both modes.
- Missing or malformed `WAT_BACKEND` throws before any reader is selected.
- An Appwrite error is returned to the route as an empty/unavailable or
  not-found state; it never invokes Firebase.
- The Appwrite browser SDK is not used for catalogue traffic.

Dependency-injected tests prove that selection cannot mix readers or fall back.

## 4. Product Listing Wiring

`app/page.tsx` now loads the Appwrite product/category catalogue server-side and
passes the public DTOs to the existing homepage client. Appwrite listing:

- queries only `storefrontVisible=true`;
- requires the row to retain exact public `read("any")` permission;
- independently verifies `storefrontVisible`;
- validates all locked scalar fields needed to trust the row;
- skips malformed, hidden, or private rows without leaking row content; and
- never invokes a Firebase reader or listener.

Firebase mode continues to hydrate through the existing client reads/listeners.
Those results are filtered for storefront visibility before public mapping.

## 5. Category Wiring

Appwrite categories are server-read, sorted by name, and accepted only when:

- the row has public read permission;
- `name`, `slug`, and `updatedAt` validate; and
- the public mapper succeeds.

Malformed/private rows are skipped, and missing lookup results return null.
The existing client category filter derives from categories that are referenced
by visible products. Zero categories therefore renders the `All` control safely
without inventing counts or changing the schema.

## 6. Product Detail Wiring

`/product/[slug]` now performs its catalogue lookup at the server boundary and
passes one public DTO directly into the client presentation component.

- Visible, publicly readable Appwrite rows may render.
- Hidden rows, private rows, missing rows, and malformed rows return 404.
- Metadata uses the same public-only selected reader.
- The duplicate browser Firebase lookup and loading state were removed.
- Firebase mode still uses its existing server metadata reader.
- The Firebase metadata reader no longer has an `includeHidden` escape hatch.

The Appwrite product Open Graph image remains generic for now because that Edge
route does not load the Node Appwrite data client. It does not fall back to
Firebase in Appwrite mode and no hidden metadata is rendered.

## 7. Public Data Contract

`PublicProduct` exposes only:

- public presentation key derived from the unique slug;
- name, slug, description, brand, and category name;
- existing preferred contact identifier used by the public WhatsApp chooser;
- price, currency, condition, and stock status;
- featured/storefront/feed flags and sort priority needed by public UI logic;
- a safe public image URL or empty placeholder value; and
- created/updated timestamps needed for freshness presentation.

It does not expose:

- Appwrite row ID;
- raw permissions;
- category row ID;
- `chosenSelectionKey`;
- `imageFileId`;
- actor/audit names;
- raw Appwrite timestamps/metadata; or
- any API key or session value.

`PublicCategory` uses its slug as the public presentation key and contains only
name and slug. Raw Appwrite rows never cross into client components.

## 8. Empty-State Validation

The live Appwrite tables remained empty. Real local browser and production HTML
checks confirmed:

- `/` returns 200;
- the live summary shows zero products, categories, updates, and ready items;
- catalogue mode renders “Nothing available right now”;
- feed mode renders “Nothing in the feed right now”;
- the `All` category filter renders safely;
- brand cards show zero products/categories without synthetic counts;
- there is no infinite loading state, hydration error, runtime overlay, stale
  Firebase data, or mock product; and
- mutation controls remain unavailable.

## 9. Hidden/Visible-State Validation

Fixture-based automated tests were sufficient, so live rows were not created.
The tests prove:

- visible boolean plus public row permission is included;
- visible boolean without public permission is excluded;
- public permission with hidden boolean is excluded;
- hidden product detail returns null;
- visible product detail returns the filtered DTO;
- malformed or invalid scalar rows fail closed;
- empty lists and missing details are valid; and
- Firebase is never called after Appwrite success or failure.

## 10. Synthetic Data and Cleanup

No synthetic category, product, or file was created. The Phase 3O disposable
lifecycle was not repeated. Final live counts were independently rechecked as:

- products: 0;
- categories: 0;
- files: 0.

## 11. Image and Placeholder Behavior

No file was uploaded or created. `imageFileId` is validated but not exposed or
used until a separately approved media-delivery phase.

An Appwrite row with no safe legacy image maps to an empty image URL and uses
the existing “Photo coming soon”/category placeholder. HTTPS legacy URLs may be
used only when they are not Firebase, Firestore, Google APIs, Firebase Storage,
or Realtime Database hosts. Appwrite mode never restores a Firebase Storage
dependency through `legacyImageUrl`.

## 12. Rendering and Cache Behavior

- `/` remains `force-dynamic`; live Appwrite catalogue data is read at request
  time and is not frozen into build output.
- `/product/[slug]` remains `force-dynamic`, `revalidate=0`, and uses a
  server-side selected lookup.
- The product Open Graph image remains an Edge route. Appwrite mode uses its
  generic safe rendering until media support is separately wired.
- The production build does not depend on mutable Appwrite rows.
- No global caching behavior or unrelated route was changed.

## 13. Browser Routes Tested

| Route/state | Result |
| --- | --- |
| `/` catalogue mode | Empty catalogue, no runtime/console error |
| `/` feed mode | Empty feed, no runtime/console error |
| homepage category controls | Safe `All`-only state |
| `/product/phase-3p-missing` | Expected 404 |
| `/admin` | Mutations-disabled state |
| `/admin/login` | Mutations-disabled state |

No synthetic visible or hidden route was needed because fixture tests supplied
the bounded visibility proof.

## 14. Appwrite Network Evidence

Live server-side Appwrite evidence includes:

- exact read-only bootstrap classification;
- successful metadata connectivity;
- zero-row/file aggregate checks;
- successful dynamic homepage rendering through the selected Appwrite service;
  and
- successful missing-product lookup returning 404.

Catalogue Appwrite traffic is server-side only. No browser SDK request or Web
platform was required.

## 15. Firebase Traffic Containment

The real Appwrite-mode browser run produced no Firebase configuration or console
error. The homepage and product detail do not invoke Firebase catalogue readers
in Appwrite mode. The local browser made the existing same-origin analytics POST,
which returned 204 because mutations were disabled; the mutation test proves it
did not load or call the Firebase writer.

Automated tests additionally prove Appwrite mode:

- never falls back to Firebase catalogue reads;
- never calls the Firebase analytics writer;
- never loads Firebase notification services; and
- blocks the legacy Firebase image proxy before fetch.

No Firebase resource or configuration was changed.

## 16. Client Secret Containment

The production homepage HTML, `.next/static` assets, generated public
JavaScript/source-map candidates, and tracked files were scanned against:

- all three configured Appwrite server-key values;
- beginning, middle, and ending secret fragments;
- server-only Appwrite key names;
- `.env.local`; and
- `WAT_MUTATIONS_ENABLED`.

All scans were negative. The public Appwrite endpoint/project ID remain the only
permitted public Appwrite configuration, although this phase does not invoke the
browser SDK.

## 17. Tests and Build

Passed:

- targeted catalogue tests: 13;
- Appwrite foundation tests: 59;
- focused connectivity tests: 3;
- mutation-gate/containment tests: 15;
- Firebase inventory safety tests: 8;
- lint;
- typecheck;
- production build;
- whitespace check;
- tracked secret-value scan;
- production HTML/client secret and fragment scans.

The build retained the existing warnings about multiple lockfiles, webpack cache
snapshots, and Edge-runtime static generation.

## 18. Repository Changes

The repository now has:

- a server-only backend-selected public catalogue service;
- strict public permission and visibility enforcement for Appwrite rows;
- dedicated public product/category DTOs;
- server-loaded homepage Appwrite data;
- server-selected product detail and metadata;
- Firebase-only client hydration retained for rollback mode;
- no hidden-product metadata escape hatch;
- safe Appwrite-mode legacy-image filtering; and
- fixture coverage for selection, visibility, DTOs, malformed data, empty data,
  missing data, categories, images, and no fallback.

No mutation API, login, admin CRUD, recovery, user, membership, file upload,
operational table, platform, deployment, dependency upgrade, or broad refactor
was added.

## 19. Files Changed

- `app/page.tsx`
- `app/product/[slug]/page.tsx`
- `app/product/[slug]/opengraph-image.tsx`
- public catalogue presentation components
- `lib/catalogue/public.ts`
- `lib/catalogue/read.ts`
- `lib/appwrite/read.ts`
- `lib/firebase/firestore-server.ts`
- `lib/types.ts`
- `lib/utils.ts`
- `lib/analytics.ts`
- `tests/appwrite-read.test.ts`
- `tests/catalogue-read.test.ts`
- `package.json`
- `appwrite-migration-handoff.md`
- this report

## 20. Commit and Push

Phase 3P is committed and pushed only after the final live count, diff, secret,
and staging checks pass. The exact commit is reported in the final handoff.

## 21. Findings and Remaining Risks

- Live product/category tables are still empty, so permission/visibility
  behavior is fixture-proven rather than proven with live product rows.
- The server data key can technically read private rows, so the adapter
  independently enforces exact public permission and visibility before mapping.
  A future mutation phase must preserve row/file permission sequencing.
- Appwrite image-file delivery is not wired; placeholders are intentional.
- Appwrite product Open Graph images are generic until a bounded server-compatible
  media design is approved.
- There is no separate public category route; homepage filters are the complete
  current category surface.

## 22. Next Safest Recommended Phase

The next phase should remain read-only and design Appwrite product-image
delivery without exposing the data key or hidden file IDs. It should fixture-test
public/private file permission decisions and choose a server-mediated delivery
pattern before any file is uploaded. Live product mutation, authentication,
admin CRUD, operational tables, or deployment should remain separate phases.

## 23. Final State

**PASS WITH FINDINGS**

Read-only Appwrite catalogue and product-detail paths are wired through one
server selector. Empty, hidden, visible, missing, malformed, category, DTO, and
placeholder behavior is verified. No live synthetic data, file, user,
membership, platform, Firebase change, Vercel action, deployment, domain,
production-branch change, or archive change occurred.
