---
name: XDIGITEX stack decisions
description: Build quirks and decisions for the XDIGITEX AI platform
---

## zod/v4 subpath in api-server
esbuild cannot resolve `zod/v4` subpath export when bundling the api-server artifact.
**Why:** esbuild doesn't support package.json `exports` subpath resolution for `zod/v4` at the version in use.
**How to apply:** Always import `from "zod"` (not `"zod/v4"`) in `artifacts/api-server/src/routes/*.ts`. The Zod v4 API is identical on the bare `"zod"` import in the installed version.

## wouter Link nesting
In wouter, `<Link>` renders a native `<a>` tag. Do NOT nest another `<a>` inside it. Pass `className` directly to `<Link>` instead.
**Why:** Nested `<a>` tags are invalid HTML and cause React hydration warnings.
**How to apply:** `<Link href="..." className="...">content</Link>` — no inner `<a>`.
