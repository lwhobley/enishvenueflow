import { useAppContext } from "@/hooks/use-app-context";
import { useListTimeOffRequests, getListTimeOffRequestsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export default function ManagerTimeOff() {
  const { activeVenue } = useAppContext();
  
  const { data: requests } = useListTimeOffRequests(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListTimeOffRequestsQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  const pending = requests?.filter(r => r.status === 'pending') || [];
  const history = requests?.filter(r => r.status !== 'pending') || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-green-500">Approved</Badge>;
      case 'denied': return <Badge className="bg-red-500">Denied</Badge>;
      default: return <Badge className="bg-yellow-500">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Time Off Requests</h1>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Pending Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map(req => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.userName}</TableCell>
                      <TableCell className="capitalize">{req.type}</TableCell>
                      <TableCell>{req.startDate} to {req.endDate}</TableCell>
                      <TableCell>{req.notes}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" className="border-green-500 text-green-500 hover:bg-green-50">Approve</Button>
                        <Button variant="outline" className="border-red-500 text-red-500 hover:bg-red-50">Deny</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pending.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No pending requests.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Request History</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map(req => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.userName}</TableCell>
                      <TableCell className="capitalize">{req.type}</TableCell>
                      <TableCell>{req.startDate} to {req.endDate}</TableCell>
                      <TableCell>{getStatusBadge(req.status)}</TableCell>
                    </TableRow>
                  ))}
                  {history.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No request history.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
