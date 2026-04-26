# Host-Stand Table Management

Plan + as-built notes for the host-stand workflow layered onto the existing
floor-plan module. Read this first before extending.

## 1. Audit (what was there)

| Surface | State before this drop |
|---|---|
| `reservations` schema | Had `tableId`, `status` (default `"pending"`), `durationMinutes` (90), but **no lifecycle timestamps** (arrived/seated/completed). |
| `waitlist_entries` schema | Existed with `quotedWait`, `status`, `notes`. |
| `reservations` API | GET/POST/PUT/DELETE + bulk + waitlist GET/POST/PUT. **No transition endpoints.** No "seat from waitlist". |
| `tables.status` | Column existed, defaulted `"available"`, **never written to** by any code. The floor plan's red coloring was driven entirely by "is there an active reservation today for this table id?" |
| Floor plan canvas | Tables tinted red on reservation, white otherwise. No notion of seated / dirty / blocked. |
| `TableInfoDialog` | Reserve / cancel / move section / set price + buyer. No lifecycle actions. |
| Sections | `assignedUserId` shown in dropdown text + dialog row. **Not painted on the canvas.** |
| Smart assign | None. Manager picks the table by hand. |
| Test runner | None at any package. |

## 2. Gaps closed in this drop

1. Reservation **lifecycle timestamps** — `arrivedAt`, `seatedAt`, `completedAt`.
2. `tables.lastStatusAt` so the canvas can show "seated 24 min ago" etc.
3. `tables.combinableWith` (text[]) — column reserved for the future combine-tables feature; nothing reads it yet.
4. **Lifecycle endpoints**: `arrive`, `seat`, `complete`, `no-show` on reservations; `status` PUT on tables; `seat` on waitlist (waitlist → reservation → seated, in one call).
5. **Smart-assign service** — pure function, separately testable, returns ranked tables with `reasons[]`.
6. **`GET /reservations/:id/suggested-tables`** wraps the service and returns the top 5.
7. **Host-Stand Panel** — replaces the Table Sales legend on the manager floor plan with a tabbed operations panel (Upcoming · Arrived · Seated · Waitlist). 1-click lifecycle actions. Smart-assign picker on Seat.
8. **Status colors on the canvas** — reserved (red), seated (amber), dirty (gray), blocked (slate), available (white).
9. **Section color stripe** at the top of every table — at-a-glance section identification.
10. **Status quick-actions** in `TableInfoDialog` — Mark Dirty / Mark Cleaned / Block / Unblock.

## 3. Deferred / stubbed (call out for next drop)

| Item | Why deferred | Where to start |
|---|---|---|
| Combinable tables (multi-table parties) | Significant UI surface (multi-select + capacity-pooling logic in smart-assign). | Schema column `combinableWith` already exists. Extend `suggestTables()` to build virtual-table groups when no single table fits. |
| Per-party-size / per-meal-period turn time pacing | One-shift solution covers 80% of the value via `durationMinutes`. | New `pacing_rules` table keyed by venue + dayOfWeek + size range. |
| Pacing controls (no-more-than-N-seatings per 15 min) | Same. | Compute in the host-stand panel from current seated + recently-seated. |
| POS event auto-statusing (order-fired → coursing, check-closed → dirty) | No POS integration is wired up. | `lib/pos.ts` already has provider scaffolding. Add a POS-event ingestion route that maps event types → status writes via the same lifecycle endpoints. |
| SMS notifications on waitlist | Twilio not configured. | Schema has the phone field; add a `sms_provider` env + a notify hook on `PUT /waitlist/:id` when status flips to `ready`. |
| Drag-and-drop reservation → table on the canvas | Click-to-seat is faster for now. | Add HTML5 DnD onto the reservation card → table id; reuse the seat endpoint. |

## 4. Domain model after this drop

