import { useState } from "react";
import { Link, useLocation } from "wouter";
import { bookingFetch, useBooking, DEFAULT_VENUE_ID } from "@/contexts/booking-context";

interface AuthResponse {
  customer: { id: string; email: string; fullName: string; phone: string | null; venueId: string };
  sessionToken: string;
  expiresAt: string;
}

// Single component used for both /book/login and /book/register — toggled
// by the `mode` prop. Keeps the visual treatment + form layout in one
// place so the two screens stay perfectly consistent.
export default function BookAuth({ mode }: { mode: "login" | "register" }) {
  const [, navigate] = useLocation();
  const { signIn } = useBooking();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const path = mode === "login"
        ? "/api/public/customers/login"
        : "/api/public/customers/register";
      const body = mode === "login"
        ? { venueId: DEFAULT_VENUE_ID, email: email.trim(), password }
        : { venueId: DEFAULT_VENUE_ID, email: email.trim(), password, fullName: fullName.trim(), phone: phone.trim() || null, marketingOptIn };
      const session = await bookingFetch<AuthResponse>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      signIn({
        id: session.customer.id, email: session.customer.email, fullName: session.customer.fullName,
        phone: session.customer.phone, venueId: session.customer.venueId,
        sessionToken: session.sessionToken, expiresAt: session.expiresAt,
      });
      navigate("/book/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h1>
        <p className="mt-1 text-sm text-white/65">
          {mode === "login"
            ? "Welcome back. Pick up where you left off."
            : "An account makes managing future bookings easier."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "register" ? (
            <>
              <Field id="au-name" label="Full name" required>
                <input id="au-name" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                  className={inputClass} autoComplete="name" />
              </Field>
              <Field id="au-phone" label="Phone">
                <input id="au-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  className={inputClass} autoComplete="tel" />
              </Field>
            </>
          ) : null}
          <Field id="au-email" label="Email" required>
            <input id="au-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className={inputClass} autoComplete="email" />
          </Field>
          <Field id="au-pw" label="Password" required>
            <input id="au-pw" type="password" required value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={mode === "register" ? 8 : undefined}
              className={inputClass}
              autoComplete={mode === "register" ? "new-password" : "current-password"} />
          </Field>
          {mode === "register" ? (
            <label className="flex items-start gap-2 text-sm text-white/75">
              <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)}
                className="mt-1 h-4 w-4 accent-[#F5C56B]" />
              <span>Email me about upcoming events at Enish.</span>
            </label>
          ) : null}

          {error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-md bg-[#F5C56B] px-4 py-2.5 text-sm font-semibold text-[#0B0E1A] hover:bg-[#FFD27A] disabled:opacity-60"
          >
            {submitting ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-white/55">
          {mode === "login" ? (
            <>New here? <Link href="/book/register" className="text-[#F5C56B] hover:underline">Create an account</Link></>
          ) : (
            <>Already booked with us? <Link href="/book/login" className="text-[#F5C56B] hover:underline">Sign in</Link></>
          )}
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-[#F5C56B]/60";

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
