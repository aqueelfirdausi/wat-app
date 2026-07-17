# Phase 3S — Appwrite authentication and SSR session

## Outcome and starting state

Phase 3S implements the minimum fail-closed Appwrite staff authentication
foundation while keeping `WAT_MUTATIONS_ENABLED=false`. Starting branch and
upstream were `appwrite-migration` and `origin/appwrite-migration` at
`d31578be327b2fcabe65409144f51282535f403f`, ahead/behind `0/0`. Local and
remote `main` remained
`83616bfd67534fdd090459230b373f23633bc81d`; the archive remained
`8d1a1ccee792f672864bc32827caefc43d5e7210`. The worktree was clean and
`.env.local` was ignored, untracked, and unstaged.

Read-only bootstrap and connectivity checks classified the exact Team,
database, bucket, products table, and categories table as ready. The three
operational tables and `team_contacts` were absent. Initial live totals were
zero users, Team members, products, categories, files, and platforms.

## Authentication audit and backend boundary

The retained Firebase path used the existing Google popup login and client
admin layout. Appwrite previously had fail-closed placeholders without active
login session creation, SSR identity resolution, logout, or recovery
completion.

Protected pages now share one server authentication boundary. Firebase mode
retains its legacy components for rollback. Appwrite mode uses email/password
only and does not initialize or call Firebase Auth. Missing or malformed
backend selection fails closed; there is no cross-backend fallback.

## Login, cookie, identity, and protected routes

The Appwrite form sends bounded JSON to same-origin `/api/auth/login`. The
server validates origin, content type, shape, lengths, and normalized email;
creates the email/password session with the dedicated server capability; and
resolves authorization immediately. Unauthorized new sessions are revoked.
Errors are generic and accounts are never created.

Only the Appwrite session secret is stored in the configured HTTP-only cookie.
It is `SameSite=Lax`, scoped to `/`, secure in production, locally compatible,
and bounded by the Appwrite session expiration. It is not returned in JSON,
HTML, client props, client assets, or browser-readable storage. Invalid state
uses a same-origin cookie-clearing route. Logout deletes only the current
session where possible, expires the same cookie, and is safe if the session is
already invalid.

The server identity resolver returns only the account ID, display name, email,
normalized application role, and membership ID needed internally. `/admin`
and its children redirect no-session users to login, clear invalid session
state, and render a narrow role-aware shell only after authorization. The
Appwrite shell exposes no catalogue mutation controls and states that migration
mutations remain disabled.

## Team membership and exact roles

Authorization requires a well-formed, confirmed membership in exact Team
`wat_staff`, belonging to the current account, with exactly one recognized
application role.

| Role or state | Result |
| --- | --- |
| `admin` only | Allowed |
| `product_editor` only | Allowed |
| No recognized role or both application roles | Denied |
| Unknown, duplicate, malformed, or non-scalar role | Denied |
| Built-in `owner` only | Denied |
| Missing, wrong-Team, or unconfirmed membership | Denied |
| Blocked account or invalid/expired session | Denied |

The built-in Appwrite Team `owner` role never implies application admin.

## UI, logout, and recovery

Appwrite login contains email, password, submit, generic error, and
forgot-password controls. It contains no signup, Google, OAuth, phone, Magic
URL, Email OTP, or anonymous-login control.

Recovery request returns the same accepted response whether delivery succeeds
or fails and uses the configured recovery URL. The callback validates bounded
`userId` and secret inputs, moves them to a short-lived HTTP-only recovery
cookie, and redirects to a clean completion URL. Completion requires matching
bounded passwords, uses the server recovery service, clears sensitive state,
and returns only generic errors. Live email delivery is **Needs verification**
because no controlled inbox or provider was available.

## Disposable identity lifecycle and browser verification

`appwrite:check-auth` is read-only by default, requires two explicit mutation
gates, and has a `try/finally` cleanup contract. Fixtures prove user,
membership, session, authorization, revocation, and failure cleanup. The
current narrow setup key lacks user-inventory and platform-inventory scope, so
confirmed apply refuses before mutation rather than assuming a zero baseline
or broadening a key.

The authorized live lifecycle was performed through the signed-in Console:

1. Confirmed zero users, Team members, and platforms.
2. Created one uniquely prefixed synthetic user.
3. Added one confirmed `wat_staff` membership with exactly `admin`.
4. Verified generic invalid-login behavior.
5. Verified valid email/password login and protected server authorization.
6. Verified desktop and mobile protected shells and narrow identity display.
7. Verified logout and subsequent `/admin` denial.
8. Verified generic recovery request UI and invalid callback handling.
9. Deleted the current session, membership, and user.
10. Independently reconfirmed zero users, Team members, and platforms.

Browser routes included `/admin/login`, `/admin`,
`/admin/forgot-password`, and `/admin/reset-password/complete` at 390×844 and
1280×844. The mobile shell had no horizontal overflow. Observed route asset
URLs contained no Firebase, Google APIs, Identity Toolkit, or Secure Token
request. There was no runtime overlay, hydration failure, or application
console error.

Authentication is server-mediated, so no Appwrite Web platform was needed.
Configured server keys were absent from tracked files, served HTML, and
selected client assets. Browser/server logs contained no disposable marker,
synthetic email, cookie value, password, session secret, or recovery secret.
No temporary credential was printed, saved, committed, or retained.

## Cleanup and final live totals

Final Console totals were zero users, zero `wat_staff` members, and zero
platforms. Final read-only API totals were zero products, zero categories, and
zero product image files. Operational tables and `team_contacts` remained
absent. No disposable session, recovery state, membership, user, credential
file, browser profile, screenshot, or diagnostic log remains.

## Verification

Passed:

- `npm.cmd run test:catalogue` — 20 tests
- `npm.cmd run test:appwrite-foundation` — 99 tests
- `npm.cmd exec -- tsx --conditions=react-server --test tests/appwrite-connectivity.test.ts` — 3 tests
- `npm.cmd run test:appwrite-auth` — 40 tests
- `npm.cmd run test:mutation-gate` — 15 tests
- `npm.cmd run test:firebase-inventory` — 8 tests
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd run appwrite:bootstrap`
- `npm.cmd run appwrite:check`
- `npm.cmd run appwrite:check-empty`
- `npm.cmd run appwrite:check-auth`
- `git diff --check`

The confirmed apply form of `appwrite:check-auth` failed closed before a write
because the existing narrow key cannot establish numeric user and platform
baselines. The production build completed. The existing workspace-root warning
caused by an unrelated parent Desktop lockfile remains; no parent file changed.

## Repository scope, findings, and next phase

Changes are limited to admin login/recovery/protected routes, authentication API
routes and components, Appwrite authorization/session/runtime helpers, the
double-gated command, auth/containment/cleanup tests, and migration docs.

Remaining findings are controlled: live recovery email delivery needs a
controlled inbox, and live CLI apply remains unavailable with the deliberately
narrow setup key. Console verification supplied the live proof without
changing key scopes.

The next safest phase is a separately approved, read-only admin catalogue
presentation phase. Keep mutations disabled; do not create operational tables
or deploy.
