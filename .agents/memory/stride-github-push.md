---
name: Stride GitHub push
description: How to push this whole project to GitHub and why a plain connector token fails.
---

# Pushing the Stride project to GitHub

The repo tracks `.github/workflows/*.yml` (slack-failure-digest.yml, sync-to-github.yml).
GitHub rejects a push **atomically** if the credential lacks the `workflow` OAuth scope —
so the entire push fails (not just those files) with a workflow-scope error.

**Rule:** to push this project you need a classic Personal Access Token with **both `repo`
and `workflow`** scopes. The installed GitHub *connector* token only has `repo` (no
`workflow`), so it cannot push this repo as-is.

**Why:** removing the 2 workflow files to use the connector would (a) make the upload
non-identical and (b) require a `git commit`, which is policy-restricted for the agent.
A PAT avoids any commit — just push the existing HEAD.

**How to apply:**
- Account/owner: `ciskybs-QRCode` (type User).
- Secret name in this repl: `GITHUB_PAT`.
- Git over HTTPS requires **Basic auth**, not Bearer.
  `git -c http.extraheader="Authorization: Basic $(printf "ciskybs-QRCode:$GITHUB_PAT" | base64 -w 0)" push https://github.com/ciskybs-QRCode/StrideApp14052026.git HEAD:main`
- `Bearer $GITHUB_PAT` is rejected by GitHub git endpoints (returns "invalid credentials").
  Only the REST API accepts Bearer; git transport needs Basic.
- Verify alignment: `git ls-remote <url> refs/heads/main` SHA must equal `git rev-parse HEAD`.
- A newly-added secret with the **same key** may read stale in the running shell; using a
  **new key name** sidesteps the staleness.
