import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/hooks/use-app-context";
import { useListGuests, getListGuestsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Star, Upload } from "lucide-react";
import { CsvImportDialog, type CsvImportConfig, type ImportResult } from "@/components/csv-import-dialog";

const guestImportConfig: CsvImportConfig = {
  fields: [
    { key: "fullName", label: "Name", aliases: ["full name", "guest name", "guest"], required: true },
    { key: "email", label: "Email", aliases: ["email address"] },
    { key: "phone", label: "Phone", aliases: ["phone number", "cell", "mobile"] },
    { key: "birthday", label: "Birthday", aliases: ["dob", "date of birth"] },
    {
      key: "vipLevel", label: "VIP Level", aliases: ["vip"],
      transform: (v) => (v === "" ? 0 : Math.max(0, Math.min(3, Math.round(Number(v)) || 0))),
    },
    {
      key: "tags", label: "Tags", aliases: ["tag", "labels"],
      transform: (v) => v.split(/[,;|]/).map((s) => s.trim()).filter(Boolean),
    },
    { key: "notes", label: "Notes", aliases: ["comments", "comment"] },
  ],
};

export default function ManagerGuests() {
  const { activeVenue } = useAppContext();
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);

  const { data: guests, isLoading } = useListGuests(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListGuestsQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  const handleImport = async (rows: Array<Record<string, unknown>>): Promise<ImportResult> => {
    if (!activeVenue?.id) throw new Error("No active venue");
    const res = await fetch("/api/guests/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venueId: activeVenue.id, guests: rows }),
    });
    const json = (await res.json().catch(() => ({}))) as ImportResult & { message?: string };
    if (!res.ok) throw new Error(json.message ?? `Import failed (${res.status})`);
    await queryClient.invalidateQueries({ queryKey: getListGuestsQueryKey({ venueId: activeVenue.id }) });
    return json;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Guests</h1>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="w-4 h-4 mr-2" /> Import CSV
        </Button>
      </div>

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import guests from CSV"
        description="Upload a CSV exported from your previous guest book or POS. Duplicates are skipped on email or phone."
        sampleHeaders="Name,Email,Phone,Birthday,VIP Level,Tags,Notes"
        config={guestImportConfig}
        onSubmit={handleImport}
      />

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
