# Scheduler — When-I-Work-equivalent build

Plan + as-built notes for the scheduling overhaul layered onto the existing
schedule/shift module. Read alongside `docs/host-stand.md` (sister doc on
the floor-plan side) to understand the full operations surface.

## 1. Audit (what was already there)

The system was further along than expected. **Don't rebuild what works**:

| Surface | State before this drop |
|---|---|
| `schedules` schema | `id, venueId, weekStart, weekEnd, status (draft\|published), createdAt`. ✅ |
| `shifts` schema | `id, scheduleId, userId?, roleId, sectionId?, startTime, endTime, status (open\|scheduled), notes`. ✅ Open shifts = `userId IS NULL`. |
| `shift_requests` | `userId, shiftId, type (drop\|pickup\|trade), status (pending\|approved\|rejected), requestedWithId?, notes`. ✅ Approve/reject endpoints exist. |
| `availability` | `userId, dayOfWeek (0-6), isAvailable, startTime?, endTime?`. ✅ All-employees view via `GET /availability/venue`. |
| `time_off_requests` | `userId, startDate, endDate, type, status (pending\|approved\|denied)`. ✅ Approve/deny + blackout enforcement (June + holidays) wired. |
| `users.positions` | `jsonb text[]`. ✅ but **not** used to gate shift eligibility — the only filter was `roleId`. |
| `users.hourlyRate` | numeric. ✅ |
| Shift CRUD endpoints | full set: create, bulk create, copy-day, bulk-assign, single assign, **employee pickup**, edit, delete. ✅ |
| Schedule publish | `PUT /schedules/:id/publish` flips `status` to `published`. ✅ |
| Manager schedule UI | Month grid (6×7). Add Shift dialog with availability hints (red/amber tags on the employee dropdown). Bulk Add. Clear schedule. Renumber tables. ✅ |
| Employee schedule UI | Three tabs: My Shifts (drop) · Open Shifts (pickup, role-filtered) · Time Off. ✅ |
| Notifications | `notifyUser` / `notifyManagers` / `notifyVenue` helpers in `lib/push.ts`, used by shift assign/reassign + time-off endpoints. ✅ |

## 2. Gaps closed in this drop

1. **Auto-assign engine** (was missing entirely) — pure service in
   `artifacts/api-server/src/lib/auto-assign.ts` + endpoint
   `POST /schedules/:id/auto-assign` that fills open shifts in a
   schedule using the engine. Returns one assignment row per shift
   with `userId`, `reasons[]`, and `warnings[]`. `apply: true` writes
   the assignments through; `apply: false` (default) is a dry run.
2. **Eligibility uses `users.positions`** — the engine matches the
   shift's role name against each user's positions array, no longer
   the legacy single-role assumption.
3. **Hours-aware scheduling** — auto-assign tracks per-user weekly
   hours including the shifts it's mid-assigning, refuses to push
   anyone past `maxHoursPerWeek` (default 40), and warns near
   the OT threshold.
4. **Day-conflict + time-off + availability filters** — assignment
   skips users with overlapping shifts in the same week, with
   approved time-off covering the date, or whose availability is
   off / outside the shift window.
5. **Weekly hours + projected labor sidebar** on the manager
   schedule page, computed from the visible-month shifts. Per-employee
   hours, hours over 40 flagged in red, projected dollar labor sum.
6. **"Auto-Assign Open Shifts" button** in the toolbar that runs the
   engine over the visible month and re-fetches.
7. **Tests** — 8 cases on auto-assign covering position eligibility,
   availability blocking, time-off blocking, hour-cap blocking,
   conflict avoidance, fairness preference, and warning emission.

## 3. Deferred (call out for next drop)

