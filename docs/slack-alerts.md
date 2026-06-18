# Slack Alerts for Sync Failures

The sync workflow posts a Slack message whenever a push to the target GitHub repository fails.

## Required secret

| Secret | Where to set it | What it contains |
|--------|----------------|-----------------|
| `SLACK_WEBHOOK_URL` | **Settings → Secrets and variables → Actions → Secrets** | The full Incoming Webhook URL from Slack (e.g. `https://hooks.slack.com/services/T.../B.../...`) |

### Creating the webhook

1. Go to your Slack workspace's [App Directory](https://api.slack.com/apps) and open (or create) an app.
2. Under **Incoming Webhooks**, enable the feature and click **Add New Webhook to Workspace**.
3. Pick the default channel for this webhook and click **Allow**.
4. Copy the generated webhook URL and save it as the `SLACK_WEBHOOK_URL` secret in this repository.

### Rotating the webhook

If a webhook URL is ever exposed or needs to be replaced:

1. In Slack, open the same app → **Incoming Webhooks** → revoke the old webhook.
2. Create a new webhook (same steps as above).
3. In GitHub, go to **Settings → Secrets and variables → Actions → Secrets**, edit `SLACK_WEBHOOK_URL`, and paste the new URL.
4. The next workflow run will automatically use the new webhook.

## Enforcing a hard failure when the webhook is missing

By default, the preflight step emits a **warning** when `SLACK_WEBHOOK_URL` is absent and lets the rest of the run proceed. If your team requires Slack alerts to be active on every run, you can turn the missing-webhook warning into a **hard failure** by setting a repository variable:

| Variable | Where to set it | Values |
|----------|----------------|--------|
| `REQUIRE_SLACK_WEBHOOK` | **Settings → Secrets and variables → Actions → Variables** | `true` to fail the run; omit or set to anything else to keep the default warning behaviour |

When `REQUIRE_SLACK_WEBHOOK` is `true` and `SLACK_WEBHOOK_URL` is not configured, the preflight step calls `core.setFailed()` and the entire workflow stops immediately with a clear error message — no further steps run. This catches a misconfigured or missing secret at the very start of the run rather than silently skipping every notification.

**Mode summary:**

| `REQUIRE_SLACK_WEBHOOK` | `SLACK_WEBHOOK_URL` present | Behaviour |
|------------------------|----------------------------|-----------|
| not set / `false` | ✅ yes | Normal run, Slack alerts active |
| not set / `false` | ❌ no | Yellow warning annotation, run continues |
| `true` | ✅ yes | Normal run, Slack alerts active |
| `true` | ❌ no | Run fails immediately at the preflight step |

## Changing the target channel

By default, alerts go to whichever channel the webhook was created for. You can override this **without rotating the webhook** by setting a repository variable:

| Variable | Where to set it | Example value |
|----------|----------------|---------------|
| `SLACK_ALERT_CHANNEL` | **Settings → Secrets and variables → Actions → Variables** | `#ci-alerts` |

When `SLACK_ALERT_CHANNEL` is set, the `channel` field in the Slack payload overrides the webhook's default channel. When it is left empty or unset, Slack falls back to the channel the webhook was originally configured for.

> **Note:** Channel overrides only work for [legacy Incoming Webhooks](https://api.slack.com/messaging/webhooks) created before 2018, and for some Slack plans. If the override is silently ignored, re-create the webhook pointing at the desired channel and leave `SLACK_ALERT_CHANNEL` unset.

## What the alerts look like

### Failure alert (first occurrence)

```
🔴 Sync to GitHub failed — run #42
Commit: `a1b2c3d`
Actor: @your-username
View failed run →
```

A GitHub issue labelled `sync-failure` is also opened automatically. Subsequent failures on the same open issue post a quieter "still failing" retry notice instead of a fresh alert.

### Recovery notification

When a successful run closes one or more open `sync-failure` issues, a recovery message is posted:

```
✅ Sync recovered — 1 issue resolved (run #43)
Commit: `e5f6g7h` · Actor: @your-username
Resolved issue:
• #17
View run →
```

The message lists every issue number that was auto-closed and links to the resolving run. It is sent once per successful run that closes at least one issue — if no issues were open, no recovery message is sent.

A GitHub issue is also opened (or updated) automatically in the same run — see the "Notify on failure" and "Notify Slack on sync recovery" steps in `.github/workflows/sync-to-github.yml`.
