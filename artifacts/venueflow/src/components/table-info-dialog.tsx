import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, CheckCircle2, Loader2, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export interface DialogReservation {
  id: string;
  guestName: string;
  partySize: number;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:mm
  durationMinutes: number;
  status: string;
  notes: string | null;
}

export interface DialogSection {
  id: string;
  name: string;
  color: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  table:
    | { id: string; label: string; capacity: number; sectionId: string | null }
    | null;
  reservation: DialogReservation | null;
  sections: DialogSection[];
  isAdmin: boolean;
  // Today's date in the venue's local format (YYYY-MM-DD).
  today: string;
  // React Query keys used to invalidate after a save.
  reservationsQueryKey: readonly unknown[];
  tablesQueryKey: readonly unknown[];
}

function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "p" : "a";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${(m || 0).toString().padStart(2, "0")}${period}`;
}

export function TableInfoDialog({
  open, onOpenChange, venueId, table, reservation, sections, isAdmin, today,
  reservationsQueryKey, tablesQueryKey,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [movingSection, setMovingSection] = useState(false);

  const [guestName, setGuestName] = useState("");
  const [partySize, setPartySize] = useState("");
  const [time, setTime] = useState("19:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset the form whenever the dialog opens against a new table. We only
  // re-key by table.id so a re-render doesn't wipe what the admin is typing.
  useEffect(() => {
    if (!open) return;
    setGuestName("");
    setPartySize(table ? String(table.capacity) : "2");
    setTime(format(new Date(), "HH:mm"));
    setNotes("");
  }, [open, table?.id, table?.capacity]);

  if (!table) return null;

  const reserved = !!reservation;

  const handleCreate = async () => {
    if (!guestName.trim()) {
      toast({ title: "Guest name required", variant: "destructive" });
      return;
    }
    const sizeN = parseInt(partySize, 10);
    if (!Number.isFinite(sizeN) || sizeN < 1) {
      toast({ title: "Party size must be at least 1", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          tableId: table.id,
          guestName: guestName.trim(),
          partySize: sizeN,
          date: today,
          time,
          notes: notes.trim() || undefined,
          status: "confirmed",
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? `Save failed (${res.status})`);
      }
      await qc.invalidateQueries({ queryKey: reservationsQueryKey });
      toast({ title: "Reservation created", description: `${guestName.trim()} · party of ${sizeN}` });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Failed to reserve",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!reservation) return;
    setSaving(true);
    try {
      // The DELETE endpoint sets status to "cancelled" (soft delete).
      const res = await fetch(`/api/reservations/${reservation.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? `Cancel failed (${res.status})`);
      }
      await qc.invalidateQueries({ queryKey: reservationsQueryKey });
      toast({ title: "Reservation cancelled" });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Failed to cancel",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Table {table.label}
            {reserved ? (
              <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-red-100 text-red-800">
                <Calendar className="w-3 h-3" /> Reserved
              </span>
            ) : (
              <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                <CheckCircle2 className="w-3 h-3" /> Available
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Capacity {table.capacity} {table.capacity === 1 ? "guest" : "guests"}
          </DialogDescription>
        </DialogHeader>

        {sections.length > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Section</span>
            {isAdmin ? (
              <div className="flex items-center gap-2 flex-1 max-w-[260px]">
                <Select
                  value={table.sectionId ?? ""}
                  onValueChange={async (v) => {
                    if (v === table.sectionId) return;
                    setMovingSection(true);
                    try {
                      const res = await fetch(`/api/tables/${table.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sectionId: v }),
                      });
                      if (!res.ok) {
                        const json = (await res.json().catch(() => ({}))) as { message?: string };
                        throw new Error(json.message ?? `Move failed (${res.status})`);
                      }
                      await qc.invalidateQueries({ queryKey: tablesQueryKey });
                      toast({ title: "Table moved", description: sections.find((s) => s.id === v)?.name ?? "Section updated" });
                    } catch (err) {
                      toast({
                        title: "Failed to move table",
                        description: err instanceof Error ? err.message : "Unknown error",
                        variant: "destructive",
                      });
                    } finally {
                      setMovingSection(false);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue placeholder="(unassigned)" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {movingSection ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : null}
              </div>
            ) : (
              (() => {
                const s = sections.find((x) => x.id === table.sectionId);
                if (!s) return <span className="text-muted-foreground">—</span>;
                return (
                  <span className="flex items-center gap-2 font-medium">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </span>
                );
              })()
            )}
          </div>
        ) : null}

        {reserved ? (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Guest</span>
                <span className="font-medium">{reservation!.guestName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Party size</span>
                <span className="font-medium">{reservation!.partySize}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Time</span>
                <span className="font-medium font-mono">{fmt12(reservation!.time)}</span>
              </div>
              {reservation!.notes ? (
                <div className="pt-1 border-t">
                  <div className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Notes</div>
                  <div className="text-sm">{reservation!.notes}</div>
                </div>
              ) : null}
            </div>
          </div>
        ) : isAdmin ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="r-guest">Guest name</Label>
              <Input
                id="r-guest"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Smith, Jane"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="r-party">Party size</Label>
                <Input
                  id="r-party"
                  type="number"
                  min={1}
                  max={50}
                  value={partySize}
                  onChange={(e) => setPartySize(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-time">Time</Label>
                <Input
                  id="r-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-notes">Notes (optional)</Label>
              <Textarea
                id="r-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anniversary, birthday cake, allergies, etc."
              />
            </div>
          </div>
        ) : (
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            This table is currently available. Ask a manager to reserve it.
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Close
          </Button>
          {reserved && isAdmin ? (
            <Button variant="destructive" onClick={() => void handleCancel()} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Working…</> : <><X className="w-4 h-4 mr-2" />Cancel reservation</>}
            </Button>
          ) : null}
          {!reserved && isAdmin ? (
            <Button onClick={() => void handleCreate()} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Reserve table"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
