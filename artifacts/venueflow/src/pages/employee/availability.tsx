import { useState, useEffect } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Clock, CalendarDays, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format, addDays, parseISO, isToday, isSameDay } from "date-fns";

const DAYS = [
  { label: "Sunday",    short: "Sun", value: 0 },
  { label: "Monday",    short: "Mon", value: 1 },
  { label: "Tuesday",   short: "Tue", value: 2 },
  { label: "Wednesday", short: "Wed", value: 3 },
  { label: "Thursday",  short: "Thu", value: 4 },
  { label: "Friday",    short: "Fri", value: 5 },
  { label: "Saturday",  short: "Sat", value: 6 },
];

type DayAvailability = {
  dayOfWeek: number;
  isAvailable: boolean;
  allDay: boolean;
  startTime: string;
  endTime: string;
  notes: string;
};

type DateOverride = {
  date: string;                // YYYY-MM-DD
  isAvailable: boolean;
  startTime: string | null;    // null = all day
  endTime: string | null;
  notes: string | null;
};

const DEFAULT_START = "09:00";
const DEFAULT_END   = "17:00";

function makeDefaults(): DayAvailability[] {
  return DAYS.map((d) => ({
    dayOfWeek: d.value,
    isAvailable: d.value >= 1 && d.value <= 5, // Mon–Fri by default
    allDay: false,
    startTime: DEFAULT_START,
    endTime: DEFAULT_END,
    notes: "",
  }));
}

