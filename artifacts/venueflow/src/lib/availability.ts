import { useQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";

export interface AvailabilityRow {
  id: string;
  userId: string;
  venueId: string;
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  isAvailable: boolean;
  startTime: string | null; // "HH:MM"
  endTime: string | null;
  notes: string | null;
}

export type AvailabilityStatus =
  | { kind: "ok" }
  | { kind: "unset" } // employee never set availability for this day — assume ok, no warning
  | { kind: "off"; reason: string } // marked unavailable for the whole day
  | { kind: "outside"; reason: string }; // available, but the shift is outside their window

const QUERY_KEY = (venueId: string) => ["/availability/venue", venueId] as const;

async function fetchVenueAvailability(venueId: string): Promise<AvailabilityRow[]> {
  const res = await fetch(`/api/availability/venue?venueId=${encodeURIComponent(venueId)}`);
  if (!res.ok) throw new Error(`Failed to load availability (${res.status})`);
  return (await res.json()) as AvailabilityRow[];
}

export function useVenueAvailability(venueId: string) {
  return useQuery({
    queryKey: QUERY_KEY(venueId),
    queryFn: () => fetchVenueAvailability(venueId),
    enabled: !!venueId,
    staleTime: 5 * 60 * 1000,
  });
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "p" : "a";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")}${period}`;
}

/**
 * dayOfWeek for a "YYYY-MM-DD" string, evaluated in the browser's local
 * timezone. The schedule UI's HTML date input gives us exactly that
 * string — no timezone math needed.
 */
function dayOfWeekForDate(date: string): number {
  return parseISO(date).getDay();
}

export function statusForUserOnDate(
  rows: AvailabilityRow[] | undefined,
  userId: string,
  date: string,
  startHHMM: string,
  endHHMM: string,
): AvailabilityStatus {
  if (!rows || !userId) return { kind: "unset" };
  const dow = dayOfWeekForDate(date);
  const row = rows.find((r) => r.userId === userId && r.dayOfWeek === dow);
  if (!row) return { kind: "unset" };

  if (!row.isAvailable) {
    const note = row.notes ? ` — ${row.notes}` : "";
    return { kind: "off", reason: `Marked unavailable on ${DAY_NAMES[dow]}${note}` };
  }

  if (!row.startTime || !row.endTime) return { kind: "ok" };
  if (startHHMM >= row.startTime && endHHMM <= row.endTime) return { kind: "ok" };
  return {
    kind: "outside",
    reason: `Available ${fmt12(row.startTime)}–${fmt12(row.endTime)} on ${DAY_NAMES[dow]}`,
  };
}

/** One-line label for inline use in dropdown options or list rows. */
export function shortAvailabilityLabel(s: AvailabilityStatus): string | null {
  switch (s.kind) {
    case "ok":
    case "unset":
      return null;
    case "off":
      return "Unavailable";
    case "outside":
      return "Outside hours";
  }
}
