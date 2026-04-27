import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  CalendarDays, Clock, Users, Loader2, Search, ArrowLeft, CheckCircle2,
  X, Phone, Mail, MessageSquare, Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  computeAvailability, nearestAvailableSlots,
  type SlotTable, type SlotReservation, type AvailabilitySlot,
} from "@/lib/availability-slots";

interface Props {
  venueId: string;
  venueName: string;
}

/**
 * Invalidate every reservation query regardless of which date filter the
 * caller used. The orval-generated key always starts with "/api/reservations",
 * so prefix-matching catches both the page-level list and BookingFlow's
 * own per-search fetch.
 */
const RESERVATIONS_QK_PREFIX = ["/api/reservations"] as const;

// ── State machine ────────────────────────────────────────────────────────────
type Step =
  | { kind: "search" }
  | { kind: "results"; date: string; time: string; partySize: number; durationMinutes: number }
  | { kind: "guest"; date: string; time: string; partySize: number; durationMinutes: number; tableId: string }
  | { kind: "confirmed"; reservationId: string; date: string; time: string; partySize: number; guestName: string };

// ── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_DURATION = 90;
const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12];
// 17:00 → 22:00 in 30-min increments, formatted with AM/PM in the picker.
function hourOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let m = 17 * 60; m <= 22 * 60; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const v = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    out.push({ value: v, label: `${h12}:${String(min).padStart(2, "0")} ${period}` });
  }
  return out;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m || 0).padStart(2, "0")} ${period}`;
}

// ── Component ────────────────────────────────────────────────────────────────
export function BookingFlow({ venueId, venueName }: Props) {
  const [step, setStep] = useState<Step>({ kind: "search" });
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("19:00");
  const [partySize, setPartySize] = useState(2);

  // Tables come from /api/tables — needed for availability computation
  // and for the smart-best-fit table id when the guest picks a slot.
  const { data: tables = [] } = useQuery<SlotTable[]>({
    queryKey: ["/tables", venueId, "restaurant"],
    enabled: !!venueId,
    queryFn: async () => {
      const res = await fetch(`/api/tables?venueId=${venueId}&scope=restaurant`);
      if (!res.ok) throw new Error(`Tables load failed (${res.status})`);
      return await res.json();
    },
    staleTime: 30_000,
  });

  return (
    <Card className="overflow-hidden">
      {step.kind === "search" && (
        <SearchPanel
          date={date} time={time} partySize={partySize} venueName={venueName}
          onDate={setDate} onTime={setTime} onParty={setPartySize}
          onSearch={() => setStep({
            kind: "results", date, time, partySize, durationMinutes: DEFAULT_DURATION,
          })}
        />
      )}

      {step.kind === "results" && (
        <ResultsPanel
          venueId={venueId}
          step={step}
          tables={tables}
          onBack={() => setStep({ kind: "search" })}
          onPick={(slot) => {
            if (!slot.bestTableId) return;
            setStep({
              kind: "guest",
              date: step.date,
              time: slot.time,
              partySize: step.partySize,
              durationMinutes: step.durationMinutes,
              tableId: slot.bestTableId,
            });
          }}
        />
      )}

      {step.kind === "guest" && (
        <GuestPanel
          venueId={venueId}
          step={step}
          onBack={() => setStep({
            kind: "results",
            date: step.date, time: step.time,
            partySize: step.partySize, durationMinutes: step.durationMinutes,
          })}
          onConfirmed={(id, guestName) => setStep({
            kind: "confirmed",
            reservationId: id,
            date: step.date, time: step.time,
            partySize: step.partySize, guestName,
          })}
        />
      )}

      {step.kind === "confirmed" && (
        <ConfirmationPanel
          step={step}
          onNew={() => setStep({ kind: "search" })}
        />
      )}
    </Card>
  );
}

// ── Sub-panels ───────────────────────────────────────────────────────────────

function SearchPanel({
  date, time, partySize, venueName, onDate, onTime, onParty, onSearch,
}: {
  date: string; time: string; partySize: number; venueName: string;
  onDate: (v: string) => void; onTime: (v: string) => void; onParty: (v: number) => void;
  onSearch: () => void;
}) {
  return (
    <CardContent className="p-6 sm:p-8">
      <div className="space-y-1 mb-5">
        <div className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Make a reservation</div>
        <h2 className="text-2xl font-semibold tracking-tight">{venueName}</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        {/* Date */}
        <div className="sm:col-span-4 space-y-1.5">
          <Label htmlFor="bk-date" className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CalendarDays className="w-3 h-3" /> Date
          </Label>
          <Input
            id="bk-date" type="date" value={date} min={todayIso()}
            onChange={(e) => onDate(e.target.value)}
            className="h-11"
          />
        </div>
        {/* Time */}
        <div className="sm:col-span-3 space-y-1.5">
          <Label htmlFor="bk-time" className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Time
          </Label>
          <Select value={time} onValueChange={onTime}>
            <SelectTrigger id="bk-time" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {hourOptions().map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {/* Party size */}
        <div className="sm:col-span-3 space-y-1.5">
          <Label htmlFor="bk-party" className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Users className="w-3 h-3" /> Party size
          </Label>
          <Select value={String(partySize)} onValueChange={(v) => onParty(parseInt(v, 10))}>
            <SelectTrigger id="bk-party" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PARTY_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "guest" : "guests"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {/* CTA */}
        <div className="sm:col-span-2 flex items-end">
          <Button className="w-full h-11" onClick={onSearch}>
            <Search className="w-4 h-4 mr-1.5" /> Find a Table
          </Button>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Bookings are held for 15 minutes past the reserved time. Cancellations under 4 hours may incur a fee.
      </p>
    </CardContent>
  );
}

function ResultsPanel({
  venueId, step, tables, onBack, onPick,
}: {
  venueId: string;
  step: Extract<Step, { kind: "results" }>;
  tables: SlotTable[];
  onBack: () => void;
  onPick: (slot: AvailabilitySlot) => void;
}) {
  // Per-search-date reservation snapshot. Decoupled from the page-level
  // list so a manager booking, say, two weeks out doesn't see "all
  // tables free" just because the operational list is filtered to today.
  const { data: dayReservations = [], isLoading } = useQuery<SlotReservation[]>({
    queryKey: ["/api/reservations", { venueId, date: step.date }],
    enabled: !!venueId && !!step.date,
    queryFn: async () => {
      const res = await fetch(`/api/reservations?venueId=${venueId}&date=${step.date}`);
      if (!res.ok) throw new Error(`${res.status}`);
      return (await res.json()) as SlotReservation[];
    },
    staleTime: 10_000,
  });

  const slots = useMemo(() => computeAvailability(
    {
      date: step.date,
      partySize: step.partySize,
      durationMinutes: step.durationMinutes,
    },
    tables,
    dayReservations,
  ), [step, tables, dayReservations]);

  const exact = slots.find((s) => s.time === step.time);
  const exactAvailable = !!exact?.available;
  const alternatives = exactAvailable ? [] : nearestAvailableSlots(slots, step.time, 6);
  const anyAvailable = slots.some((s) => s.available);

  return (
    <CardContent className="p-6 sm:p-8">
      <div className="flex items-center justify-between gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Change search
        </Button>
        <div className="text-xs text-muted-foreground tabular-nums">
          {format(parseISO(step.date), "EEE, MMM d")} · party of {step.partySize}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking availability…
        </div>
      ) : !anyAvailable ? (
        <WaitlistPrompt date={step.date} partySize={step.partySize} venueId={venueId} />
      ) : (
        <>
          <div className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
            {exactAvailable ? "Available times" : "Try one of these instead"}
          </div>
          <div className="flex flex-wrap gap-2">
            {(exactAvailable ? slots.filter((s) => s.available) : alternatives).map((s) => {
              const highlight = s.time === step.time;
              return (
                <button
                  key={s.time}
                  type="button"
                  onClick={() => onPick(s)}
                  className={`px-4 py-2.5 rounded-full text-sm font-medium tabular-nums transition-colors ${
                    highlight
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground"
                  }`}
                >
                  {fmt12(s.time)}
                </button>
              );
            })}
          </div>

          {!exactAvailable && alternatives.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              No tables for {fmt12(step.time)} on {format(parseISO(step.date), "MMM d")}. Closest open times are above.
            </p>
          )}
        </>
      )}
    </CardContent>
  );
}

function GuestPanel({
  venueId, step, onBack, onConfirmed,
}: {
  venueId: string;
  step: Extract<Step, { kind: "guest" }>;
  onBack: () => void;
  onConfirmed: (id: string, guestName: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast({ title: "Guest name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId, tableId: step.tableId,
          guestName: name.trim(),
          guestEmail: email.trim() || undefined,
          guestPhone: phone.trim() || undefined,
          partySize: step.partySize,
          date: step.date,
          time: step.time,
          durationMinutes: step.durationMinutes,
          notes: notes.trim() || undefined,
          status: "confirmed",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) throw new Error(body.message ?? `${res.status}`);
      // Prefix-invalidate every reservations query — the page-level list
      // (filtered to its picked date), this widget's per-search fetch,
      // and the host-stand panel's "today" view all refresh together.
      await qc.invalidateQueries({ queryKey: RESERVATIONS_QK_PREFIX });
      onConfirmed(body.id ?? "", name.trim());
    } catch (err) {
      toast({
        title: "Couldn't book",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally { setSaving(false); }
  };

  return (
    <CardContent className="p-6 sm:p-8">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to times
        </Button>
      </div>

      <div className="rounded-lg border bg-secondary/50 px-4 py-3 mb-5 flex items-center gap-3 text-sm">
        <CalendarDays className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1">
          <div className="font-medium">
            {format(parseISO(step.date), "EEEE, MMMM d")} · {fmt12(step.time)}
          </div>
          <div className="text-xs text-muted-foreground">
            Party of {step.partySize} · 1h 30m turn
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="bk-name" className="text-xs uppercase tracking-wider text-muted-foreground">Guest name</Label>
          <Input id="bk-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="bk-email" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Mail className="w-3 h-3" /> Email
            </Label>
            <Input id="bk-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk-phone" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3" /> Phone
            </Label>
            <Input id="bk-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bk-notes" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> Notes (optional)
          </Label>
          <Textarea id="bk-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Anniversary, birthday cake, allergies, etc." />
        </div>

        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <strong className="text-foreground">Booking policy.</strong> Tables are held for 15 minutes
          past the reserved time. Cancellations under 4 hours of the booking may incur a fee.
        </div>

        <Button className="w-full h-11" onClick={() => void submit()} disabled={saving}>
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Confirming…</>
                  : <>Reserve table</>}
        </Button>
      </div>
    </CardContent>
  );
}

function ConfirmationPanel({
  step, onNew,
}: {
  step: Extract<Step, { kind: "confirmed" }>;
  onNew: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cancelling, setCancelling] = useState(false);

  const cancel = async () => {
    if (!step.reservationId) { onNew(); return; }
    setCancelling(true);
    try {
      const res = await fetch(`/api/reservations/${step.reservationId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`${res.status}`);
      await qc.invalidateQueries({ queryKey: RESERVATIONS_QK_PREFIX });
      toast({ title: "Reservation cancelled" });
      onNew();
    } catch (err) {
      toast({ title: "Couldn't cancel", description: String(err), variant: "destructive" });
    } finally { setCancelling(false); }
  };

  return (
    <CardContent className="p-6 sm:p-8">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h3 className="text-xl font-semibold tracking-tight">You're all set, {step.guestName.split(" ")[0]}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {format(parseISO(step.date), "EEEE, MMMM d")} · {fmt12(step.time)} · party of {step.partySize}
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 mb-5 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <Sparkles className="w-3 h-3 mt-0.5 text-primary flex-shrink-0" />
          <span>The party shows up on the host stand panel automatically. Mark them <em>Arrived</em> there when they walk in.</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={cancel} disabled={cancelling}>
          {cancelling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <X className="w-4 h-4 mr-1.5" />}
          Cancel reservation
        </Button>
        <Button className="flex-1" onClick={onNew}>
          Book another
        </Button>
      </div>
    </CardContent>
  );
}

