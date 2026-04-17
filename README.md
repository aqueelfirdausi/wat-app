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
