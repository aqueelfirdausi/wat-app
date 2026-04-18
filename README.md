# WAT App

WAT App (What's Available Today) is a mobile-first Next.js + Firebase storefront built for WhatsApp-first product discovery and internal product management.

## Features

- Public homepage with hero, categories, featured products, and latest products
- WhatsApp inquiry buttons with prefilled product details
- Firebase Auth admin login for internal team members
- Protected admin dashboard and product management flow
- Firestore-backed products, categories, settings, logs, and users collections
- Firebase Storage image uploads
- Activity logbook showing who changed what and when

## Setup

1. Copy `.env.example` to `.env.local`.
2. Fill in your Firebase web app credentials.
3. Set `NEXT_PUBLIC_WHATSAPP_NUMBER` to your WhatsApp number in international format without `+`.
4. Set `NEXT_PUBLIC_APP_URL` to your public app domain when preparing for production sharing.
5. Install dependencies with `npm install`.
6. Run `npm run dev`.

## Firebase collections

- `products`
- `categories`
- `settings`
- `logs`
- `users`

## Notes

- Admin access is limited to approved Google accounts in the app auth guard.
- The product form auto-creates a category document when a new category name is saved.
- Public product links use `/product/[slug]`.
- For Firebase App Hosting, configure the same environment variables in the Firebase console for the backend.

## Local checkpoint

- Verified working locally: product add/edit/delete, admin inventory, storefront product cards, product detail pages, category display, and Ask on WhatsApp chooser flow.
- Stable chooser component path: `components/whatsapp-contact-chooser.tsx`.
- Product detail route is intentionally dynamic for better local reliability: `app/product/[slug]/page.tsx`.
- Normal local run: `npm run dev`.
- If local route/build output gets weird, clear safe local build state with `npm run dev:reset`, then start again with `npm run dev`.

## Deployment prep

- Pre-publish local checks: storefront loads, admin login works, add/edit/delete product works, product detail pages work, Ask on WhatsApp chooser works, and status-ready export works if that feature is part of the release.
- Known local-only quirks: wrong/stale localhost port after restart, stale `.next` output, Windows `spawn EPERM`, and occasional local dev compile/path weirdness. These are local recovery issues, not automatic release blockers.
- Real blockers that should stop publishing: broken CRUD, broken product detail route, broken chooser modal, broken admin auth, broken product images, or missing product data on the live detail flow.
- Final pre-release sanity checks: quick mobile storefront scan, open a few real product detail pages, complete one edit flow, and confirm one delete flow behaves correctly.

## Share / short-link planning

- Current reality: direct product links already work, but WhatsApp Status rich previews can be inconsistent. For now, image-based status sharing is the stronger day-to-day workflow.
- Possible future improvements: add short-link generation in admin, add a quicker copy-share-link helper flow, and optionally move to a cleaner custom domain later.
- Before implementing it: keep storefront/detail stability intact, keep the export workflow simple, and avoid adding link-management complexity that slows daily posting.

## Mobile QA checklist

- Storefront: confirm the page loads cleanly on a real phone, product cards scan well, and card taps open product detail reliably.
- Product detail: confirm the image loads cleanly, title/price/specs are readable, and Ask on WhatsApp is easy to tap.
- Chooser: confirm the modal opens once, rows are readable, the Open action is easy to tap, and the modal closes cleanly.
- Admin: confirm the inventory list, add/edit form, and status-ready export panel are usable on a phone-sized screen.
- Practical posting flow: create or update one product, verify the storefront update, open the detail page, and export/share the status asset if needed.
