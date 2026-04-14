import { useAppContext } from "@/hooks/use-app-context";
import { useListPayrollRecords, getListPayrollRecordsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet } from "lucide-react";

export default function ManagerPayroll() {
  const { activeVenue } = useAppContext();
  
  const { data: records } = useListPayrollRecords(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListPayrollRecordsQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button>
            <FileSpreadsheet className="w-4 h-4 mr-2" /> Generate Payroll
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Period Records</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Regular Hrs</TableHead>
                <TableHead className="text-right">OT Hrs</TableHead>
                <TableHead className="text-right">Tips</TableHead>
                <TableHead className="text-right">Total Pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records?.map(rec => (
                <TableRow key={rec.id}>
                  <TableCell className="font-medium">{rec.userName}</TableCell>
                  <TableCell className="text-right">{rec.regularHours.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{rec.overtimeHours.toFixed(2)}</TableCell>
                  <TableCell className="text-right">${rec.tipAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-bold">${rec.totalPay.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {!records?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No payroll records found.
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