| Item | Why deferred | Where to start |
|---|---|---|
| **Weekly view** (replacing the month grid as the primary planner) | Substantial UI surface; the month grid still works and the auto-assign + hours sidebar pay back faster. | Add a `view: "month" \| "week"` toggle on `manager/schedule.tsx`; render a 7-day × N-employee grid component for week mode. |
| **Drag-and-drop** shift placement / reassignment | Same — large UI surface, low ROI relative to auto-assign. | HTML5 DnD on the shift chips → drop zone is the day cell or employee row in week view. Use the same `useUpdateShift` mutation. |
| **Shift templates** | Full CRUD page + UI to apply template → day or week. Pure schema + UI; no algorithm. | New `shift_templates` table (venueId, name, durationMinutes, roleId, defaultBreakMinutes, color, sectionId?). UI on Settings or a new Templates page. Endpoint to materialize a template into a date. |
| **Shift confirmations** by employees | Single column + endpoint + employee button. Small. | `shifts.confirmed_at` column; `POST /shifts/:id/confirm` (assertSelf-gated); a "Confirm" button on each shift in `employee/schedule.tsx`. Manager view shows ✓ / outstanding. |
| **Audit history** (who created/edited/deleted, when) | Multi-table change log; reasonable scope but not on the critical path. | New `audit_events` table; lightweight middleware that logs writes to shifts/schedules/timeOff. |
| **Attendance early/late/no-show derivation** | Computable from existing time-clock + shift data; UI surface for "exceptions" needed. | Pure helper that compares `timeClockEntries.clockIn` to `shifts.startTime`. Add a derived `state` field to the manager attendance view. |
| **SMS / email** notifications | Push exists. SMS+email need provider config (Twilio + SendGrid). | Extend `lib/push.ts` patterns into `lib/sms.ts` and `lib/email.ts`. Same `notifyUser`-shaped API. |

## 4. Auto-assign algorithm

Greedy with explainable scoring, same architecture as the host-stand
smart-assign for tables. See `lib/auto-assign.ts` for the pure
function and `lib/auto-assign.test.ts` for the cases that lock the
behavior in.

**Hard filters (table fails to assign if any fail):**

1. User has the shift's role in their `positions[]` array.
2. User is `isActive`.
3. User has no other shift overlapping this one (in the same week).
4. User is not on approved time-off covering the shift's date.
5. User's submitted availability for that day-of-week is `isAvailable: true`.
6. If user supplied a window (`startTime`–`endTime`), the shift falls inside it.
7. Adding this shift wouldn't push the user past `config.maxHoursPerWeek`
   (default 40) or `config.maxHoursPerDay` (default 12).

**Soft scoring (highest-scoring eligible user wins):**

| Signal | Weight | Reasoning |
|---|---|---|
| Fairness — fewer hours so far this week | 0.50 | Spreads load. The user with the least scheduled hours wins ties. |
| Continuity — already worked this day this week | 0.20 | Avoids broken-up days when possible. |
| Preferred over generic availability | 0.15 | Reserved for future "preferred" flag on availability. |
| Hours far from cap | 0.15 | Light bonus when the user has plenty of headroom — the assignment won't trigger downstream OT. |

**Output**: each shift gets one assignment. `userId === null` means the
engine couldn't satisfy hard filters with anyone — `reasons[]` explains
the bottom-line obstacle (e.g. "no eligible user — all 4 servers either
on time-off, off availability, or at hour cap"). Manager reviews the
list before pressing **Apply**.

## 5. Files added / changed

```
docs/scheduler.md                                            (this file)

artifacts/api-server/src/lib/auto-assign.ts                  (pure service)
artifacts/api-server/src/lib/auto-assign.test.ts             (node:test)
artifacts/api-server/src/routes/shifts.ts                    (+POST /schedules/:id/auto-assign)

artifacts/venueflow/src/components/schedule-hours-sidebar.tsx    (new)
artifacts/venueflow/src/pages/manager/schedule.tsx               (+sidebar, +Auto-Assign button)
```

## 6. Tests

Run: `pnpm --filter @workspace/api-server test`.

Cases that lock the auto-assign behavior in:

- A user without the right position in `positions[]` is filtered out.
- A user with overlapping shift in the same week is filtered out.
- A user with approved time-off covering the date is filtered out.
- A user whose availability is `isAvailable: false` for that DOW is filtered out.
- A user whose availability window doesn't cover the shift time is filtered out.
- A shift that would push a user past `maxHoursPerWeek` is filtered out.
- Fairness: when two users are equally eligible, the one with fewer existing hours wins.
- Warning: an assignment that lands inside the warning band (≥35h / week
  by default) emits a warning string but still assigns.
