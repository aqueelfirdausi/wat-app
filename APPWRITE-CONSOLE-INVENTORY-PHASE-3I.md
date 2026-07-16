# Phase 3I — Appwrite Console Inventory and Capability-Verification Plan

**Status:** PASS WITH FINDINGS for read-only planning; **NO-GO** for resource creation or migration implementation.

This report separates repository facts, official documentation, inference, and live-project facts. No Appwrite, Firebase, Vercel, domain, deployment, user, key, database, table, row, bucket, or file mutation was performed.

## 1. Starting Git state

| Check | Result | Classification |
|---|---|---|
| Current branch | `appwrite-migration` | Verified from repository |
| HEAD | `71029677caf05ac361596dc0fed6c750540a0cf6` | Verified from repository |
| Working tree | Clean at phase start | Verified from repository |
| Upstream | `origin/appwrite-migration` | Verified from repository |
| Ahead / behind | `0 / 0` | Verified from repository |
| Local `main` | `83616bfd67534fdd090459230b373f23633bc81d` | Verified from repository |
| `origin/main` | `83616bfd67534fdd090459230b373f23633bc81d` | Verified from repository |
| Expected Phase 3H commit | Present at HEAD and upstream | Verified from repository |
| Authoritative files | All required files present | Verified from repository |
| Tracked changes | None | Verified from repository |
| Staged / untracked changes | None | Verified from repository |
| Ignored sensitive files | `.env.local`, one ignored Firebase service-account JSON, and TypeScript build metadata exist locally; contents were not read | Verified by filenames only |

State-lock result: **GO for this documentation-only phase**. Ignored credentials are not a dirty-worktree condition, but they must remain ignored, unread, uncommitted, and outside every future evidence bundle.

## 2. Sources inspected

### Repository sources

- `appwrite-migration-handoff.md`
- `AGENTS.md`
- `VERCEL-PREVIEW-CLASSIFICATION-SUPPORT.md`
- `scripts/firebase-inventory-readonly.mjs`
- `tests/firebase-inventory-readonly.test.mjs`
- `lib/server/mutation-gate.ts`
- `tests/mutation-gate.test.ts`
- `.env.example`
- `.gitignore`
- `package.json`, recent Git history, branch refs, and non-secret search results

### Official Appwrite sources

