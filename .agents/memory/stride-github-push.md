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
- Working secret name used: `GITHUB_PERSONAL_ACCESS_TOKEN` (the older `GITHUB_PAT` value was invalid / Bad credentials).
- Verify a token before pushing: `curl -H "Authorization: Bearer $TOKEN" https://api.github.com/user`
  and check the `x-oauth-scopes` response header for `repo, workflow`.
- Push without persisting credentials (no remote added):
  `git push https://x-access-token:$TOKEN@github.com/<owner>/<repo>.git HEAD:main`
  and pipe through `sed "s/$TOKEN/REDACTED/g"` so the token never appears in logs.
- A newly-added secret with the **same key** may read stale in the running shell; using a
  **new key name** (as here) sidesteps the staleness.
