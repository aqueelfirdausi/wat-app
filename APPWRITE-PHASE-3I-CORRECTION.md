# Phase 3I-D — Authoritative Appwrite Schema Resolution Record

## 1. Phase result

**PASS WITH FINDINGS.** The owner explicitly resolved the permanent-table conflict and supplied the authoritative schema, permission, visibility, authentication, and API-key decisions. Documentation and owner-assisted read-only Console capture are GO. Appwrite resource creation and live capability testing remain NO-GO until the Console capture is completed and reviewed.

## 2. Starting Git state

| Check | Result |
|---|---|
| Branch | `appwrite-migration` |
| HEAD / upstream | `71029677caf05ac361596dc0fed6c750540a0cf6` |
| Ahead / behind | `0 / 0` |
| Working tree | Two intended untracked reports; no modified or staged tracked files |
| Local / remote `main` | `83616bfd67534fdd090459230b373f23633bc81d` |

## 3. Documents and history inspected

- Current `appwrite-migration-handoff.md`, `AGENTS.md`, `CLAUDE.md`, and both Phase 3I reports.
- Repository-wide current searches for `team_contacts`, `broadcasts`, permanent-table language, and all fixed IDs.
- `main`, `stage-5`, `origin/archive/stage-5-pre-appwrite`, and relevant Git history including handoff commit `b8870f4`.
- Official [Appwrite API-key scopes](https://appwrite.io/docs/advanced/security/api-keys) and [SSR login guidance](https://appwrite.io/docs/products/auth/server-side-rendering).
- The explicit Phase 3I-D owner decisions, which supersede the stale handoff table list.

## 4. `team_contacts` findings and final treatment

| Location | Classification | Final treatment |
|---|---|---|
| Former handoff permanent-table list | Stale Appwrite architecture, corrected in Phase 3I-D | Removed from the permanent Appwrite list |
| `CLAUDE.md` Firestore collection list | Current legacy Firebase functionality | Leave untouched; not an Appwrite table |
| `scripts/seed-demo.mjs` | Current legacy Firebase functionality | Leave code and data untouched |
| `stage-5` and archive documentation | Historical/archive-only Firebase material | No migration authority; do not merge or cherry-pick |
| Phase 3I reports | Historical conflict analysis | Updated to record the owner resolution |

Firebase `team_contacts` must not be deleted, migrated, or recreated in Appwrite during the current architecture. Its future treatment is deferred to a separately authorized bounded product decision.

## 5. Authoritative permanent tables

The resolved list is exactly:

1. `products`
2. `categories`
3. `activity_logs`
4. `analytics_events`
5. `broadcasts`

No sixth permanent table, Appwrite `team_contacts`, tenants table, `shopId`, `tenantId`, or multi-tenant architecture is approved. The fixed IDs remain database `wat_app`, Team `wat_staff`, and bucket `product_images`.

## 6. Authority analysis

Phase 3I-C correctly found that the then-current handoff listed `team_contacts`. Phase 3I-D supplies the missing explicit owner decision and authorizes incorporating the replacement into the handoff. The updated handoff is now the highest repository authority and supersedes the stale list. Current Firebase implementation remains evidence of legacy functionality only and does not add Appwrite tables.

## 7. Phase 3I statements corrected

- Removed `team_contacts` versus `broadcasts` as an unresolved architecture conflict.
- Recorded `broadcasts` as the fifth permanent Appwrite table.
- Classified Firebase `team_contacts` as legacy, untouched, and deferred.
- Replaced the broad incomplete-schema claim with “substantially defined and authoritative, with limited Console-compatibility and capability questions.”
- Clarified that the four-scope data/runtime key remains unchanged and `sessions.write` is a separate narrowly scoped auth/session key candidate.
- Changed documentation and owner-assisted read-only Console capture to GO while retaining NO-GO for creation and live testing.

## 8. Phase 3I statements retained

- Authenticated Appwrite Console inventory remains unavailable.
- Project ID, endpoint, platforms, provider states, users, Teams, databases, tables, bucket settings, API-key metadata, and fixed-resource collisions remain unverified.
- Public-signup prevention remains unproven.
- Password establishment through recovery without an administrator-known password remains untested.
- Permission behavior, visibility compensation, and `chosenSelectionKey` transaction/concurrency behavior remain untested.
- Firebase remains authoritative; Vercel remains dormant; no live inventory or platform mutation occurred.

## 9. Schema completeness reassessment

**Classification: substantially defined and authoritative, with limited unresolved compatibility and capability questions.**

The handoff now contains:

- Exact five-table and fixed-resource IDs.
- Approved and rejected product fields, product defaults/enums, and product indexes.
- Approved category, activity-log, analytics, and broadcast fields, indexes, and write boundaries.
- Product row and image file permission models.
- Fail-closed hide/show compensation order.
- Authentication and exact application-role rules.
- Data/runtime and candidate authentication/session key separation.

Remaining schema questions are limited to:

- Final Appwrite Console-compatible product slug varchar length (`160` or `191`).
- Exact Console-compatible types/limits for fields whose type or length was not explicitly frozen.
- Live Console compatibility of the approved indexes and permissions.
- Capability tests for permissions, transactions, concurrency, recovery provisioning, signup prevention, and compensation.

## 10. API-key scope clarification

The data/runtime key remains limited to:

- `rows.read`
- `rows.write`
- `files.read`
- `files.write`

Current official SSR guidance identifies `sessions.write` for server-side session creation. It is recorded as a separate, narrowly scoped authentication/session key candidate. Neither key may be created, combined, or broadened without isolated testing and explicit approval. Live-project requirements are **Needs verification**, and key secrets must never be documented.

## 11. Remaining genuine blockers

1. Authenticated Appwrite Console inventory has not been captured or reviewed.
2. Fixed-resource collisions and live project/provider/platform settings are unknown.
3. Final slug length and other Console-specific type/limit compatibility remain unresolved.
4. Public-signup prevention and the separate SSR auth-key design are untested.
5. Password establishment through recovery is untested.
6. Row/file permissions and visibility compensation are untested.
7. `chosenSelectionKey` transaction, uniqueness, retry, and concurrency behavior remains provisional.

## 12. Files changed

- `appwrite-migration-handoff.md`
- `APPWRITE-CONSOLE-INVENTORY-PHASE-3I.md`
- `APPWRITE-PHASE-3I-CORRECTION.md`

`AGENTS.md` was not changed because it delegates the exact five-table definition to the handoff and does not repeat the stale list.

## 13. Verification performed

- Repository-wide current and historical searches for `team_contacts`, `broadcasts`, permanent tables, and `chosenSelectionKey`.
- Cross-document five-table consistency check.
- Complete Markdown diff inspection.
- Secret-pattern and whitespace checks.
- Scope check confirming no source, configuration, script, test, dependency, environment, deployment, or `AGENTS.md` change.
- The exact repository-required lint command, explicitly authorized by Phase 3I-D.
- No live Firebase inventory, Appwrite API/CLI/Console mutation, Vercel command, deployment, typecheck, or build.

## 14. Commit and push

The intended documentation commit message is `Resolve authoritative Appwrite schema`, pushed only to `origin/appwrite-migration`. The resulting commit and remote synchronization are reported in the Phase 3I-D final response because a commit cannot embed its own final SHA.

## 15. Final Git state

Post-commit and post-push branch, remote, ahead/behind, clean-worktree, and unchanged-`main` verification are reported in the Phase 3I-D final response.

## 16. Next safest step

Perform the already-prepared owner-assisted, read-only Appwrite Console capture. Review and classify every live fixed-resource collision and remaining compatibility question before authorizing any disposable capability test or resource creation.
