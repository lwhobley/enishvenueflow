import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/hooks/use-app-context";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { Layout } from "@/components/layout";
import AuthPage from "@/pages/auth";
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
import ManagerChat from "@/pages/manager/chat";
import ManagerSettings from "@/pages/manager/settings";
import ManagerVenues from "@/pages/manager/venues";

// Employee Pages
import EmployeeDashboard from "@/pages/employee/dashboard";
import EmployeeSchedule from "@/pages/employee/schedule";
import EmployeeFloor from "@/pages/employee/floor";
import EmployeeChat from "@/pages/employee/chat";
import EmployeeTimeClock from "@/pages/employee/time-clock";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/manager/dashboard" />
      </Route>
      <Route path="/manager/dashboard"><Layout><ManagerDashboard /></Layout></Route>
      <Route path="/manager/schedule"><Layout><ManagerSchedule /></Layout></Route>
      <Route path="/manager/ai-schedule"><Layout><ManagerAISchedule /></Layout></Route>
      <Route path="/manager/employees"><Layout><ManagerEmployees /></Layout></Route>
      <Route path="/manager/floor"><Layout><ManagerFloor /></Layout></Route>
      <Route path="/manager/reservations"><Layout><ManagerReservations /></Layout></Route>
      <Route path="/manager/guests"><Layout><ManagerGuests /></Layout></Route>
      <Route path="/manager/analytics"><Layout><ManagerAnalytics /></Layout></Route>
      <Route path="/manager/time-clock"><Layout><ManagerTimeClock /></Layout></Route>
      <Route path="/manager/time-off"><Layout><ManagerTimeOff /></Layout></Route>
      <Route path="/manager/payroll"><Layout><ManagerPayroll /></Layout></Route>
      <Route path="/manager/tip-pool"><Layout><ManagerTipPool /></Layout></Route>
      <Route path="/manager/documents"><Layout><ManagerDocuments /></Layout></Route>
      <Route path="/manager/chat"><Layout><ManagerChat /></Layout></Route>
      <Route path="/manager/settings"><Layout><ManagerSettings /></Layout></Route>
      <Route path="/manager/venues"><Layout><ManagerVenues /></Layout></Route>
      <Route path="/employee/dashboard"><Layout isEmployee><EmployeeDashboard /></Layout></Route>
      <Route path="/employee/schedule"><Layout isEmployee><EmployeeSchedule /></Layout></Route>
      <Route path="/employee/floor"><Layout isEmployee><EmployeeFloor /></Layout></Route>
      <Route path="/employee/chat"><Layout isEmployee><EmployeeChat /></Layout></Route>
      <Route path="/employee/time-clock"><Layout isEmployee><EmployeeTimeClock /></Layout></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { user } = useAuth();
  if (!user) return <AuthPage />;
  return (
    <AppProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
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
