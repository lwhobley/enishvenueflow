import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/hooks/use-app-context";
import {
  useListShifts, getListShiftsQueryKey,
  useListOpenShifts, getListOpenShiftsQueryKey,
  useListShiftRequests, getListShiftRequestsQueryKey,
  useListTimeOffRequests, getListTimeOffRequestsQueryKey,
  useCreateShiftRequest, useCreateTimeOffRequest,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, isFuture } from "date-fns";
import { findBlackoutOverlaps, describeBlackouts, upcomingBlackouts } from "@workspace/api-zod";
import { X, ArrowDownCircle, ArrowUpCircle, CalendarOff, Clock, ChevronDown } from "lucide-react";

// ── palette ──────────────────────────────────────────────────────────────────
// VenueFlow brand palette — light, navy/teal/mint. Variable names kept so
// the rest of the file's many references resolve unchanged.
const G = {
  bg: "#F4F8FA", surface: "#FFFFFF", surfaceHi: "#EAF4F8",
  gold: "#1F9CC2", goldDim: "rgba(31,156,194,0.12)", goldHair: "rgba(31,156,194,0.08)",
  champ: "#142849", champDim: "rgba(20,40,73,0.62)", muted: "rgba(20,40,73,0.46)",
  border: "rgba(38,78,122,0.16)", rose: "#DC2626", sage: "#10B981",
};

// ── tiny modal ────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{ position: "relative", background: G.surface, border: `1px solid ${G.border}`, borderRadius: 16, padding: 28, width: "100%", maxWidth: 440, boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ color: G.champ, fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: G.muted, padding: 4 }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function statusBadgeStyle(status: string) {
  if (status === "approved") return { background: "rgba(139,168,136,0.18)", color: G.sage, border: `1px solid rgba(139,168,136,0.3)` };
  if (status === "rejected") return { background: "rgba(192,57,43,0.14)", color: "#E07060", border: `1px solid rgba(192,57,43,0.3)` };
  return { background: G.goldDim, color: G.gold, border: `1px solid rgba(201,168,75,0.3)` };
}

