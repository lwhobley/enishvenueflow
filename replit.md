# VenueFlow — Hospitality Venue Management SaaS

## Overview
Full-stack venue management platform for restaurants and hospitality businesses. Covers staff scheduling, AI schedule generation, reservations/waitlist, guest CRM, time clock, payroll, tip pool, floor plan, team messaging, and analytics.

## Architecture
- **Monorepo**: pnpm workspaces
- **Frontend**: React + Vite (`artifacts/venueflow`) — routes at `/manager/*` and `/employee/*`
- **Backend**: Express + Pino (`artifacts/api-server`) — REST API at `/api/*` on port 8080
- **Database**: PostgreSQL via Drizzle ORM (`lib/db`)
- **API Client**: React Query hooks auto-generated from OpenAPI spec (`lib/api-client-react`)
- **AI**: Gemini 2.5 Flash via Replit AI Integrations (schedule generation)

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
- `venues` — multi-venue support
- `roles` — role definitions with permission JSON
- `users` — staff with hourly rate, role assignment
- `schedules` — weekly schedules (weekStart/weekEnd)
- `shifts` + `shiftRequests` — shift assignments, pickups, trades
- `reservations` + `waitlistEntries` — booking and walk-in management
- `guests` — CRM with VIP levels, tags, visit history
- `timeClockEntries` + `timeOffRequests` — time tracking
- `floorSections` + `tables` — floor plan with drag positioning
- `tipPools` + `tipPoolEntries` — tip distribution
- `payrollRecords` — payroll computation
- `messages` + `notifications` + `documents` — messaging and file management

## Seed Data
The database is seeded with:
- **Venue**: The Rustic Table (San Francisco)
- **Users**: 6 staff (Sarah Chen/Manager, Marcus/Server, Elena/Bartender, James/Server, Aisha/Host, Tom/Kitchen)
- **Roles**: Manager, Server, Bartender, Host, Kitchen
- **Floor**: 3 sections (Main Dining, Bar, Patio) with 9 tables
- **Reservations**: 4 reservations (3 today, 1 tomorrow)
- **Guests**: 5 CRM profiles with visit history
- **Schedule**: Week of April 13, 2026 with 6 shifts

## Design
- Dark sidebar (`#1A1A2E` / `#16213E`) with primary purple `#5B3FD9`
- Content area background `#F9FAFB`, text `#111827`
- Role badges color-coded per role
- Recharts for analytics charts
- Lucide React icons throughout

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection
- `SESSION_SECRET` — Express session
- `AI_INTEGRATIONS_GEMINI_BASE_URL` — Gemini API proxy URL
- `AI_INTEGRATIONS_GEMINI_API_KEY` — Gemini API key
- `PORT` — Auto-assigned per artifact

## Development
```bash
# Push DB schema changes
pnpm --filter @workspace/db run push

# Start API server
pnpm --filter @workspace/api-server run dev

# Start frontend
pnpm --filter @workspace/venueflow run dev
```
