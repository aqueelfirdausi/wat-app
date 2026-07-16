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
