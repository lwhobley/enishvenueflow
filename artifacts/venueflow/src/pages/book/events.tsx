import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { bookingFetch, DEFAULT_VENUE_ID } from "@/contexts/booking-context";

interface PublicEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string | null;
  imageUrl: string | null;
  coverCharge: number;
  depositPerGuest: number;
  description: string | null;
}

export default function BookEvents() {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => firstOfMonth(new Date()));

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    bookingFetch<PublicEvent[]>(`/api/public/events?venueId=${DEFAULT_VENUE_ID}&from=${today}`)
      .then((rows) => { if (!cancelled) { setEvents(rows); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load events"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [today]);

  const eventsByDate = useMemo(() => {
    const m = new Map<string, PublicEvent[]>();
    for (const e of events) {
      const list = m.get(e.date) ?? [];
      list.push(e);
      m.set(e.date, list);
    }
    return m;
  }, [events]);

  const monthDays = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Event Calendar</h1>
        <p className="mt-1 text-white/60">Tap a night to lock in your section.</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setCursor((c) => addMonths(c, -1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 hover:bg-white/5"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-lg font-semibold">{monthLabel}</div>
          <button
            type="button"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 hover:bg-white/5"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="bg-[#0B0E1A] py-2 text-center text-[11px] uppercase tracking-wider text-white/45">
              {d}
            </div>
          ))}
          {monthDays.map((cell) => {
            const inMonth = cell.getMonth() === cursor.getMonth();
            const iso = cell.toISOString().slice(0, 10);
            const isToday = iso === today;
            const dayEvents = eventsByDate.get(iso) ?? [];
            const isPast = iso < today;
            return (
              <div
                key={iso}
                className={[
                  "min-h-[88px] bg-[#0B0E1A] p-2 text-xs",
                  inMonth ? "" : "opacity-40",
                  isPast ? "opacity-50" : "",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <span className={isToday ? "rounded bg-[#F5C56B] px-1.5 text-[10px] font-bold text-[#0B0E1A]" : "text-white/55"}>
                    {cell.getDate()}
                  </span>
                  {dayEvents.length > 1 ? (
                    <span className="text-[10px] text-white/45">{dayEvents.length}×</span>
                  ) : null}
                </div>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 2).map((ev) => (
                    <Link
                      key={ev.id}
                      href={`/book/events/${ev.id}`}
                      className="block truncate rounded bg-[#F5C56B]/15 px-1.5 py-1 text-[11px] text-[#F5C56B] hover:bg-[#F5C56B]/25"
                    >
                      {ev.title}
                    </Link>
                  ))}
                  {dayEvents.length > 2 ? (
                    <span className="block text-[10px] text-white/45">+{dayEvents.length - 2} more</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold">All upcoming events</h2>
        {loading ? (
          <div className="mt-4 text-sm text-white/55">Loading…</div>
        ) : error ? (
          <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        ) : events.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/55">
            No events scheduled. Open table reservations are always available — pick a date on the home page.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {events.map((ev) => (
              <Link
                key={ev.id}
                href={`/book/events/${ev.id}`}
                className="group block rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-[#F5C56B]/40 transition-colors"
              >
                <div className="flex items-baseline justify-between">
                  <div className="text-sm uppercase tracking-wider text-[#F5C56B]">{fmtFullDate(ev.date)}</div>
                  <div className="text-xs text-white/55">{ev.startTime}{ev.endTime ? `–${ev.endTime}` : ""}</div>
                </div>
                <div className="mt-1 text-lg font-semibold group-hover:text-[#F5C56B]">{ev.title}</div>
                {ev.description ? (
                  <p className="mt-2 line-clamp-2 text-sm text-white/65">{ev.description}</p>
                ) : null}
                <div className="mt-3 flex items-center gap-3 text-xs text-white/55">
                  {ev.depositPerGuest > 0 ? <span>Deposit from ${ev.depositPerGuest.toFixed(0)}/guest</span> : null}
                  {ev.coverCharge > 0 ? <span>Cover ${ev.coverCharge.toFixed(0)}</span> : null}
                  {ev.depositPerGuest === 0 && ev.coverCharge === 0 ? <span>Free entry</span> : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function firstOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

// 6 rows × 7 cols of dates surrounding the cursor month, padded into the
// previous/next month so every grid cell is filled.
function buildMonthGrid(cursor: Date): Date[] {
  const first = firstOfMonth(cursor);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay()); // back to Sunday
  return Array.from({ length: 42 }).map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function fmtFullDate(yyyyMMdd: string): string {
  const [y, m, d] = yyyyMMdd.split("-").map((s) => Number(s));
  if (!y || !m || !d) return yyyyMMdd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}
