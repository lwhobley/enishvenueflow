import { useMemo, useState } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import {
  useListSchedules, getListSchedulesQueryKey,
  useCreateSchedule,
  useListShifts, getListShiftsQueryKey,
  useCreateShift,
  useListRoles, getListRolesQueryKey,
  useListUsers, getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

function mondayOf(d: Date): string {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(copy.setDate(diff)).toISOString().split("T")[0];
}

function addDaysIso(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function isoAtLocal(date: string, time: string): string {
  // Combine an input[type=date] + input[type=time] into an ISO timestamp
  // interpreted in the user's local timezone. Falls back to "now" if parsing
  // fails so the Add Shift flow still progresses rather than 400'ing.
  const combined = `${date}T${time.length === 5 ? time + ":00" : time}`;
  const parsed = new Date(combined);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

export default function ManagerSchedule() {
  const { activeVenue } = useAppContext();
  const qc = useQueryClient();
  const { toast } = useToast();
  const venueId = activeVenue?.id ?? "";

  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [addOpen, setAddOpen] = useState(false);

  const { data: schedules } = useListSchedules(
    { venueId },
    { query: { enabled: !!venueId, queryKey: getListSchedulesQueryKey({ venueId }) } },
  );
  const currentSchedule = schedules?.find((s) => s.weekStart === weekStart);

  const { data: shifts } = useListShifts(
    { scheduleId: currentSchedule?.id || "", venueId },
    {
      query: {
        enabled: !!currentSchedule?.id,
        queryKey: getListShiftsQueryKey({ scheduleId: currentSchedule?.id || "", venueId }),
      },
    },
  );

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

  const ensureSchedule = async (): Promise<string | null> => {
    if (currentSchedule?.id) return currentSchedule.id;
    if (!venueId) return null;
    const weekEnd = addDaysIso(weekStart, 6);
    const sched = await createSchedule.mutateAsync({ data: { venueId, weekStart, weekEnd } });
    await qc.invalidateQueries({ queryKey: getListSchedulesQueryKey({ venueId }) });
    return sched.id;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(mondayOf(new Date(e.target.value)))}
            className="w-[170px]"
          />
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Shift
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-muted-foreground">
            Week of {format(parseISO(weekStart), "MMM d, yyyy")}
          </div>
          <div className="text-sm text-muted-foreground">
            {currentSchedule ? `${shifts?.length ?? 0} shifts scheduled` : "No schedule yet — adding a shift will create one"}
          </div>
        </div>
        {shifts && shifts.length > 0 ? (
          <ul className="divide-y">
            {[...shifts]
              .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
              .map((s) => {
                const u = users?.find((x) => x.id === s.userId);
                const r = roles?.find((x) => x.id === s.roleId);
                return (
                  <li key={s.id} className="py-3 flex items-center gap-4 text-sm">
                    <span className="w-28 font-mono text-xs">
                      {format(new Date(s.startTime), "EEE MMM d")}
                    </span>
                    <span className="w-32 font-mono text-xs">
                      {format(new Date(s.startTime), "h:mm a")} – {format(new Date(s.endTime), "h:mm a")}
                    </span>
                    <span className="flex-1">
                      <span className="font-medium">{u?.fullName ?? "Open"}</span>
                      {r ? <span className="text-muted-foreground"> · {r.name}</span> : null}
                    </span>
                  </li>
                );
              })}
          </ul>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-8">
            No shifts in this week yet.
          </div>
        )}
      </div>

      <AddShiftDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        weekStart={weekStart}
        roles={roles ?? []}
        users={users ?? []}
        onSubmit={async (input) => {
          if (!venueId) {
            toast({ title: "No active venue", variant: "destructive" });
            return;
          }
          try {
            const scheduleId = await ensureSchedule();
            if (!scheduleId) {
              toast({ title: "Couldn't create the week's schedule", variant: "destructive" });
              return;
            }
            await createShift.mutateAsync({
              data: {
                scheduleId,
                userId: input.userId || undefined,
                roleId: input.roleId,
                startTime: isoAtLocal(input.date, input.startTime),
                endTime: isoAtLocal(input.date, input.endTime),
                notes: input.notes || undefined,
              },
            });
            await qc.invalidateQueries({ queryKey: getListShiftsQueryKey({ scheduleId, venueId }) });
            toast({ title: "Shift added" });
            setAddOpen(false);
          } catch (err) {
            const e = err as { data?: { message?: string }; message?: string };
            const msg = e?.data?.message ?? e?.message ?? String(err);
            console.error("Add shift failed:", err);
            toast({
              title: "Failed to add shift",
              description: msg,
              variant: "destructive",
            });
          }
        }}
        saving={createShift.isPending || createSchedule.isPending}
      />
    </div>
  );
}

type AddShiftInput = {
  date: string;
  startTime: string;
  endTime: string;
  roleId: string;
  userId: string;
  notes: string;
};

function AddShiftDialog({
  open, onOpenChange, weekStart, roles, users, onSubmit, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  weekStart: string;
  roles: Array<{ id: string; name: string }>;
  users: Array<{ id: string; fullName: string }>;
  onSubmit: (input: AddShiftInput) => void | Promise<void>;
  saving: boolean;
}) {
  const defaultDate = weekStart;
  const [form, setForm] = useState<AddShiftInput>({
    date: defaultDate,
    startTime: "17:00",
    endTime: "22:00",
    roleId: "",
    userId: "",
    notes: "",
  });

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysIso(weekStart, i);
      const d = parseISO(iso);
      return { iso, label: format(d, "EEE MMM d") };
    });
  }, [weekStart]);

  const update = <K extends keyof AddShiftInput>(key: K, value: AddShiftInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canSubmit =
    !!form.date && !!form.startTime && !!form.endTime && !!form.roleId && form.startTime < form.endTime;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add shift</DialogTitle>
          <DialogDescription>
            Leave the employee empty to create an open shift that staff can pick up.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sh-date">Day</Label>
            <Select value={form.date} onValueChange={(v) => update("date", v)}>
              <SelectTrigger id="sh-date"><SelectValue /></SelectTrigger>
              <SelectContent>
                {weekDays.map((d) => (
                  <SelectItem key={d.iso} value={d.iso}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSubmit(form)} disabled={!canSubmit || saving}>
            {saving ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>) : "Add shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
