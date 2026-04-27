/**
 * Pure slot-availability computation. Used by the OpenTable-style booking
 * flow on the manager reservations page to populate clickable time pills.
 *
 * For each candidate time slot (every `slotMinutes` from `dayStart` to
 * `dayEnd` in venue local time), check whether ANY table with capacity
 * >= party size is unblocked AND has no overlapping active reservation.
 * If yes, the slot is `available`. If no, it's `full`.
 *
 * Doesn't hit the network — operates over the snapshots the host stand /
 * reservations page already polls. Same-day scope: caller passes only
 * the reservations for the requested date.
 */

export interface SlotTable {
  id: string;
  capacity: number;
  status: string;       // available | reserved | seated | dirty | blocked …
}

export interface SlotReservation {
  tableId: string | null;
  /** ISO date YYYY-MM-DD */
  date: string;
  /** HH:MM 24-hour, venue local */
  time: string;
  durationMinutes: number;
  status: string;
}

export interface AvailabilitySlot {
  /** HH:MM 24-hour. */
  time: string;
  /** True if at least one table fits the party at this time. */
  available: boolean;
  /** Best-fit table id (smallest capacity that still fits). null when full. */
  bestTableId: string | null;
}

export interface SlotConfig {
  date: string;             // YYYY-MM-DD
  partySize: number;
  durationMinutes: number;  // turn time per booking
  /** Slot grid step. 30 (every half hour) is the OpenTable standard. */
  slotMinutes?: number;
  /** First slot to consider, "HH:MM". Default 17:00 (5pm). */
  dayStart?: string;
  /** Last slot to consider, "HH:MM" inclusive. Default 22:00 (10pm). */
  dayEnd?: string;
}

const ACTIVE_RESERVATION_STATUSES = new Set([
  "pending", "confirmed", "arrived", "seated",
]);

function hhmmToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function minToHhmm(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Returns the full slot grid for the day, each marked available or full
 * relative to the requested party size + turn duration. Caller decides
 * how to render (typically: pills, with the requested time highlighted
 * and nearby alternatives shown when the exact slot is full).
 */
export function computeAvailability(
  cfg: SlotConfig,
  tables: SlotTable[],
  reservations: SlotReservation[],
): AvailabilitySlot[] {
  const slotMinutes = cfg.slotMinutes ?? 30;
  const startMin = hhmmToMin(cfg.dayStart ?? "17:00");
  const endMin = hhmmToMin(cfg.dayEnd ?? "22:00");

  // Pre-filter out tables that can't possibly host the party (too small
  // or blocked) so the inner loop is small.
  const eligibleTables = tables.filter((t) =>
    t.status !== "blocked" && t.capacity >= cfg.partySize,
  );
  // Sort smallest-first so we report the most efficient seating per slot
  // (the bestTableId surfaced is the one a smart-assign would pick).
  eligibleTables.sort((a, b) => a.capacity - b.capacity);

  // Pre-compute reservation windows in minutes for fast overlap checks.
  const todayRes = reservations
    .filter((r) => r.date === cfg.date && ACTIVE_RESERVATION_STATUSES.has(r.status) && r.tableId)
    .map((r) => ({
      tableId: r.tableId!,
      startMin: hhmmToMin(r.time),
      endMin: hhmmToMin(r.time) + (r.durationMinutes ?? 90),
    }));

  const slots: AvailabilitySlot[] = [];
  for (let m = startMin; m <= endMin; m += slotMinutes) {
    const reqStart = m;
    const reqEnd = m + cfg.durationMinutes;

    let bestTableId: string | null = null;
    for (const t of eligibleTables) {
      const conflict = todayRes.some((r) =>
        r.tableId === t.id && r.startMin < reqEnd && r.endMin > reqStart,
      );
      if (!conflict) { bestTableId = t.id; break; }
    }
    slots.push({ time: minToHhmm(m), available: bestTableId !== null, bestTableId });
  }
  return slots;
}

/**
 * Pick the N closest *available* slots to the requested time, used by
 * the "Try one of these instead" alternatives row when the exact slot
 * the diner asked for is full.
 */
export function nearestAvailableSlots(
  slots: AvailabilitySlot[],
  requestedTime: string,
  count = 5,
): AvailabilitySlot[] {
  const reqMin = hhmmToMin(requestedTime);
  return slots
    .filter((s) => s.available)
    .sort((a, b) => Math.abs(hhmmToMin(a.time) - reqMin) - Math.abs(hhmmToMin(b.time) - reqMin))
    .slice(0, count);
}
