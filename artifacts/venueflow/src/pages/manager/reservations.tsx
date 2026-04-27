import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/hooks/use-app-context";
import { useListReservations, getListReservationsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { CsvImportDialog, type CsvImportConfig, type ImportResult } from "@/components/csv-import-dialog";
import { normalizeDate, normalizeTime } from "@/lib/csv";
import { BookingFlow } from "@/components/booking-flow";

// Maps the strings restaurants typically export ("Reserved" / "Seated" /
// "No-show" / "Confirmed" / etc.) to the canonical statuses our schema
// stores. Anything unrecognized falls back to "confirmed" because most
// imported reservations are confirmed bookings.
function normalizeImportedStatus(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!t) return "confirmed";
  if (t === "reserved" || t === "confirmed" || t === "booked") return "confirmed";
  if (t === "pending" || t === "tentative" || t === "request") return "pending";
  if (t === "arrived" || t === "checkedin") return "arrived";
  if (t === "seated") return "seated";
  if (t === "completed" || t === "departed" || t === "done" || t === "finished") return "completed";
  if (t === "cancelled" || t === "canceled") return "cancelled";
  if (t === "noshow") return "no_show";
  return "confirmed";
}

const reservationImportConfig: CsvImportConfig = {
  // Unrecognized CSV columns get folded into the `notes` field as
  // `Column Header: value · Column Header: value` so nothing is silently
  // dropped on a wide OpenTable / Resy / spreadsheet export.
  unmappedTo: "notes",
  fields: [
    { key: "guestName", label: "Guest Name", aliases: ["name", "guest", "full name"], required: true },
    { key: "guestEmail", label: "Email", aliases: ["email", "email address"] },
    { key: "guestPhone", label: "Phone", aliases: ["phone", "phone number", "cell", "mobile"] },
    {
      key: "partySize", label: "Party Size", aliases: ["party", "size", "guests", "covers"],
      required: true,
      transform: (v) => {
        const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
        return Number.isFinite(n) && n > 0 ? n : null;
      },
      validate: (v) => (typeof v === "number" && v > 0 ? null : "Party size must be a positive number"),
    },
    {
      key: "date", label: "Date",
      required: true,
      transform: (v) => normalizeDate(v),
      validate: (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : "Couldn't parse date"),
    },
    {
      key: "time", label: "Time", aliases: ["visit time", "reservation time"],
      required: true,
      transform: (v) => normalizeTime(v),
      validate: (v) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? null : "Couldn't parse time"),
    },
    {
      key: "status", label: "Status", aliases: ["reservation status", "state"],
      transform: (v) => normalizeImportedStatus(v),
    },
    {
      key: "durationMinutes", label: "Duration (min)", aliases: ["duration", "minutes"],
      transform: (v) => (v === "" ? null : parseInt(v, 10) || null),
    },
    { key: "tableLabel", label: "Table", aliases: ["table", "table number", "table label"] },
    {
      key: "notes", label: "Notes",
      aliases: ["comments", "comment", "dining visit notes", "visit notes", "guest notes", "request"],
    },
  ],
};

export default function ManagerReservations() {
  const { activeVenue } = useAppContext();
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);

  const { data: reservations, isLoading } = useListReservations(
    { venueId: activeVenue?.id || "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListReservationsQueryKey({ venueId: activeVenue?.id || "" }) } }
  );

  const handleImport = async (rows: Array<Record<string, unknown>>): Promise<ImportResult> => {
    if (!activeVenue?.id) throw new Error("No active venue");
    const res = await fetch("/api/reservations/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venueId: activeVenue.id, reservations: rows }),
    });
    const json = (await res.json().catch(() => ({}))) as ImportResult & { message?: string };
    if (!res.ok) throw new Error(json.message ?? `Import failed (${res.status})`);
    await queryClient.invalidateQueries({ queryKey: getListReservationsQueryKey({ venueId: activeVenue.id }) });
    return json;
  };

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

  const reservationsQK = getListReservationsQueryKey({ venueId: activeVenue?.id || "" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Reservations</h1>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="w-4 h-4 mr-2" /> Import CSV
        </Button>
      </div>

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import reservations from CSV"
        description="Upload an OpenTable / Resy / spreadsheet export. Dates and times are normalized automatically; rows with bad data are flagged before import."
        sampleHeaders="Guest Name,Email,Phone,Party Size,Date,Time,Duration,Table,Notes"
        config={reservationImportConfig}
        onSubmit={handleImport}
      />

      {/* OpenTable-style booking widget — primary action on this page. */}
      <BookingFlow
        venueId={activeVenue?.id || ""}
        venueName={activeVenue?.name ?? "Reserve a table"}
        reservations={(reservations ?? []).map((r) => ({
          tableId: r.tableId ?? null,
          date: r.date,
          time: r.time,
          durationMinutes: r.durationMinutes ?? 90,
          status: r.status,
        }))}
        reservationsQueryKey={reservationsQK}
      />

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
