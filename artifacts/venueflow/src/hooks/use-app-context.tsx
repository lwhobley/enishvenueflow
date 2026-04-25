import React, { createContext, useContext, useState, useEffect } from "react";
import { useListVenues } from "@workspace/api-client-react";
import type { Venue } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth, type AuthUser } from "@/contexts/auth-context";
import { Loader2 } from "lucide-react";

interface AppContextType {
  activeVenue: Venue | null;
  activeUser: AuthUser | null;
  setActiveVenue: (venue: Venue) => void;
  isLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
const ACTIVE_VENUE_KEY = "enosh-active-venue-id";

function readStoredVenueId(): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_VENUE_KEY) : null;
  } catch {
    return null;
  }
}

function writeStoredVenueId(id: string | null) {
  try {
    if (typeof window === "undefined") return;
    if (id) window.localStorage.setItem(ACTIVE_VENUE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_VENUE_KEY);
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // activeUser is always the authenticated user — never substituted with
  // someone else (previously this code defaulted to the first admin in the
  // venue, which silently impersonated whoever logged in).
  const activeUser = user;

  const [activeVenue, setActiveVenueState] = useState<Venue | null>(null);

  const setActiveVenue = (venue: Venue) => {
    setActiveVenueState(venue);
    writeStoredVenueId(venue.id);
  };

  const { data: venues, isLoading: isLoadingVenues } = useListVenues();

  // Pick the venue this device last used (persisted in localStorage). Falls
  // back to venues[0] only when no stored id matches; non-admins should
  // ultimately always see only their own venue, but until we filter
  // server-side this keeps behavior consistent across devices.
  useEffect(() => {
    if (!venues || venues.length === 0 || activeVenue) return;
    const storedId = readStoredVenueId();
    const fromStorage = storedId ? venues.find((v) => v.id === storedId) : null;
    // If the authenticated user has a venueId and it appears in the list,
    // honor that first — non-admins should never end up viewing a different
    // venue's data.
    const fromAuth = user?.venueId ? venues.find((v) => v.id === user.venueId) : null;
    const next = fromStorage ?? fromAuth ?? venues[0];
    setActiveVenueState(next);
    writeStoredVenueId(next.id);
  }, [venues, activeVenue, user?.venueId]);

  const isLoading = isLoadingVenues;

  if (isLoading && !activeVenue) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppContext.Provider
      value={{
        activeVenue,
        activeUser,
        setActiveVenue,
        isLoading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
}
