import { useAppContext } from "@/hooks/use-app-context";
import { useListTipPools, getListTipPoolsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { format } from "date-fns";

export default function ManagerTipPool() {
  const { activeVenue } = useAppContext();
  
  const { data: pools } = useListTipPools(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListTipPoolsQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Tip Pools</h1>
        <Button>
          <Plus className="w-4 h-4 mr-2" /> Create Tip Pool
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Tip Pools</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Total Tips</TableHead>
                <TableHead>Distribution</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pools?.map(pool => (
                <TableRow key={pool.id}>
                  <TableCell>{format(new Date(pool.createdAt), 'PP')}</TableCell>
                  <TableCell>${pool.totalTips.toFixed(2)}</TableCell>
                  <TableCell className="capitalize">{pool.distributionMethod}</TableCell>
                  <TableCell>
                    {pool.status === 'distributed' ? (
                      <Badge className="bg-green-500">Distributed</Badge>
                    ) : (
                      <Badge className="bg-yellow-500">Draft</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!pools?.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No tip pools found.
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
