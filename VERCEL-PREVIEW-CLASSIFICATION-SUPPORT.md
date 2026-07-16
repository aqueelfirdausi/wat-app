# First deployment of non-production Git branch is forced to Production despite documented Preview semantics

## Expected behavior

Creating a deployment from the non-production Git branch `appwrite-migration` with the REST deployment `target` omitted should create a Preview deployment. The project production branch is `main`, and no custom environment or branch mapping changes that classification.

## Actual behavior

The empty project's first controlled deployment was classified as Production. The deployment creation response, an independent deployment lookup, and the deployment's OIDC environment all reported `production`, even though the source branch was `appwrite-migration` and the REST request omitted `target`.

## Business impact

Migration preview work is paused. The owner cannot safely bootstrap the project's first Preview deployment without risking an unapproved Production deployment. No bootstrap Production deployment is permitted.

## Project, team, and source identifiers

- Project name: `wat-app-preview`
- Project ID: `prj_dpu5BIsP0EyCY9sKf5TMhgZSosVs`
- Team ID: `team_9U0AhvG9gBBoNYANNqIw3JQZ`
- Team slug: `aqueel-ahmed-firdausis-projects`
- Git repository: `aqueelfirdausi/wat-app`
- Source branch: `appwrite-migration`
- Source SHA: `520d6e9a29bb279475256f535dabc1df874eecd6`
- Failed deployment ID: `dpl_Dqz1TiJJT5wKnxW3A2qCduJtTmHW`
- Approximate attempt time: 2026-07-17 02:24 PKT
- Vercel CLI version: not captured during the earlier CLI attempts; the CLI was not installed in the package-preparation environment, so no unsupported version claim is included.

## Production branch and environment configuration

- Configured Production branch: `main`
- Intended Preview branch: `appwrite-migration`
- Custom environments: none
- Branch-to-environment mappings: none
- Custom domains: none
- Retained deployments before and after cleanup: zero
- Project state before the attempt: no prior deployments (`hasDeployments=false`)

## Sanitized REST request structure

The controlled request followed the documented Git-source deployment structure. Authentication headers and all secret values are omitted.

```http
POST /v13/deployments?teamId=<team-id>
Content-Type: application/json
Authorization: Bearer <redacted>

{
  "name": "wat-app-preview",
  "project": "<project-id>",
  "gitSource": {
    "type": "github",
    "repoId": "<repository-id-redacted>",
    "ref": "appwrite-migration",
    "sha": "520d6e9a29bb279475256f535dabc1df874eecd6"
  }
}
```

The `target` property was deliberately omitted to request normal Preview semantics.

## Sanitized evidence

### Creation response

The creation response returned deployment ID `dpl_Dqz1TiJJT5wKnxW3A2qCduJtTmHW` with `target: "production"`. No response token, environment value, URL, or credential is included here.

### Independent lookup

A separate lookup of the deployment ID also returned `target: "production"`. This ruled out classification being only a creation-response display issue.

### OIDC environment

The deployment metadata reported the OIDC environment as `production`, independently matching the creation and lookup classification.

### Deletion and cleanup

The deployment was deleted while still `INITIALIZING`. A post-delete lookup returned HTTP 404. No deployment URL was visited, no runtime request was made, no custom domain was attached, and the project again had zero retained deployments.

## Previous methods tested

The following approaches were tried before the pause. None produced a safe retained Preview deployment:

1. Git-source API deployment.
2. Plain CLI deployment.
3. Explicit Preview target.
4. Custom staging attempt.
5. Documented REST request with `target` omitted.

## Configuration causes already ruled out

- The source branch was not the configured Production branch.
- The source SHA and branch were explicit and matched the intended migration commit.
- The final REST request did not request a Production target.
- No custom environment existed.
- No branch mapping existed.
- No custom domain existed.
- No prior retained deployment could have supplied an existing Production alias or promotion state.
- Independent target and OIDC metadata agreed, so this was not only a UI label issue.

## Minimal reproduction

1. Start with a Vercel project whose Production branch is `main`, with no custom environments, branch mappings, domains, or retained deployments.
2. Select a different Git branch, such as `appwrite-migration`, and its exact SHA.
3. Call `POST /v13/deployments` with the project and Git source fields, omitting `target`.
4. Inspect the creation response's target.
5. Independently retrieve the deployment by ID and inspect both its target and OIDC environment.
6. Observe that all three are `production` rather than Preview.
7. Delete the initializing deployment before visiting its URL or sending runtime traffic.

## Questions for Vercel Support

- Why is an omitted deployment target being converted to Production for this project?
- Is there an undocumented first-deployment bootstrap rule?
- Can Vercel reset or correct the project's deployment target state without creating a Production deployment?
- Is this behavior specific to projects with `hasDeployments=false`?
- Is there an API or project flag that guarantees the first deployment is Preview?
- Can Support confirm whether this is expected behavior or a platform defect?

Please inspect why an empty project's first deployment overrides documented Preview semantics. The project must remain dormant until Support provides a safe path that does not create a bootstrap Production deployment.

## Security note

This package contains no tokens, cookies, secrets, environment-variable values, Firebase API values or credentials, Appwrite credentials, service-account contents, full deployment URLs, or private local paths.
