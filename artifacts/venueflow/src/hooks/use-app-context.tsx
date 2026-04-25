import React, { createContext, useContext } from "react";
import { useListVenues } from "@workspace/api-client-react";
import type { Venue } from "@workspace/api-client-react/src/generated/api.schemas";
import { useAuth, type AuthUser } from "@/contexts/auth-context";
import { Loader2 } from "lucide-react";

interface AppContextType {
  activeVenue: Venue | null;
  activeUser: AuthUser | null;
  isLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const activeUser = user;

  // Single-venue app: GET /venues returns just this user's venue. We pick
  // the first (and only) row, or fall back to the venue id from the auth
  // session if the list response is somehow empty.
  const { data: venues, isLoading } = useListVenues();
  const activeVenue =
    venues?.find((v) => v.id === user?.venueId) ?? venues?.[0] ?? null;

  if (isLoading && !activeVenue) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ activeVenue, activeUser, isLoading }}>
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
