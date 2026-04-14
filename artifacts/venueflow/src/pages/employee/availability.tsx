import { useState, useEffect } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Clock, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load saved availability
  useEffect(() => {
    if (!activeVenue?.id || !activeUser?.id) return;
    setLoading(true);
    fetch(`/api/availability?userId=${activeUser.id}&venueId=${activeVenue.id}`)
      .then((r) => r.json())
      .then((rows: Array<{ dayOfWeek: number; isAvailable: boolean; startTime: string | null; endTime: string | null; notes: string | null }>) => {
        if (rows.length === 0) { setLoading(false); return; }
        setDays((prev) =>
          prev.map((d) => {
            const row = rows.find((r) => r.dayOfWeek === d.dayOfWeek);
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
