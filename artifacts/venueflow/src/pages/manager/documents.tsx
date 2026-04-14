import { useAppContext } from "@/hooks/use-app-context";
import { useListDocuments, getListDocumentsQueryKey, useListExpiringDocuments, getListExpiringDocumentsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle, FileText, Download } from "lucide-react";
import { format } from "date-fns";

export default function ManagerDocuments() {
  const { activeVenue } = useAppContext();
  
  const { data: documents } = useListDocuments(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListDocumentsQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  const { data: expiring } = useListExpiringDocuments(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListExpiringDocumentsQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-500">Active</Badge>;
      case 'expired': return <Badge className="bg-red-500">Expired</Badge>;
      case 'expiring_soon': return <Badge className="bg-yellow-500">Expiring Soon</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
        <Button>
          <Plus className="w-4 h-4 mr-2" /> Upload Document
        </Button>
      </div>

      {expiring && expiring.length > 0 && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-600 flex items-center text-base">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Attention Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-600 dark:text-red-400">
              You have {expiring.length} document(s) expiring soon or already expired.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents?.map(doc => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium flex items-center">
                    <FileText className="w-4 h-4 mr-2 text-muted-foreground" />
                    {doc.title}
                  </TableCell>
                  <TableCell className="capitalize">{doc.type}</TableCell>
                  <TableCell>{doc.userName || '-'}</TableCell>
                  <TableCell>{doc.expiryDate ? format(new Date(doc.expiryDate), 'PP') : '-'}</TableCell>
                  <TableCell>{getStatusBadge(doc.status)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon">
                      <Download className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!documents?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No documents uploaded yet.
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
