# Issue Dashboard Filters

The sync workflow automatically labels issues it closes with `auto-resolved`, making it
easy to distinguish automation-driven closures from issues closed by hand.

## Saved search URLs

Replace `OWNER/REPO` with this repository's owner and name (e.g. `ciskybs-QRCode/StrideApp14052026`).

### Auto-resolved — closed by automation

Issues that were closed automatically by a successful workflow run:

```
https://github.com/OWNER/REPO/issues?q=label%3Aauto-resolved+is%3Aclosed
```

Equivalent issue search query:

```
label:auto-resolved is:closed
```

### Manually closed — no automation involvement

Sync-failure issues that were closed by a person (not labelled `auto-resolved`):

```
https://github.com/OWNER/REPO/issues?q=label%3Async-failure+-label%3Aauto-resolved+is%3Aclosed
```

Equivalent issue search query:

```
label:sync-failure -label:auto-resolved is:closed
```

### All sync-failure issues (open or closed)

```
https://github.com/OWNER/REPO/issues?q=label%3Async-failure
```

## How labels are applied

| Label | Applied by | Meaning |
|-------|-----------|---------|
| `sync-failure` | "Notify on failure" step | Opened on every new sync failure |
| `auto-resolved` | "Close sync-failure issues on success" step | Added immediately before auto-closing |

Because `auto-resolved` is applied before the issue is closed, it appears in the issue
timeline and is visible in any export or audit log.

## Auditing automation recovery rate

Use the two filters above to compare totals:

- **auto-resolved count** — how often the workflow recovered without human action
- **manually closed count** — how often a person had to intervene

A high auto-resolved ratio means the failure causes (expired PAT, transient network
errors) are short-lived and self-healing. A high manually-closed ratio suggests
recurring root causes worth investigating.
