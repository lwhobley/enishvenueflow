import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Calendar, Clock, Users, CreditCard, X, LogOut } from "lucide-react";
import { bookingFetch, useBooking } from "@/contexts/booking-context";

interface MyBooking {
  id: string;
  date: string;
  time: string;
  partySize: number;
  status: string;
  kind: string;
  notes: string | null;
  depositAmount: number;
  depositPaid: boolean;
  totalAmount: number | null;
  confirmationCode: string | null;
  tableId: string | null;
  eventId: string | null;
}

export default function BookDashboard() {
  const { customer, signOut } = useBooking();
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    bookingFetch<MyBooking[]>("/api/public/bookings/mine", {}, customer.sessionToken)
      .then((rows) => { if (!cancelled) setBookings(rows); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load"); });
    return () => { cancelled = true; };
  }, [customer]);

  if (!customer) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <h1 className="text-2xl font-semibold">Sign in to see your bookings</h1>
        <p className="mt-2 text-sm text-white/65">Or look up a single booking by its confirmation code.</p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/book/login"
            className="inline-flex items-center justify-center rounded-md bg-[#F5C56B] px-4 py-2.5 text-sm font-semibold text-[#0B0E1A] hover:bg-[#FFD27A]">
            Sign in
          </Link>
          <Link href="/book/register"
            className="inline-flex items-center justify-center rounded-md border border-white/15 bg-white/5 px-4 py-2.5 text-sm hover:bg-white/10">
            Create an account
          </Link>
        </div>
      </div>
    );
  }

  const handleCancel = async (id: string) => {
    if (!customer) return;
    if (cancellingId) return;
    if (!confirm("Cancel this booking? Your deposit will be refunded within 5 business days.")) return;
    setCancellingId(id);
    try {
      const updated = await bookingFetch<MyBooking>(`/api/public/bookings/${id}/cancel`, {
        method: "POST",
      }, customer.sessionToken);
      setBookings((prev) => (prev ?? []).map((b) => b.id === id ? updated : b));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancellingId(null);
    }
  };

  const upcoming = (bookings ?? []).filter((b) => b.status !== "cancelled" && b.status !== "completed" && b.date >= todayIso());
  const past = (bookings ?? []).filter((b) => b.status === "cancelled" || b.status === "completed" || b.date < todayIso());

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">My bookings</h1>
          <p className="mt-1 text-sm text-white/60">Signed in as {customer.email}.</p>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 text-sm text-white/85 hover:bg-white/10"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      <section>
        <div className="mb-3 text-xs uppercase tracking-wider text-white/45">Upcoming</div>
        {bookings === null ? (
          <div className="text-sm text-white/55">Loading…</div>
        ) : upcoming.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/55">
            No upcoming bookings. <Link href="/book" className="text-[#F5C56B] hover:underline">Make one →</Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {upcoming.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                onCancel={() => handleCancel(b.id)}
                cancelling={cancellingId === b.id}
              />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section>
          <div className="mb-3 text-xs uppercase tracking-wider text-white/45">Past & cancelled</div>
          <div className="grid gap-3">
            {past.map((b) => (
              <BookingCard key={b.id} booking={b} historical />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function BookingCard({ booking, onCancel, cancelling, historical }: {
  booking: MyBooking;
  onCancel?: () => void;
  cancelling?: boolean;
  historical?: boolean;
}) {
  const statusColor = STATUS_STYLE[booking.status] ?? STATUS_STYLE.default;
  return (
    <div className={[
      "rounded-2xl border bg-white/[0.03] p-5",
      historical ? "border-white/5 opacity-75" : "border-white/10",
    ].join(" ")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${statusColor}`}>
              {booking.status}
            </span>
            {booking.kind === "event" ? (
              <span className="inline-flex items-center rounded-full bg-[#F5C56B]/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#F5C56B]">Event</span>
            ) : booking.kind === "nightlife" ? (
              <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/65">Late Night</span>
            ) : null}
          </div>
          <div className="mt-2 text-lg font-semibold">{fmtDate(booking.date)} · {booking.time}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/65">
            <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {booking.partySize} guests</span>
            {booking.confirmationCode ? (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Code <span className="font-mono text-[#F5C56B]">{booking.confirmationCode}</span>
              </span>
            ) : null}
          </div>
          {booking.notes ? <div className="mt-2 text-sm text-white/55">Note: {booking.notes}</div> : null}
        </div>
        <div className="text-right">
          <div className="inline-flex items-center gap-1.5 text-sm">
            <CreditCard className="h-3.5 w-3.5" />
            <span className="text-white">${booking.depositAmount.toFixed(2)}</span>
            <span className={booking.depositPaid ? "text-emerald-300" : "text-white/55"}>
              {booking.depositPaid ? "Paid" : "Unpaid"}
            </span>
          </div>
          {!historical && onCancel && booking.status !== "cancelled" ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="mt-3 inline-flex items-center gap-1 rounded-md border border-white/15 px-2.5 py-1 text-xs text-white/75 hover:bg-white/5 disabled:opacity-60"
            >
              <X className="h-3 w-3" /> {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-400/20 text-amber-200",
  confirmed: "bg-emerald-400/20 text-emerald-200",
  arrived: "bg-cyan-400/20 text-cyan-100",
  seated: "bg-indigo-400/20 text-indigo-100",
  completed: "bg-white/15 text-white/70",
  cancelled: "bg-red-400/20 text-red-200",
  no_show: "bg-red-400/20 text-red-200",
  default: "bg-white/15 text-white/70",
};

function todayIso(): string { return new Date().toISOString().slice(0, 10); }

function fmtDate(yyyyMMdd: string): string {
  const [y, m, d] = yyyyMMdd.split("-").map((s) => Number(s));
  if (!y || !m || !d) return yyyyMMdd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}
