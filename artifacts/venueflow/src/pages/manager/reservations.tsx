import { useAppContext } from "@/hooks/use-app-context";
import { useListReservations, getListReservationsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function ManagerReservations() {
  const { activeVenue } = useAppContext();
  
  const { data: reservations, isLoading } = useListReservations(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListReservationsQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-500';
      case 'seated': return 'bg-blue-500';
      case 'pending': return 'bg-yellow-500';
      case 'cancelled': return 'bg-red-500';
      case 'no_show': return 'bg-red-700';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Reservations</h1>
        <Button>
          <Plus className="w-4 h-4 mr-2" /> New Reservation
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today's Reservations</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Party Size</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations?.map(res => (
                  <TableRow key={res.id}>
                    <TableCell>{res.time}</TableCell>
                    <TableCell className="font-medium">{res.guestName}</TableCell>
                    <TableCell>{res.partySize}</TableCell>
                    <TableCell>
                      <Badge className={`${getStatusColor(res.status)} text-white`}>
                        {res.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!reservations?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No reservations today.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
