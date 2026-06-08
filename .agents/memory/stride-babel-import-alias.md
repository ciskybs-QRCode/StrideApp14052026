---
name: Stride Babel import alias collision
description: Babel/Metro registers the original imported name in scope even when aliased, causing Duplicate declaration if a local function shares that name.
---

## Rule

When you write `import { foo as bar } from "./module"` in a file that **also** declares a local function named `foo`, Babel/Metro throws:

```
TransformError: Duplicate declaration "foo"
```

TypeScript does NOT catch this — `tsc --noEmit` passes cleanly. The error only appears at Metro bundle time.

**Why:** Babel's scope analysis registers both the alias target (`bar`) AND the original binding name (`foo`) internally, then sees the function declaration as a re-declaration.

## How to apply

Always rename the local function to something distinct when the export name from an imported module would collide:

```typescript
// BAD — Babel collision
import { registerPushToken as apiToken } from "./api";
export async function registerPushToken() { ... }  // ← "Duplicate declaration"

// GOOD — distinct local name
import { registerPushToken as apiRegisterToken } from "./api";
export async function registerDevicePushToken() { ... }  // ← no collision
```

Update all callers of the renamed function accordingly.
