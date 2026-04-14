import { useAppContext } from "@/hooks/use-app-context";
import { useGetDashboardAnalytics, getGetDashboardAnalyticsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, CalendarCheck, Activity, UserPlus, FileClock, ShieldAlert, BarChart3, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function ManagerDashboard() {
  const { activeVenue } = useAppContext();
  
  const { data: stats, isLoading } = useGetDashboardAnalytics(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getGetDashboardAnalyticsQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    { title: "Active Staff", value: stats.activeStaffCount, icon: Users, color: "text-blue-500" },
    { title: "Shifts Today", value: stats.shiftsToday, icon: Clock, color: "text-indigo-500" },
    { title: "Open Shifts", value: stats.openShifts, icon: AlertCircle, color: "text-amber-500" },
    { title: "Labor %", value: `${stats.laborPct}%`, icon: BarChart3, color: "text-green-500" },
    { title: "Waitlist", value: stats.waitlistCount, icon: UserPlus, color: "text-purple-500" },
    { title: "Reservations Today", value: stats.reservationsToday, icon: CalendarCheck, color: "text-pink-500" },
    { title: "Clocked In Now", value: stats.clockedInNow, icon: Activity, color: "text-emerald-500" },
    { title: "Pending Time Off", value: stats.pendingTimeOff, icon: FileClock, color: "text-orange-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
