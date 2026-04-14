import { useState } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { useListTimeClockEntries, getListTimeClockEntriesQueryKey, useClockIn, useClockOut, useListActiveClockIns, getListActiveClockInsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Clock, Play, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function EmployeeTimeClock() {
  const { activeVenue, activeUser } = useAppContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [time, setTime] = useState(new Date());

  // Update clock every second
  useState(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  });

  const { data: activeEntries } = useListActiveClockIns(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListActiveClockInsQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  const { data: history } = useListTimeClockEntries(
    { venueId: activeVenue?.id || "", userId: activeUser?.id || "" },
    { query: { enabled: !!activeVenue?.id && !!activeUser?.id, queryKey: getListTimeClockEntriesQueryKey({ venueId: activeVenue?.id || "", userId: activeUser?.id || "" }) } }
  );

  const activeEntry = activeEntries?.find(e => e.userId === activeUser?.id);
  const isClockedIn = !!activeEntry;

  const clockIn = useClockIn();
  const clockOut = useClockOut();

  const handleClockIn = () => {
    if (!activeVenue || !activeUser) return;
    clockIn.mutate({
      data: { venueId: activeVenue.id, userId: activeUser.id }
    }, {
      onSuccess: () => {
        toast({ title: "Clocked In", description: "You have successfully clocked in." });
        queryClient.invalidateQueries({ queryKey: getListActiveClockInsQueryKey({ venueId: activeVenue.id }) });
        queryClient.invalidateQueries({ queryKey: getListTimeClockEntriesQueryKey({ venueId: activeVenue.id, userId: activeUser.id }) });
      }
    });
  };

  const handleClockOut = () => {
    if (!activeVenue || !activeUser) return;
    clockOut.mutate({
      data: { venueId: activeVenue.id, userId: activeUser.id }
    }, {
      onSuccess: () => {
        toast({ title: "Clocked Out", description: "You have successfully clocked out." });
        queryClient.invalidateQueries({ queryKey: getListActiveClockInsQueryKey({ venueId: activeVenue.id }) });
        queryClient.invalidateQueries({ queryKey: getListTimeClockEntriesQueryKey({ venueId: activeVenue.id, userId: activeUser.id }) });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Time Clock</h1>
      </div>

      <Card className="text-center py-12">
        <CardContent className="space-y-8">
          <div className="text-6xl font-bold tracking-tighter tabular-nums">
            {format(time, 'HH:mm:ss')}
          </div>
          <div className="text-xl text-muted-foreground">
            {format(time, 'EEEE, MMMM do, yyyy')}
          </div>

          <div className="flex justify-center pt-8">
            {!isClockedIn ? (
              <Button 
                size="lg" 
                className="h-24 px-12 text-xl bg-green-600 hover:bg-green-700 text-white rounded-2xl"
                onClick={handleClockIn}
                disabled={clockIn.isPending}
              >
                <Play className="w-8 h-8 mr-3 fill-current" />
                Clock In
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="text-green-600 font-medium flex items-center justify-center">
                  <span className="relative flex h-3 w-3 mr-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                  Currently clocked in since {format(new Date(activeEntry.clockIn), 'h:mm a')}
                </div>
                <Button 
                  size="lg" 
                  className="h-24 px-12 text-xl bg-red-600 hover:bg-red-700 text-white rounded-2xl"
                  onClick={handleClockOut}
                  disabled={clockOut.isPending}
                >
                  <Square className="w-8 h-8 mr-3 fill-current" />
                  Clock Out
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My Time Entries</CardTitle>
          <CardDescription>Recent shifts worked.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Clock In</TableHead>
                <TableHead>Clock Out</TableHead>
                <TableHead className="text-right">Total Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history?.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{format(new Date(entry.clockIn), 'MMM d, yyyy')}</TableCell>
                  <TableCell>{format(new Date(entry.clockIn), 'p')}</TableCell>
                  <TableCell>{entry.clockOut ? format(new Date(entry.clockOut), 'p') : 'Active'}</TableCell>
                  <TableCell className="text-right font-bold">{entry.totalHours?.toFixed(2) || '-'}</TableCell>
                </TableRow>
              ))}
              {!history?.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No recent time entries.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
