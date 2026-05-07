# WAT App Local Polish Progress

## Working Mode

All current WAT App refinements are LOCAL ONLY.

- Do not push to GitHub without explicit approval.
- Do not deploy, upload live, or run any Firebase deploy command without explicit approval.
- Do not change the live/test site without explicit approval.
- Final production deployment remains blocked until the app is fully polished, reviewed, and explicitly approved for release.

## Product Direction

WAT App is being shaped into a fast mobile daily stock sheet for WhatsApp ordering.

Guiding sentence:

> WAT App should feel like opening today's WhatsApp stock sheet - fast, clear, visual, and ready to order.

## Accepted Local Baseline

The following refinements are accepted locally:

- Compact live-stock hero accepted.
- Urdu identity line accepted: "آج کیا دستیاب ہے؟"
- Today's Live Picks inside the hero accepted.
- Browse by category appears early.
- Mobile Category Bar Polish accepted.
- Compact mobile Browse View accepted.
- Quick Return / Save WAT App moved lower.
- Mobile Catalog horizontal stock-card system accepted.
- Product cards now feel faster to scan, with image left and price/CTA visible sooner.
- Current mobile scrolling/tactile feel accepted based on laptop narrow/mobile-like preview.

## Catalog Mobile Baseline Lock

The current Catalog/mobile homepage baseline is accepted locally and should be preserved unless the user explicitly reopens it.

Treat these as protected accepted local UX surfaces:

- Product cards.
- Category bar.
- Compact live-stock hero.
- Browse View.
- Quick Return placement and mobile weight.

Future changes should preserve the current Catalog mobile layout unless explicitly requested.

## Feed Parked Separately

Feed polish is explicitly parked and is not part of the current Catalog/homepage baseline work.

- Feed polish is not part of today's work.
- Feed should be handled one item at a time later.
- Do not mix Feed polish with Catalog/homepage polish.
- Future Feed work should be a separate local-only phase.

## Protected Areas

Do not change these unless explicitly requested:

- Product data/schema.
- Firestore queries.
- Admin flows.
- Routes.
- Metadata / OG / canonical / share preview logic.
- WhatsApp chooser behavior.
- Product detail pages.
- Feed card layout.
- Desktop product card layout.
- Live deployment.

## Current Visual Judgment

- Hero is useful and product-driven.
- Category bar now feels cleaner and more app-like.
- Browse View is acceptable and much less explanatory than before.
- Mobile Catalog cards now support quick scanning.
- Two to three products can be viewed more quickly than before.
- Overall direction now matches a WhatsApp-first daily stock app.

## Parked Future Ideas

These ideas are parked and not active work:

- Browse View micro-tightening if it still feels slightly tall later.
- Quick Return simplification.
- Real-user mobile testing.
- Smarter mobile default mode strategy.
- Feed Mode Review & Polish as a separate future local-only phase.
- Final production deployment only after explicit approval.

## Recommended Next Work

Next recommended work is a separate future phase: "Feed Mode Review & Polish".

Do not start it inside this documentation-only phase.

## Testing Status

Recent local checks have repeatedly passed:

- `npm run lint`
- `git diff --check`
- Local browser/mobile-width visual checks

## Release Checkpoint: Logo/Header Publish Stopped

The new WAT logo/header revamp is accepted locally.

A live publish for the logo/header refresh was planned, but it was correctly stopped before commit because unrelated local polish changes are mixed into the working tree.

No commit, push, deploy, upload, Firebase deploy, or live/test-site change happened.

Current mixed local changes include:

- `components/homepage-client.tsx`
- `app/globals.css`
- `components/mobile-feed-card.tsx`
- `components/product-card.tsx`
- `docs/`
- `tsconfig.tsbuildinfo`

Tomorrow's first task should be release isolation:

1. Inspect `git status --short`.
2. Separate logo/header changes from broader local Catalog, Feed, and product-card polish changes.
3. Decide whether to publish only the logo/header refresh or keep everything local until a broader approved release.

## Restored Local Baseline Checkpoint

The previous full mixed local state was restored from:

`C:\Users\Administrator\Desktop\WAT-app-release-extraction-backup-20260507-024213`

The logo/header-only extraction was abandoned because it removed accepted homepage polish that is part of the current local baseline.

Current accepted local baseline includes:

- New WAT logo/header.
- Compact hero.
- Urdu identity line.
- Today's Live Picks carousel.
- Category polish.
- Browse View polish.
- Mobile Catalog stock-card refinements.
- Quick Return lower placement refinements.

Mobile right-edge clipping was fixed in `app/globals.css`.

Root cause:

- Mobile visual viewport/layout viewport mismatch.
- Shrink-sensitive scroll rows could contribute to clipping around narrow mobile review widths.

Fix summary:

- Shrink guards added to the public shell and mobile surfaces.
- Page-level horizontal overflow safety guard added.
- Mobile-only `.public-shell` / `.login-shell` width constrained and left-anchored.

Verified clean at:

- 360px.
- 390px.
- 414px.
- Desktop width.

Validation:

- `npm run lint` passed.
- `git diff --check` passed with only existing CRLF warning noise.

No commit, push, deploy, upload, Firebase deploy, or live/test-site change happened.

Working mode remains LOCAL ONLY.

## Feed Polish Checkpoint

Feed mode inspection found no clipping or overflow after the shell fix.

Feed cards were visually too tall because the poster/media area dominated the first mobile view and pushed the title, price, and WhatsApp CTA too far down.

CSS-only polish was applied in `app/globals.css`.

Feed media adjustment:

- Mobile `.mobile-feed-media` min-height changed from `344px` to `320px`.
- Mobile `.mobile-feed-media` now uses `aspect-ratio: 1 / 1.08`.
- `.mobile-feed-media-placeholder` changed from `204px` to `188px`.

Visual result:

- Feed is easier to scan.
- Title, price, and WhatsApp CTA appear sooner.
- Images still feel premium.
- Badges remain readable.
- No right-edge clipping returned.
- Catalog mode remains unchanged.

Verified at:

- 360px.
- 390px.
- 414px.

Validation:

- `npm run lint` passed.
- `git diff --check` passed with only existing CRLF warning noise.

No commit, push, deploy, upload, Firebase deploy, staging, or live/test-site change happened.

Working mode remains LOCAL ONLY.
