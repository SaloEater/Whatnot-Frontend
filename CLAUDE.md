# Whatnot-Frontend (Next.js Admin UI)

Next.js 14 (App Router, TypeScript, Bootstrap 5) admin interface for managing streams, breaks, and events.

## Running Locally

```bash
npm install
npm run dev   # http://localhost:3000
```

Requires `.env.local`:
```
BACKEND_HOST=http://localhost:5555
```

`BACKEND_HOST` is exposed to the browser via the server-side route `pages/api/get-env-var.ts` — do not access `process.env.BACKEND_HOST` directly from client components.

## Architecture

- Next.js 14 App Router (`src/app/`); all pages are `'use client'`
- Bootstrap 5 loaded client-side via `components/BootstrapClient.tsx`
- No global state manager — plain React `useState`/`useEffect` + custom hooks
- Auth: username/password stored in `localStorage`, sent as `Authorization: Basic <base64>` on every request; cleared automatically on 401

## Key Files

| File | Purpose |
|------|---------|
| `src/app/lib/backend.ts` | All API calls; `post()` and `get()` helpers; all endpoint strings |
| `src/app/entity/entities.ts` | TypeScript interfaces for all domain types |
| `src/app/common/auth_storage.ts` | `SetAuth()`, `CleanAuth()`, `GetAuth()` |
| `src/app/hooks/` | `useStream`, `useActiveStream`, `useChannel` — data-fetching hooks |
| `pages/api/get-env-var.ts` | Server route that returns `BACKEND_HOST` to client |

## Routing Map

| Route | Page |
|-------|------|
| `/login` | Auth form |
| `/channels` | All channels — main landing page after login |
| `/channel/[id]` | Channel detail + stream list |
| `/stream/[id]` | Stream breaks |
| `/break/[id]` | Break events (most complex page) |
| `/obs/[id]`, `/obs/manage/[id]`, `/obs/teams/[id]` | OBS browser source pages |
| `/package/[id]` | Shipping / package management |

## Pattern: Adding a New API Call

1. Add endpoint string and fetch call in `src/app/lib/backend.ts` using the `post()` or `get()` helper
2. Add or extend the TypeScript interface in `src/app/entity/entities.ts`
3. The helpers automatically attach the Basic Auth header — no extra setup needed

## Notes

- No tests configured
- `npm run lint` runs ESLint (next/core-web-vitals preset)
