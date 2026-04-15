import { useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/hooks/use-app-context";
import {
  useListTimeOffRequests, getListTimeOffRequestsQueryKey,
  useApproveTimeOff, useDenyTimeOff,
  useListShiftRequests, getListShiftRequestsQueryKey,
  useApproveShiftRequest, useRejectShiftRequest,
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { CheckCircle, XCircle, Clock, ArrowDownCircle, ArrowUpCircle, CalendarOff } from "lucide-react";

// ── palette ──────────────────────────────────────────────────────────────────
const G = {
  bg: "#0C0806", surface: "#18100A", surfaceHi: "#1E1510",
  gold: "#C9A84B", goldDim: "rgba(201,168,75,0.14)", goldHair: "rgba(201,168,75,0.10)",
  champ: "#EAD9A4", champDim: "rgba(234,217,164,0.55)", muted: "rgba(234,217,164,0.38)",
  border: "rgba(201,168,75,0.11)", rose: "#C0392B", sage: "#8BA888",
};

function statusChip(status: string) {
  if (status === "approved") return { bg: "rgba(139,168,136,0.14)", color: G.sage, border: "rgba(139,168,136,0.3)" };
  if (status === "denied" || status === "rejected") return { bg: "rgba(192,57,43,0.12)", color: "#E07060", border: "rgba(192,57,43,0.3)" };
  return { bg: G.goldDim, color: G.gold, border: "rgba(201,168,75,0.3)" };
}

function ActionBtns({ onApprove, onDeny, loading }: { onApprove: () => void; onDeny: () => void; loading: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
      <button
        onClick={onApprove}
        disabled={loading}
        title="Approve"
        style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(139,168,136,0.35)", background: "rgba(139,168,136,0.12)", color: G.sage, cursor: "pointer", fontWeight: 700, fontSize: 12, opacity: loading ? 0.5 : 1 }}
      >
        <CheckCircle size={13} /> Approve
      </button>
      <button
        onClick={onDeny}
        disabled={loading}
        title="Deny"
        style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(192,57,43,0.3)", background: "rgba(192,57,43,0.1)", color: "#E07060", cursor: "pointer", fontWeight: 700, fontSize: 12, opacity: loading ? 0.5 : 1 }}
      >
        <XCircle size={13} /> Deny
      </button>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 0", color: G.muted, fontSize: 14 }}>{message}</div>
  );
}

// ── Time-off section ──────────────────────────────────────────────────────────
function TimeOffSection({ venueId }: { venueId: string }) {
  const qc = useQueryClient();
  const { data: requests } = useListTimeOffRequests(
    { venueId },
    { query: { enabled: !!venueId, queryKey: getListTimeOffRequestsQueryKey({ venueId }) } }
  );
  const approve = useApproveTimeOff();
  const deny = useDenyTimeOff();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListTimeOffRequestsQueryKey({ venueId }) });

  const pending = (requests ?? []).filter(r => r.status === "pending");
  const history = (requests ?? []).filter(r => r.status !== "pending");

  async function handleApprove(id: string) {
    await approve.mutateAsync({ id });
    invalidate();
  }
  async function handleDeny(id: string) {
    await deny.mutateAsync({ id });
    invalidate();
  }

  const isLoading = approve.isPending || deny.isPending;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Pending */}
      <div style={{ background: G.surfaceHi, border: `1px solid ${G.border}`, borderRadius: 14, padding: 24 }}>
        <h3 style={{ color: G.gold, fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={13} /> Pending ({pending.length})
        </h3>
        {pending.length === 0 ? <EmptyState message="No pending time-off requests." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pending.map(req => (
              <div key={req.id} style={{ background: G.bg, border: `1px solid ${G.border}`, borderRadius: 12, padding: "16px 20px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: G.champ, fontWeight: 600, fontSize: 15 }}>{req.userName}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
                    <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: G.goldDim, color: G.gold, border: `1px solid rgba(201,168,75,0.3)`, textTransform: "capitalize", fontWeight: 600 }}>
                      <CalendarOff size={10} style={{ marginRight: 4, verticalAlign: "middle" }} />
                      {req.type}
                    </span>
                    <span style={{ fontSize: 12, color: G.muted }}>
                      {req.startDate} → {req.endDate}
                    </span>
                  </div>
                  {req.notes && <div style={{ color: G.muted, fontSize: 12, marginTop: 6, fontStyle: "italic" }}>"{req.notes}"</div>}
                </div>
                <ActionBtns onApprove={() => handleApprove(req.id)} onDeny={() => handleDeny(req.id)} loading={isLoading} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div style={{ background: G.surfaceHi, border: `1px solid ${G.border}`, borderRadius: 14, padding: 24 }}>
          <h3 style={{ color: G.muted, fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", margin: "0 0 14px" }}>History</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map(req => {
              const chip = statusChip(req.status ?? "pending");
              return (
                <div key={req.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 16px", background: G.bg, borderRadius: 10, border: `1px solid ${G.border}` }}>
                  <div>
                    <span style={{ color: G.champDim, fontWeight: 600, fontSize: 14 }}>{req.userName}</span>
                    <span style={{ color: G.muted, fontSize: 12, marginLeft: 10 }}>{req.type} · {req.startDate} → {req.endDate}</span>
                  </div>
                  <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, fontWeight: 700, background: chip.bg, color: chip.color, border: `1px solid ${chip.border}`, textTransform: "capitalize" }}>
                    {req.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shift Requests section ────────────────────────────────────────────────────
function ShiftRequestsSection({ venueId }: { venueId: string }) {
  const qc = useQueryClient();
  const { data: requests } = useListShiftRequests(
    { venueId },
    { query: { enabled: !!venueId, queryKey: getListShiftRequestsQueryKey({ venueId }) } }
  );
  const approve = useApproveShiftRequest();
  const reject = useRejectShiftRequest();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListShiftRequestsQueryKey({ venueId }) });
  };

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const history = (requests ?? []).filter((r) => r.status !== "pending");

  async function handleApprove(id: string) {
    await approve.mutateAsync({ id });
    invalidate();
  }
  async function handleReject(id: string) {
    await reject.mutateAsync({ id });
    invalidate();
  }

  const isLoading = approve.isPending || reject.isPending;

  function RequestCard({ req, showActions }: { req: typeof requests extends (infer T)[] | undefined ? T : never; showActions: boolean }) {
    if (!req) return null;
    const isDropReq = req.type === "drop";
    const chip = statusChip(req.status ?? "pending");
    const typeColor = isDropReq ? { color: "#E07060", border: "rgba(192,57,43,0.3)", bg: "rgba(192,57,43,0.1)" } : { color: G.sage, border: "rgba(139,168,136,0.3)", bg: "rgba(139,168,136,0.1)" };

    return (
      <div style={{ background: G.bg, border: `1px solid ${G.border}`, borderRadius: 12, padding: "16px 20px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: G.champ, fontWeight: 600, fontSize: 15 }}>{req.userName}</span>
            <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, fontWeight: 700, background: typeColor.bg, color: typeColor.color, border: `1px solid ${typeColor.border}`, display: "flex", alignItems: "center", gap: 4 }}>
              {isDropReq ? <ArrowDownCircle size={11} /> : <ArrowUpCircle size={11} />}
              {isDropReq ? "Drop Request" : "Pickup Request"}
            </span>
          </div>
          {(req as { shiftStartTime?: Date | string | null; shiftEndTime?: Date | string | null; roleName?: string | null; roleColor?: string | null }).shiftStartTime && (
            <div style={{ color: G.muted, fontSize: 12, marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={11} />
              {format(new Date((req as { shiftStartTime: string }).shiftStartTime), "EEE, MMM do · h:mm a")}
              {" – "}
              {format(new Date((req as { shiftEndTime: string }).shiftEndTime!), "h:mm a")}
              {(req as { roleName?: string | null }).roleName && (
                <span style={{ marginLeft: 6, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: `${(req as { roleColor?: string }).roleColor ?? G.gold}18`, color: (req as { roleColor?: string }).roleColor ?? G.gold }}>
                  {(req as { roleName: string }).roleName}
                </span>
              )}
            </div>
          )}
          {req.notes && <div style={{ color: G.muted, fontSize: 12, marginTop: 4, fontStyle: "italic" }}>"{req.notes}"</div>}
          {!showActions && (
            <span style={{ display: "inline-block", marginTop: 6, fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700, background: chip.bg, color: chip.color, border: `1px solid ${chip.border}`, textTransform: "capitalize" }}>
              {req.status}
            </span>
          )}
        </div>
        {showActions && (
          <ActionBtns onApprove={() => handleApprove(req.id)} onDeny={() => handleReject(req.id)} loading={isLoading} />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: G.surfaceHi, border: `1px solid ${G.border}`, borderRadius: 14, padding: 24 }}>
        <h3 style={{ color: G.gold, fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={13} /> Pending ({pending.length})
        </h3>
        {pending.length === 0 ? <EmptyState message="No pending shift requests." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pending.map(req => <RequestCard key={req.id} req={req} showActions />)}
          </div>
        )}
      </div>
      {history.length > 0 && (
        <div style={{ background: G.surfaceHi, border: `1px solid ${G.border}`, borderRadius: 14, padding: 24 }}>
          <h3 style={{ color: G.muted, fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", margin: "0 0 14px" }}>History</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map(req => <RequestCard key={req.id} req={req} showActions={false} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function ManagerTimeOff() {
  const { activeVenue } = useAppContext();
  const { data: shiftRequests } = useListShiftRequests(
    { venueId: activeVenue?.id ?? "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListShiftRequestsQueryKey({ venueId: activeVenue?.id ?? "" }) } }
  );
  const { data: timeOffRequests } = useListTimeOffRequests(
    { venueId: activeVenue?.id ?? "" },
    { query: { enabled: !!activeVenue?.id, queryKey: getListTimeOffRequestsQueryKey({ venueId: activeVenue?.id ?? "" }) } }
  );

  const pendingTimeOff = (timeOffRequests ?? []).filter(r => r.status === "pending").length;
  const pendingShifts = (shiftRequests ?? []).filter(r => r.status === "pending").length;

  if (!activeVenue?.id) return null;

  return (
    <div style={{ color: G.champ, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: G.champ, letterSpacing: 0.5, margin: 0 }}>Staff Requests</h1>
        <p style={{ color: G.muted, fontSize: 13, marginTop: 4 }}>Approve or deny time-off and shift change requests</p>
      </div>

      <Tabs defaultValue="timeoff">
        <TabsList style={{ background: G.surfaceHi, border: `1px solid ${G.border}`, borderRadius: 10, padding: 4, gap: 2 }}>
          <TabsTrigger value="timeoff" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <CalendarOff size={12} />
            Time Off
            {pendingTimeOff > 0 && (
              <span style={{ marginLeft: 4, fontSize: 10, background: G.gold, color: G.bg, borderRadius: 10, padding: "1px 6px", fontWeight: 800 }}>{pendingTimeOff}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="shifts" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Shift Changes
            {pendingShifts > 0 && (
              <span style={{ marginLeft: 4, fontSize: 10, background: G.rose, color: "#fff", borderRadius: 10, padding: "1px 6px", fontWeight: 800 }}>{pendingShifts}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeoff" style={{ marginTop: 16 }}>
          <TimeOffSection venueId={activeVenue.id} />
        </TabsContent>

        <TabsContent value="shifts" style={{ marginTop: 16 }}>
          <ShiftRequestsSection venueId={activeVenue.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
