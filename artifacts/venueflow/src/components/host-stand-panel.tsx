import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, Clock, Loader2, Plus, Sparkles, UserCheck, UserX, Utensils, X, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNowStrict } from "date-fns";

// ── Types ────────────────────────────────────────────────────────────────────
// We pull these from the server raw (no orval client for the new endpoints
// yet), so the typings live here rather than in the generated API spec.

export interface ReservationRow {
  id: string;
  venueId: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  partySize: number;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM
  durationMinutes: number;
  tableId: string | null;
  status: string;     // pending | confirmed | arrived | seated | completed | cancelled | no_show
  notes: string | null;
  arrivedAt: string | null;
  seatedAt: string | null;
  completedAt: string | null;
}

export interface WaitlistRow {
  id: string;
  venueId: string;
  guestName: string;
  guestPhone: string | null;
  partySize: number;
  quotedWait: number | null;
  status: string;     // waiting | seated | removed | left
  notes: string | null;
  createdAt: string;
}

export interface PanelTable {
  id: string;
  label: string;
  capacity: number;
  status: string;
}

export interface TableSuggestion {
  tableId: string;
  label: string;
  score: number;
  reasons: string[];
}

interface Props {
  venueId: string;
  /** Today's date in YYYY-MM-DD — defines the day the panel scopes to. */
  today: string;
  reservations: ReservationRow[];
  /** All tables in the active scope, used for the seat picker fallback list. */
  tables: PanelTable[];
  /** Query key whose invalidation refreshes the reservations + tables view. */
  reservationsQueryKey: readonly unknown[];
  tablesQueryKey: readonly unknown[];
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Buckets today's reservations into the four operational categories. */
function bucket(reservations: ReservationRow[]) {
  const upcoming: ReservationRow[] = [];
  const arrived: ReservationRow[] = [];
  const seated: ReservationRow[] = [];
  const completed: ReservationRow[] = [];
  for (const r of reservations) {
    switch (r.status) {
      case "pending":
      case "confirmed":
        upcoming.push(r); break;
      case "arrived":
        arrived.push(r); break;
      case "seated":
        seated.push(r); break;
      case "completed":
        completed.push(r); break;
      // cancelled, no_show — drop
    }
  }
  upcoming.sort((a, b) => a.time.localeCompare(b.time));
  // arrived: longest waiting first
  arrived.sort((a, b) => (a.arrivedAt ?? "").localeCompare(b.arrivedAt ?? ""));
  // seated: most recently seated first
  seated.sort((a, b) => (b.seatedAt ?? "").localeCompare(a.seatedAt ?? ""));
  return { upcoming, arrived, seated, completed };
}

function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "p" : "a";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${(m || 0).toString().padStart(2, "0")}${period}`;
}

/** Projected end time for a seated party — seatedAt + durationMinutes. */
function projectedEnd(r: ReservationRow): Date | null {
  if (!r.seatedAt) return null;
  return new Date(new Date(r.seatedAt).getTime() + r.durationMinutes * 60_000);
}

// ── Top-level component ──────────────────────────────────────────────────────

type Tab = "upcoming" | "arrived" | "seated" | "waitlist";

export function HostStandPanel({
  venueId, today, reservations, tables, reservationsQueryKey, tablesQueryKey,
}: Props) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [seatTarget, setSeatTarget] = useState<{ kind: "reservation"; id: string } | { kind: "waitlist"; id: string } | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);

  const buckets = useMemo(() => bucket(reservations), [reservations]);

  const { data: waitlist = [] } = useQuery<WaitlistRow[]>({
    queryKey: ["/waitlist", venueId],
    enabled: !!venueId,
    queryFn: async () => {
      const res = await fetch(`/api/waitlist?venueId=${venueId}`);
      if (!res.ok) throw new Error(`Waitlist load failed (${res.status})`);
      return await res.json();
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const activeWaitlist = useMemo(
    () => waitlist.filter((w) => w.status === "waiting").sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [waitlist],
  );

  const counts = {
    upcoming: buckets.upcoming.length,
    arrived: buckets.arrived.length,
    seated: buckets.seated.length,
    waitlist: activeWaitlist.length,
  };

  return (
    <aside className="border rounded-xl bg-card flex flex-col" style={{ minWidth: 320, maxWidth: 380 }}>
      <div className="px-4 py-3 border-b">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Host Stand</div>
        <div className="mt-0.5 text-sm font-medium">{format(new Date(), "EEEE, MMM d")}</div>
      </div>

      {/* Tab strip */}
      <div className="grid grid-cols-4 border-b text-xs font-medium">
        <TabButton label="Upcoming" count={counts.upcoming} active={tab === "upcoming"} onClick={() => setTab("upcoming")} />
        <TabButton label="Arrived"  count={counts.arrived}  active={tab === "arrived"}  onClick={() => setTab("arrived")} />
        <TabButton label="Seated"   count={counts.seated}   active={tab === "seated"}   onClick={() => setTab("seated")} />
        <TabButton label="Waitlist" count={counts.waitlist} active={tab === "waitlist"} onClick={() => setTab("waitlist")} />
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 640 }}>
        {tab === "upcoming" && (
          <UpcomingList
            rows={buckets.upcoming}
            reservationsQueryKey={reservationsQueryKey}
          />
        )}
        {tab === "arrived" && (
          <ArrivedList
            rows={buckets.arrived}
            onSeat={(id) => setSeatTarget({ kind: "reservation", id })}
            reservationsQueryKey={reservationsQueryKey}
          />
        )}
        {tab === "seated" && (
          <SeatedList
            rows={buckets.seated}
            tables={tables}
            reservationsQueryKey={reservationsQueryKey}
            tablesQueryKey={tablesQueryKey}
          />
        )}
        {tab === "waitlist" && (
          <WaitlistList
            venueId={venueId}
            entries={activeWaitlist}
            onWalkIn={() => setWalkInOpen(true)}
            onSeat={(id) => setSeatTarget({ kind: "waitlist", id })}
          />
        )}
      </div>

      <SeatPicker
        venueId={venueId}
        target={seatTarget}
        tables={tables}
        reservationsQueryKey={reservationsQueryKey}
        tablesQueryKey={tablesQueryKey}
        onClose={() => setSeatTarget(null)}
      />
      <WalkInDialog
        open={walkInOpen}
        onOpenChange={setWalkInOpen}
        venueId={venueId}
      />

      <div className="px-4 py-2.5 border-t text-xs text-muted-foreground">
        Today: {counts.upcoming + counts.arrived + counts.seated + buckets.completed.length} reservations · {buckets.completed.length} completed
      </div>
    </aside>
  );
}

// ── Tab button ───────────────────────────────────────────────────────────────
function TabButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-2 px-1 text-center transition-colors ${
        active
          ? "bg-secondary text-foreground border-b-2 border-primary -mb-px"
          : "text-muted-foreground hover:bg-muted/50"
      }`}
    >
      <div>{label}</div>
      <div className={`text-[10px] ${active ? "text-primary" : ""}`}>{count}</div>
    </button>
  );
}