function ShiftCard({ shift, onDrop, myRequests }: {
  shift: { id: string; startTime: string | Date; endTime: string | Date; roleName?: string | null; roleColor?: string | null; status?: string | null };
  onDrop: (shiftId: string) => void;
  myRequests: Array<{ shiftId: string; type: string; status: string }>;
}) {
  const dropReq = myRequests.find(r => r.shiftId === shift.id && r.type === "drop");
  const isFut = isFuture(new Date(shift.startTime));

  return (
    <div style={{ background: G.surfaceHi, border: `1px solid ${G.border}`, borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ color: G.champ, fontWeight: 600, fontSize: 15 }}>
            {format(new Date(shift.startTime), "EEEE, MMMM do")}
          </div>
          <div style={{ color: G.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Clock size={12} />
            {format(new Date(shift.startTime), "h:mm a")} – {format(new Date(shift.endTime), "h:mm a")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {shift.roleName && (
            <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: `${shift.roleColor ?? G.gold}18`, color: shift.roleColor ?? G.gold, border: `1px solid ${shift.roleColor ?? G.gold}30` }}>
              {shift.roleName}
            </span>
          )}
          {isFut && !dropReq && (
            <button
              onClick={() => onDrop(shift.id)}
              style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "6px 12px", borderRadius: 8, background: "rgba(192,57,43,0.12)", border: "1px solid rgba(192,57,43,0.28)", color: "#E07060", cursor: "pointer", fontWeight: 600 }}
            >
              <ArrowDownCircle size={13} /> Drop
            </button>
          )}
          {dropReq && (
            <span style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, fontWeight: 600, ...statusBadgeStyle(dropReq.status) }}>
              Drop {dropReq.status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function OpenShiftCard({ shift, onPickup, myRequests }: {
  shift: { id: string; startTime: string | Date; endTime: string | Date; roleName?: string | null; roleColor?: string | null };
  onPickup: (shiftId: string) => void;
  myRequests: Array<{ shiftId: string; type: string; status: string }>;
}) {
  const pickupReq = myRequests.find(r => r.shiftId === shift.id && r.type === "pickup");

  return (
    <div style={{ background: G.surfaceHi, border: `1px solid ${G.border}`, borderRadius: 12, padding: "16px 20px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <div>
        <div style={{ color: G.champ, fontWeight: 600, fontSize: 15 }}>
          {format(new Date(shift.startTime), "EEEE, MMMM do")}
        </div>
        <div style={{ color: G.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <Clock size={12} />
          {format(new Date(shift.startTime), "h:mm a")} – {format(new Date(shift.endTime), "h:mm a")}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {shift.roleName && (
          <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: `${shift.roleColor ?? G.gold}18`, color: shift.roleColor ?? G.gold, border: `1px solid ${shift.roleColor ?? G.gold}30` }}>
            {shift.roleName}
          </span>
        )}
        {!pickupReq ? (
          <button
            onClick={() => onPickup(shift.id)}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "6px 14px", borderRadius: 8, background: G.goldDim, border: `1px solid rgba(201,168,75,0.3)`, color: G.gold, cursor: "pointer", fontWeight: 600 }}
          >
            <ArrowUpCircle size={13} /> Request Pickup
          </button>
        ) : (
          <span style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, fontWeight: 600, ...statusBadgeStyle(pickupReq.status) }}>
            Pickup {pickupReq.status}
          </span>
        )}
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────
export default function EmployeeSchedule() {
  const { activeVenue, activeUser } = useAppContext();
  const qc = useQueryClient();

  // State for modals
  const [dropShiftId, setDropShiftId] = useState<string | null>(null);
  const [dropNotes, setDropNotes] = useState("");
  const [dropError, setDropError] = useState("");
  const [dropLoading, setDropLoading] = useState(false);

  const [pickupShiftId, setPickupShiftId] = useState<string | null>(null);
  const [pickupLoading, setPickupLoading] = useState(false);
  const [pickupError, setPickupError] = useState("");

  // Time-off form
  const [toType, setToType] = useState("vacation");
  const [toStart, setToStart] = useState("");
  const [toEnd, setToEnd] = useState("");
  const [toNotes, setToNotes] = useState("");
  const [toLoading, setToLoading] = useState(false);
  const [toSuccess, setToSuccess] = useState(false);
  const [toError, setToError] = useState("");

  const vId = activeVenue?.id ?? "";
  const uId = activeUser?.id ?? "";

  const { data: myShifts } = useListShifts(
    { venueId: vId, userId: uId },
    { query: { enabled: !!vId && !!uId, queryKey: getListShiftsQueryKey({ venueId: vId, userId: uId }) } }
  );

  const { data: openShifts } = useListOpenShifts(
    { venueId: vId, roleId: activeUser?.roleId ?? "" },
    { query: { enabled: !!vId && !!activeUser?.roleId, queryKey: getListOpenShiftsQueryKey({ venueId: vId, roleId: activeUser?.roleId ?? "" }) } }
  );

  const { data: myRequests } = useListShiftRequests(
    { userId: uId },
    { query: { enabled: !!uId, queryKey: getListShiftRequestsQueryKey({ userId: uId }) } }
  );

  const { data: myTimeOff } = useListTimeOffRequests(
    { venueId: vId, userId: uId },
    { query: { enabled: !!vId && !!uId, queryKey: getListTimeOffRequestsQueryKey({ venueId: vId, userId: uId }) } }
  );

  const createShiftRequest = useCreateShiftRequest();
  const createTimeOff = useCreateTimeOffRequest();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListShiftRequestsQueryKey({ userId: uId }) });
    qc.invalidateQueries({ queryKey: getListShiftsQueryKey({ venueId: vId, userId: uId }) });
    qc.invalidateQueries({ queryKey: getListOpenShiftsQueryKey({ venueId: vId, roleId: activeUser?.roleId ?? "" }) });
  };

  async function handleDropSubmit() {
    if (!dropShiftId || !uId) return;
    setDropLoading(true);
    setDropError("");
    try {
      await createShiftRequest.mutateAsync({ data: { userId: uId, shiftId: dropShiftId, type: "drop", notes: dropNotes || undefined } });
      invalidate();
      setDropShiftId(null);
      setDropNotes("");
    } catch (e: unknown) {
      setDropError((e as { message?: string })?.message ?? "Request failed");
    } finally {
      setDropLoading(false);
    }
  }

  async function handlePickupSubmit() {
    if (!pickupShiftId || !uId) return;
    setPickupLoading(true);
    setPickupError("");
    try {
      await createShiftRequest.mutateAsync({ data: { userId: uId, shiftId: pickupShiftId, type: "pickup" } });
      invalidate();
      setPickupShiftId(null);
    } catch (e: unknown) {
      setPickupError((e as { message?: string })?.message ?? "Request failed");
    } finally {
      setPickupLoading(false);
    }
  }

  async function handleTimeOffSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vId || !uId || !toStart || !toEnd) return;
    // Local-side blackout guard so the user sees the rejection instantly
    // instead of round-tripping the API. The server enforces the same list
    // server-side — this is just a UX shortcut.
    if (toType !== "sick") {
      const conflicts = findBlackoutOverlaps(toStart, toEnd);
      if (conflicts.length > 0) {
        setToError(`These dates are blackout (${describeBlackouts(conflicts)}). Pick different dates or talk to your manager.`);
        return;
      }
    }
    setToLoading(true);
    setToError("");
    setToSuccess(false);
    try {
      await createTimeOff.mutateAsync({ data: { userId: uId, venueId: vId, startDate: toStart, endDate: toEnd, type: toType, notes: toNotes || undefined } });
      qc.invalidateQueries({ queryKey: getListTimeOffRequestsQueryKey({ venueId: vId, userId: uId }) });
      setToSuccess(true);
      setToStart(""); setToEnd(""); setToNotes(""); setToType("vacation");
    } catch (e: unknown) {
      setToError((e as { message?: string })?.message ?? "Submission failed");
    } finally {
      setToLoading(false);
    }
  }

  const req = (myRequests ?? []) as Array<{ shiftId: string; type: string; status: string }>;
  const upcomingShifts = (myShifts ?? []).filter(s => isFuture(new Date(s.endTime)));
  const pendingTimeOff = (myTimeOff ?? []).filter(r => r.status === "pending");
  const historyTimeOff = (myTimeOff ?? []).filter(r => r.status !== "pending");

  const inputStyle: React.CSSProperties = {
    width: "100%", background: G.bg, border: `1px solid ${G.border}`, borderRadius: 8,
    color: G.champ, fontSize: 14, padding: "10px 12px", outline: "none",
    fontFamily: "system-ui, sans-serif",
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, appearance: "none" };
  const labelStyle: React.CSSProperties = { display: "block", color: G.muted, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, fontWeight: 600 };

  return (
    <div style={{ color: G.champ, fontFamily: "system-ui, sans-serif" }}>
      {/* Drop shift modal */}
      {dropShiftId && (
        <Modal title="Request to Drop Shift" onClose={() => { setDropShiftId(null); setDropNotes(""); setDropError(""); }}>
          <p style={{ color: G.muted, fontSize: 13, marginBottom: 16 }}>
            Your manager will review this request before the shift is released. You remain responsible for the shift until approved.
          </p>
          <label style={labelStyle}>Reason (optional)</label>
          <textarea
            value={dropNotes}
            onChange={e => setDropNotes(e.target.value)}
            placeholder="Briefly explain why you need to drop this shift…"
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
          {dropError && <p style={{ color: G.rose, fontSize: 12, marginTop: 8 }}>{dropError}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button onClick={() => { setDropShiftId(null); setDropNotes(""); }} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${G.border}`, background: "transparent", color: G.muted, cursor: "pointer" }}>Cancel</button>
            <button onClick={handleDropSubmit} disabled={dropLoading} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "1px solid rgba(192,57,43,0.4)", background: "rgba(192,57,43,0.18)", color: "#E07060", cursor: "pointer", fontWeight: 700, opacity: dropLoading ? 0.6 : 1 }}>
              {dropLoading ? "Submitting…" : "Submit Drop Request"}
            </button>
          </div>
        </Modal>
      )}

      {/* Pickup confirm modal */}
      {pickupShiftId && (
        <Modal title="Request to Pick Up Shift" onClose={() => { setPickupShiftId(null); setPickupError(""); }}>
          <p style={{ color: G.muted, fontSize: 13, marginBottom: 16 }}>
            Your manager will review your pickup request. You will be notified once approved.
          </p>
          {pickupError && <p style={{ color: G.rose, fontSize: 12, marginBottom: 12 }}>{pickupError}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setPickupShiftId(null)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${G.border}`, background: "transparent", color: G.muted, cursor: "pointer" }}>Cancel</button>
            <button onClick={handlePickupSubmit} disabled={pickupLoading} style={{ flex: 2, padding: "10px", borderRadius: 8, border: `1px solid rgba(201,168,75,0.3)`, background: G.goldDim, color: G.gold, cursor: "pointer", fontWeight: 700, opacity: pickupLoading ? 0.6 : 1 }}>
              {pickupLoading ? "Submitting…" : "Confirm Request"}
            </button>
          </div>
        </Modal>
      )}

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: G.champ, letterSpacing: 0.5, margin: 0 }}>My Schedule</h1>
        <p style={{ color: G.muted, fontSize: 13, marginTop: 4 }}>Manage your shifts and time-off requests</p>
      </div>

      <Tabs defaultValue="shifts">
        <TabsList style={{ background: G.surfaceHi, border: `1px solid ${G.border}`, borderRadius: 10, padding: 4, gap: 2 }}>
          <TabsTrigger value="shifts">My Shifts {upcomingShifts.length > 0 && `(${upcomingShifts.length})`}</TabsTrigger>
          <TabsTrigger value="open">Open Shifts {(openShifts?.length ?? 0) > 0 && `(${openShifts?.length})`}</TabsTrigger>
          <TabsTrigger value="timeoff">
            <CalendarOff size={13} style={{ marginRight: 5 }} />
            Time Off
          </TabsTrigger>
        </TabsList>

        {/* ── My Shifts ── */}
        <TabsContent value="shifts" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {upcomingShifts.map(shift => (
              <ShiftCard key={shift.id} shift={shift} onDrop={setDropShiftId} myRequests={req} />
            ))}
            {!upcomingShifts.length && (
              <div style={{ textAlign: "center", padding: "48px 0", color: G.muted, fontSize: 14 }}>
                No upcoming shifts scheduled.
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Open Shifts ── */}
        <TabsContent value="open" style={{ marginTop: 16 }}>
          <p style={{ color: G.muted, fontSize: 13, marginBottom: 14 }}>
            Showing open shifts matching your <strong style={{ color: G.gold }}>{activeUser?.roleId ? "position" : "role"}</strong>. Pickup requests require manager approval.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(openShifts ?? []).map(shift => (
              <OpenShiftCard key={shift.id} shift={shift} onPickup={setPickupShiftId} myRequests={req} />
            ))}
            {!(openShifts ?? []).length && (
              <div style={{ textAlign: "center", padding: "48px 0", color: G.muted, fontSize: 14 }}>
                No open shifts available for your position.
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Time Off ── */}
        <TabsContent value="timeoff" style={{ marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
            {/* Blackout dates banner */}
            {upcomingBlackouts().length > 0 && (
              <div style={{
                background: "rgba(176, 58, 46, 0.08)",
                border: `1px solid rgba(176, 58, 46, 0.28)`,
                borderRadius: 14,
                padding: "14px 18px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#B03A2E" }}>
                    Blackout dates
                  </span>
                </div>
                <p style={{ color: G.muted, fontSize: 12, lineHeight: 1.6, margin: "0 0 8px" }}>
                  Time-off requests aren't accepted on these dates (FIFA World Cup all of June + peak holidays). Sick leave is exempt.
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, color: G.text, fontSize: 12.5, lineHeight: 1.7 }}>
                  {upcomingBlackouts().map((b) => (
                    <li key={`${b.start}-${b.end}`}>
                      <strong>{b.label}</strong>
                      {" — "}
                      {b.start === b.end ? format(new Date(`${b.start}T00:00:00`), "EEE, MMM d, yyyy") : (
                        <>
                          {format(new Date(`${b.start}T00:00:00`), "MMM d")} – {format(new Date(`${b.end}T00:00:00`), "MMM d, yyyy")}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Request form */}
            <div style={{ background: G.surfaceHi, border: `1px solid ${G.border}`, borderRadius: 14, padding: 24 }}>
              <h3 style={{ color: G.gold, fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", margin: "0 0 20px" }}>New Request</h3>
              <form onSubmit={handleTimeOffSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Request Type</label>
                  <div style={{ position: "relative" }}>
                    <select value={toType} onChange={e => setToType(e.target.value)} style={selectStyle}>
                      <option value="vacation">Vacation</option>
                      <option value="sick">Sick Leave</option>
                      <option value="personal">Personal Day</option>
                      <option value="unpaid">Unpaid Time Off</option>
                    </select>
                    <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: G.muted, pointerEvents: "none" }} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Start Date</label>
                    <input type="date" value={toStart} onChange={e => setToStart(e.target.value)} required min={new Date().toISOString().split("T")[0]} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>End Date</label>
                    <input type="date" value={toEnd} onChange={e => setToEnd(e.target.value)} required min={toStart || new Date().toISOString().split("T")[0]} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Notes (optional)</label>
                  <textarea value={toNotes} onChange={e => setToNotes(e.target.value)} placeholder="Additional context for your manager…" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                </div>
                {toError && <p style={{ color: G.rose, fontSize: 12 }}>{toError}</p>}
                {toSuccess && <p style={{ color: G.sage, fontSize: 12 }}>Request submitted! Your manager will review it shortly.</p>}
                <button type="submit" disabled={toLoading || !toStart || !toEnd} style={{ padding: "11px", borderRadius: 10, border: `1px solid rgba(201,168,75,0.35)`, background: G.goldDim, color: G.gold, fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: (toLoading || !toStart || !toEnd) ? 0.5 : 1 }}>
                  {toLoading ? "Submitting…" : "Submit Request"}
                </button>
              </form>
            </div>

            {/* Pending requests */}
            {pendingTimeOff.length > 0 && (
              <div style={{ background: G.surfaceHi, border: `1px solid ${G.border}`, borderRadius: 14, padding: 24 }}>
                <h3 style={{ color: G.gold, fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", margin: "0 0 16px" }}>Pending</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pendingTimeOff.map(r => (
                    <div key={r.id} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "12px 16px", background: G.bg, borderRadius: 10, border: `1px solid ${G.border}` }}>
                      <div>
                        <div style={{ color: G.champ, fontSize: 14, fontWeight: 600, textTransform: "capitalize" }}>{r.type}</div>
                        <div style={{ color: G.muted, fontSize: 12, marginTop: 2 }}>{r.startDate} → {r.endDate}</div>
                        {r.notes && <div style={{ color: G.muted, fontSize: 11, marginTop: 2, fontStyle: "italic" }}>{r.notes}</div>}
                      </div>
                      <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, fontWeight: 700, background: G.goldDim, color: G.gold, border: `1px solid rgba(201,168,75,0.3)` }}>Pending</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* History */}
            {historyTimeOff.length > 0 && (
              <div style={{ background: G.surfaceHi, border: `1px solid ${G.border}`, borderRadius: 14, padding: 24 }}>
                <h3 style={{ color: G.muted, fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", margin: "0 0 16px" }}>History</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {historyTimeOff.map(r => (
                    <div key={r.id} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "10px 14px", background: G.bg, borderRadius: 10, border: `1px solid ${G.border}` }}>
                      <div>
                        <div style={{ color: G.champDim, fontSize: 13, textTransform: "capitalize" }}>{r.type}</div>
                        <div style={{ color: G.muted, fontSize: 11, marginTop: 2 }}>{r.startDate} → {r.endDate}</div>
                      </div>
                      <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, fontWeight: 700, ...statusBadgeStyle(r.status ?? "pending") }}>
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