function fmt12(time: string) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function EmployeeAvailability() {
  const { activeVenue, activeUser } = useAppContext();
  const { toast } = useToast();

  const [days, setDays] = useState<DayAvailability[]>(makeDefaults());
  const [overrides, setOverrides] = useState<DateOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load both recurring rules + per-date overrides in one call. The API
  // returns every row for this user; we partition client-side by whether
  // `date` is set.
  useEffect(() => {
    if (!activeVenue?.id || !activeUser?.id) return;
    setLoading(true);
    fetch(`/api/availability?userId=${activeUser.id}&venueId=${activeVenue.id}`)
      .then((r) => r.json())
      .then((rows: Array<{ dayOfWeek: number; isAvailable: boolean; startTime: string | null; endTime: string | null; notes: string | null; date: string | null }>) => {
        if (rows.length === 0) return;
        const recurring = rows.filter((r) => !r.date);
        const dateRows  = rows.filter((r) => !!r.date) as Array<typeof rows[number] & { date: string }>;

        if (recurring.length > 0) {
          setDays((prev) =>
            prev.map((d) => {
              const row = recurring.find((r) => r.dayOfWeek === d.dayOfWeek);
              if (!row) return d;
              return {
                ...d,
                isAvailable: row.isAvailable,
                allDay: !row.startTime && !row.endTime,
                startTime: row.startTime || DEFAULT_START,
                endTime: row.endTime || DEFAULT_END,
                notes: row.notes || "",
              };
            })
          );
        }

        setOverrides(dateRows.map((r) => ({
          date: r.date,
          isAvailable: r.isAvailable,
          startTime: r.startTime,
          endTime: r.endTime,
          notes: r.notes,
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeVenue?.id, activeUser?.id]);

  function update(dayOfWeek: number, patch: Partial<DayAvailability>) {
    setSaved(false);
    setDays((prev) => prev.map((d) => d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d));
  }

  async function save() {
    if (!activeVenue?.id || !activeUser?.id) return;
    setSaving(true);
    try {
      const payload = {
        userId: activeUser.id,
        venueId: activeVenue.id,
        days: days.map((d) => ({
          dayOfWeek: d.dayOfWeek,
          isAvailable: d.isAvailable,
          startTime: d.isAvailable && !d.allDay ? d.startTime : null,
          endTime: d.isAvailable && !d.allDay ? d.endTime : null,
          notes: d.notes || null,
        })),
      };
      const res = await fetch("/api/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      toast({ title: "Availability saved", description: "Your schedule preferences have been updated." });
    } catch {
      toast({ title: "Error", description: "Could not save availability.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const availableCount = days.filter((d) => d.isAvailable).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Availability</h1>
          <p className="text-muted-foreground mt-1">
            Let your manager know which days and hours you're available to work.
          </p>
        </div>
        <Badge variant={availableCount > 0 ? "default" : "secondary"} className="shrink-0 mt-1">
          <CalendarDays className="w-3 h-3 mr-1" />
          {availableCount} day{availableCount !== 1 ? "s" : ""} available
        </Badge>
      </div>

      {/* Weekly grid */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Weekly Availability</CardTitle>
          <CardDescription>Toggle each day and set your preferred hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 p-0">
          {DAYS.map((day, idx) => {
            const d = days.find((x) => x.dayOfWeek === day.value)!;
            const isWeekend = day.value === 0 || day.value === 6;

            return (
              <div
                key={day.value}
                className={cn(
                  "flex flex-col gap-3 px-5 py-4 transition-colors",
                  idx < DAYS.length - 1 && "border-b",
                  d.isAvailable
                    ? "bg-background"
                    : "bg-muted/30",
                  isWeekend && !d.isAvailable && "bg-muted/50"
                )}
              >
                {/* Day row top */}
                <div className="flex items-center gap-4">
                  {/* Day name + toggle */}
                  <div className="flex items-center gap-3 w-36 shrink-0">
                    <Switch
                      id={`day-${day.value}`}
                      checked={d.isAvailable}
                      onCheckedChange={(v) => update(day.value, { isAvailable: v })}
                    />
                    <Label
                      htmlFor={`day-${day.value}`}
                      className={cn(
                        "font-medium cursor-pointer select-none",
                        !d.isAvailable && "text-muted-foreground"
                      )}
                    >
                      {day.label}
                    </Label>
                  </div>

                  {/* Time range or status text */}
                  {d.isAvailable ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      {d.allDay ? (
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> All day
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={d.startTime}
                            onChange={(e) => update(day.value, { startTime: e.target.value })}
                            className="h-8 rounded-md border border-input bg-background px-2 text-sm tabular-nums"
                          />
                          <span className="text-muted-foreground text-sm">–</span>
                          <input
                            type="time"
                            value={d.endTime}
                            onChange={(e) => update(day.value, { endTime: e.target.value })}
                            className="h-8 rounded-md border border-input bg-background px-2 text-sm tabular-nums"
                          />
                        </div>
                      )}

                      {/* All-day toggle */}
                      <button
                        onClick={() => update(day.value, { allDay: !d.allDay })}
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full border transition-colors",
                          d.allDay
                            ? "bg-primary text-primary-foreground border-primary"
                            : "text-muted-foreground border-border hover:border-primary hover:text-primary"
                        )}
                      >
                        All day
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Not available</span>
                  )}

                  {/* Summary badge (read-only) */}
                  {d.isAvailable && !d.allDay && (
                    <span className="ml-auto text-xs text-muted-foreground hidden sm:block">
                      {fmt12(d.startTime)} – {fmt12(d.endTime)}
                    </span>
                  )}
                </div>

                {/* Notes field — only when available */}
                {d.isAvailable && (
                  <div className="pl-[calc(36px+12px+4px)]">
                    <Textarea
                      placeholder="Notes (e.g. can't start before noon, prefer evenings…)"
                      value={d.notes}
                      onChange={(e) => update(day.value, { notes: e.target.value })}
                      rows={1}
                      className="text-sm resize-none min-h-0 h-8 py-1.5"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Specific dates — overrides for the next 31 days */}
      <SpecificDatesPanel
        userId={activeUser?.id ?? null}
        venueId={activeVenue?.id ?? null}
        recurring={days}
        overrides={overrides}
        onChange={setOverrides}
      />

      {/* Quick presets */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Quick presets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          {[
            { label: "Mon – Fri", fn: () => setDays(d => d.map(x => ({ ...x, isAvailable: x.dayOfWeek >= 1 && x.dayOfWeek <= 5 }))) },
            { label: "Every day", fn: () => setDays(d => d.map(x => ({ ...x, isAvailable: true }))) },
            { label: "Weekends only", fn: () => setDays(d => d.map(x => ({ ...x, isAvailable: x.dayOfWeek === 0 || x.dayOfWeek === 6 }))) },
            { label: "Clear all", fn: () => setDays(d => d.map(x => ({ ...x, isAvailable: false }))) },
          ].map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              size="sm"
              onClick={() => { preset.fn(); setSaved(false); }}
            >
              {preset.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
          ) : (
            "Save Availability"
          )}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
            <CheckCircle2 className="w-4 h-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

// ── Specific dates (next 31 days) ───────────────────────────────────────────
function SpecificDatesPanel({
  userId, venueId, recurring, overrides, onChange,
}: {
  userId: string | null;
  venueId: string | null;
  recurring: DayAvailability[];
  overrides: DateOverride[];
  onChange: (next: DateOverride[]) => void;
}) {
  const { toast } = useToast();
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [savingDate, setSavingDate] = useState<string | null>(null);

  const days = Array.from({ length: 31 }, (_, i) => addDays(new Date(), i));

  const overrideByDate = new Map(overrides.map((o) => [o.date, o]));
  const recurringFor = (date: Date) => recurring.find((r) => r.dayOfWeek === date.getDay())!;

  const upsertOverride = async (override: DateOverride) => {
    if (!userId || !venueId) return;
    setSavingDate(override.date);
    try {
      const res = await fetch("/api/availability/override", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId, venueId,
          date: override.date,
          isAvailable: override.isAvailable,
          startTime: override.startTime,
          endTime: override.endTime,
          notes: override.notes,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const next = overrides.filter((o) => o.date !== override.date).concat(override);
      onChange(next);
      setEditingDate(null);
    } catch (err) {
      toast({ title: "Couldn't save override", description: String(err), variant: "destructive" });
    } finally { setSavingDate(null); }
  };

  const removeOverride = async (date: string) => {
    if (!userId || !venueId) return;
    setSavingDate(date);
    try {
      const res = await fetch(
        `/api/availability/override?userId=${userId}&venueId=${venueId}&date=${date}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`${res.status}`);
      onChange(overrides.filter((o) => o.date !== date));
      setEditingDate(null);
    } catch (err) {
      toast({ title: "Couldn't remove override", description: String(err), variant: "destructive" });
    } finally { setSavingDate(null); }
  };

  const overrideCount = overrides.filter((o) => {
    const d = parseISO(o.date);
    return days.some((x) => isSameDay(x, d));
  }).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Specific Dates</CardTitle>
            <CardDescription>
              Mark a one-off override for any of the next 31 days. Overrides win over your weekly rule.
            </CardDescription>
          </div>
          {overrideCount > 0 ? (
            <Badge variant="default">{overrideCount} override{overrideCount === 1 ? "" : "s"}</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {days.map((d) => {
            const iso = format(d, "yyyy-MM-dd");
            const override = overrideByDate.get(iso);
            const rec = recurringFor(d);
            const isEditing = editingDate === iso;
            const effective = override ?? {
              date: iso,
              isAvailable: rec.isAvailable,
              startTime: rec.isAvailable && !rec.allDay ? rec.startTime : null,
              endTime: rec.isAvailable && !rec.allDay ? rec.endTime : null,
              notes: rec.notes || null,
            };
            return (
              <li key={iso} className="px-4 py-2.5 text-sm">
                <div className="flex items-center gap-3">
                  <div className="w-12 flex-shrink-0">
                    <div className={cn(
                      "text-[10px] uppercase tracking-wider",
                      isToday(d) ? "text-primary font-semibold" : "text-muted-foreground",
                    )}>
                      {format(d, "EEE")}
                    </div>
                    <div className="text-base font-semibold tabular-nums leading-tight">
                      {format(d, "d")}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{format(d, "MMM").toUpperCase()}</div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {override ? (
                        <Badge variant="default" className="text-[10px] uppercase tracking-wider">
                          Override
                        </Badge>
                      ) : null}
                      <span className={cn(
                        "text-sm font-medium",
                        !effective.isAvailable && "text-muted-foreground",
                      )}>
                        {effective.isAvailable
                          ? (effective.startTime && effective.endTime
                              ? `${fmt12(effective.startTime)} – ${fmt12(effective.endTime)}`
                              : "Available all day")
                          : "Not available"}
                      </span>
                    </div>
                    {override?.notes ? (
                      <div className="text-xs text-muted-foreground truncate">{override.notes}</div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {savingDate === iso ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    ) : null}
                    {override ? (
                      <Button size="sm" variant="ghost" onClick={() => void removeOverride(iso)} title="Remove override">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => setEditingDate(isEditing ? null : iso)}>
                      {isEditing ? "Close" : (override ? "Edit" : "Override")}
                    </Button>
                  </div>
                </div>

                {isEditing ? (
                  <OverrideEditor
                    initial={effective}
                    onSave={upsertOverride}
                    onCancel={() => setEditingDate(null)}
                    saving={savingDate === iso}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function OverrideEditor({
  initial, onSave, onCancel, saving,
}: {
  initial: DateOverride;
  onSave: (next: DateOverride) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [available, setAvailable] = useState(initial.isAvailable);
  const [allDay, setAllDay] = useState(!initial.startTime && !initial.endTime);
  const [start, setStart] = useState(initial.startTime ?? DEFAULT_START);
  const [end, setEnd] = useState(initial.endTime ?? DEFAULT_END);
  const [notes, setNotes] = useState(initial.notes ?? "");

  const submit = () => {
    onSave({
      date: initial.date,
      isAvailable: available,
      startTime: available && !allDay ? start : null,
      endTime: available && !allDay ? end : null,
      notes: notes.trim() || null,
    });
  };

  return (
    <div className="mt-3 ml-[60px] rounded-md border bg-muted/30 p-3 space-y-2.5">
      <div className="flex items-center gap-3">
        <Switch checked={available} onCheckedChange={setAvailable} id={`av-${initial.date}`} />
        <Label htmlFor={`av-${initial.date}`} className="text-sm cursor-pointer">
          {available ? "Available this day" : "Not available this day"}
        </Label>
      </div>
      {available ? (
        <div className="flex items-center gap-2 flex-wrap">
          {allDay ? (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> All day
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="time" value={start} onChange={(e) => setStart(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm tabular-nums"
              />
              <span className="text-muted-foreground text-sm">–</span>
              <input
                type="time" value={end} onChange={(e) => setEnd(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm tabular-nums"
              />
            </div>
          )}
          <button
            onClick={() => setAllDay(!allDay)}
            className={cn(
              "text-xs px-2 py-0.5 rounded-full border transition-colors",
              allDay
                ? "bg-primary text-primary-foreground border-primary"
                : "text-muted-foreground border-border hover:border-primary hover:text-primary",
            )}
          >
            All day
          </button>
        </div>
      ) : null}
      <Textarea
        placeholder="Notes (e.g. doctor's appt, school event…)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={1}
        className="text-sm resize-none min-h-0 h-8 py-1.5"
      />
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : "Save override"}
        </Button>
      </div>
    </div>
  );
}
