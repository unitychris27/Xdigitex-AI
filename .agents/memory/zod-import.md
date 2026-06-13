---
name: Zod import in api-server
description: Always import from "zod" not "zod/v4" in api-server routes
---

## Rule
In `artifacts/api-server`, always use `import { z } from "zod"`. The `zod/v4` subpath import fails during esbuild bundling.

**Why:** esbuild doesn't resolve `zod/v4` subpath exports correctly in this workspace setup.

**How to apply:** Any new api-server route or lib file that needs Zod must use the root `"zod"` import.