```
reservation
├─ id, venueId, guestId?, guestName, guestEmail?, guestPhone?
├─ partySize, date (YYYY-MM-DD), time (HH:MM), durationMinutes
├─ tableId?, notes?, source?, externalId?
├─ status: pending | confirmed | arrived | seated | completed
│         | cancelled | no_show
└─ arrivedAt?, seatedAt?, completedAt?, createdAt

table
├─ id, venueId, sectionId, scope (restaurant|nightlife)
├─ label, capacity, x, y, width, height, shape, rotation
├─ price?, purchaserName?
├─ status: available | reserved | seated | occupied | dirty | blocked
├─ lastStatusAt?
└─ combinableWith: string[]

floor_section
├─ id, venueId, scope
├─ name, color, capacity
└─ assignedUserId? (server / bartender)

waitlist_entry
├─ id, venueId
├─ guestName, guestPhone?, partySize
├─ quotedWait?, status: waiting | seated | removed | left
├─ notes?, createdAt
```

## 5. Lifecycle state machine

```
                 ┌──────────────┐
                 │   pending    │
                 └──────┬───────┘
                        │ confirm (existing PUT)
                 ┌──────▼───────┐
                 │  confirmed   │
                 └──────┬───────┘
                        │ POST /reservations/:id/arrive
                 ┌──────▼───────┐                no-show
                 │   arrived    │ ────────────► POST /reservations/:id/no-show
                 └──────┬───────┘
                        │ POST /reservations/:id/seat
                 ┌──────▼───────┐
                 │   seated     │  table.status = seated
                 └──────┬───────┘
                        │ POST /reservations/:id/complete
                 ┌──────▼───────┐
                 │  completed   │  table.status = dirty
                 └──────────────┘
```

Cancellation can fire from any pre-seated state via existing `DELETE /reservations/:id` (soft-deletes to `cancelled`).

Walk-ins: walk-in flow is `POST /waitlist` → `POST /waitlist/:id/seat { tableId }`, which behind the scenes creates a reservation already in `seated` status, links it to the table, and marks the waitlist entry `seated`.

## 6. Files added / changed

```
docs/host-stand.md                                          (this file)

lib/db/src/schema/reservations.ts                           (+arrivedAt, seatedAt, completedAt)
lib/db/src/schema/floorplan.ts                              (+lastStatusAt, combinableWith)
artifacts/api-server/src/lib/startup-migrations.ts          (idempotent ADD COLUMNs)

artifacts/api-server/src/lib/smart-assign.ts                (pure logic — testable)
artifacts/api-server/src/lib/smart-assign.test.mjs          (node --test)

artifacts/api-server/src/routes/reservations.ts             (+lifecycle endpoints, +/suggested-tables, +waitlist /seat)
artifacts/api-server/src/routes/floorplan.ts                (+PUT /tables/:id/status, status writes set lastStatusAt)

artifacts/venueflow/src/components/host-stand-panel.tsx     (new)
artifacts/venueflow/src/components/table-info-dialog.tsx    (+status quick actions)
artifacts/venueflow/src/pages/manager/floor.tsx             (replace TableLegend with HostStandPanel; status colors; section stripe)
```

## 7. Smart-assign scoring (so it's not a black box)

Hard filters first:
- table.status === `blocked` → drop
- table.capacity < party size → drop
- any conflicting reservation overlaps the requested window → drop

Then score each candidate 0–1:

| Signal | Weight | Reasoning |
|---|---|---|
| Capacity match | 0.40 | Exact = full credit; +1–2 seats = 0.25; larger = 0.05. Maximizes covers. |
| Server load balance | 0.20 | If section's assignedUser has ≤6 covers seated, full credit. ≤12 = half. Else 0. |
| Preferred section | 0.15 | If reservation note flags one. |
| Currently dirty | -0.10 | Doesn't disqualify but penalizes — host should still see it. |

Top 5 returned, each with `reasons[]` strings. The picker UI shows them inline.

## 8. Testing

`smart-assign.test.mjs` covers:

- Exact capacity match wins over a larger table.
- A blocked table is filtered out entirely.
- A conflicting reservation in the time window filters the table out.
- A section with a heavily-loaded server scores below a lighter section.

Run: `node --test artifacts/api-server/src/lib/smart-assign.test.mjs`.
