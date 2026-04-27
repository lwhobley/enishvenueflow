import { useEffect, useState } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Plus, Pencil, Trash2, ExternalLink, Eye, EyeOff } from "lucide-react";

interface Event {
  id: string;
  venueId: string;
  title: string;
  description: string | null;
  date: string;
  startTime: string;
  endTime: string | null;
  coverCharge: number;
  depositPerGuest: number;
  imageUrl: string | null;
  isPublished: boolean;
  capacity: number | null;
  createdAt: string;
}

async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && typeof data === "object" && data && "message" in data)
      ? String((data as { message: unknown }).message)
      : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export default function ManagerEvents() {
  const { activeVenue } = useAppContext();
  const venueId = activeVenue?.id || "";
  const { toast } = useToast();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Event | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Event | null>(null);

  const load = async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      const rows = await api<Event[]>(`/events?venueId=${venueId}`);
      setEvents(rows);
    } catch (err) {
      toast({ title: "Failed to load events", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [venueId]);

  const handleSave = async (form: EventForm, id?: string) => {
    try {
      if (id) {
        const updated = await api<Event>(`/events/${id}`, {
          method: "PUT", body: JSON.stringify({ ...form, venueId }),
        });
        setEvents((prev) => prev.map((e) => e.id === id ? updated : e));
        toast({ title: "Event updated" });
      } else {
        const created = await api<Event>("/events", {
          method: "POST", body: JSON.stringify({ ...form, venueId }),
        });
        setEvents((prev) => [created, ...prev]);
        toast({ title: "Event created" });
      }
      setEditing(null);
      setCreating(false);
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await api(`/events/${deleting.id}?venueId=${venueId}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((e) => e.id !== deleting.id));
      toast({ title: "Event deleted" });
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const togglePublish = async (event: Event) => {
    try {
      const updated = await api<Event>(`/events/${event.id}`, {
        method: "PUT", body: JSON.stringify({ isPublished: !event.isPublished, venueId }),
      });
      setEvents((prev) => prev.map((e) => e.id === event.id ? updated : e));
    } catch (err) {
      toast({ title: "Update failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Events</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Themed nights and bookable events. Published events appear on your public booking site at <a href="/book/events" target="_blank" rel="noreferrer" className="text-[#1F9CC2] hover:underline inline-flex items-center gap-1">/book/events <ExternalLink className="h-3 w-3" /></a>.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" /> New event
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 p-12 text-center">
          <Calendar className="mx-auto h-10 w-10 text-muted-foreground" />
          <div className="mt-3 text-base font-semibold">No events yet</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Publish your first themed night so customers can RSVP and reserve sections.
          </div>
          <Button className="mt-4" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> Create one
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {events.map((event) => (
            <div key={event.id} className="rounded-lg border bg-card p-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs uppercase tracking-wider text-[#1F9CC2]">{fmtDate(event.date)} · {event.startTime}{event.endTime ? `–${event.endTime}` : ""}</span>
                  {event.isPublished ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-700">
                      <Eye className="h-3 w-3" /> Published
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <EyeOff className="h-3 w-3" /> Draft
                    </span>
                  )}
                </div>
                <div className="mt-1 text-lg font-semibold">{event.title}</div>
                {event.description ? <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{event.description}</p> : null}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Cover ${event.coverCharge.toFixed(2)}</span>
                  <span>Deposit ${event.depositPerGuest.toFixed(2)}/guest</span>
                  {event.capacity ? <span>Cap {event.capacity}</span> : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => togglePublish(event)}>
                  {event.isPublished ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                  {event.isPublished ? "Unpublish" : "Publish"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(event)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleting(event)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <EventDialog
        open={creating || !!editing}
        onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }}
        initial={editing}
        onSave={(form) => handleSave(form, editing?.id)}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => { if (!v) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.title}" will be removed. Existing bookings for this event are NOT deleted —
              they remain on the reservations page so guests are still seated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface EventForm {
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  coverCharge: string;
  depositPerGuest: string;
  imageUrl: string;
  isPublished: boolean;
  capacity: string;
}

function EventDialog({ open, onOpenChange, initial, onSave }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Event | null;
  onSave: (form: EventForm) => void;
}) {
  const [form, setForm] = useState<EventForm>(blankForm);

  useEffect(() => {
    if (open) {
      setForm(initial ? {
        title: initial.title,
        description: initial.description ?? "",
        date: initial.date,
        startTime: initial.startTime,
        endTime: initial.endTime ?? "",
        coverCharge: String(initial.coverCharge ?? 0),
        depositPerGuest: String(initial.depositPerGuest ?? 0),
        imageUrl: initial.imageUrl ?? "",
        isPublished: initial.isPublished,
        capacity: initial.capacity != null ? String(initial.capacity) : "",
      } : blankForm);
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit event" : "Create event"}</DialogTitle>
          <DialogDescription>Customers see published events on the public booking site.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ev-title">Title</Label>
            <Input id="ev-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Afrobeats Friday" />
          </div>
          <div>
            <Label htmlFor="ev-desc">Description</Label>
            <Textarea id="ev-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3} placeholder="Resident DJ Bola spinning Afrobeats and Amapiano…" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="ev-date">Date</Label>
              <Input id="ev-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ev-start">Start</Label>
              <Input id="ev-start" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ev-end">End (optional)</Label>
              <Input id="ev-end" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="ev-cover">Cover ($)</Label>
              <Input id="ev-cover" type="number" min="0" step="0.01" value={form.coverCharge}
                onChange={(e) => setForm({ ...form, coverCharge: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ev-deposit">Deposit/guest ($)</Label>
              <Input id="ev-deposit" type="number" min="0" step="0.01" value={form.depositPerGuest}
                onChange={(e) => setForm({ ...form, depositPerGuest: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ev-cap">Capacity</Label>
              <Input id="ev-cap" type="number" min="0" value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="ev-img">Image URL</Label>
            <Input id="ev-img" value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              placeholder="https://…" />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Switch id="ev-pub" checked={form.isPublished}
              onCheckedChange={(v) => setForm({ ...form, isPublished: v })} />
            <Label htmlFor="ev-pub">Publish to booking site</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.title.trim() || !form.date || !form.startTime}>
            {initial ? "Save changes" : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const blankForm: EventForm = {
  title: "", description: "", date: "", startTime: "21:00", endTime: "",
  coverCharge: "0", depositPerGuest: "0", imageUrl: "",
  isPublished: true, capacity: "",
};

function fmtDate(yyyyMMdd: string): string {
  const [y, m, d] = yyyyMMdd.split("-").map((s) => Number(s));
  if (!y || !m || !d) return yyyyMMdd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}
