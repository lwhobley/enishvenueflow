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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [activeVenue, setActiveVenue] = useState<Venue | null>(null);
  const [activeUser, setActiveUser] = useState<User | null>(null);

  const { data: venues, isLoading: isLoadingVenues } = useListVenues();

  useEffect(() => {
    if (venues && venues.length > 0 && !activeVenue) {
      setActiveVenue(venues[0]);
    }
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
