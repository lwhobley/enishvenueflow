import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  X, Plus, GripVertical, AlertTriangle, CheckCircle2, Loader2, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  statusForUserOnDate, type AvailabilityRow, type AvailabilityStatus,
} from "@/lib/availability";

// ── Inputs from the parent schedule page ────────────────────────────────────
export interface DayEditorShift {
  id: string;
  userId: string | null;
  userName?: string | null;
  roleName?: string | null;
  roleColor?: string | null;
  startTime: string;          // ISO
  endTime: string;            // ISO
}

export interface DayEditorUser {
  id: string;
  fullName: string;
  isActive?: boolean;
  positions?: string[];
  hourlyRate?: number | null;
}

interface Props {
  /** YYYY-MM-DD of the day being edited. */
  date: string;
  /** Shifts already on the day (drop targets). */
  shifts: DayEditorShift[];
  /** Every venue user — filtered + sorted by availability inside. */
  users: DayEditorUser[];
  /** Pre-loaded availability rows for this venue. */
  availability: AvailabilityRow[] | undefined;
  /** React Query key whose invalidation refreshes the schedule grid. */
  shiftsQueryKey: readonly unknown[];
  /** Open the existing "Add Shift" dialog pre-filled to this date. */
  onAddShift: () => void;
  /** Manager closed the panel (clicked X or the same day again). */
  onClose: () => void;
}

// Default 5-9 window for the per-day availability ranking. The actual
// availability check inside `statusForUserOnDate` uses these times to
// classify "Available / Outside hours / Unavailable".
const DEFAULT_START = "17:00";
const DEFAULT_END   = "22:00";

const DRAG_TYPE = "application/x-venueflow-userid";

function fmt12(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

export function DayEditorPanel({
  date, shifts, users, availability, shiftsQueryKey, onAddShift, onClose,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dragUserId, setDragUserId] = useState<string | null>(null);
  const [dropTargetShiftId, setDropTargetShiftId] = useState<string | null>(null);

  // Active employees only, ranked: available first, then outside-hours,
  // then unavailable last. Names within each tier sorted alphabetically.
  const ranked = useMemo(() => {
    const rank = (s: AvailabilityStatus): number => {
      switch (s.kind) {
        case "ok":      return 0;
        case "unset":   return 1;
        case "outside": return 2;
        case "off":     return 3;
      }
    };
    return users
      .filter((u) => u.isActive !== false)
      .map((u) => ({
        user: u,
        status: statusForUserOnDate(availability, u.id, date, DEFAULT_START, DEFAULT_END),
      }))
      .sort((a, b) => {
        const r = rank(a.status) - rank(b.status);
        return r !== 0 ? r : a.user.fullName.localeCompare(b.user.fullName);
      });
  }, [users, availability, date]);

  const assign = useMutation({
    mutationFn: async (input: { shiftId: string; userId: string }) => {
      const res = await fetch(`/api/shifts/${input.shiftId}/assign`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: input.userId }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? `${res.status}`);
      }
      return await res.json();
    },
    onSuccess: async (_data, input) => {
      await qc.invalidateQueries({ queryKey: shiftsQueryKey });
      const userName = users.find((u) => u.id === input.userId)?.fullName ?? "Employee";
      toast({ title: "Shift assigned", description: userName });
    },
    onError: (err: unknown) => {
      toast({ title: "Couldn't assign", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    },
  });

  const dropOnShift = (shiftId: string, e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetShiftId(null);
    setDragUserId(null);
    const userId = e.dataTransfer.getData(DRAG_TYPE);
    if (!userId) return;
    assign.mutate({ shiftId, userId });
  };

  return (
    <aside className="border rounded-xl bg-card flex flex-col" style={{ minWidth: 300, maxWidth: 360 }}>
      <div className="px-4 py-3 border-b flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Day editor
          </div>
          <div className="mt-0.5 text-sm font-semibold">{format(parseISO(date), "EEEE, MMM d")}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Shifts on this day — each is a drop target. */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Shifts ({shifts.length})
          </div>
          <Button size="sm" variant="outline" onClick={onAddShift}>
            <Plus className="w-3 h-3 mr-1" /> Add
          </Button>
        </div>

        {shifts.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 text-center border border-dashed rounded">
            No shifts yet. Add one above, then drop an employee onto it.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {shifts
              .slice()
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
              .map((s) => {
                const isHover = dropTargetShiftId === s.id;
                const tint = s.roleColor ?? "#1F9CC2";
                return (
                  <li key={s.id}>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDropTargetShiftId(s.id); }}
                      onDragLeave={() => setDropTargetShiftId((id) => id === s.id ? null : id)}
                      onDrop={(e) => dropOnShift(s.id, e)}
                      className={`rounded border-l-4 px-2.5 py-1.5 text-sm transition-colors ${
                        isHover ? "bg-emerald-50 border border-emerald-300" : "bg-secondary"
                      }`}
                      style={{ borderLeftColor: isHover ? "#10B981" : tint }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {fmt12(s.startTime)}–{fmt12(s.endTime)}
                        </span>
                        {s.roleName ? (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.roleName}</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {s.userId ? (
                          <span className="font-medium truncate">{s.userName ?? "Assigned"}</span>
                        ) : (
                          <span className="text-xs italic text-muted-foreground">Open shift — drop employee here</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      {/* Available employees — drag sources. Sorted with most-available first. */}
      <div className="px-4 py-3 border-b">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          Available employees
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">
          Drag onto a shift to assign.
        </p>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
        {ranked.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">No employees yet.</div>
        ) : (
          <ul className="divide-y">
            {ranked.map(({ user, status }) => {
              const isDragging = dragUserId === user.id;
              const positionTag = user.positions && user.positions.length > 0 ? user.positions[0] : null;
              return (
                <li
                  key={user.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, user.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragUserId(user.id);
                  }}
                  onDragEnd={() => { setDragUserId(null); setDropTargetShiftId(null); }}
                  className={`px-4 py-2 flex items-center gap-2 text-sm cursor-grab active:cursor-grabbing transition-opacity ${
                    isDragging ? "opacity-50" : "hover:bg-accent/40"
                  }`}
                >
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="truncate">{user.fullName}</span>
                    {positionTag ? (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {positionTag}
                      </span>
                    ) : null}
                  </div>
                  <StatusChip status={status} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {assign.isPending ? (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Assigning…
        </div>
      ) : null}
    </aside>
  );
}

function StatusChip({ status }: { status: AvailabilityStatus }) {
  if (status.kind === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
        <CheckCircle2 className="w-3 h-3" /> Available
      </span>
    );
  }
  if (status.kind === "unset") {
    return <span className="text-[10px] uppercase tracking-wider text-muted-foreground">No pref</span>;
  }
  if (status.kind === "off") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-800" title={status.reason}>
        <AlertTriangle className="w-3 h-3" /> Off
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800" title={status.reason}>
      <AlertTriangle className="w-3 h-3" /> Outside
    </span>
  );
}
