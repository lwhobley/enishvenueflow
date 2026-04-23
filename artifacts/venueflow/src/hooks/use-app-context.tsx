import React, { createContext, useContext, useState, useEffect } from "react";
import { useListVenues, useListUsers } from "@workspace/api-client-react";
import type { Venue, User } from "@workspace/api-client-react/src/generated/api.schemas";
import { Loader2 } from "lucide-react";

interface AppContextType {
  activeVenue: Venue | null;
  activeUser: User | null;
  setActiveVenue: (venue: Venue) => void;
  setActiveUser: (user: User) => void;
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
  const [activeVenue, setActiveVenueState] = useState<Venue | null>(null);
  const [activeUser, setActiveUser] = useState<User | null>(null);

  const setActiveVenue = (venue: Venue) => {
    setActiveVenueState(venue);
    writeStoredVenueId(venue.id);
  };

  const { data: venues, isLoading: isLoadingVenues } = useListVenues();

  // Pick the venue this device last used (persisted in localStorage). Falls
  // back to venues[0] only when no stored id matches — this keeps two
  // devices with mismatched venue list ordering from silently loading
  // different data.
  useEffect(() => {
    if (!venues || venues.length === 0 || activeVenue) return;
    const storedId = readStoredVenueId();
    const fromStorage = storedId ? venues.find((v) => v.id === storedId) : null;
    const next = fromStorage ?? venues[0];
    setActiveVenueState(next);
    writeStoredVenueId(next.id);
  }, [venues, activeVenue]);

  const { data: users, isLoading: isLoadingUsers } = useListUsers(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id } }
  );

  useEffect(() => {
    if (users && users.length > 0 && !activeUser) {
      // Find an admin user if possible, else just the first user
      const admin = users.find(u => u.isAdmin);
      setActiveUser(admin || users[0]);
    }
  }, [users, activeUser]);

  const isLoading = isLoadingVenues || (!!activeVenue && isLoadingUsers);

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
        setActiveUser,
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
