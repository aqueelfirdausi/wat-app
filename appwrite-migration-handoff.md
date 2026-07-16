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
3. `team_contacts`
4. `activity_logs`
5. `analytics_events`

Appwrite Auth and the `wat_staff` Team provide staff identity and authorization; do not create a separate permanent users table. Configuration that does not belong in the five tables must remain application configuration unless a later approved architecture revision says otherwise.

`chosenSelectionKey` is provisional until isolated testing confirms the safest way to enforce the single chosen product invariant. Do not treat it as finalized schema or production behavior before that test.

## Security and mutation boundaries

- All catalogue, operational-state, role-sensitive, logging, and storage mutations are server-mediated.
- Hidden product rows are private.
- Images belonging to hidden products are private.
- Authorization must preserve the `admin` and `product_editor` boundaries; only admins may permanently delete products.
- Do not expose Appwrite API keys, session secrets, credentials, or private test output to browser bundles or Git.

### Deployment mutation gate

- `WAT_MUTATIONS_ENABLED` is a server-only deployment safety switch. It must never use the `NEXT_PUBLIC_` prefix or be exposed to browser code.
- Only the exact value `true` enables approved server-side mutations. Missing, empty, malformed, and all other values fail closed.
- The gate does not bypass authentication, authorization, validation, or role checks; it is not a role-permission mechanism.
- Vercel Preview must use `WAT_MUTATIONS_ENABLED=false`.
- The initial Vercel Production temporary-domain deployment must use `WAT_MUTATIONS_ENABLED=false`.
- Current Firebase production requires `WAT_MUTATIONS_ENABLED=true` before this branch can replace its running code without disabling gated writes.
- Future Appwrite mutations may be enabled only after explicit approval and successful permission tests.

## Migration and branch safety

- Firebase remains authoritative during the migration. Do not change production reads or writes until a separately approved cutover.
- `main` is the production branch and must remain unchanged by migration work.
- `appwrite-migration` is the active migration-development branch and is based directly on synchronized `main`.
- `archive/stage-5-pre-appwrite` is the preservation branch for the pre-Appwrite `stage-5` workspace.
- Never merge, rebase, or cherry-pick `stage-5` into `appwrite-migration`.
- This phase does not import into Vercel. A later explicitly approved import must keep both Preview and the initial Production temporary domain at `WAT_MUTATIONS_ENABLED=false`.
- Do not change Firebase, Appwrite, Vercel, domains, or deployments without explicit owner authorization.
