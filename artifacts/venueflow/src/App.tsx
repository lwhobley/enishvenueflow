import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/hooks/use-app-context";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { Layout } from "@/components/layout";
import AuthPage from "@/pages/auth";
import EnrollPage from "@/pages/enroll";
import NotFound from "@/pages/not-found";

// Manager Pages
import ManagerDashboard from "@/pages/manager/dashboard";
import ManagerSchedule from "@/pages/manager/schedule";
import ManagerEmployees from "@/pages/manager/employees";
import ManagerReservations from "@/pages/manager/reservations";
import ManagerGuests from "@/pages/manager/guests";
import ManagerFloor from "@/pages/manager/floor";
import ManagerAnalytics from "@/pages/manager/analytics";
import ManagerTimeClock from "@/pages/manager/time-clock";
import ManagerTimeOff from "@/pages/manager/time-off";
import ManagerPayroll from "@/pages/manager/payroll";
import ManagerAISchedule from "@/pages/manager/ai-schedule";
import ManagerTipPool from "@/pages/manager/tip-pool";
import ManagerDocuments from "@/pages/manager/documents";
import ManagerLiterature from "@/pages/manager/literature";
import ManagerChat from "@/pages/manager/chat";
import ManagerSettings from "@/pages/manager/settings";
import ManagerVenues from "@/pages/manager/venues";
import ManagerIntegrations from "@/pages/manager/integrations";

// Employee Pages
import EmployeeDashboard from "@/pages/employee/dashboard";
import EmployeeSchedule from "@/pages/employee/schedule";
import EmployeeAvailability from "@/pages/employee/availability";
import EmployeeFloor from "@/pages/employee/floor";
import EmployeeChat from "@/pages/employee/chat";
import EmployeeLiterature from "@/pages/employee/literature";
import EmployeeTimeClock from "@/pages/employee/time-clock";

// Global sync cadence: 30 s polling with a 20 s staleTime keeps the whole
// app roughly live across browsers and PWAs without hammering aggregation
// endpoints like analytics/payroll. Pages that need sub-5-s sync (floor plan,
// chat, active time clock) override at the call site. React Query pauses
// polling on hidden tabs (refetchIntervalInBackground: false) and catches up
// on window/reconnect.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 30_000,
      staleTime: 20_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchIntervalInBackground: false,
    },
  },
});

function Router({ isAdmin }: { isAdmin: boolean }) {
  // Gate /manager/* behind the admin flag. Non-admins who land on a manager
  // URL get bounced to /employee/dashboard. The auth wall already handled
  // "no user"; this layer handles "user but not admin".
  const RequireAdmin = ({ children }: { children: React.ReactNode }) =>
    isAdmin ? <>{children}</> : <Redirect to="/employee/dashboard" />;

  return (
    <Switch>
      <Route path="/">
        <Redirect to={isAdmin ? "/manager/dashboard" : "/employee/dashboard"} />
      </Route>
      <Route path="/manager/dashboard"><RequireAdmin><Layout><ManagerDashboard /></Layout></RequireAdmin></Route>
      <Route path="/manager/schedule"><RequireAdmin><Layout><ManagerSchedule /></Layout></RequireAdmin></Route>
      <Route path="/manager/ai-schedule"><RequireAdmin><Layout><ManagerAISchedule /></Layout></RequireAdmin></Route>
      <Route path="/manager/employees"><RequireAdmin><Layout><ManagerEmployees /></Layout></RequireAdmin></Route>
      <Route path="/manager/floor"><RequireAdmin><Layout><ManagerFloor /></Layout></RequireAdmin></Route>
      <Route path="/manager/reservations"><RequireAdmin><Layout><ManagerReservations /></Layout></RequireAdmin></Route>
      <Route path="/manager/guests"><RequireAdmin><Layout><ManagerGuests /></Layout></RequireAdmin></Route>
      <Route path="/manager/analytics"><RequireAdmin><Layout><ManagerAnalytics /></Layout></RequireAdmin></Route>
      <Route path="/manager/time-clock"><RequireAdmin><Layout><ManagerTimeClock /></Layout></RequireAdmin></Route>
      <Route path="/manager/time-off"><RequireAdmin><Layout><ManagerTimeOff /></Layout></RequireAdmin></Route>
      <Route path="/manager/payroll"><RequireAdmin><Layout><ManagerPayroll /></Layout></RequireAdmin></Route>
      <Route path="/manager/tip-pool"><RequireAdmin><Layout><ManagerTipPool /></Layout></RequireAdmin></Route>
      <Route path="/manager/documents"><RequireAdmin><Layout><ManagerDocuments /></Layout></RequireAdmin></Route>
      <Route path="/manager/literature"><RequireAdmin><Layout><ManagerLiterature /></Layout></RequireAdmin></Route>
      <Route path="/manager/chat"><RequireAdmin><Layout><ManagerChat /></Layout></RequireAdmin></Route>
      <Route path="/manager/settings"><RequireAdmin><Layout><ManagerSettings /></Layout></RequireAdmin></Route>
      <Route path="/manager/venues"><RequireAdmin><Layout><ManagerVenues /></Layout></RequireAdmin></Route>
      <Route path="/manager/integrations"><RequireAdmin><Layout><ManagerIntegrations /></Layout></RequireAdmin></Route>
      <Route path="/employee/dashboard"><Layout isEmployee><EmployeeDashboard /></Layout></Route>
      <Route path="/employee/schedule"><Layout isEmployee><EmployeeSchedule /></Layout></Route>
      <Route path="/employee/availability"><Layout isEmployee><EmployeeAvailability /></Layout></Route>
      <Route path="/employee/floor"><Layout isEmployee><EmployeeFloor /></Layout></Route>
      <Route path="/employee/chat"><Layout isEmployee><EmployeeChat /></Layout></Route>
      <Route path="/employee/literature"><Layout isEmployee><EmployeeLiterature /></Layout></Route>
      <Route path="/employee/time-clock"><Layout isEmployee><EmployeeTimeClock /></Layout></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { user } = useAuth();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  // Enrollment links are public — they must not be blocked by the PIN auth
  // wall, and they don't need the venue/user bootstrap.
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const enrollPrefix = `${base}/enroll/`;
  if (path.startsWith(enrollPrefix) || path.startsWith("/enroll/")) {
    return (
      <WouterRouter base={base}>
        <Switch>
          <Route path="/enroll/:venueId/:token" component={EnrollPage} />
          <Route component={NotFound} />
        </Switch>
      </WouterRouter>
    );
  }

  if (!user) return <AuthPage />;
  return (
    <AppProvider>
      <WouterRouter base={base}>
        <Router isAdmin={!!user.isAdmin} />
      </WouterRouter>
    </AppProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <AppContent />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
