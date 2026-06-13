---
name: Wouter Link nesting
description: Wouter's Link renders as <a> — never nest another <a> inside it
---

## Rule
In Wouter, `<Link>` renders an `<a>` tag. Never put `<a>` inside `<Link>`. Pass `className` directly on `<Link>` (it forwards it to the `<a>`).

**Why:** Nested `<a>` tags are invalid HTML and cause Babel/React parser errors — specifically "Expected corresponding JSX closing tag" errors in Vite.

**How to apply:**
- Card wrapped in a link: `<Link href="/foo" className="block"><Card>...</Card></Link>` — no inner `<a>`
- Remove any `<a>` wrapper if it's already inside a `<Link>`
