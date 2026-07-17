# Appwrite Fast-Track Local Runbook

## 1. Safety model

This runbook is for local work on `appwrite-migration`. `main`, the production website, Firebase data and rules, Vercel, domains, and deployments remain untouched. `WAT_BACKEND` selects one backend per process. Missing, padded, uppercase, or unknown values fail closed. Only exact `WAT_MUTATIONS_ENABLED=true` enables mutation paths.

## 2. Required environment-variable names

Copy `.env.example` to an ignored `.env.local` and set values there. Appwrite mode uses:

- `WAT_BACKEND`
- `WAT_MUTATIONS_ENABLED`
- `NEXT_PUBLIC_APPWRITE_ENDPOINT`
- `NEXT_PUBLIC_APPWRITE_PROJECT_ID`
- `APPWRITE_ENDPOINT`
- `APPWRITE_PROJECT_ID`
- `APPWRITE_DATA_API_KEY`
- `APPWRITE_AUTH_API_KEY`
- the fixed resource ID variables
- `APPWRITE_SESSION_COOKIE_NAME`
- `APPWRITE_PASSWORD_RECOVERY_URL`

The bootstrap additionally requires `APPWRITE_EXPECTED_PROJECT_ID` and `APPWRITE_BOOTSTRAP_API_KEY`. The expected ID must exactly equal `APPWRITE_PROJECT_ID`.

## 3. Values the owner must obtain from Appwrite

Obtain the Frankfurt API endpoint, existing `watapp` project ID, a narrowly scoped data key, a separate `sessions.write` authentication key if capability testing confirms it, and a temporary bootstrap key with only the metadata-read and resource-create scopes needed by the bootstrap. Never reuse an overly broad key as a runtime key. Never paste secrets into chat, Git, logs, screenshots, or Markdown.

The fixed IDs remain `wat_app`, `wat_staff`, `product_images`, `products`, `categories`, `activity_logs`, `analytics_events`, and `broadcasts`.

## 4. Run bootstrap in read-only mode

With the ignored local variables configured:

```powershell
npm.cmd run appwrite:bootstrap
```

This is the default. It inventories and classifies resources, prints a sanitized plan, and performs no writes.

## 5. Review bootstrap output

Review every resource classification. Stop on `conflicting`, `requires adjustment`, or `Needs verification`. Confirm no Appwrite `team_contacts` or unexpected permanent table exists. Matching table IDs are not reusable until columns, types, defaults, indexes, permissions, and row security are checked.

## 6. Apply creation explicitly

Only after the read-only output is reviewed and the owner separately authorizes creation:

```powershell
npm.cmd run appwrite:bootstrap -- --apply --confirm-create-missing
```

Apply mode never deletes or rewrites resources and never modifies users or keys. It can create a missing fixed Team, database, bucket, and the fully locked `products` and `categories` tables. The two core tables are created with empty table permissions, row security, the Phase 3L columns, and approved indexes. Partial or incompatible tables are not adjusted automatically. The three operational tables remain deferred; incomplete placeholder tables are not created.

If the ignored environment is not configured, both bootstrap and connectivity commands fail before network access and print only missing variable names.

## 6A. Verify connectivity

The default check reads metadata only:

```powershell
npm.cmd run appwrite:check
```

After the resources and narrow data key are confirmed, the separately gated disposable private-category lifecycle is:

```powershell
npm.cmd run appwrite:check -- --apply --confirm-disposable-check
```

It creates, reads, updates, deletes, and verifies deletion of one unmistakably disposable row with empty row permissions. Do not run it against an unreviewed project. If it fails, preserve the reported row ID and verify cleanup in the Console before retrying.

## 7. Start local Appwrite mode

Set these ignored local values, then start normally:

```text
WAT_BACKEND=appwrite
WAT_MUTATIONS_ENABLED=false
```

```powershell
npm.cmd run dev
```

The client receives a build-time, non-secret mirror of `WAT_BACKEND`; owners configure only the server selector. Restart the development server after changing it.

## 8. Keep mutations disabled

Leave `WAT_MUTATIONS_ENABLED=false` while inspecting configuration, building resources, and connecting read paths. Missing or any value other than exact lowercase `true` is disabled.

## 9. Enable local mutations only after resources exist

Do not enable mutations merely because bootstrap top-level resources exist. First verify all table schemas, permissions, row/file security, authentication, Team roles, recovery, and server adapters. Then obtain explicit owner approval for the bounded local test before setting exact `true` in ignored local configuration.

## 10. Verify no Firebase traffic occurs

In browser developer tools, clear the Network panel, reload local Appwrite mode, and exercise the loaded screens. Filter for `firebase`, `firestore`, `googleapis.com`, `firebaseio.com`, `identitytoolkit`, `firebaseinstallations`, and `fcmregistrations`. No request should appear. The browser Firebase app, Auth, Firestore, Storage, messaging, and listeners remain uninitialized because the selected backend is Appwrite.

Server Firebase Admin loaders and Firebase REST analytics also reject Appwrite mode before initialization. Catalogue adapters are not yet connected, so a fail-closed or unavailable state is expected instead of Firebase fallback.

## 11. Reset local sessions

Stop the dev server and remove only the local cookie named by `APPWRITE_SESSION_COOKIE_NAME` from the localhost browser profile. Do not revoke accounts, delete Appwrite sessions globally, or clear unrelated site data. Restart the server afterward.

## 12. Return temporarily to Firebase mode

Stop the server, set `WAT_BACKEND=firebase`, preserve the existing Firebase public configuration, and restart. Do not mix selectors or attempt simultaneous writes. Production is unaffected because this work remains only on `appwrite-migration` and is not deployed.

## 13. What must never be committed

Never commit `.env` files, API-key values, session secrets, passwords, recovery tokens, cookies, private Console output, service accounts, personal user inventories, bootstrap logs containing private metadata, or `tsconfig.tsbuildinfo`.

## 14. What remains blocked

- Live Console inventory and collision review
- Live product/category resource creation and verification until ignored credentials are supplied
- Exact types and limits for the three deferred operational tables
- Automatic creation of `activity_logs`, `analytics_events`, and `broadcasts`
- Public-signup prevention proof
- Recovery-based password establishment
- SSR session-key verification
- Team membership/role capability tests
- Permission, visibility-compensation, and concurrency tests
- Real-user creation, migration writes, Vercel work, deployment, and cutover

## 15. Next implementation phase

Place the required values in ignored `.env.local`, run bootstrap read-only, review every fixed-resource classification, then use the already-authorized double-gated apply only if there are no collisions. Run the metadata check, the authorized disposable lifecycle, and a local Appwrite-mode browser smoke test with mutations disabled. The next implementation phase can then wire the existing product/category read adapters into the storefront and admin UI.
