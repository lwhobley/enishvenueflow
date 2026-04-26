import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, AlertTriangle, Eye } from "lucide-react";

interface ShiftRow {
  id: string;
  userId: string | null;
  startTime: string;     // ISO
  endTime: string;       // ISO
}

interface UserRow {
  id: string;
  fullName: string;
  hourlyRate?: number | null;
}

interface AssignmentResult {
  shiftId: string;
  userId: string | null;
  reasons: string[];
  warnings: string[];
}

interface AutoAssignResponse {
  assignments: AssignmentResult[];
  openCount: number;
  assignedCount: number;
  applied: number;
  dryRun: boolean;
  message?: string;
}

interface Props {
  venueId: string;
  /** ISO start of the visible window (typically start-of-month grid). */
  fromIso: string;
  /** ISO end of the visible window. */
  toIso: string;
  shifts: ShiftRow[];
  users: UserRow[];
  /** Query key whose invalidation refreshes the schedule grid + hours. */
  shiftsQueryKey: readonly unknown[];
}

const HOURS_OT_FLAG = 40;
const HOURS_NEAR_OT = 35;

/** Hours from an ISO start/end pair, clipped at zero. */
function shiftHours(s: ShiftRow): number {
  const ms = new Date(s.endTime).getTime() - new Date(s.startTime).getTime();
  return ms > 0 ? ms / 3_600_000 : 0;
}

export function ScheduleHoursSidebar({
  venueId, fromIso, toIso, shifts, users, shiftsQueryKey,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [preview, setPreview] = useState<AutoAssignResponse | null>(null);

  // Hours per assigned employee in the visible window. Open shifts
  // (userId null) are surfaced separately so the manager can see how
  // many hours need a body.
  const summary = useMemo(() => {
    const byUser = new Map<string, number>();
    let openHours = 0;
    let totalCost = 0;
    for (const s of shifts) {
      const h = shiftHours(s);
      if (!s.userId) { openHours += h; continue; }
      byUser.set(s.userId, (byUser.get(s.userId) ?? 0) + h);
      const u = users.find((x) => x.id === s.userId);
      if (u?.hourlyRate) totalCost += h * u.hourlyRate;
    }
    const rows = users
      .map((u) => ({ user: u, hours: byUser.get(u.id) ?? 0 }))
      .filter((r) => r.hours > 0)
      .sort((a, b) => b.hours - a.hours);
    return { rows, openHours, totalCost };
  }, [shifts, users]);

  const autoAssignMut = useMutation({
    mutationFn: async (apply: boolean) => {
      const res = await fetch("/api/shifts/auto-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, from: fromIso, to: toIso, apply }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? `Auto-assign failed (${res.status})`);
      }
      return (await res.json()) as AutoAssignResponse;
    },
    onSuccess: async (data, apply) => {
      if (apply) {
        await qc.invalidateQueries({ queryKey: shiftsQueryKey });
        toast({
          title: `Assigned ${data.applied} of ${data.openCount} open shifts`,
          description: data.applied < data.openCount
            ? `${data.openCount - data.applied} couldn't be auto-filled — they remain open.`
            : "All open shifts filled.",
        });
        setPreview(null);
      } else {
        setPreview(data);
      }
    },
    onError: (err: unknown) => {
      toast({ title: "Auto-assign failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  return (
    <aside className="border rounded-xl bg-card flex flex-col" style={{ minWidth: 280, maxWidth: 340 }}>
      <div className="px-4 py-3 border-b">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Schedule</div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <div>
            <div className="text-lg font-semibold tabular-nums">${summary.totalCost.toFixed(0)}</div>
            <div className="text-[11px] text-muted-foreground">projected labor</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums">{summary.openHours.toFixed(0)}h</div>
            <div className="text-[11px] text-muted-foreground">open</div>
          </div>
        </div>
      </div>

      <div className="px-3 py-2 border-b flex gap-2">
        <Button
          size="sm"
          variant="default"
          className="flex-1"
          disabled={autoAssignMut.isPending || summary.openHours === 0}
          onClick={() => autoAssignMut.mutate(false)}
          title="Preview auto-assignment"
        >
          {autoAssignMut.isPending && !autoAssignMut.variables ? (
            <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3 mr-1.5" />
          )}
          Auto-Assign
        </Button>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 540 }}>
        {summary.rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No shifts assigned in this view yet.
          </div>
        ) : (
          <ul className="divide-y">
            {summary.rows.map(({ user, hours }) => {
              const isOver = hours > HOURS_OT_FLAG;
              const isNear = !isOver && hours >= HOURS_NEAR_OT;
              return (
                <li key={user.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{user.fullName}</span>
                  <span className={`tabular-nums font-mono text-sm ${
                    isOver ? "text-destructive font-semibold" : isNear ? "text-amber-600 font-semibold" : ""
                  }`}>
                    {hours.toFixed(1)}h
                  </span>
                  {isOver ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                  ) : isNear ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {preview && preview.dryRun ? (
        <div className="border-t px-3 py-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Eye className="w-3 h-3" /> Preview
            </span>
            <span className="text-[11px] text-muted-foreground">
              {preview.assignedCount}/{preview.openCount} would fill
            </span>
          </div>
          <ul className="text-[11px] space-y-1 max-h-48 overflow-y-auto">
            {preview.assignments.map((a) => {
              const userName = a.userId ? userById.get(a.userId)?.fullName ?? a.userId : null;
              return (
                <li key={a.shiftId} className={`px-2 py-1.5 rounded border ${a.userId ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                  {userName ? (
                    <>
                      <div className="font-medium text-emerald-900">→ {userName}</div>
                      <div className="text-[10px] text-emerald-800">{a.reasons.join(" · ")}</div>
                      {a.warnings.length > 0 ? (
                        <div className="text-[10px] text-amber-700 mt-0.5">⚠ {a.warnings.join(" · ")}</div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className="font-medium text-destructive">Stays open</div>
                      <div className="text-[10px] text-red-800">{a.reasons.join(" · ")}</div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="flex-1" onClick={() => setPreview(null)} disabled={autoAssignMut.isPending}>
              Discard
            </Button>
            <Button
              size="sm"
              variant="default"
              className="flex-1"
              disabled={autoAssignMut.isPending || preview.assignedCount === 0}
              onClick={() => autoAssignMut.mutate(true)}
            >
              {autoAssignMut.isPending && autoAssignMut.variables ? (
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              ) : null}
              Apply ({preview.assignedCount})
            </Button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
