import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";

// The customer-facing booking site is a separate authentication realm
// from the staff app — managers/employees use PIN auth and a `users`
// session, customers use email+password and a `customer_sessions`
// session. Keeping them in two contexts means a manager who's also
// booking a table for themselves doesn't blow away their staff session.

const STORAGE_KEY = "enish-booking-customer";
// Single venue today (the seeded ENISH row). When the platform onboards
// more venues, swap this for a per-subdomain or path-based resolver.
export const DEFAULT_VENUE_ID = "venue-enosh";

export interface BookingCustomer {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  venueId: string;
  sessionToken: string;
  expiresAt: string;
}

interface BookingContextValue {
  customer: BookingCustomer | null;
  venueId: string;
  signIn: (customer: BookingCustomer) => void;
  signOut: () => void;
  // Pulled out so call sites (checkout, floor picker) can build a
  // shared draft without prop-drilling through the page tree.
  draft: BookingDraft;
  setDraft: (next: Partial<BookingDraft>) => void;
  resetDraft: () => void;
}

export interface BookingDraft {
  date: string;            // YYYY-MM-DD
  time: string;            // HH:MM
  partySize: number;
  eventId: string | null;
  eventTitle: string | null;
  tableId: string | null;
  tableLabel: string | null;
  sectionId: string | null;
  sectionName: string | null;
  tablePrice: number | null;   // table minimum if any
  depositAmount: number;       // computed at checkout
  notes: string;
}

const blankDraft: BookingDraft = {
  date: "",
  time: "21:30",
  partySize: 2,
  eventId: null,
  eventTitle: null,
  tableId: null,
  tableLabel: null,
  sectionId: null,
  sectionName: null,
  tablePrice: null,
  depositAmount: 0,
  notes: "",
};

const Ctx = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<BookingCustomer | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as BookingCustomer;
      if (!parsed.sessionToken) return null;
      if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) return null;
      return parsed;
    } catch {
      return null;
    }
  });

  const [draft, setDraftState] = useState<BookingDraft>(() => {
    try {
      const raw = sessionStorage.getItem("enish-booking-draft");
      return raw ? { ...blankDraft, ...JSON.parse(raw) } : blankDraft;
    } catch {
      return blankDraft;
    }
  });

  useEffect(() => {
    try { sessionStorage.setItem("enish-booking-draft", JSON.stringify(draft)); }
    catch { /* ignore quota errors */ }
  }, [draft]);

  const signIn = useCallback((next: BookingCustomer) => {
    setCustomer(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { /* ignore */ }
  }, []);

  const signOut = useCallback(() => {
    setCustomer(null);
    try { localStorage.removeItem(STORAGE_KEY); }
    catch { /* ignore */ }
  }, []);

  const setDraft = useCallback((next: Partial<BookingDraft>) => {
    setDraftState((prev) => ({ ...prev, ...next }));
  }, []);

  const resetDraft = useCallback(() => {
    setDraftState(blankDraft);
    try { sessionStorage.removeItem("enish-booking-draft"); }
    catch { /* ignore */ }
  }, []);

  const value = useMemo<BookingContextValue>(() => ({
    customer, venueId: DEFAULT_VENUE_ID, signIn, signOut,
    draft, setDraft, resetDraft,
  }), [customer, signIn, signOut, draft, setDraft, resetDraft]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBooking(): BookingContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBooking must be used within BookingProvider");
  return v;
}

// Wrapper around fetch that injects the booking customer's bearer token
// when they're signed in — used for /public/customers/me, /bookings/mine,
// /bookings/:id/cancel. Anonymous public endpoints still work because
// the server treats a missing Authorization header as "guest".
export async function bookingFetch<T = unknown>(
  url: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body && typeof init.body === "string") {
    headers.set("content-type", "application/json");
  }
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && typeof data === "object" && "message" in data)
      ? String((data as { message: unknown }).message)
      : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}
