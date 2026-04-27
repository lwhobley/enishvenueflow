import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Calendar, Clock, Users, ArrowRight, Sparkles, MapPin } from "lucide-react";
import { useBooking, bookingFetch, DEFAULT_VENUE_ID } from "@/contexts/booking-context";

interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  date: string;
  startTime: string;
  endTime: string | null;
  imageUrl: string | null;
  coverCharge: number;
  depositPerGuest: number;
}

export default function BookLanding() {
  const [, navigate] = useLocation();
  const { setDraft, draft } = useBooking();
  const [events, setEvents] = useState<PublicEvent[]>([]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Persisted draft fields (date/party/time) prefill the hero form so a
  // returning user picks up where they left off.
  const [date, setDate] = useState(draft.date || today);
  const [time, setTime] = useState(draft.time || "21:30");
  const [partySize, setPartySize] = useState(draft.partySize || 2);

  useEffect(() => {
    let cancelled = false;
    bookingFetch<PublicEvent[]>(`/api/public/events?venueId=${DEFAULT_VENUE_ID}&from=${today}`)
      .then((rows) => { if (!cancelled) setEvents(rows.slice(0, 3)); })
      .catch(() => { /* silent — landing page can render without events */ });
    return () => { cancelled = true; };
  }, [today]);

  const handleStart = () => {
    setDraft({ date, time, partySize, eventId: null, eventTitle: null });
    navigate("/book/floor-plan");
  };

  return (
    <div className="space-y-12">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#152042] via-[#0F1830] to-[#0B0E1A] p-8 sm:p-12">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(closest-side, #F5C56B, transparent)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(closest-side, #1F9CC2, transparent)" }}
        />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F5C56B]/40 bg-[#F5C56B]/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-[#F5C56B]">
            <Sparkles className="h-3.5 w-3.5" /> Late Night & Events
          </span>
          <h1 className="mt-4 font-serif text-4xl sm:text-5xl lg:text-6xl leading-tight">
            Reserve your section.
            <br />
            <span className="text-[#F5C56B]">Own the night.</span>
          </h1>
          <p className="mt-4 max-w-xl text-white/70">
            Pick your table on the floor plan, lock it in with a deposit, and skip the line.
            Tonight's bookings sync live to the host stand.
          </p>
        </div>

        {/* Inline reservation form */}
        <div className="relative mt-8 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="lp-date" className="block text-xs uppercase tracking-wider text-white/55 mb-1">Date</label>
            <input
              id="lp-date"
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-[#F5C56B]/60"
            />
          </div>
          <div>
            <label htmlFor="lp-time" className="block text-xs uppercase tracking-wider text-white/55 mb-1">Arrival</label>
            <input
              id="lp-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-[#F5C56B]/60"
            />
          </div>
          <div>
            <label htmlFor="lp-party" className="block text-xs uppercase tracking-wider text-white/55 mb-1">Party</label>
            <select
              id="lp-party"
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-[#F5C56B]/60"
            >
              {Array.from({ length: 19 }).map((_, i) => {
                const n = i + 2;
                return <option key={n} value={n} className="bg-[#0B0E1A]">{n} guests</option>;
              })}
              <option value={25} className="bg-[#0B0E1A]">25+ guests</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleStart}
            className="inline-flex h-[42px] items-center justify-center gap-2 rounded-md bg-[#F5C56B] px-5 text-sm font-semibold text-[#0B0E1A] hover:bg-[#FFD27A] transition-colors"
          >
            Pick a section <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/55">
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> 5851 Westheimer Rd, Houston</span>
          <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Doors 9 PM · Last call 2 AM</span>
          <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> 21+ after 10 PM</span>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { n: "01", title: "Pick a section", body: "Tap a table directly on our floor plan. Booked tables go dim in real time." },
          { n: "02", title: "Lock with a deposit", body: "Hold your section with a deposit applied to your tab when you arrive." },
          { n: "03", title: "Skip the line", body: "Show your QR at the door. We'll have you seated immediately." },
        ].map((s) => (
          <div key={s.n} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="text-xs font-mono text-[#F5C56B]">{s.n}</div>
            <div className="mt-2 text-lg font-semibold">{s.title}</div>
            <div className="mt-1 text-sm text-white/65">{s.body}</div>
          </div>
        ))}
      </section>

      {/* ── Upcoming events ── */}
      <section>
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Upcoming nights</h2>
            <p className="text-sm text-white/55">Themed events — the floor plan opens for booking 30 days out.</p>
          </div>
          <Link href="/book/events" className="text-sm text-[#F5C56B] hover:underline">View calendar →</Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/55">
              No published events yet — open table reservations are still available, pick a date above.
            </div>
          ) : (
            events.map((ev) => (
              <Link
                key={ev.id}
                href={`/book/events/${ev.id}`}
                className="group block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] hover:border-[#F5C56B]/40 transition-colors"
              >
                <div className="relative h-40 w-full bg-gradient-to-br from-[#1F9CC2]/40 to-[#142849]">
                  {ev.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ev.imageUrl} alt={ev.title} className="h-full w-full object-cover opacity-90" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-5xl text-white/10">♬</div>
                  )}
                  <div className="absolute left-3 top-3 rounded bg-[#0B0E1A]/85 px-2 py-1 text-[10px] uppercase tracking-widest">
                    {fmtShortDate(ev.date)}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-base font-semibold group-hover:text-[#F5C56B] transition-colors">{ev.title}</div>
                  <div className="mt-1 text-xs text-white/55">{ev.startTime}{ev.endTime ? ` – ${ev.endTime}` : ""}</div>
                  {ev.depositPerGuest > 0 ? (
                    <div className="mt-3 text-xs text-white/65">
                      Deposit from <span className="text-white">${ev.depositPerGuest.toFixed(0)}/guest</span>
                    </div>
                  ) : ev.coverCharge > 0 ? (
                    <div className="mt-3 text-xs text-white/65">Cover ${ev.coverCharge.toFixed(0)}</div>
                  ) : (
                    <div className="mt-3 text-xs text-white/65">Free entry</div>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function fmtShortDate(yyyyMMdd: string): string {
  const [y, m, d] = yyyyMMdd.split("-").map((s) => Number(s));
  if (!y || !m || !d) return yyyyMMdd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" });
}
