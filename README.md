# VenueFlow — Hospitality Venue Management SaaS

## Overview
Full-stack venue management platform for restaurants and hospitality businesses. Covers staff scheduling, AI schedule generation, reservations/waitlist, guest CRM, time clock, payroll, tip pool, floor plan, team messaging, and analytics.

## Architecture
- **Monorepo**: pnpm workspaces
- **Frontend**: React + Vite (`artifacts/venueflow`) — routes at `/manager/*` and `/employee/*`
- **Backend**: Express + Pino (`artifacts/api-server`) — REST API at `/api/*`. In production the same process serves the built frontend statics.
- **Database**: PostgreSQL via Drizzle ORM (`lib/db`)
- **API Client**: React Query hooks auto-generated from OpenAPI spec (`lib/api-client-react`)
- **AI**: Gemini 2.5 Flash (schedule generation)

## Key Features
| Feature | Frontend Path | API Prefix |
|---------|--------------|-----------|
| Dashboard | `/manager/dashboard` | `/api/analytics/dashboard` |
| Schedule | `/manager/schedule` | `/api/schedules`, `/api/shifts` |
| AI Schedule | `/manager/ai-schedule` | `/api/schedules/ai-generate` |
| Employees | `/manager/employees` | `/api/users`, `/api/roles` |
| Floor Plan | `/manager/floor` | `/api/floor-sections`, `/api/tables` |
| Reservations | `/manager/reservations` | `/api/reservations`, `/api/waitlist` |
| Guests CRM | `/manager/guests` | `/api/guests` |
| Time Clock | `/manager/time-clock` | `/api/time-clock/*` |
| Time Off | `/manager/time-off` | `/api/time-off` |
| Payroll | `/manager/payroll` | `/api/payroll` |
| Tip Pool | `/manager/tip-pool` | `/api/tip-pools` |
| Documents | `/manager/documents` | `/api/documents` |
| Chat | `/manager/chat` | `/api/messages` (5s polling) |
| Analytics | `/manager/analytics` | `/api/analytics/labor`, `/api/analytics/employees` |

## Database Schema (lib/db/src/schema/)
- `venues`, `roles`, `users`, `schedules`, `shifts`, `shiftRequests`
- `reservations`, `waitlistEntries`, `guests`
- `timeClockEntries`, `timeOffRequests`
- `floorSections`, `tables`
- `tipPools`, `tipPoolEntries`, `payrollRecords`
- `posIntegrations`, `messages`, `notifications`, `documents`

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required)
- `SESSION_SECRET` — Express session secret
- `PORT` — HTTP port (defaults to 8080; Railway injects automatically)
- `AI_INTEGRATIONS_GEMINI_BASE_URL` — Gemini API base URL (optional; AI schedule uses fallback without it)
- `AI_INTEGRATIONS_GEMINI_API_KEY` — Gemini API key (optional)
- `OUTLOOK_ACCESS_TOKEN` — Microsoft Graph access token for report emails (optional; reports return 412 without it)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` — Web Push credentials
- `STATIC_DIR` — override for the static frontend directory (defaults to `artifacts/venueflow/dist/public`)

## Local Development
```bash
pnpm install

# Push DB schema changes
pnpm --filter @workspace/db run push

# Start API server (serves API on :8080)
pnpm --filter @workspace/api-server run dev

# Start frontend (Vite dev server on :5173)
pnpm --filter @workspace/venueflow run dev
```

## Deploy to Railway
The repo is configured for a single Railway service that builds both the
frontend and the API server, then runs the API server (which also serves the
built frontend).

1. Create a new Railway project and link this repo.
2. Provision a **Postgres** plugin. Railway will expose `DATABASE_URL` to the
   service automatically.
3. Set the remaining environment variables (see above).
4. Deploy. Railway uses `nixpacks.toml` + `railway.json`:
   - Build: `pnpm install --frozen-lockfile && pnpm run build`
   - Start: `node --enable-source-maps artifacts/api-server/dist/index.mjs`
   - Healthcheck: `/api/healthz`

### Database migrations
Run the Drizzle schema push against your Railway Postgres on first deploy and
whenever the schema changes. The simplest way is to run it locally pointed at
the Railway Postgres URL:

```bash
DATABASE_URL="$RAILWAY_DATABASE_URL" pnpm --filter @workspace/db run push
```

Or, to automate it on every deploy, change the start command in `railway.json`
to prepend `pnpm --filter @workspace/db run push &&` (not recommended for
long-lived production DBs because `drizzle-kit push` can be destructive on
renames).