// ── Card: a single reservation row ───────────────────────────────────────────
function ResCard({
  r, children,
}: { r: ReservationRow; children?: React.ReactNode }) {
  return (
    <li className="px-4 py-2.5 border-b text-sm space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{fmt12(r.time)}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Party of {r.partySize}
        </span>
      </div>
      <div className="font-medium leading-tight truncate">{r.guestName}</div>
      {r.notes ? <div className="text-xs text-muted-foreground line-clamp-2">{r.notes}</div> : null}
      {children}
    </li>
  );
}

// ── Upcoming tab ────────────────────────────────────────────────────────────
function UpcomingList({ rows, reservationsQueryKey }: {
  rows: ReservationRow[];
  reservationsQueryKey: readonly unknown[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const fire = async (id: string, action: "arrive" | "no-show" | "cancel") => {
    setBusyId(id);
    try {
      const url = action === "cancel"
        ? `/api/reservations/${id}`
        : `/api/reservations/${id}/${action}`;
      const res = await fetch(url, { method: action === "cancel" ? "DELETE" : "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      await qc.invalidateQueries({ queryKey: reservationsQueryKey });
    } catch (err) {
      toast({ title: "Action failed", description: String(err), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0) {
    return <EmptyState text="No upcoming reservations." />;
  }
  return (
    <ul>
      {rows.map((r) => (
        <ResCard key={r.id} r={r}>
          <div className="flex gap-1.5 pt-1">
            <Button size="sm" variant="default" disabled={busyId === r.id} onClick={() => fire(r.id, "arrive")}>
              {busyId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3 mr-1" />}
              Arrived
            </Button>
            <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => fire(r.id, "no-show")}>
              No-show
            </Button>
            <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => fire(r.id, "cancel")}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        </ResCard>
      ))}
    </ul>
  );
}

// ── Arrived tab ─────────────────────────────────────────────────────────────
function ArrivedList({
  rows, onSeat, reservationsQueryKey,
}: { rows: ReservationRow[]; onSeat: (id: string) => void; reservationsQueryKey: readonly unknown[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const noShow = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/reservations/${id}/no-show`, { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      await qc.invalidateQueries({ queryKey: reservationsQueryKey });
    } catch (err) {
      toast({ title: "Action failed", description: String(err), variant: "destructive" });
    } finally { setBusyId(null); }
  };

  if (rows.length === 0) return <EmptyState text="Nobody waiting." />;
  return (
    <ul>
      {rows.map((r) => {
        const waitedFor = r.arrivedAt ? formatDistanceToNowStrict(new Date(r.arrivedAt)) : "—";
        return (
          <ResCard key={r.id} r={r}>
            <div className="text-[11px] text-amber-600 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Waiting {waitedFor}
            </div>
            <div className="flex gap-1.5 pt-1">
              <Button size="sm" variant="default" onClick={() => onSeat(r.id)}>
                <Utensils className="w-3 h-3 mr-1" /> Seat
              </Button>
              <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => noShow(r.id)}>
                <UserX className="w-3 h-3 mr-1" /> No-show
              </Button>
            </div>
          </ResCard>
        );
      })}
    </ul>
  );
}

// ── Seated tab ──────────────────────────────────────────────────────────────
function SeatedList({
  rows, tables, reservationsQueryKey, tablesQueryKey,
}: {
  rows: ReservationRow[];
  tables: PanelTable[];
  reservationsQueryKey: readonly unknown[];
  tablesQueryKey: readonly unknown[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const complete = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/reservations/${id}/complete`, { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      await qc.invalidateQueries({ queryKey: reservationsQueryKey });
      await qc.invalidateQueries({ queryKey: tablesQueryKey });
    } catch (err) {
      toast({ title: "Action failed", description: String(err), variant: "destructive" });
    } finally { setBusyId(null); }
  };

  if (rows.length === 0) return <EmptyState text="Nobody seated." />;
  const tableLabel = (id: string | null) => id ? tables.find((t) => t.id === id)?.label ?? "—" : "—";

  return (
    <ul>
      {rows.map((r) => {
        const elapsed = r.seatedAt ? formatDistanceToNowStrict(new Date(r.seatedAt)) : "—";
        const projEnd = projectedEnd(r);
        const isPastDue = projEnd && projEnd.getTime() < Date.now();
        return (
          <ResCard key={r.id} r={r}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono">Table {tableLabel(r.tableId)}</span>
              <span className={isPastDue ? "text-destructive font-medium" : "text-muted-foreground"}>
                {elapsed} seated{projEnd ? ` · projected ${format(projEnd, "h:mma").toLowerCase()}` : ""}
              </span>
            </div>
            <div className="flex gap-1.5 pt-1">
              <Button size="sm" variant="default" disabled={busyId === r.id} onClick={() => complete(r.id)}>
                {busyId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                Complete
              </Button>
            </div>
          </ResCard>
        );
      })}
    </ul>
  );
}

// ── Waitlist tab ────────────────────────────────────────────────────────────
function WaitlistList({
  venueId, entries, onWalkIn, onSeat,
}: { venueId: string; entries: WaitlistRow[]; onWalkIn: () => void; onSeat: (id: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/waitlist/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "removed" }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await qc.invalidateQueries({ queryKey: ["/waitlist", venueId] });
    } catch (err) {
      toast({ title: "Action failed", description: String(err), variant: "destructive" });
    } finally { setBusyId(null); }
  };

  return (
    <div>
      <div className="px-4 py-2 border-b">
        <Button size="sm" variant="default" className="w-full" onClick={onWalkIn}>
          <Plus className="w-3 h-3 mr-1" /> Add walk-in
        </Button>
      </div>
      {entries.length === 0 ? (
        <EmptyState text="Waitlist is empty." />
      ) : (
        <ul>
          {entries.map((w) => {
            const waited = formatDistanceToNowStrict(new Date(w.createdAt));
            return (
              <li key={w.id} className="px-4 py-2.5 border-b text-sm space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium leading-tight truncate">{w.guestName}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Party of {w.partySize}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-3">
                  <span><Clock className="w-3 h-3 inline mr-1" />Waited {waited}</span>
                  {w.quotedWait ? <span>Quoted {w.quotedWait} min</span> : null}
                </div>
                {w.notes ? <div className="text-xs text-muted-foreground line-clamp-2">{w.notes}</div> : null}
                <div className="flex gap-1.5 pt-1">
                  <Button size="sm" variant="default" onClick={() => onSeat(w.id)}>
                    <Utensils className="w-3 h-3 mr-1" /> Seat
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busyId === w.id} onClick={() => remove(w.id)}>
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-4 py-8 text-center text-sm text-muted-foreground">{text}</div>
  );
}

// ── Walk-in dialog (creates a waitlist entry) ───────────────────────────────
function WalkInDialog({
  open, onOpenChange, venueId,
}: { open: boolean; onOpenChange: (v: boolean) => void; venueId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [size, setSize] = useState("2");
  const [quoted, setQuoted] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(""); setPhone(""); setSize("2"); setQuoted(""); setNotes(""); };

  const submit = async () => {
    if (!name.trim()) { toast({ title: "Guest name required", variant: "destructive" }); return; }
    const sizeN = parseInt(size, 10);
    if (!Number.isFinite(sizeN) || sizeN < 1) { toast({ title: "Party size must be ≥ 1", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          guestName: name.trim(),
          guestPhone: phone.trim() || null,
          partySize: sizeN,
          quotedWait: quoted ? parseInt(quoted, 10) : null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await qc.invalidateQueries({ queryKey: ["/waitlist", venueId] });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Failed to add", description: String(err), variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) { if (!v) reset(); onOpenChange(v); } }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add walk-in to waitlist</DialogTitle>
          <DialogDescription>Quote a wait time and you can seat them once a table opens.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Guest name</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Party size</Label><Input type="number" min={1} max={50} value={size} onChange={(e) => setSize(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Quoted wait (min)</Label><Input type="number" min={0} value={quoted} onChange={(e) => setQuoted(e.target.value)} placeholder="optional" /></div>
          </div>
          <div className="space-y-1.5"><Label>Phone (optional)</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="for SMS later" /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anniversary, allergies, etc." /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding…</> : "Add to waitlist"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Seat picker (reservation OR waitlist → table) ───────────────────────────
function SeatPicker({
  venueId, target, tables, reservationsQueryKey, tablesQueryKey, onClose,
}: {
  venueId: string;
  target: { kind: "reservation"; id: string } | { kind: "waitlist"; id: string } | null;
  tables: PanelTable[];
  reservationsQueryKey: readonly unknown[];
  tablesQueryKey: readonly unknown[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [seating, setSeating] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Smart suggestions are fetched only for reservation targets (the
  // backend route is keyed by reservation id). Waitlist targets get the
  // raw available-table list.
  const { data: suggestions = [] } = useQuery<TableSuggestion[]>({
    queryKey: ["/reservations", target?.kind === "reservation" ? target.id : "_", "suggested"],
    enabled: target?.kind === "reservation",
    queryFn: async () => {
      if (!target || target.kind !== "reservation") return [];
      const res = await fetch(`/api/reservations/${target.id}/suggested-tables`);
      if (!res.ok) throw new Error(`${res.status}`);
      return await res.json();
    },
    staleTime: 0,
  });

  const seat = async (tableId: string) => {
    if (!target) return;
    setSeating(true);
    try {
      const url = target.kind === "reservation"
        ? `/api/reservations/${target.id}/seat`
        : `/api/waitlist/${target.id}/seat`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `${res.status}`);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: reservationsQueryKey }),
        qc.invalidateQueries({ queryKey: tablesQueryKey }),
        qc.invalidateQueries({ queryKey: ["/waitlist", venueId] }),
      ]);
      onClose();
    } catch (err) {
      toast({
        title: "Couldn't seat",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally { setSeating(false); }
  };

  const availableTables = tables
    .filter((t) => t.status !== "blocked" && t.status !== "seated")
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <Dialog open={target !== null} onOpenChange={(v) => { if (!seating && !v) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Seat at table</DialogTitle>
          <DialogDescription>
            {target?.kind === "reservation"
              ? "Smart-assign ranked these tables. Click any to seat — or hit \"all tables\" to override."
              : "Pick any open table for this walk-in."}
          </DialogDescription>
        </DialogHeader>

        {target?.kind === "reservation" && suggestions.length > 0 && !showAll ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Recommended
            </div>
            <ul className="space-y-1.5 max-h-72 overflow-y-auto">
              {suggestions.map((s) => (
                <li key={s.tableId}>
                  <button
                    type="button"
                    disabled={seating}
                    onClick={() => seat(s.tableId)}
                    className="w-full text-left rounded-md border px-3 py-2 hover:bg-secondary transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-semibold">Table {s.label}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Score {Math.round(s.score * 100)}
                      </span>
                    </div>
                    <ul className="text-[11px] text-muted-foreground space-y-0.5">
                      {s.reasons.map((r, i) => <li key={i}>· {r}</li>)}
                    </ul>
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAll(true)}>
              <ChevronDown className="w-3 h-3 mr-1" /> Show all tables
            </Button>
          </div>
        ) : (
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {availableTables.length === 0 ? (
              <li className="text-sm text-muted-foreground px-2 py-4 text-center">No open tables.</li>
            ) : availableTables.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={seating}
                  onClick={() => seat(t.id)}
                  className="w-full text-left rounded-md border px-3 py-2 hover:bg-secondary transition-colors flex items-center justify-between disabled:opacity-50"
                >
                  <span className="font-mono font-semibold">Table {t.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t.capacity}-top · {t.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={seating}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