function WaitlistPrompt({
  venueId, date, partySize,
}: { venueId: string; date: string; partySize: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast({ title: "Guest name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          guestName: name.trim(),
          guestPhone: phone.trim() || null,
          partySize,
          notes: `Wanted ${date}`,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await qc.invalidateQueries({ queryKey: ["/waitlist", venueId] });
      toast({ title: "Added to waitlist", description: `${name} · party of ${partySize}` });
      setName(""); setPhone("");
    } catch (err) {
      toast({ title: "Couldn't add", description: String(err), variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="rounded-lg border bg-amber-50 border-amber-200 text-amber-900 px-4 py-3 mb-4">
        <div className="font-medium text-sm">Fully booked for {format(parseISO(date), "MMM d")}.</div>
        <p className="text-xs mt-0.5">No tables fit a party of {partySize} on this date. Add the guest to the waitlist — they'll be seated if anything opens up.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="wl-name" className="text-xs uppercase tracking-wider text-muted-foreground">Guest name</Label>
          <Input id="wl-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wl-phone" className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Phone className="w-3 h-3" /> Phone (optional)
          </Label>
          <Input id="wl-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>

      <Button className="w-full h-11 mt-4" onClick={() => void submit()} disabled={saving}>
        {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding…</> : "Add to waitlist"}
      </Button>
    </div>
  );
}
