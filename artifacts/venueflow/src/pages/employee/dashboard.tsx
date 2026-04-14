import { useAppContext } from "@/hooks/use-app-context";
import { useListShifts, getListShiftsQueryKey, useListNotifications, getListNotificationsQueryKey, useListTimeOffRequests, getListTimeOffRequestsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Calendar, Bell, CalendarOff } from "lucide-react";
import { format } from "date-fns";

export default function EmployeeDashboard() {
  const { activeVenue, activeUser } = useAppContext();
  
  const { data: shifts } = useListShifts(
    { venueId: activeVenue?.id || "", userId: activeUser?.id || "" },
    { query: { enabled: !!activeVenue?.id && !!activeUser?.id, queryKey: getListShiftsQueryKey({ venueId: activeVenue?.id || "", userId: activeUser?.id || "" }) } }
  );

  const { data: notifications } = useListNotifications(
    { userId: activeUser?.id || "" },
    { query: { enabled: !!activeUser?.id, queryKey: getListNotificationsQueryKey({ userId: activeUser?.id || "" }) } }
  );

  const { data: timeOff } = useListTimeOffRequests(
    { venueId: activeVenue?.id || "", userId: activeUser?.id || "" },
    { query: { enabled: !!activeVenue?.id && !!activeUser?.id, queryKey: getListTimeOffRequestsQueryKey({ venueId: activeVenue?.id || "", userId: activeUser?.id || "" }) } }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Welcome, {activeUser?.fullName}</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="w-5 h-5 mr-2" />
              Upcoming Shifts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {shifts?.slice(0, 5).map(shift => (
                <div key={shift.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">{format(new Date(shift.startTime), 'EEEE, MMMM do')}</div>
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(shift.startTime), 'p')} - {format(new Date(shift.endTime), 'p')}
                    </div>
                  </div>
                  <div className="text-sm font-medium px-3 py-1 rounded-full" style={{ backgroundColor: `${shift.roleColor}20`, color: shift.roleColor || 'inherit' }}>
                    {shift.roleName}
                  </div>
                </div>
              ))}
              {!shifts?.length && (
                <div className="text-center py-8 text-muted-foreground">
                  No upcoming shifts scheduled.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Bell className="w-5 h-5 mr-2" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {notifications?.slice(0, 5).map(notif => (
                  <div key={notif.id} className="text-sm border-b pb-3 last:border-0 last:pb-0">
                    <div className="font-medium">{notif.title}</div>
                    <div className="text-muted-foreground">{notif.content}</div>
                  </div>
                ))}
                {!notifications?.length && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No new notifications.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CalendarOff className="w-5 h-5 mr-2" />
                Time Off
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {timeOff?.slice(0, 3).map(req => (
                  <div key={req.id} className="flex justify-between items-center text-sm border-b pb-3 last:border-0 last:pb-0">
                    <div>
                      <div className="capitalize font-medium">{req.type}</div>
                      <div className="text-muted-foreground">{req.startDate}</div>
                    </div>
                    <div className={`px-2 py-1 rounded text-xs ${
                      req.status === 'approved' ? 'bg-green-100 text-green-800' :
                      req.status === 'denied' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {req.status}
                    </div>
                  </div>
                ))}
                {!timeOff?.length && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No time off requests.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
