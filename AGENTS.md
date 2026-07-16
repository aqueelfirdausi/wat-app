# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

WAT App — What's Available Today. Mobile-first, WhatsApp-driven storefront for daily stock browsing.
Live at: watapp.pk
Local path: `C:\Users\Administrator\Desktop\Codex-Projects\WAT-app`

## Commands

```bash
npm run dev          # local development
npm run build        # production build
npm run lint         # must pass before every commit
npm run typecheck    # run when changing auth/routes/logic
npm run dev:reset    # reset local state if needed
npm run seed:demo    # seed demo data
```

No test suite exists. `lint` and `typecheck` are the verification gates.

## Rules — Non-Negotiable

- Smallest safe change only. No redesigns.
- Inspect first. Always read before editing.
- `npm run lint` before every commit.
- `npm run typecheck` before commits touching auth/routes/logic.
- No Firebase deploy unless explicitly requested by owner.
- No Firebase config changes casually.
- Do not commit `tsconfig.tsbuildinfo`.
- LF-to-CRLF warnings on Windows are known and accepted.

## Design System — Do Not Touch

- CTA green: `#16c16b` / `#128a4f` — never change
- Header identity — do not redesign
- Tactile button system — do not change
- Compact WhatsApp chooser — do not change
- Carousel interaction style — do not change
- Brand tile presentation — do not change
- Novart.io footer signature — do not touch

Mobile-first. Always test at: 360px, 390px, 414px, desktop.
No flashy animations. No autoplay. No external carousel libraries.

## Architecture Overview

**WAT-app** is a WhatsApp-first product storefront for two brands — **UniverCell** (mobile phones, tech) and **EKO Fragrances** (perfumes). The public storefront lets customers browse and contact sellers via WhatsApp; the `/admin` area lets authorised staff manage the product catalogue.

### Stack

- **Next.js 15 App Router** — server and client components, API routes
- **Firebase Firestore** (`watapp` database ID) — primary database with real-time subscriptions
- **Firebase Auth** — Google OAuth only; role lookup done against hardcoded email lists (not Firestore)
- **Firebase Storage** — product images stored as `products/{slug}-{timestamp}-{filename}`
- Deployed via **Firebase App Hosting** (`apphosting.yaml`, backend ID `wat-app`), Cloud Run with `minInstances: 0`

### Route Structure

| Route | Purpose |
|---|---|
| `/` | Public storefront (`HomepageClient`) |
| `/product/[slug]` | Product detail with OG image + WhatsApp CTA |
| `/admin` | Protected shell; redirects to `/admin/login` if unauthenticated |
| `/admin/products` | Product list |
| `/admin/products/new` | Create product |
| `/admin/products/[id]` | Edit product |
| `/admin/analytics` | Analytics dashboard |
| `/admin/logs` | Activity audit log |
| `/api/analytics` | POST — track storefront events |
| `/api/image-proxy` | GET — proxy remote images with 5-min cache |

### Auth & Roles

Roles are defined statically in `lib/admin-roles.ts` — **not Firestore**.

| Role | Emails |
|---|---|
| `admin` | aqueelfirdausi@gmail.com, abdullahbinaqueel@gmail.com |
| `product_editor` | saaimshakil@gmail.com, axrbruh@gmail.com |

Unknown emails are rejected and signed out immediately.

**Role boundaries (do not break):**

- Product editors may access: `/admin/products`, `/admin/products/new`, `/admin/products/[id]`
- Product editors are blocked from: `/admin`, `/admin/analytics`, `/admin/logs`
- Delete product: UI hidden for editors; `removeProduct()` throws unless `actor.role === "admin"`

The `AuthProvider` (`components/providers/`) wraps the entire app and exposes `user`, `role`, `loading`. Admin routes are protected by `AuthGuard` in `components/admin/`.

### Data Layer (`lib/firebase/`)

- `config.ts` — loads env vars, exports `isFirebaseConfigured()`
- `client.ts` — initialises Firebase app, auth, db, storage (client-side only; never import from server components or API routes)
- `firestore.ts` — all CRUD for products, categories, activity logs, analytics; real-time `onSnapshot` subscriptions; image upload/delete (20s timeout); `chosenForToday` enforced as a single-product flag via batch writes; every mutation writes to `logs` via `logActivity()`
- `firestore-server.ts` — server-side product fetching via Firestore REST API (used for OG images and SSR metadata)
- `auth.ts` — Google sign-in, role resolution, user profile creation, logout

### Key Utilities (`lib/`)

| File | Responsibility |
|---|---|
| `types.ts` | Shared TypeScript types — `Product`, `Category`, `ActivityLog`, `AnalyticsEvent`, `ProductFormValues` |
| `constants.ts` | Canonical value lists — conditions, stock statuses, brands, default currency (PKR) |
| `brands.ts` | Brand metadata for UniverCell & EKO; `inferBrandFromCategory()` auto-assigns brand from category name |
| `utils.ts` | Stock labels, WhatsApp link builder, product sorting (featured → priority → freshness → name), slugify, currency formatting (en-PK) |
| `analytics.ts` | Client-side event tracking with session deduplication via sessionStorage; uses `sendBeacon` when available |
| `metadata.ts` | OG/SEO metadata helpers; canonical base URL defaults to `watapp.pk` |
| `team-contacts.ts` | Hardcoded team WhatsApp contacts; `resolveProductContact()` picks the right number per product |
| `status-image-minimal.ts` | Canvas-based 1080×1920 WhatsApp Status image generator (product image + QR code + price) |

### Firestore Collections

`products`, `categories`, `team_contacts`, `users`, `logs`, `analyticsEvents`, `settings`

### Environment Variables

Copy `.env.example` to `.env.local`:

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_WHATSAPP_NUMBER
NEXT_PUBLIC_APP_URL
```

## Roadmap (context only — do not implement unless instructed)

1. Admin stock update flow — mobile friendly, 30-second update
2. PWA setup — installable on Android
3. Capacitor APK — shareable .apk file
4. Commercialization — multi-tenant SaaS for Pakistani shopkeepers
