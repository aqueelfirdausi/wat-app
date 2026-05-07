# WAT App Pre-Release Polish Handoff - 2026-05-08

## 1. Project Identity And Purpose

WAT App is a public storefront for "What's Available Today" live stock browsing. It presents daily product availability, pricing, brand/category browsing, product detail pages, and a WhatsApp-first contact/order flow for quick confirmation with the team.

The current storefront identity is a calm beige/green premium commerce experience centered around the new WAT App logo/header and the accepted primary action green system.

## 2. Current Accepted Storefront Status

Accepted local storefront baseline includes:

- New WAT logo/header identity.
- Compact hero with Urdu identity line.
- Today's Live Picks carousel in the hero.
- Browse by category polish.
- Browse View polish.
- Mobile Catalog stock-card refinements.
- Feed media polish.
- Quick Return lower placement refinements.
- Mobile right-edge clipping fix.
- Unified primary CTA green system:
  - Primary action green: `#16C16B`
  - Hover/pressed green: `#128A4F`
- Premium tactile CTA shadows and press states.
- Product detail stock badge fix.
- Mobile Live Picks carousel rhythm polish.
- Subtle mobile Live Picks arrow controls using native horizontal scroll.
- Compact premium WhatsApp chooser contact picker.
- Premium brand logo tile refinement.
- Novart.io footer signature.

## 3. Polishing Completed In This Phase

- Restored accepted local baseline.
  - Needs verification from git history/checkpoints if exact restore steps are required.
- Mobile clipping fix.
  - Public storefront mobile width and horizontal overflow protections were accepted in the local baseline.
- CTA green unification.
  - Public primary CTAs were unified to `#16C16B` with `#128A4F` hover/pressed state.
  - Secondary beige buttons such as `Shop by brand` were preserved.
- Tactile CTA polish.
  - Public primary CTAs received calmer transitions, refined shadows, and subtle press behavior.
- Product detail stock badge fix.
  - Product detail stock pills were scoped so the global stock pill absolute positioning does not pull the badge into the viewport/header area.
  - Accepted selector: `.product-detail-pills .product-detail-stock { position: static; }`
- Live Picks carousel rhythm polish.
  - Mobile hero carousel spacing, card width, right-edge breathing room, and text containment were refined.
  - Horizontal scroll behavior and next-card preview were preserved.
- Live Picks mobile arrow controls.
  - Small mobile-only previous/next buttons were added for Today's Live Picks.
  - Controls use native `scrollBy` with smooth horizontal scrolling.
  - Accessible labels:
    - `Previous live pick`
    - `Next live pick`
- WhatsApp chooser compact premium contact picker.
  - Mobile contact rows were compacted into avatar + contact info + right-side `Open` button.
  - Modal spacing and bottom breathing room were tightened.
  - WhatsApp links, contact data, product data, and selection/opening behavior were preserved.
- Brand logo tile refinement.
  - UniverCell PK and EKO Fragrances logos were kept as original assets.
  - Logo presentation was refined with a consistent square premium tile, soft beige surface, subtle border, centered containment, and `object-fit: contain`.
- Novart.io footer signature.
  - Public footer developer credit was added/refined.
  - Current footer copy:
    - `Developed by Aqueel Ahmed Firdausi`
    - `A novart.io build`
  - `public/branding/novart-logo-dark.png` was added from a local provided Novart.io asset.

## 4. Files Changed During The Local Polish Phase

Observed changed/untracked files at handoff time:

- `app/globals.css`
- `app/layout.tsx`
- `components/homepage-client.tsx`
- `components/mobile-feed-card.tsx`
- `components/product-card.tsx`
- `components/whatsapp-chooser-button.module.css`
- `app/icon.svg`
- `docs/local-mobile-user-testing-checklist.md`
- `docs/local-polish-progress.md`
- `docs/wat-app-pre-release-polish-handoff-2026-05-08.md`
- `public/branding/novart-logo-dark.png`
- `public/branding/wat-app-icon.svg`
- `tsconfig.tsbuildinfo`

Notes:

- `docs/` is currently untracked as a folder in `git status --short`.
- `tsconfig.tsbuildinfo` is present as an untracked generated file. Decide intentionally whether to ignore/remove/commit later. Do not discard it without user approval.
- This list reflects local working tree observation, not a committed diff.

## 5. Accepted Design Decisions

- Public storefront should stay calm, premium, mobile-first, and commerce-focused.
- WAT App primary CTA color system is:
  - `#16C16B`
  - `#128A4F`
- Secondary beige actions should remain secondary and should not be recolored green.
- Product/card WhatsApp CTAs are part of the primary action system.
- Button polish should be tactile and restrained: small translate, refined shadows, smooth transitions, no bounce.
- The hero/top storefront is accepted and should not be over-polished.
- Live Picks remains a native horizontal scroll carousel, not an external slider.
- WhatsApp chooser remains a simple contact picker, not a redesigned flow.
- Brand logos should be preserved as assets and improved only through presentation.
- Footer developer credit should be readable, subtle, centered, and not overpower WAT branding.

## 6. Deferred Future Refinements

- Full pre-release browser QA across key mobile widths and desktop after final commit.
- Decide what to do with `tsconfig.tsbuildinfo`.
- Review whether `docs/` should be included in the release commit.
- Review all changed files before committing the accepted baseline.
- Optional final visual capture set for:
  - Homepage desktop.
  - Homepage mobile.
  - Catalog mobile.
  - Feed mobile.
  - Product detail mobile.
  - WhatsApp chooser mobile.
  - Footer mobile/desktop.
- Needs verification: whether there are any additional local changes outside the observed `git status --short` output.

## 7. What Must Not Be Touched

Do not touch unless the user explicitly approves:

- Admin UI.
- Backend/Firebase logic.
- Firebase deploy or any live deployment path.
- Product data.
- Contact data.
- WhatsApp links, chooser logic, or opening behavior.
- CTA green system.
- Accepted hero layout and Live Picks behavior.
- Accepted Catalog/Feed/product detail behavior.
- Existing user/local changes outside the requested scope.

## 8. Validation Already Passed

Validation repeatedly passed during the local polish phase:

- `npm run lint`
- `git diff --check`

Observed note:

- `git diff --check` reported LF-to-CRLF warnings for some working-copy files, but no whitespace errors.

## 9. Current Safety Status

- No push yet.
- No deploy yet.
- No Firebase deploy.
- No staging yet.
- No commit yet.
- No reset or discard performed.

## 10. Rollback Confidence

- Checkpoints were created during the local polish work. Needs verification if exact checkpoint names/commands are required.
- Visual checks were done after each polish pass where practical.
- User personally checked mobile/desktop previews during the polish process.
- The local baseline has been validated with lint and diff whitespace checks.

## 11. Next Step After This File

Recommended next sequence:

1. Inspect `git status`.
2. Review changed files.
3. Commit the accepted polish baseline intentionally.
4. Push intentionally.

Do not stage, commit, push, deploy, upload, reset, discard, or run Firebase deploy until the user explicitly asks for that next step.
