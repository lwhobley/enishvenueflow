import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, CreditCard, Lock, Sparkles } from "lucide-react";
import { bookingFetch, useBooking, DEFAULT_VENUE_ID } from "@/contexts/booking-context";

interface CreatedBooking {
  id: string;
  confirmationCode: string | null;
  depositAmount: number;
  depositPaid: boolean;
  status: string;
  date: string;
  time: string;
  partySize: number;
  guestName: string;
  guestEmail: string;
  tableId: string | null;
  eventId: string | null;
}

export default function BookCheckout() {
  const [, navigate] = useLocation();
  const { draft, customer, signIn, resetDraft } = useBooking();

  const [name, setName] = useState(customer?.fullName ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [notes, setNotes] = useState("");
  const [createAccount, setCreateAccount] = useState(false);
  const [password, setPassword] = useState("");

  const [card, setCard] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<CreatedBooking | null>(null);

  // Use the table's price (minimum) as the deposit floor; fall back to
  // a flat $25 nightlife hold so a free RSVP still asks for some skin
  // in the game.
  const baseDeposit = draft.tablePrice ?? 25;
  const deposit = useMemo(() => Math.max(0, baseDeposit), [baseDeposit]);

  useEffect(() => {
    // If the user landed on /book/checkout with no table selected, send
    // them back to pick one — checkout doesn't make sense otherwise.
    if (!confirmation && (!draft.tableId || !draft.date)) {
      navigate("/book/floor-plan");
    }
  }, [confirmation, draft.tableId, draft.date, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (createAccount && password.length < 8) {
      setError("Choose a password of at least 8 characters, or uncheck account creation.");
      return;
    }
    setSubmitting(true);
    try {
      // Create the booking row first.
      const booking = await bookingFetch<CreatedBooking>("/api/public/bookings", {
        method: "POST",
        body: JSON.stringify({
          venueId: DEFAULT_VENUE_ID,
          eventId: draft.eventId,
          tableId: draft.tableId,
          partySize: draft.partySize,
          date: draft.date,
          time: draft.time,
          durationMinutes: 180,
          guestName: name.trim(),
          guestEmail: email.trim(),
          guestPhone: phone.trim() || null,
          notes: notes.trim() || null,
          depositAmount: deposit,
        }),
      });

      // Charge the deposit (mock provider for now — real Stripe / Square
      // wiring would tokenize the card client-side and pass the token
      // here instead of last-4 of the PAN).
      if (deposit > 0) {
        await bookingFetch(`/api/public/bookings/${booking.id}/pay-deposit`, {
          method: "POST",
          body: JSON.stringify({
            provider: "mock",
            amount: deposit,
            providerRef: card ? `mock_card_${card.slice(-4)}` : `mock_${Date.now()}`,
          }),
        });
      }

      // Promote guest to a real account on request (server side: this
      // upgrades the lazily-created customer row created by the booking
      // and returns a session token).
      if (createAccount) {
        const session = await bookingFetch<{
          customer: { id: string; email: string; fullName: string; phone: string | null; venueId: string };
          sessionToken: string;
          expiresAt: string;
        }>("/api/public/customers/register", {
          method: "POST",
          body: JSON.stringify({
            venueId: DEFAULT_VENUE_ID,
            email: email.trim(),
            fullName: name.trim(),
            phone: phone.trim() || null,
            password,
            marketingOptIn: true,
          }),
        });
        signIn({
          id: session.customer.id, email: session.customer.email, fullName: session.customer.fullName,
          phone: session.customer.phone, venueId: session.customer.venueId,
          sessionToken: session.sessionToken, expiresAt: session.expiresAt,
        });
      }

      setConfirmation({ ...booking, depositPaid: deposit === 0 ? booking.depositPaid : true, status: deposit === 0 ? booking.status : "confirmed" });
      resetDraft();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmation) {
    return <ConfirmationView booking={confirmation} />;
  }

  return (
    <div className="space-y-6">
      <Link href="/book/floor-plan" className="inline-flex items-center text-sm text-white/55 hover:text-white">
        <ArrowLeft className="mr-1 h-4 w-4" /> Change section
      </Link>
      <h1 className="text-3xl font-semibold">Confirm & pay deposit</h1>

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Section title="Your details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="ck-name" label="Full name" required>
                <input id="ck-name" type="text" required value={name} onChange={(e) => setName(e.target.value)}
                  className={inputClass} autoComplete="name" />
              </Field>
              <Field id="ck-email" label="Email" required>
                <input id="ck-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className={inputClass} autoComplete="email" />
              </Field>
              <Field id="ck-phone" label="Phone">
                <input id="ck-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  className={inputClass} autoComplete="tel" />
              </Field>
            </div>
            <Field id="ck-notes" label="Notes for the host (optional)">
              <textarea id="ck-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                placeholder="Allergies, occasion, bottle preferences…"
                className={`${inputClass} min-h-[88px]`} />
            </Field>
            {!customer ? (
              <label className="mt-3 flex items-start gap-2 text-sm text-white/75">
                <input type="checkbox" checked={createAccount} onChange={(e) => setCreateAccount(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-[#F5C56B]" />
                <span>
                  Create an account to manage this booking later.
                  {createAccount ? (
                    <input
                      type="password"
                      placeholder="Password (8+ chars)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${inputClass} mt-2`}
                      autoComplete="new-password"
                    />
                  ) : null}
                </span>
              </label>
            ) : null}
          </Section>

          <Section title="Deposit">
            <div className="rounded-md border border-white/10 bg-white/[0.02] p-4 text-sm text-white/70">
              Your deposit holds the section and is applied to your tab when you arrive.
              If the venue is unable to seat you, we'll refund it within 5 business days.
            </div>
            {deposit > 0 ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_120px_120px]">
                <Field id="ck-card" label="Card number">
                  <input id="ck-card" inputMode="numeric" placeholder="4242 4242 4242 4242" value={card}
                    onChange={(e) => setCard(e.target.value.replace(/\D/g, "").slice(0, 19))}
                    className={inputClass} autoComplete="cc-number" />
                </Field>
                <Field id="ck-exp" label="Exp">
                  <input id="ck-exp" placeholder="MM/YY" value={exp}
                    onChange={(e) => setExp(e.target.value.slice(0, 5))}
                    className={inputClass} autoComplete="cc-exp" />
                </Field>
                <Field id="ck-cvc" label="CVC">
                  <input id="ck-cvc" placeholder="123" value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    className={inputClass} autoComplete="cc-csc" />
                </Field>
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                No deposit required for this booking — you're good to go.
              </div>
            )}
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/45">
              <Lock className="h-3.5 w-3.5" /> Card details are not stored. Mock checkout for staging.
            </div>
          </Section>

          {error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
          ) : null}
        </div>

        {/* Order summary */}
        <aside className="self-start rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="text-xs uppercase tracking-wider text-white/45">Booking summary</div>
          <div className="mt-2 text-xl font-semibold">{draft.tableLabel ?? "Table"}</div>
          <div className="text-sm text-white/65">{draft.sectionName ?? "—"}</div>
          <dl className="mt-4 space-y-2 text-sm">
            <Row k="Date" v={fmtDate(draft.date)} />
            <Row k="Arrival" v={draft.time || "—"} />
            <Row k="Party" v={`${draft.partySize} guests`} />
            {draft.eventTitle ? <Row k="Event" v={draft.eventTitle} /> : null}
          </dl>
          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between text-sm text-white/70">
              <span>Deposit due now</span>
              <span className="text-2xl font-bold text-white">${deposit.toFixed(2)}</span>
            </div>
            {draft.tablePrice ? (
              <div className="mt-1 text-xs text-white/45">Includes ${draft.tablePrice.toFixed(0)} table minimum</div>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#F5C56B] px-4 py-2.5 text-sm font-semibold text-[#0B0E1A] hover:bg-[#FFD27A] disabled:opacity-60"
          >
            <CreditCard className="h-4 w-4" />
            {submitting ? "Processing…" : deposit > 0 ? `Pay $${deposit.toFixed(2)} & confirm` : "Confirm reservation"}
          </button>
          <div className="mt-3 text-center text-[11px] text-white/45">
            Free cancellation up to 24 hours before your reservation.
          </div>
        </aside>
      </form>
    </div>
  );
}

function ConfirmationView({ booking }: { booking: CreatedBooking }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-300" />
        <h1 className="mt-4 text-3xl font-semibold">You're in.</h1>
        <p className="mt-2 text-white/75">
          Confirmation sent to {booking.guestEmail}. Show this code at the door.
        </p>
        <div className="mt-6 inline-block rounded-xl border border-white/15 bg-[#0B0E1A]/60 px-6 py-3 font-mono text-2xl tracking-[0.18em] text-[#F5C56B]">
          {booking.confirmationCode ?? booking.id.slice(0, 8).toUpperCase()}
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="text-xs uppercase tracking-wider text-white/45">Reservation</div>
        <dl className="mt-3 grid gap-2 text-sm">
          <Row k="Date" v={fmtDate(booking.date)} />
          <Row k="Arrival" v={booking.time} />
          <Row k="Party" v={`${booking.partySize} guests`} />
          <Row k="Status" v={booking.status === "confirmed" ? "Confirmed (deposit paid)" : "Pending"} />
          <Row k="Deposit" v={`$${booking.depositAmount.toFixed(2)} ${booking.depositPaid ? "(paid)" : "(pending)"}`} />
        </dl>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/book/dashboard"
          className="inline-flex items-center justify-center gap-2 rounded-md border border-white/15 bg-white/5 px-4 py-2.5 text-sm hover:bg-white/10">
          View my bookings
        </Link>
        <Link href="/book"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#F5C56B] px-4 py-2.5 text-sm font-semibold text-[#0B0E1A] hover:bg-[#FFD27A]">
          <Sparkles className="h-4 w-4" /> Book another night
        </Link>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-[#F5C56B]/60";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="text-base font-semibold">{title}</div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Field({ id, label, required, children }: {
  id: string; label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="block text-xs uppercase tracking-wider text-white/55 mb-1">
        {label}{required ? <span className="text-[#F5C56B]"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-white/55">{k}</dt>
      <dd className="text-white">{v}</dd>
    </div>
  );
}

function fmtDate(yyyyMMdd: string): string {
  if (!yyyyMMdd) return "—";
  const [y, m, d] = yyyyMMdd.split("-").map((s) => Number(s));
  if (!y || !m || !d) return yyyyMMdd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}
