import { useAppContext } from "@/hooks/use-app-context";
import { useListShifts, getListShiftsQueryKey, useListOpenShifts, getListOpenShiftsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

export default function EmployeeSchedule() {
  const { activeVenue, activeUser } = useAppContext();
  
  const { data: myShifts } = useListShifts(
    { venueId: activeVenue?.id || "", userId: activeUser?.id || "" },
    { query: { enabled: !!activeVenue?.id && !!activeUser?.id, queryKey: getListShiftsQueryKey({ venueId: activeVenue?.id || "", userId: activeUser?.id || "" }) } }
  );

  const { data: openShifts } = useListOpenShifts(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListOpenShiftsQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">My Schedule</h1>
      </div>

      <Tabs defaultValue="mine" className="w-full">
        <TabsList>
          <TabsTrigger value="mine">My Shifts</TabsTrigger>
          <TabsTrigger value="open">Open Shifts ({openShifts?.length || 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="mine">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {myShifts?.map(shift => (
                  <div key={shift.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-4">
                    <div>
                      <div className="font-medium text-lg">{format(new Date(shift.startTime), 'EEEE, MMMM do')}</div>
                      <div className="text-muted-foreground">
                        {format(new Date(shift.startTime), 'p')} - {format(new Date(shift.endTime), 'p')}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm font-medium px-3 py-1 rounded-full" style={{ backgroundColor: `${shift.roleColor}20`, color: shift.roleColor || 'inherit' }}>
                        {shift.roleName}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">Swap</Button>
                        <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600">Drop</Button>
                      </div>
                    </div>
                  </div>
                ))}
                {!myShifts?.length && (
                  <div className="text-center py-8 text-muted-foreground">
                    No upcoming shifts.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="open">
          <Card>
            <CardHeader>
              <CardTitle>Available to Pickup</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {openShifts?.map(shift => (
                  <div key={shift.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-4">
                    <div>
                      <div className="font-medium text-lg">{format(new Date(shift.startTime), 'EEEE, MMMM do')}</div>
                      <div className="text-muted-foreground">
                        {format(new Date(shift.startTime), 'p')} - {format(new Date(shift.endTime), 'p')}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm font-medium px-3 py-1 rounded-full" style={{ backgroundColor: `${shift.roleColor}20`, color: shift.roleColor || 'inherit' }}>
                        {shift.roleName}
                      </div>
                      <Button size="sm">Pickup Shift</Button>
                    </div>
                  </div>
                ))}
                {!openShifts?.length && (
                  <div className="text-center py-8 text-muted-foreground">
                    No open shifts available.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
