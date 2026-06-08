---
name: Stride marketplace guard scope
description: Express router.use() without a path prefix in a sub-router acts as a catch-all interceptor for ALL requests — scope feature-flag guards with a path prefix.
---

## Rule
Never use `router.use(guardFn)` (no path) as a feature-flag gate in a sub-router that is mounted without a path prefix in the parent router (`mainRouter.use(subRouter)`). The guard intercepts every request passing through the parent, not just routes in the sub-router.

**Why:** When `mainRouter.use(subRouter)` mounts the sub-router without a path, all requests reach it. `router.use(fn)` inside the sub-router matches `/` (i.e. everything), so the guard runs for all paths — including routes registered in later sub-routers.

**How to apply:** Always scope feature-flag middleware with a path prefix that matches the feature's routes:
```ts
// WRONG — intercepts /regional-pricing, /billing, everything else
router.use(async (req, res, next) => { if (!enabled) return res.status(404)...; next(); });

// CORRECT — only intercepts /marketplace/* paths
router.use("/marketplace", async (req, res, next) => { if (!enabled) return res.status(404)...; next(); });
```

The marketplace guard bug caused `GET /regional-pricing` to return 404 even though the route was properly registered, because `marketplaceRouter` was registered before `regionalPricingRouter` and its unscoped `router.use()` guard was blocking all subsequent routes.
