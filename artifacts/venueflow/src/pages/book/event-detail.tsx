import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, Calendar, Clock, Users } from "lucide-react";
import { bookingFetch, useBooking } from "@/contexts/booking-context";

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
  capacity: number | null;
}

export default function BookEventDetail() {
  const [, params] = useRoute("/book/events/:id");
  const [, navigate] = useLocation();
  const { setDraft, draft } = useBooking();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(draft.partySize || 2);

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    bookingFetch<PublicEvent>(`/api/public/events/${params.id}`)
      .then((ev) => { if (!cancelled) { setEvent(ev); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Event not found"); });
    return () => { cancelled = true; };
  }, [params?.id]);

  const handleReserve = () => {
    if (!event) return;
    setDraft({
      eventId: event.id,
      eventTitle: event.title,
      date: event.date,
      time: event.startTime,
      partySize,
      // Reset section selection so the customer picks a fresh table
      // for this event.
      tableId: null, tableLabel: null, sectionId: null, sectionName: null, tablePrice: null,
    });
    navigate("/book/floor-plan");
  };

  if (error) {
    return (
      <div>
        <Link href="/book/events" className="inline-flex items-center text-sm text-white/55 hover:text-white">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to events
        </Link>
        <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      </div>
    );
  }

  if (!event) {
    return <div className="text-sm text-white/55">Loading event…</div>;
  }

  return (
    <div className="space-y-8">
      <Link href="/book/events" className="inline-flex items-center text-sm text-white/55 hover:text-white">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to events
      </Link>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#152042] to-[#0B0E1A]">
        <div className="relative h-56 sm:h-72 w-full bg-gradient-to-br from-[#1F9CC2]/40 to-[#142849]">
          {event.imageUrl ? (
            <img src={event.imageUrl} alt={event.title} className="h-full w-full object-cover opacity-80" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-7xl text-white/10">♬</div>
          )}
        </div>
        <div className="p-6 sm:p-8">
          <h1 className="font-serif text-3xl sm:text-4xl">{event.title}</h1>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
            <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4 text-[#F5C56B]" /> {fmtFullDate(event.date)}</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-[#F5C56B]" /> {event.startTime}{event.endTime ? ` – ${event.endTime}` : ""}</span>
            {event.capacity ? (
              <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-[#F5C56B]" /> Capacity {event.capacity}</span>
            ) : null}
          </div>
          {event.description ? (
            <p className="mt-5 max-w-2xl text-white/75 leading-relaxed">{event.description}</p>
          ) : null}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Stat label="Deposit per guest" value={event.depositPerGuest > 0 ? `$${event.depositPerGuest.toFixed(2)}` : "Free"} />
            <Stat label="Cover charge" value={event.coverCharge > 0 ? `$${event.coverCharge.toFixed(2)}` : "Included"} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <div className="text-sm uppercase tracking-wider text-[#F5C56B]">Reserve a section</div>
        <h2 className="mt-1 text-2xl font-semibold">Pick your party size, then your table.</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label htmlFor="ev-party" className="block text-xs uppercase tracking-wider text-white/55 mb-1">Party size</label>
            <select
              id="ev-party"
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-[#F5C56B]/60"
            >
              {Array.from({ length: 19 }).map((_, i) => {
                const n = i + 2;
                return <option key={n} value={n} className="bg-[#0B0E1A]">{n} guests</option>;
              })}
              <option value={25} className="bg-[#0B0E1A]">25+ guests (large party)</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleReserve}
            className="inline-flex h-[42px] items-center justify-center gap-2 rounded-md bg-[#F5C56B] px-5 text-sm font-semibold text-[#0B0E1A] hover:bg-[#FFD27A]"
          >
            Pick a section <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[11px] uppercase tracking-wider text-white/45">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function fmtFullDate(yyyyMMdd: string): string {
  const [y, m, d] = yyyyMMdd.split("-").map((s) => Number(s));
  if (!y || !m || !d) return yyyyMMdd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}
