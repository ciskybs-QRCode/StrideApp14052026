---
name: Stride landing Wouter base path
description: How to configure Wouter routing when Vite is set with a non-root BASE_PATH
---

## The Rule
Always wrap `<Switch>` in `<Router base={...}>` when the Vite config uses a non-root `basePath`.

```tsx
const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
return (
  <Router base={base}>
    <Switch>...</Switch>
  </Router>
);
```

**Why:** Vite sets `import.meta.env.BASE_URL` to the configured `BASE_PATH` (e.g. `/landing/`). Without `Router base`, Wouter matches against the full pathname `/landing/contact` and every sub-route falls through to the catch-all `<Route component={Landing} />`.

**How to apply:** Any time a new route is added to `artifacts/stride-landing/src/App.tsx`, ensure the `Router base` wrapper is present. `BASE_URL` already includes a trailing slash, so strip it before passing to Wouter.
