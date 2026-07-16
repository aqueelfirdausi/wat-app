# AGENTS.md

This file guides work in the WAT App repository. When repository documentation conflicts, `appwrite-migration-handoff.md` is authoritative for the Appwrite migration.

## Project

WAT App (What's Available Today) is a mobile-first, WhatsApp-driven storefront for daily stock browsing. The production site is `watapp.pk`.

The current production baseline uses Next.js 15 App Router, Firebase Auth, Firestore, Firebase Storage, and Firebase App Hosting. Firebase remains authoritative while the Appwrite migration is developed in isolation.

## Commands

```bash
npm run dev          # local development
npm run build        # production build
npm run lint         # required before every commit
npm run typecheck    # required for auth, routes, or logic changes
npm run dev:reset    # reset local development state if needed
npm run seed:demo    # seed demo data
```

There is no general automated test suite on the clean production baseline. Lint and typecheck are the required verification gates; run the production build for migration checkpoints and before handoff.

## Non-negotiable rules

- Make the smallest safe change and inspect files before editing.
- Do not deploy Firebase or casually change Firebase configuration.
- Do not change Appwrite, Vercel, domains, or deployments without explicit owner authorization.
- Do not commit `.env` files, credentials, service-account files, private logs, local Appwrite test output, or `tsconfig.tsbuildinfo`.
- Keep `main` production-only. Build the migration on `appwrite-migration`, based directly on synchronized `main`.
- Preserve `archive/stage-5-pre-appwrite`; do not merge, rebase, or cherry-pick `stage-5` into the migration branch.
- The migration is single-shop. Do not introduce `shopId`, tenant tables, tenant abstractions, or multi-tenant tests.
- Firebase remains the authoritative data source until an explicitly approved cutover.
- Vercel import remains blocked until an approved preview mutation gate exists.
- LF-to-CRLF warnings on Windows are known and accepted.

## Design constraints

- CTA green is `#16c16b` / `#128a4f`; do not change it.
- Do not redesign the header identity, tactile button system, compact WhatsApp chooser, carousel interaction, brand tiles, or Novart.io footer signature.
- Work mobile-first and check 360 px, 390 px, 414 px, and desktop layouts for UI changes.
- Do not add flashy animations, autoplay, external carousel libraries, or unnecessary redesigns.

## Current production architecture

- Public routes include `/` and `/product/[slug]`.
- Admin routes include login, products, stock, analytics, logs, and notifications.
- API routes cover analytics, image proxying, OG images, FCM service-worker delivery, and notification sending.
- Firebase client initialization lives under `lib/firebase/`; do not import client-only Firebase modules into server components or route handlers.
- Staff roles are currently resolved by `lib/admin-roles.ts`. The roles are `admin` and `product_editor`.
- Product editors may work in product and stock routes. Analytics, logs, notifications, and owner administration remain admin-only.
- Only admins may permanently delete products.
- The current Firebase sign-in flow is Google OAuth. The frozen Appwrite target replaces this with email/password only and keeps Google OAuth disabled in Appwrite.
- Firebase App Hosting currently uses backend ID `wat-app`; `apphosting.yaml` currently sets `minInstances: 1`.

## Appwrite migration guardrails

Follow `appwrite-migration-handoff.md` exactly. The target uses the existing Frankfurt Appwrite project `watapp`, database `wat_app`, Team `wat_staff`, bucket `product_images`, and exactly five permanent tables. Mutations are server-mediated, hidden rows and images are private, product images are limited to 1 MB, and `chosenSelectionKey` remains provisional pending isolated testing.
