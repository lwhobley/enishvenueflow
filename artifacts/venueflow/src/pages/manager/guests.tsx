import { useAppContext } from "@/hooks/use-app-context";
import { useListGuests, getListGuestsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Star } from "lucide-react";

export default function ManagerGuests() {
  const { activeVenue } = useAppContext();
  
  const { data: guests, isLoading } = useListGuests(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListGuestsQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Guests</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Guest Directory</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>VIP</TableHead>
                  <TableHead>Visits</TableHead>
                  <TableHead>Total Spent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests?.map(guest => (
                  <TableRow key={guest.id}>
                    <TableCell className="font-medium">{guest.fullName}</TableCell>
                    <TableCell>
                      <div className="flex">
                        {[...Array(3)].map((_, i) => (
                          <Star key={i} className={`w-4 h-4 ${i < guest.vipLevel ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{guest.visitCount}</TableCell>
                    <TableCell>${guest.totalSpent.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {!guests?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No guests found.
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