- [Authentication overview](https://appwrite.io/docs/products/auth)
- [Email/password and recovery](https://appwrite.io/docs/products/auth/email-password)
- [SSR login](https://appwrite.io/docs/products/auth/server-side-rendering)
- [Authentication status](https://appwrite.io/docs/products/auth/checking-auth-status)
- [Teams](https://appwrite.io/docs/products/auth/teams), [Teams API](https://appwrite.io/docs/references/cloud/server-nodejs/teams), and [Membership model](https://appwrite.io/docs/references/cloud/models/membership)
- [Database permissions](https://appwrite.io/docs/products/databases/permissions), [tables](https://appwrite.io/docs/products/databases/tables), [rows](https://appwrite.io/docs/products/databases/rows), and [transactions](https://appwrite.io/docs/products/databases/transactions)
- [Storage buckets](https://appwrite.io/docs/products/storage/buckets) and [storage permissions](https://appwrite.io/docs/products/storage/permissions)
- [API keys and scopes](https://appwrite.io/docs/advanced/security/api-keys)
- [Project API](https://appwrite.io/docs/references/cloud/server-rest/project)

Documentation proves platform capabilities, not this project's live configuration.

## 3. Access available and unavailable

| Surface | Status | Result |
|---|---|---|
| Local repository and Git metadata | Available | Read-only inspection completed |
| Non-secret variable names | Available | No `APPWRITE*` or `WAT_MUTATIONS_ENABLED` names were present in the process environment; `.env.example` defines no Appwrite variables |
| Appwrite SDK dependency | Unavailable | No Appwrite package is installed |
| Appwrite CLI | Unavailable | No local CLI command was found |
| Authenticated Appwrite Console | Not assumed / unavailable | No Console inspection performed |
| Appwrite API credentials | Unavailable | No values were requested or read |
| Browser automation | Not assumed | Not used |
| Official Appwrite documentation | Available | Current primary documentation inspected |

## 4. Non-secret project inventory

### Project

| Value | Inventory result | Classification |
|---|---|---|
| Project name | `watapp` | Frozen architecture; not live-verified |
| Project ID | Needs user capture — Appwrite Console access unavailable. | Needs verification |
| Endpoint | Needs user capture — Appwrite Console access unavailable. | Needs verification |
| Region | Frankfurt | Frozen architecture; live region needs user capture |
| Active Web platforms | Needs user capture — Appwrite Console access unavailable. | Needs verification |
| Platform hostnames | Needs user capture — Appwrite Console access unavailable. | Needs verification |

### Authentication inventory

| Value | Inventory result |
|---|---|
| Email/password status | Needs user capture — Appwrite Console access unavailable. |
| Google status | Needs user capture — Appwrite Console access unavailable. |
| Every other provider | Needs user capture — Appwrite Console access unavailable. |
| Public registration behavior | Needs user capture — Appwrite Console access unavailable. |
| Password-recovery configuration/templates | Needs user capture — Appwrite Console access unavailable. |
| Redirect/platform requirements | Needs user capture — Appwrite Console access unavailable. |
| Session duration/invalidation settings | Needs user capture — Appwrite Console access unavailable. |

Official docs verify email/password sessions and recovery. Recovery redirects must use a domain registered as a platform, and recovery links are time-limited. SSR guidance uses a server-created session, an HTTP-only secure cookie, a per-request session client, and `account.get()` to verify the account. It identifies `sessions.write` for the admin client used to create sessions. The safest provisional interpretation is to keep the four-scope data/runtime key unchanged and test a separate narrowly scoped auth/session key; whether that separate key is required is **Needs verification**.

The Project API documents enabling/disabling the `email-password` method, but the reviewed primary documentation did not establish a separate switch that keeps email/password login enabled while disabling only public `account.create`. Therefore “email/password enabled, no public signup” is a capability assumption requiring an isolated test and possibly an application-level control; it is not yet proven as a project-wide enforcement.

### User-state summary

| Check | Inventory result |
|---|---|
| Total users | Needs user capture — Appwrite Console access unavailable. |
| Any existing users | Needs user capture — Appwrite Console access unavailable. |
| Planned admin identities already exist | Needs user capture — Appwrite Console access unavailable. |
| Planned product-editor identities already exist | Needs user capture — Appwrite Console access unavailable. |
| Relevant account status | Needs user capture — Appwrite Console access unavailable. |
| Recovery-based password establishment | Supported in documentation for an existing email/password account; project behavior Needs verification |

Planned admins: `aqueelfirdausi@gmail.com`, `abdullahbinaqueel@gmail.com`. Planned product editors: `saaimshakil@gmail.com`, `axrbruh@gmail.com`. No user was created, read, or modified. Unrelated identities must not be copied into this report.

### Team inventory

For every existing Team: **Needs user capture — Appwrite Console access unavailable.** Capture Team ID, name, aggregate membership count, aggregate defined roles, and whether the fixed ID `wat_staff` collides.

Official docs verify that a Team creator receives built-in `owner`; membership records independently expose `roles` and `confirm`. The server rule can therefore explicitly filter application roles to `admin` and `product_editor`, require `confirm=true`, and reject `owner` alone. This rule remains subject to later runtime tests.

### Database and table inventory

For every existing database, table, column, index, permission, and row-security setting: **Needs user capture — Appwrite Console access unavailable.** No database or table is proven reusable, conflicting, or missing yet.

### Bucket inventory

For every existing bucket and its file-security, permissions, maximum size, extensions, compression, encryption, antivirus, transformations, and aggregate file count: **Needs user capture — Appwrite Console access unavailable.** `product_images` is not live-verified.

### API-key metadata inventory

For every existing key's name, ID, scopes, expiry, and non-secret creation state: **Needs user capture — Appwrite Console access unavailable.** No secret should ever be copied. No key is proven suitably scoped or overly broad yet.

## 5. Frozen-architecture comparison

| Requirement | Repository / docs finding | Status |
|---|---|---|
| Existing `watapp`, Frankfurt | Declared in handoff; not live-verified | Needs verification |
| Email/password only; Google disabled | Declared; provider state unavailable | Needs verification |
| No public signup UI | No Appwrite UI/runtime exists yet | Missing implementation, out of scope |
| Project-wide public signup prevention | Separate provider-vs-registration control not proven | Needs verification / risk |
| SSR session cookie | Officially supported | Capability verified from docs; implementation missing |
| Active account + confirmed Team membership + exactly one app role | Membership `confirm` and roles documented | Capability plausible; isolated proof required |
| `owner` alone denied | `owner` is automatically granted to Team creator | Required application-side filter; proof required |
| Single shop; no tenant fields | Repository guardrail matches | Reusable constraint |
| Database `wat_app` | Live state unavailable | Needs verification |
| Team `wat_staff` | Live state unavailable | Needs verification |
| Bucket `product_images` | Live state unavailable | Needs verification |
| Five tables | Owner decision incorporated into the handoff: `products`, `categories`, `activity_logs`, `analytics_events`, `broadcasts` | Authoritative; no sixth table and no Appwrite `team_contacts` |
| Initial data/runtime API scopes only rows/files | Official scopes exist | Preserve the four-scope data key; test whether SSR needs a separate `sessions.write` auth key |
| Empty table permissions + row security | Appwrite uses grant-only table/row permissions; row permissions apply only with row security | Correct basis for visible/hidden row isolation |
| Empty bucket permissions + file security | Appwrite uses grant-only bucket/file permissions; file permissions apply only with file security | Correct basis for visible/hidden image isolation |
| 1 MB images | Bucket maximum size is configurable | Capability verified from docs; live setting unknown |
| Server-mediated mutations | Server SDK keys are scope-controlled and bypass resource permissions | Compatible, but least-privilege tests required |
| `WAT_MUTATIONS_ENABLED` disabled | Exact `"true"` behavior verified in repository; no environment value read | Must remain disabled |
| Transactions | Row operations accept `transactionId`; commit is atomic and detects conflicts | Capability verified from docs; live plan and concurrency proof required |
| Unique `chosenSelectionKey` | Unique indexes disallow duplicates | Mechanism documented; provisional invariant still Needs verification |

### Schema-specific findings

- The handoff now substantially defines the five tables, approved/rejected product fields, indexes, permission boundaries, visibility compensation, authentication, and API-key separation. Remaining schema questions are limited to Console compatibility and capability proof, including the final slug varchar length and the provisional selection invariant.
- No Appwrite design may introduce `shopId`, `tenantId`, tenants, tenant permissions, or Firebase UID columns on product rows.
- Because permissions are additive, public read cannot be granted at table/bucket level and then “denied” on a hidden row/file. Table and bucket permissions must remain empty; public/staff read must be set per row/file.
- Activity logs are intended to be append-only, analytics server-mediated, and broadcast creation/deletion role-restricted, but the exact row permissions and schema remain unverified.
- Visible/hidden product and image permissions form a two-resource consistency problem; compensation tests are mandatory.

## 6. Resource collision table

| Fixed ID | Kind | Live result | Classification |
|---|---|---|---|
| `wat_app` | Database | Needs user capture — Appwrite Console access unavailable. | Needs verification |
| `wat_staff` | Team | Needs user capture — Appwrite Console access unavailable. | Needs verification |
| `product_images` | Bucket | Needs user capture — Appwrite Console access unavailable. | Needs verification |
| `products` | Table | Needs user capture — Appwrite Console access unavailable. | Needs verification |
| `categories` | Table | Needs user capture — Appwrite Console access unavailable. | Needs verification |
| `activity_logs` | Table | Needs user capture — Appwrite Console access unavailable. | Needs verification |
| `analytics_events` | Table | Needs user capture — Appwrite Console access unavailable. | Needs verification |
| `broadcasts` | Table | Needs user capture — Appwrite Console access unavailable. | Needs verification |

## 7. Reusable-resource table

No live Appwrite resource is proven reusable. After capture, classify a match as reusable only when its ID, type, security settings, permissions, attributes, indexes, and role implications match the frozen architecture exactly. “Reusable after later safe adjustment” requires an explicit bounded adjustment plan and approval.

| Candidate | Current result |
|---|---|
| Existing project `watapp` | Intended reuse; project ID/region/platforms not live-verified |
| Any fixed-ID Team/database/table/bucket | Needs verification |
| Any existing API key | Needs verification; secret must never be recaptured |
| Existing planned staff account | Needs verification; do not modify in Phase 3I |

## 8. Missing-resource table

No live resource is proven missing because authenticated inventory was unavailable.

| Item | Local finding | Live classification |
|---|---|---|
| Appwrite SDK/runtime integration | Not present | Intentionally missing; later phase only |
| Appwrite environment variable definitions | Not present in `.env.example` | Intentionally missing; later phase only |
| Authoritative schema definition | Handoff now contains the approved tables, columns, indexes, permissions, visibility order, and key separation | Substantially defined; limited Console compatibility and capability questions remain |
| Fixed Appwrite resources | Cannot determine locally | Needs verification |

## 9. Security findings

1. **Least privilege:** API keys are secret and scope-based. Current docs verify `rows.read`, `rows.write`, `files.read`, and `files.write`; do not add database/table/bucket administration scopes for normal runtime.
2. **Separate SSR key question:** current SSR docs identify `sessions.write` for the admin client that creates sessions. This does not require silently broadening the four-scope data/runtime key; provisionally test a separate narrowly scoped auth/session key and create no key without explicit approval.
3. **Signup control:** disabling the entire email-password method is documented; a separate project-wide disable-signup/allow-login switch was not verified. Hiding signup UI alone is not a security boundary.
4. **Grant-only permissions:** table/bucket public read would expose every row/file. Use empty table/bucket permissions plus row/file security and explicit per-resource reads.
5. **API-key bypass:** server SDK calls with a key bypass resource permissions, so the mutation gate, server authorization, validation, and exact key scopes all remain mandatory.
6. **Team owner:** built-in `owner` is not an application-admin role. Authorization must intersect roles with exactly `{admin, product_editor}` and require exactly one result.
7. **Pending membership:** membership `confirm=false` exists and must fail closed.
8. **Local credentials:** ignored sensitive files exist. They were not read and must not enter commits, screenshots, logs, or evidence.
9. **No secret capture:** API-key values, recovery tokens, session cookies, passwords, personal user lists, and private file names are excluded from the checklist and evidence plan.

## 10. Capability assumptions requiring proof

- Email/password login can remain available while public account creation is effectively prevented.
- Existing users can establish passwords by recovery without an administrator learning a temporary password.
- The SSR flow can use the four-scope data/runtime key unchanged plus a separate narrowly scoped `sessions.write` auth key, or can safely avoid that auth key; both alternatives require isolated proof.
- A session client can reliably fetch the current account and confirmed `wat_staff` membership/roles without broader API-key scopes.
- Disabled/deleted users and revoked/expired sessions fail closed immediately enough for the application boundary.
- `rows.read`/`rows.write` and `files.read`/`files.write` alone cover normal server-mediated operations, including per-row/file permission updates.
- Empty table/bucket permissions plus row/file security implement visible/public and hidden/staff access without leakage.
- Transaction APIs and unique indexes behave correctly under concurrent selection requests and retry.
- A newly created row's chosen custom row ID can also be written into `chosenSelectionKey` in the same staged creation.
- Compensation can restore the earlier safe state when only one of row/file visibility changes succeeds.

## 11. Detailed isolated test matrix

All tests are for a later explicitly authorized phase. Use a disposable namespace, synthetic identities, non-production images/text, `WAT_MUTATIONS_ENABLED=false`, and no Firebase data. Evidence is sanitized request IDs/statuses and permission metadata—never secrets, cookies, tokens, passwords, full personal records, or private file names.

### Authentication and provisioning

| # / test | Purpose | Preconditions and disposable resources | Exact actions | Expected success / expected failure | Cleanup | Evidence / production-like data | GO / NO-GO |
|---|---|---|---|---|---|---|---|
| 1. Account creation constraints | Determine whether login can remain enabled while public signup is blocked | Disposable email domain/address; email-password enabled; no real staff | Attempt client `account.create`; repeat through intended public route; inspect Console auth controls read-only | Success criterion is public creation denied while existing-user login remains possible; failure is any unauthenticated caller can create an account | Delete synthetic account if unexpectedly created | Status/code and auth-setting names; no production data | GO only if signup is enforceably blocked without disabling login |
| 2. Password recovery | Prove recovery delivery and redirect rules | Existing synthetic account; registered disposable redirect platform | Start recovery; follow link; set a new random user-chosen password | Valid registered redirect completes; unregistered redirect and invalid token fail | Delete account and invalidate sessions | Redacted timestamps/statuses; no token retained; no production data | GO if valid flow works and invalid redirect/token fail |
| 3. Password establishment without admin-known password | Prove invite/provisioning can avoid temporary passwords known to admins | Synthetic pre-created account without shared password; recovery mail access held by test user | Trigger recovery; test user alone establishes password; login | User can establish and use password; administrator cannot retrieve/observe it | Delete account and sessions | Flow checkpoints only; no password/token; no production data | GO only if admin never knows password |
| 4. SSR session creation | Prove server-side email/password session creation | Synthetic account; disposable login endpoint; candidate key scopes | Submit credentials server-side; call create email/password session | Valid credentials return session object; invalid credentials fail without cookie | Revoke session; remove endpoint/key | Status and required scopes only; no cookie; no production data | GO if secure server flow succeeds with approved scopes or produces amendment evidence |
| 5. SSR cookie verification | Prove cookie-to-session client verification | Session from test 4; HTTP-only secure cookie | Send protected request; set session on a fresh per-request client; call `account.get()` | Valid cookie resolves correct synthetic account; altered cookie fails 401 | Revoke session and clear cookie | Redacted account ID hash/status; no cookie; no production data | GO if authentic cookie succeeds and tampered cookie fails |
| 6. Expired/revoked session | Fail closed after expiry/revocation | Short-lived synthetic session | Access before revoke; revoke/expire; repeat request | Before succeeds; after returns unauthorized and no role/data | Delete account/session | Status timeline; no secrets; no production data | GO if post-revoke access is denied |
| 7. No session | Fail closed with absent cookie | Protected disposable route | Call without cookie/header | No account/team/data access; 401/redirect | None | Status only; no production data | GO if denied before privileged work |
| 8. Disabled/deleted account | Fail closed for invalid account state | Two synthetic accounts and sessions | Disable one, delete one via authorized test admin; replay sessions | Both fail account verification and protected access | Remove remaining synthetic artifacts | Status/account-state labels only; no production data | GO if both are denied |

### Team authorization

| # / test | Purpose | Preconditions and disposable resources | Exact actions | Expected success / expected failure | Cleanup | Evidence / production-like data | GO / NO-GO |
|---|---|---|---|---|---|---|---|
| 9. Confirmed membership | Require active `wat_staff` membership | Disposable Team mirroring roles; confirmed synthetic member | Authenticate; fetch Team membership; authorize | Confirmed membership reaches role evaluation; absent/unconfirmed fails | Remove member/account/Team | `confirm` and role counts only; no production data | GO if confirm is reliably enforced |
| 10. Exact admin | Validate `admin` authorization | Confirmed member with roles `[admin]` | Call admin and editor-allowed probes | Admin probe succeeds; unauthorized unrelated operation still fails | Remove test membership | Decision/status only; no production data | GO if exactly-admin mapping is deterministic |
| 11. Exact product editor | Validate editor boundary | Confirmed member `[product_editor]` | Call product/stock probe and admin-only probe | Product/stock succeeds; admin-only fails | Remove test membership | Decision/status only; no production data | GO if boundary holds |
| 12. No application role | Fail closed on zero recognized roles | Confirmed member with no app role | Call protected probe | Denied even though Team membership exists | Remove membership | Role count `0`, status; no production data | GO if denied |
| 13. Both roles | Fail closed on ambiguity | Confirmed member `[admin, product_editor]` | Call protected probe | Denied with safe ambiguity error; neither role selected | Remove membership | Recognized-role count `2`; no production data | GO if denied |
| 14. Owner only | Separate built-in owner from app admin | Team creator with `[owner]` only | Call admin probe | Denied; `owner` never maps to `admin` | Delete disposable Team/account | Role labels and denial; no production data | GO if denied |
| 15. Removed membership | Revoke promptly | Authorized synthetic member with active session | Verify success; remove membership; retry | Before succeeds; after fails without requiring new login | Delete artifacts | Before/after statuses; no production data | GO if removal is effective |
| 16. Pending membership | Reject unconfirmed invitation | Client-created pending invite with `confirm=false` if supported | Authenticate invitee if account exists; call protected probe before/after confirmation | Before fails; after explicit confirmation enters role evaluation | Delete invite/account/Team | `confirm` transitions only; no token; no production data | GO if pending fails closed |

### Database API scopes

| # / test | Purpose | Preconditions and disposable resources | Exact actions | Expected success / expected failure | Cleanup | Evidence / production-like data | GO / NO-GO |
|---|---|---|---|---|---|---|---|
| 17. `rows.read` | Prove minimum read scope | Disposable database/table/row; key with only `rows.read` | Get/list rows; attempt write | Reads succeed; write fails scope check | Delete key/resources with separate admin control | Scope list/status; synthetic row only | GO if read-only behavior is exact |
| 18. `rows.write` | Prove minimum write scope | Disposable table; key with only `rows.write` | Create/update/delete row; attempt list/read | Writes succeed as documented; read without `rows.read` fails | Delete key/resources | Operation statuses; synthetic data only | GO if scope boundary is exact |
| 19. Missing row scope | Prove denial | Key with neither row scope | Read and write disposable row | Both fail missing-scope; no mutation occurs | Delete key/resources | Error codes only; synthetic data | GO if denied |
| 20. Unrelated admin denial | Ensure runtime key cannot administer schema/project | Key with four frozen scopes | Attempt list/create/update database/table/index and project operations | All unrelated administration fails | Delete key/resources | Endpoint/status matrix; no production data | GO if all denied |
| 21. No broader runtime scope | Confirm end-to-end row behavior | Key with four frozen scopes; disposable schema pre-created by separate setup authority | Run all intended runtime row reads/writes/permission changes | Normal runtime row flow succeeds; any broader-scope requirement is recorded as failure | Delete artifacts | Exact missing-scope evidence if any; synthetic data | GO only if no broader row/admin scope is needed |

### Storage API scopes

| # / test | Purpose | Preconditions and disposable resources | Exact actions | Expected success / expected failure | Cleanup | Evidence / production-like data | GO / NO-GO |
|---|---|---|---|---|---|---|---|
| 22. `files.read` | Prove minimum file read scope | Disposable private bucket/file; key only `files.read` | Get/download metadata/content; attempt write | Read succeeds; write fails | Delete key/file/bucket with setup authority | Scope/status; synthetic tiny image | GO if exact |
| 23. `files.write` | Prove minimum file write scope | Disposable bucket; key only `files.write` | Upload/update permissions/delete; attempt read | Writes succeed; read without `files.read` fails | Delete artifacts | Operation statuses; synthetic image | GO if exact |
| 24. Missing file scope | Prove denial | Key with no file scopes | Attempt read/upload/update/delete | All fail; no file created/changed | Delete key/bucket | Error codes/counts; synthetic data | GO if denied |
| 25. No broader bucket/project scope | Confirm runtime file behavior | Four-scope key; pre-created bucket | Run intended file lifecycle and permission updates; attempt bucket admin | File lifecycle succeeds; bucket/project admin fails | Delete artifacts | Scope/status matrix; synthetic image | GO only if no bucket/admin scope is needed |

### Row permissions

| # / test | Purpose | Preconditions and disposable resources | Exact actions | Expected success / expected failure | Cleanup | Evidence / production-like data | GO / NO-GO |
|---|---|---|---|---|---|---|---|
| 26. Public visible read | Validate visible row permission | Row security on; empty table permissions; visible row `read(any)` plus staff read | Read unauthenticated | Visible row succeeds | Delete row/table | Permission strings/status; synthetic data | GO if readable |
| 27. Public hidden denial | Validate hidden row privacy | Hidden row with staff read only | Read/list unauthenticated | Direct read denied/not found and list omits row | Delete row | Status/count; synthetic data | GO if no leakage |
| 28. Admin visible read | Validate admin access | Confirmed `[admin]` session; visible row | Read row | Succeeds | Delete artifacts | Status only | GO if succeeds |
| 29. Admin hidden read | Validate admin hidden access | Confirmed `[admin]`; hidden staff-readable row | Read row | Succeeds | Delete artifacts | Status only | GO if succeeds |
| 30. Editor visible read | Validate editor access | Confirmed `[product_editor]`; visible row | Read row | Succeeds | Delete artifacts | Status only | GO if succeeds |
| 31. Editor hidden read | Validate editor hidden access | Confirmed `[product_editor]`; hidden staff-readable row | Read row | Succeeds | Delete artifacts | Status only | GO if succeeds |
| 32. Public mutation denial | Block unauthenticated writes | Empty table create/update/delete; rows expose read only | Attempt create/update/delete client-side unauthenticated | All denied; row unchanged | Delete row/table | Status and final checksum; synthetic data | GO if denied |
| 33. Staff direct mutation denial | Enforce server mediation | Staff sessions; no write permissions | Attempt client create/update/delete | All denied for admin and editor clients | Delete artifacts | Status matrix; synthetic data | GO if denied |
| 34. Server-mediated write | Validate intended path | Authorized server route; four-scope key; mutation test gate explicitly scoped to disposable harness only | Perform validated create/update/delete after role checks | Authorized action succeeds; invalid role/input fails before SDK write | Delete artifacts/key | Sanitized audit/status; synthetic data | GO if success and pre-write denial both hold |

### File permissions

| # / test | Purpose | Preconditions and disposable resources | Exact actions | Expected success / expected failure | Cleanup | Evidence / production-like data | GO / NO-GO |
|---|---|---|---|---|---|---|---|
| 35. Public visible image | Validate visible file read | File security on; empty bucket permissions; file `read(any)` plus staff read | Download/view unauthenticated | Succeeds | Delete file/bucket | Status/MIME/size only; synthetic image | GO if readable |
| 36. Public hidden image denial | Validate hidden file privacy | Staff-readable file without `read(any)` | Attempt unauthenticated view/download | Denied/not found | Delete file | Status only | GO if denied |
| 37. Staff visible image | Validate staff read | Confirmed staff session; visible file | Read file | Succeeds | Delete artifacts | Status only | GO if succeeds |
| 38. Staff hidden image | Validate staff hidden read | Confirmed staff; private file | Read file | Succeeds | Delete artifacts | Status only | GO if succeeds |
| 39. Public file mutation denial | Block unauthenticated file writes | Empty bucket permissions | Attempt upload/update/delete unauthenticated | All denied; count unchanged | Delete bucket | Status/count; synthetic data | GO if denied |
| 40. Staff direct file mutation denial | Enforce server mediation | Staff sessions; files have read only | Attempt client upload/update/delete | All denied | Delete artifacts | Status matrix | GO if denied |
| 41. Server-mediated file write | Validate intended path | Authorized server harness; four-scope key; 1 MB bucket | Upload, change permissions, replace, delete a small synthetic image | Authorized lifecycle succeeds; invalid role/type/size fails | Delete file/key/bucket | Status/MIME/size, no bytes retained | GO if exact and no broader scope needed |

### Visibility compensation

| # / test | Purpose | Preconditions and disposable resources | Exact actions | Expected success / expected failure | Cleanup | Evidence / production-like data | GO / NO-GO |
|---|---|---|---|---|---|---|---|
| 42. Hide happy path | Make row and image private | Public synthetic row/file | Remove public image read, then row read using planned sequence; verify both | Both become publicly inaccessible and staff-readable | Delete artifacts | Permission before/after; synthetic data | GO if atomic outcome from user perspective |
| 43. Row-private failure, image restore success | Validate compensation | Inject row-permission failure after image private | Make image private; force row update fail; restore image public | Operation reports failure; both remain public; no mixed state | Remove fault/artifacts | Step/status/permissions | GO if restoration succeeds and state is consistent |
| 44. Row-private failure, image restore failure | Prove fail-closed escalation | Inject row failure and restoration failure | Make image private; fail row; fail restore | Result must not expose hidden content: row may remain public but image stays private; alert/manual-repair marker emitted | Repair via authorized cleanup; delete artifacts | Redacted failure chain | GO only if state is fail-closed and repairable |
| 45. Show happy path | Make row and image public safely | Private row/file | Apply planned sequence and verify both | Both public only after complete success | Delete artifacts | Permission transitions | GO if no premature row exposure |
| 46. Image-public failure, row revert | Compensate show failure | Inject image permission failure after row public | Make row public; force image public fail; revert row hidden | Final row and image both private; operation fails | Remove fault/artifacts | Step/status/permissions | GO if row reliably reverts |
| 47. All failures fail closed | Exhaust failure boundaries | Fault injection at each network/SDK/timeout step | Run hide/show with each injected failure; read as public and staff | No hidden row/image becomes public unintentionally; ambiguous states deny public | Repair/delete artifacts | Matrix of final visibility only | GO if every case fails closed |

### Transactions and selected-product invariant

| # / test | Purpose | Preconditions and disposable resources | Exact actions | Expected success / expected failure | Cleanup | Evidence / production-like data | GO / NO-GO |
|---|---|---|---|---|---|---|---|
| 48. Transaction capability | Prove required row operations | Disposable products table and key/session candidates | Create transaction; stage create/update/delete; read staged state; commit and rollback variants | Commit applies all; rollback applies none; unsupported call fails without partial write | Delete rows/table/key | Transaction status/op counts | GO if required operations are atomic |
| 49. Unique-index behavior | Prove uniqueness semantics | `chosenSelectionKey` unique index | Insert distinct values, then duplicate value | Distinct succeed; duplicate rejected without corrupting prior row | Delete rows/table | Index/status only | GO if deterministic |
| 50. Row ID during creation | Prove provisional unselected value | Known custom Appwrite row ID | Create row with `chosenSelectionKey` equal to its row ID, preferably staged | Row is created with exact matching value; failure leaves no row | Delete row | Hashed ID/equality boolean | GO if safe and deterministic |
| 51. Select one | Establish `current` | Two unselected rows keyed to own IDs | Transactionally set one row to `current` | Exactly one selected; other unchanged | Delete rows | Aggregate selected count | GO if count is one |
| 52. Atomic switch | Move selection | A=`current`, B=own ID | In one transaction set A=own ID then B=`current`; commit | Exactly B selected; transaction failure changes neither | Delete rows | Before/after aggregate | GO if atomic |
| 53. Simultaneous selection | Test concurrency | Two unselected rows; synchronized clients | Submit competing selection transactions simultaneously | At most one commits; loser conflicts/unique-fails; final count ≤1 | Delete rows | Outcomes and final count | GO if never duplicates |
| 54. Retry behavior | Validate safe conflict retry | Induced conflict from test 53; idempotency/request ID design | Retry loser after refetch under defined policy | Retry produces one intended final selection without duplicate side effects | Delete rows | Attempt count/final selected hash | GO if bounded and idempotent |
| 55. Partial failure | Prove no partial invariant change | Fault one staged operation/commit | Stage switch with invalid second operation; commit | Entire transaction fails; original selection remains | Delete rows | Transaction status/final aggregate | GO if no partial state |
| 56. Duplicate `current` prevention | Directly challenge unique index | One row already `current` | Attempt second row `current` outside and inside transaction | Both attempts rejected; first unchanged | Delete rows | Error class/count | GO if duplicates impossible |
| 57. No selected product | Validate allowed empty state | All rows own-ID keys | Query selection and run storefront fallback | Zero selected handled safely; no arbitrary row silently promoted | Delete rows | Selected count/result state | GO if supported or explicit requirement revision made |
| 58. Delete selected product | Define deletion semantics | One selected row | Attempt authorized delete under proposed transaction/guard | Either transaction deletes safely leaving zero or denial requires deselect; no stale `current` | Delete remaining rows | Final selected count | GO only with explicit deterministic rule |
| 59. Hidden selected product | Prevent hidden promotion | Selected visible row | Hide selected row using planned visibility flow | Selection is cleared/switched atomically or storefront excludes it; hidden content never shown | Delete rows/files | Visibility/selected aggregates | GO if hidden selection cannot leak |
| 60. Rollback behavior | Prove explicit rollback | Staged multi-row switch | Inspect staged state, invoke rollback, read persisted rows | Persisted state unchanged; transaction closed/unusable | Delete rows/table | Transaction status/final hashes | GO if rollback is complete |

## 12. Blockers

1. No authenticated Console/API inventory; every live resource classification remains unknown.
2. Public-signup prevention while email/password login remains enabled is not proven.
3. The separate auth-key design is not yet proven; official SSR guidance identifies `sessions.write`, while the four-scope data/runtime key must remain unchanged.
4. No live provider, platform, Team, user, database, table, bucket, or key metadata has been captured.
5. The final Console-compatible product slug length (`160` or `191`) remains unresolved.
6. Row/file permission behavior and visibility compensation remain untested.
7. Password establishment through recovery without administrator-known passwords remains untested.
8. `chosenSelectionKey` remains provisional until all relevant transaction/concurrency tests pass.

## 13. Risks

- Creating fixed IDs before inventory could collide with incompatible resources.
- Treating Team `owner` as application `admin` would create privilege escalation.
- Granting public table/bucket read would defeat hidden row/file privacy because Appwrite permissions are additive.
- A broad API key would bypass intended client permission boundaries.
- Hiding signup UI without backend enforcement could allow direct public account creation.
- Row/file visibility can drift on partial failure without verified compensation.
- Concurrent selection requests can violate business intent unless transaction and unique-index behavior is proven.
- Screenshots of Auth/Users/Teams/API keys can expose personal or secret data if not tightly cropped and redacted.

## 14. Consolidated Appwrite Console capture checklist

Complete this once, in navigation order. Record text where possible. Never copy API-key secret values, passwords, recovery tokens, session cookies, private keys, personal user lists, or private file names. Crop screenshots to the requested fields, redact unrelated users/members, and prefer aggregate counts.

1. **Project selector / Settings / General**
   - Project ID, project name, endpoint, and region.
   - Confirm this is the existing `watapp` project in Frankfurt.
2. **Project Settings / Platforms**
   - Every active Web platform name and hostname; include localhost status.
   - Do not include platform secrets if any are displayed.
3. **Auth / Settings or Login methods**
   - Enabled/disabled state of email/password, Google, and every other method.
   - Any control describing registration/signup availability.
4. **Auth / Security and Templates**
   - Session duration/invalidation, email/password policies, recovery template/configuration, and relevant allowed redirect/platform requirements.
   - Do not copy message secrets or recovery links.
5. **Auth / Users**
   - Total count and whether any users exist.
   - For only the four planned staff emails, answer exists/not found and active/disabled where shown.
   - Do not capture unrelated users, full records, sessions, passwords, phone numbers, IPs, or activity logs.
6. **Auth / Teams**
   - For every Team: ID, name, aggregate membership count, and aggregate role labels.
   - For `wat_staff`: collision/existence, defined roles, and whether memberships are confirmed in aggregate.
   - Redact unrelated names/emails; do not copy invitation links or secrets.
7. **Databases**
   - Every database ID/name and region if shown.
   - For `wat_app`, list every table ID/name.
8. **Each matching table / Settings, Columns, Indexes**
   - Enabled state, row security, exact table permissions, every column key/type/required/default/size/enum, and every index key/type/columns/order.
   - Capture `products`, `categories`, `activity_logs`, `analytics_events`, and `broadcasts`. Do not create or search for an Appwrite `team_contacts` table as part of the target architecture; legacy Firebase handling is deferred.
   - Do not list or screenshot row data.
9. **Storage**
   - Every bucket ID/name.
   - For `product_images`: enabled/file-security state, bucket permissions, maximum size, extensions/MIME restrictions, compression, encryption, antivirus, transformations, and aggregate file count if shown without listing files.
   - Do not list private file names or preview/download files.
10. **Project Settings / Integrations / API keys**
    - For every key: name, ID, scopes, expiry, and creation/active state if shown.
    - **Never copy, reveal, regenerate, or screenshot the key secret.**
    - Flag any scope beyond `rows.read`, `rows.write`, `files.read`, and `files.write`; separately note whether a session-specific key exists with `sessions.write` without exposing its secret.

Return the capture as one redacted bundle. Do not create or change anything while capturing it.

## 15. GO / NO-GO decision

**Phase 3I planning and owner-assisted Console capture: GO WITH FINDINGS.** The resolved five-table architecture and substantially defined schema support continuing read-only discovery.

**Migration creation/testing decision: NO-GO.** Do not create resources, users, keys, schemas, or runtime code until the consolidated Console capture is completed and reviewed, fixed-resource collisions are classified, and the relevant signup, SSR-key, permission, recovery, visibility, and transaction assumptions are approved for isolated testing.

## 16. Next safest recommended phase

Phase 3J should be a read-only, owner-assisted Console inventory classification using the single checklist above. It should populate this report's unknowns, classify each collision as reusable / adjustable / conflicting / missing, and recommend only a minimal disposable capability-test phase for later approval. It must not create production-like resources or users.

## 17. Exact files changed

- Added `APPWRITE-CONSOLE-INVENTORY-PHASE-3I.md` only.
- Did not update `appwrite-migration-handoff.md` because no live-project fact was verified and its schema conflict requires an explicit authoritative decision.

## 18. Commands run

- Read-only Git branch, status, upstream, ahead/behind, commit, remote, history, required-file, and ignored-sensitive-filename checks.
- Read-only file inspection of all sources required by Phase 3I.
- Read-only repository searches for Appwrite metadata, fixed IDs, schema terms, and dependency/CLI presence.
- Process-environment **name-only** inspection for `APPWRITE*` and `WAT_MUTATIONS_ENABLED`; no values were printed.
- Official Appwrite documentation searches and reads on `appwrite.io` only.
- No Appwrite CLI/API/Console call, Firebase inventory, live-service test, deployment, or mutation command.

## 19. Verification results

- Documentation-only scope: verified; the report is the sole untracked workspace change.
- Detailed matrix: verified as 60 unique rows numbered 1 through 60.
- Secret-like value review: passed; no private key marker, bearer token, Appwrite key value, or service-account filename was added. Planned staff emails are intentionally included because they were supplied as in-scope identities.
- Source/configuration changes: none.
- Lint/typecheck/build: not required if final diff remains Markdown-only.
- Live Firebase inventory: not run.
- Mutation-enabled live tests: not run.

## 20. Final Git state

- Branch: `appwrite-migration`
- HEAD: `71029677caf05ac361596dc0fed6c750540a0cf6`
- Upstream: `origin/appwrite-migration`, ahead/behind `0/0`
- Local and remote `main`: unchanged at `83616bfd67534fdd090459230b373f23633bc81d`
- Working tree: one untracked intended file, `APPWRITE-CONSOLE-INVENTORY-PHASE-3I.md`; no modified or staged files
- Commit/push: Phase 3I-D explicitly authorizes the repository-required lint and the bounded documentation commit; final commit and synchronization are reported in the Phase 3I-D handoff.
