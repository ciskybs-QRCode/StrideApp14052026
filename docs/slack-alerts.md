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

## Changing the target channel

By default, alerts go to whichever channel the webhook was created for. You can override this **without rotating the webhook** by setting a repository variable:

| Variable | Where to set it | Example value |
|----------|----------------|---------------|
| `SLACK_ALERT_CHANNEL` | **Settings → Secrets and variables → Actions → Variables** | `#ci-alerts` |

When `SLACK_ALERT_CHANNEL` is set, the `channel` field in the Slack payload overrides the webhook's default channel. When it is left empty or unset, Slack falls back to the channel the webhook was originally configured for.

> **Note:** Channel overrides only work for [legacy Incoming Webhooks](https://api.slack.com/messaging/webhooks) created before 2018, and for some Slack plans. If the override is silently ignored, re-create the webhook pointing at the desired channel and leave `SLACK_ALERT_CHANNEL` unset.

## What the alert looks like

```
🔴 Sync to GitHub failed — run #42
Commit: `a1b2c3d`
Actor: @your-username
View failed run →
```

A GitHub issue is also opened (or updated) automatically in the same run — see the "Notify on failure" step in `.github/workflows/sync-to-github.yml`.
