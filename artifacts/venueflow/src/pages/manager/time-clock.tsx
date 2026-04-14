import { useAppContext } from "@/hooks/use-app-context";
import { useListActiveClockIns, getListActiveClockInsQueryKey, useListTimeClockEntries, getListTimeClockEntriesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default function ManagerTimeClock() {
  const { activeVenue } = useAppContext();
  
  const { data: activeClockIns } = useListActiveClockIns(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListActiveClockInsQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  const { data: history } = useListTimeClockEntries(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListTimeClockEntriesQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Time Clock</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Currently Clocked In</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Clock In Time</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeClockIns?.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.userName}</TableCell>
                  <TableCell>{format(new Date(entry.clockIn), 'PP pp')}</TableCell>
                  <TableCell>
                    <Badge className="bg-green-500">Active</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!activeClockIns?.length && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    No employees currently clocked in.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entry History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Clock In</TableHead>
                <TableHead>Clock Out</TableHead>
                <TableHead>Total Hours</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history?.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.userName}</TableCell>
                  <TableCell>{format(new Date(entry.clockIn), 'PP pp')}</TableCell>
                  <TableCell>{entry.clockOut ? format(new Date(entry.clockOut), 'PP pp') : '-'}</TableCell>
                  <TableCell>{entry.totalHours?.toFixed(2) || '-'}</TableCell>
                  <TableCell>
                    {entry.status === 'active' ? (
                      <Badge className="bg-green-500">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Completed</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
               {!history?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No time clock history.
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
