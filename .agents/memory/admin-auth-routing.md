---
name: Admin auth & routing
description: How role-based auth and admin panel routing work in XDIGITEX AI
---

## Rule
AuthContext (src/contexts/AuthContext.tsx) stores user+role in localStorage under key `xdx_auth`. On login, if role is `super_admin|admin|moderator|support`, the login page redirects to `/admin`. Otherwise to `/dashboard`.

**Why:** auth is mock (no real JWT/sessions) — API returns user with role; we persist to localStorage on the client side.

**How to apply:**
- Login → `POST /api/auth/login` returns `{ user, token }` where `user` includes `role`
- `useAuth().login(user, token)` persists to localStorage
- `AdminGuard` in App.tsx reads `isAdmin` from context; redirects to `/login` if not admin
- `/admin` and `/admin/:rest*` are both matched as separate routes before `/:rest*` (order matters in Switch)
- AdminShell has its own sidebar (red "ADM" branding, separate nav groups)
- Seed admin: `alex@xdigitex.ai` has `role=super_admin` — any password works (mock auth)
