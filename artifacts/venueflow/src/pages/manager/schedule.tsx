import { useMemo, useState } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { useAuth } from "@/contexts/auth-context";
import {
  useListSchedules, getListSchedulesQueryKey,
  useCreateSchedule,
  useCreateShift,
  useListRoles, getListRolesQueryKey,
  useListUsers, getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, ChevronLeft, ChevronRight, Trash2, Loader2, Calendar as CalendarIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth,
  isToday, parseISO, startOfMonth, startOfWeek,
} from "date-fns";

type ShiftRow = {
  id: string;
  scheduleId: string;
  userId: string | null;
  roleId: string;
  sectionId: string | null;
  startTime: string;
  endTime: string;
  status: string;
  notes: string | null;
  roleName?: string | null;
  roleColor?: string | null;
  userName?: string | null;
};

type Role = { id: string; name: string; color?: string | null };
type UserRow = { id: string; fullName: string };

function isoDay(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function combineDateAndTimeToIso(date: string, time: string): string {
  const withSeconds = time.length === 5 ? `${time}:00` : time;
  const parsed = new Date(`${date}T${withSeconds}`);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function mondayOfSameWeek(isoDate: string): string {
  const d = parseISO(isoDate);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return isoDay(d);
}

function addDaysIso(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

export default function ManagerSchedule() {
  const { activeVenue } = useAppContext();
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;
  const qc = useQueryClient();
  const { toast } = useToast();
  const venueId = activeVenue?.id ?? "";

  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState<string>(() => isoDay(new Date()));
  const [editing, setEditing] = useState<ShiftRow | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Calendar grid: start-of-week of the first day of the month through
  // end-of-week of the last, so the grid is always 6 rows of 7.
  const gridStart = useMemo(() => startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 }), [cursor]);
  const gridEnd   = useMemo(() => endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 }),   [cursor]);
  const gridDays  = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);

  const fromIso = gridStart.toISOString();
  const toIso   = gridEnd.toISOString();

  const { data: schedules } = useListSchedules(
    { venueId },
    { query: { enabled: !!venueId, queryKey: getListSchedulesQueryKey({ venueId }) } },
  );

  const shiftsKey = ["shifts", venueId, "range", fromIso, toIso] as const;
  const { data: monthShifts } = useQuery<ShiftRow[]>({
    queryKey: shiftsKey,
    enabled: !!venueId,
    queryFn: async () => {
      const url = `/api/shifts?venueId=${encodeURIComponent(venueId)}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load shifts (${res.status})`);
      return res.json();
    },
  });

  const { data: roles } = useListRoles(
    { venueId },
    { query: { enabled: !!venueId, queryKey: getListRolesQueryKey({ venueId }) } },
  );
  const { data: users } = useListUsers(
    { venueId },
    { query: { enabled: !!venueId, queryKey: getListUsersQueryKey({ venueId }) } },
  );

  const createSchedule = useCreateSchedule();
  const createShift = useCreateShift();

  const updateShiftMut = useMutation({
    mutationFn: async (input: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/shifts/${input.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Update failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: shiftsKey }); },
  });

  const deleteShiftMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shifts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Delete failed (${res.status})`);
      }
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: shiftsKey }); },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch(`/api/shifts/bulk`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(`Bulk delete failed (${res.status})`);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: shiftsKey }); },
  });

  const ensureScheduleForDate = async (dateIso: string): Promise<string | null> => {
    if (!venueId) return null;
    const weekStart = mondayOfSameWeek(dateIso);
    const existing = schedules?.find((s) => s.weekStart === weekStart);
    if (existing?.id) return existing.id;
    const weekEnd = addDaysIso(weekStart, 6);
    const sched = await createSchedule.mutateAsync({ data: { venueId, weekStart, weekEnd } });
    await qc.invalidateQueries({ queryKey: getListSchedulesQueryKey({ venueId }) });
    return sched.id;
  };

  const shiftsByDay = useMemo(() => {
    const map: Record<string, ShiftRow[]> = {};
    for (const s of monthShifts ?? []) {
      const key = isoDay(new Date(s.startTime));
      (map[key] ||= []).push(s);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }
    return map;
  }, [monthShifts]);

  const monthLabel = format(cursor, "MMMM yyyy");

  const inMonthShiftIds = useMemo(() => {
    return (monthShifts ?? [])
      .filter((s) => isSameMonth(new Date(s.startTime), cursor))
      .map((s) => s.id);
  }, [monthShifts, cursor]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => addMonths(c, -1))} aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-sm font-medium min-w-[140px] text-center">{monthLabel}</div>
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(startOfMonth(new Date()))} className="ml-1">
            <CalendarIcon className="w-4 h-4 mr-1.5" /> Today
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <Button
              variant="outline"
              onClick={() => setConfirmClear(true)}
              disabled={inMonthShiftIds.length === 0 || bulkDeleteMut.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Clear schedule
            </Button>
          ) : null}
          <Button onClick={() => { setAddDate(isoDay(new Date())); setAddOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Add Shift
          </Button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-1">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-px bg-border border rounded-lg overflow-hidden">
        {gridDays.map((day) => {
          const key = isoDay(day);
          const dayShifts = shiftsByDay[key] ?? [];
          const inMonth = isSameMonth(day, cursor);
          const today = isToday(day);
          return (
            <button
              type="button"
              key={key}
              onClick={() => { setAddDate(key); setAddOpen(true); }}
              className={`min-h-[118px] text-left p-2 transition-colors ${
                inMonth ? "bg-card hover:bg-accent/40" : "bg-muted/40 hover:bg-muted text-muted-foreground"
              } ${today ? "ring-2 ring-primary ring-inset" : ""}`}
              aria-label={`Add shift for ${format(day, "EEEE, MMMM d")}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-sm ${today ? "font-bold text-primary" : inMonth ? "font-semibold" : ""}`}>
                  {format(day, "d")}
                </span>
                {dayShifts.length > 0 ? (
                  <span className="text-[10px] text-muted-foreground">{dayShifts.length}</span>
                ) : null}
              </div>
              <div className="space-y-1">
                {dayShifts.slice(0, 4).map((s) => (
                  <ShiftChip
                    key={s.id}
                    shift={s}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(s);
                    }}
                  />
                ))}
                {dayShifts.length > 4 ? (
                  <div className="text-[10px] text-muted-foreground pl-1">
                    +{dayShifts.length - 4} more
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {/* Add dialog */}
      <ShiftDialog
        mode="add"
        open={addOpen}
        onOpenChange={setAddOpen}
        initialDate={addDate}
        roles={roles ?? []}
        users={users ?? []}
        saving={createShift.isPending || createSchedule.isPending}
        onSubmit={async (input) => {
          if (!venueId) { toast({ title: "No active venue", variant: "destructive" }); return; }
          try {
            const scheduleId = await ensureScheduleForDate(input.date);
            if (!scheduleId) throw new Error("Couldn't create the week's schedule");
            await createShift.mutateAsync({
              data: {
                scheduleId,
                userId: input.userId || undefined,
                roleId: input.roleId,
                startTime: combineDateAndTimeToIso(input.date, input.startTime),
                endTime: combineDateAndTimeToIso(input.date, input.endTime),
                notes: input.notes || undefined,
              },
            });
            await qc.invalidateQueries({ queryKey: shiftsKey });
            toast({ title: "Shift added" });
            setAddOpen(false);
          } catch (err) {
            console.error(err);
            toast({
              title: "Failed to add shift",
              description: err instanceof Error ? err.message : "Unknown error",
              variant: "destructive",
            });
          }
        }}
      />

      {/* Edit dialog (admin only — triggered from shift tile) */}
      <ShiftDialog
        mode="edit"
        open={editing !== null && isAdmin}
        onOpenChange={(v) => { if (!v) setEditing(null); }}
        initialDate={editing ? isoDay(new Date(editing.startTime)) : addDate}
        initialShift={editing}
        roles={roles ?? []}
        users={users ?? []}
        saving={updateShiftMut.isPending || deleteShiftMut.isPending}
        onDelete={async () => {
          if (!editing) return;
          try {
            await deleteShiftMut.mutateAsync(editing.id);
            toast({ title: "Shift deleted" });
            setEditing(null);
          } catch (err) {
            toast({
              title: "Failed to delete",
              description: err instanceof Error ? err.message : "Unknown error",
              variant: "destructive",
            });
          }
        }}
        onSubmit={async (input) => {
          if (!editing) return;
          try {
            await updateShiftMut.mutateAsync({
              id: editing.id,
              data: {
                userId: input.userId || null,
                roleId: input.roleId,
                startTime: combineDateAndTimeToIso(input.date, input.startTime),
                endTime: combineDateAndTimeToIso(input.date, input.endTime),
                notes: input.notes || null,
              },
            });
            toast({ title: "Shift updated" });
            setEditing(null);
          } catch (err) {
            toast({
              title: "Failed to update",
              description: err instanceof Error ? err.message : "Unknown error",
              variant: "destructive",
            });
          }
        }}
      />

      {/* Read-only dialog for non-admins clicking a shift */}
      {editing !== null && !isAdmin ? (
        <Dialog open onOpenChange={(v) => { if (!v) setEditing(null); }}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>{editing.userName ?? "Open shift"}</DialogTitle>
              <DialogDescription>{editing.roleName ?? "No role"}</DialogDescription>
            </DialogHeader>
            <div className="text-sm space-y-2">
              <div>{format(new Date(editing.startTime), "EEEE, MMMM d")}</div>
              <div className="font-mono">
                {format(new Date(editing.startTime), "h:mm a")} – {format(new Date(editing.endTime), "h:mm a")}
              </div>
              {editing.notes ? (
                <div className="pt-2 text-muted-foreground">{editing.notes}</div>
              ) : null}
            </div>
            <DialogFooter>
              <Button onClick={() => setEditing(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Clear schedule confirmation */}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear {monthLabel} schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {inMonthShiftIds.length} shift
              {inMonthShiftIds.length === 1 ? "" : "s"} in {monthLabel}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await bulkDeleteMut.mutateAsync(inMonthShiftIds);
                  toast({ title: "Schedule cleared" });
                } catch (err) {
                  toast({
                    title: "Failed to clear",
                    description: err instanceof Error ? err.message : "Unknown error",
                    variant: "destructive",
                  });
                } finally {
                  setConfirmClear(false);
                }
              }}
            >
              Clear schedule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ShiftChip({ shift, onClick }: { shift: ShiftRow; onClick: (e: React.MouseEvent) => void }) {
  const start = format(new Date(shift.startTime), "h:mma").toLowerCase();
  const assignee = shift.userName?.split(" ")[0] ?? "Open";
  const tint = shift.roleColor ?? "#6366f1";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e as unknown as React.MouseEvent); } }}
      className="w-full truncate text-left text-[11px] leading-tight rounded px-1.5 py-1 cursor-pointer hover:brightness-95"
      style={{ background: `${tint}22`, borderLeft: `3px solid ${tint}` }}
      title={`${shift.userName ?? "Open"} · ${shift.roleName ?? ""} · ${format(new Date(shift.startTime), "h:mm a")}–${format(new Date(shift.endTime), "h:mm a")}${shift.notes ? ` · ${shift.notes}` : ""}`}
    >
      <span className="font-semibold">{start}</span> · {assignee}
      {shift.roleName ? <span className="text-muted-foreground"> · {shift.roleName}</span> : null}
    </div>
  );
}

type ShiftInput = {
  date: string;
  startTime: string;
  endTime: string;
  roleId: string;
  userId: string;
  notes: string;
};

function ShiftDialog({
  mode, open, onOpenChange, initialDate, initialShift, roles, users,
  onSubmit, onDelete, saving,
}: {
  mode: "add" | "edit";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialDate: string;
  initialShift?: ShiftRow | null;
  roles: Role[];
  users: UserRow[];
  onSubmit: (input: ShiftInput) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = useState<ShiftInput>(() => ({
    date: initialDate,
    startTime: "17:00",
    endTime: "22:00",
    roleId: "",
    userId: "",
    notes: "",
  }));

  // Re-seed the form whenever the dialog opens with new context.
  const keyState = `${open}-${initialShift?.id ?? "new"}-${initialDate}`;
  const [lastKey, setLastKey] = useState(keyState);
  if (open && keyState !== lastKey) {
    setLastKey(keyState);
    if (initialShift) {
      setForm({
        date: isoDay(new Date(initialShift.startTime)),
        startTime: format(new Date(initialShift.startTime), "HH:mm"),
        endTime: format(new Date(initialShift.endTime), "HH:mm"),
        roleId: initialShift.roleId,
        userId: initialShift.userId ?? "",
        notes: initialShift.notes ?? "",
      });
    } else {
      setForm({ date: initialDate, startTime: "17:00", endTime: "22:00", roleId: "", userId: "", notes: "" });
    }
  }

  const update = <K extends keyof ShiftInput>(key: K, value: ShiftInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canSubmit =
    !!form.date && !!form.startTime && !!form.endTime && !!form.roleId && form.startTime < form.endTime;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add shift" : "Edit shift"}</DialogTitle>
          <DialogDescription>
            Leave the employee empty to create (or convert to) an open shift.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sh-date">Date</Label>
            <Input id="sh-date" type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sh-start">Start</Label>
              <Input id="sh-start" type="time" value={form.startTime} onChange={(e) => update("startTime", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sh-end">End</Label>
              <Input id="sh-end" type="time" value={form.endTime} onChange={(e) => update("endTime", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-role">Role</Label>
            {roles.length === 0 ? (
              <div className="text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted">
                No roles configured yet. Add roles on the Employees page first.
              </div>
            ) : (
              <Select value={form.roleId} onValueChange={(v) => update("roleId", v)}>
                <SelectTrigger id="sh-role"><SelectValue placeholder="Choose a role" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-user">Employee (optional)</Label>
            <Select value={form.userId || "__open__"} onValueChange={(v) => update("userId", v === "__open__" ? "" : v)}>
              <SelectTrigger id="sh-user"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__open__">Open shift (anyone can pick up)</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-notes">Notes (optional)</Label>
            <Textarea id="sh-notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={2} />
          </div>
          {form.startTime >= form.endTime ? (
            <p className="text-xs text-destructive">End time must be after start time.</p>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          {mode === "edit" && onDelete ? (
            <Button variant="destructive" onClick={onDelete} disabled={saving}>
              <Trash2 className="w-4 h-4 mr-1.5" /> Delete
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSubmit(form)} disabled={!canSubmit || saving}>
            {saving ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>) : (mode === "add" ? "Add shift" : "Save changes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
