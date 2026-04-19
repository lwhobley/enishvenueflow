import { useState } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import {
  useGetDashboardAnalytics,
  getGetDashboardAnalyticsQueryKey,
  useGetLastReportSends,
  getGetLastReportSendsQueryKey,
  useGetReportRecipients,
  getGetReportRecipientsQueryKey,
  useUpdateReportRecipients,
  useSendEndOfShiftReport,
  useSendEndOfNightReport,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users,
  Clock,
  CalendarCheck,
  Activity,
  UserPlus,
  FileClock,
  BarChart3,
  AlertCircle,
  Mail,
  MoonStar,
  Sun,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

function formatRelative(iso: string | undefined): string {
  if (!iso) return "Not yet sent today";
  const date = new Date(iso);
  return `Last sent ${date.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} CT`;
}

export default function ManagerDashboard() {
  const { activeVenue } = useAppContext();
  const venueId = activeVenue?.id || "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: stats, isLoading } = useGetDashboardAnalytics(
    { venueId },
    { query: { enabled: !!venueId, queryKey: getGetDashboardAnalyticsQueryKey({ venueId }) } },
  );

  const { data: lastSends } = useGetLastReportSends(
    { venueId },
    { query: { enabled: !!venueId, queryKey: getGetLastReportSendsQueryKey({ venueId }) } },
  );

  const { data: recipientsData } = useGetReportRecipients(
    { venueId },
    { query: { enabled: !!venueId } },
  );

  const [editing, setEditing] = useState(false);
  const [recipientDraft, setRecipientDraft] = useState("");
  const [confirmKind, setConfirmKind] = useState<"shift" | "night" | null>(null);

  const updateRecipients = useUpdateReportRecipients();
  const sendEos = useSendEndOfShiftReport();
  const sendEon = useSendEndOfNightReport();

  const recipients = recipientsData?.recipients ?? [];

  const refreshLastSends = () =>
    queryClient.invalidateQueries({ queryKey: getGetLastReportSendsQueryKey({ venueId }) });

  const handleSend = async (kind: "shift" | "night") => {
    if (!venueId) return;
    try {
      const mutation = kind === "shift" ? sendEos : sendEon;
      const label = kind === "shift" ? "End-of-Shift" : "End-of-Night";
      const result = await mutation.mutateAsync({ data: { venueId } });
      toast({
        title: `${label} report sent`,
        description: `Delivered to: ${result.recipients.join(", ")}`,
      });
      refreshLastSends();
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string; data?: { message?: string } };
      const status = e?.status;
      const msg = e?.data?.message ?? e?.message ?? "Unknown error";
      toast({
        title: status === 412 ? "Connect Outlook to send reports" : "Failed to send report",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const requestSend = (kind: "shift" | "night") => setConfirmKind(kind);

  const confirmSend = async () => {
    const k = confirmKind;
    setConfirmKind(null);
    if (k) await handleSend(k);
  };

  const confirmLabel = confirmKind === "shift" ? "End-of-Shift" : "End-of-Night";

  const startEditingRecipients = () => {
    setRecipientDraft(recipients.join(", "));
    setEditing(true);
  };

  const saveRecipients = async () => {
    const list = recipientDraft
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) {
      toast({ title: "At least one recipient required", variant: "destructive" });
      return;
    }
    try {
      await updateRecipients.mutateAsync({ data: { venueId, recipients: list } });
      await queryClient.invalidateQueries({ queryKey: getGetReportRecipientsQueryKey({ venueId }) });
      toast({ title: "Recipients updated" });
      setEditing(false);
    } catch (err: unknown) {
      const e = err as { data?: { message?: string }; message?: string };
      toast({
        title: "Failed to update recipients",
        description: e?.data?.message ?? e?.message ?? "Unknown error",
        variant: "destructive",
      });
    }
  };

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    { title: "Active Staff", value: stats.activeStaffCount, icon: Users, color: "text-blue-500" },
    { title: "Shifts Today", value: stats.shiftsToday, icon: Clock, color: "text-indigo-500" },
    { title: "Open Shifts", value: stats.openShifts, icon: AlertCircle, color: "text-amber-500" },
    { title: "Labor %", value: `${stats.laborPct}%`, icon: BarChart3, color: "text-green-500" },
    { title: "Waitlist", value: stats.waitlistCount, icon: UserPlus, color: "text-purple-500" },
    { title: "Reservations Today", value: stats.reservationsToday, icon: CalendarCheck, color: "text-pink-500" },
    { title: "Clocked In Now", value: stats.clockedInNow, icon: Activity, color: "text-emerald-500" },
    { title: "Pending Time Off", value: stats.pendingTimeOff, icon: FileClock, color: "text-orange-500" },
  ];

  const eosSentAt = lastSends?.end_of_shift?.sentAt;
  const eonSentAt = lastSends?.end_of_night?.sentAt;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-500" />
                Manager Reports
              </CardTitle>
              <CardDescription>
                Email today's reservations, labor, and tips summary via Outlook. Reports use the Central Time business day (4am to 4am). End-of-Shift sends automatically at 5:00 PM and 10:00 PM CT; End-of-Night is sent manually by managers.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-amber-500" />
                <h3 className="font-semibold">End-of-Shift</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Snapshot of the business day so far — reservations, labor, tips.
              </p>
              <p className="text-xs text-muted-foreground">
                Auto-sends at 5:00 PM and 10:00 PM CT. Use the button below to send now.
              </p>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                {eosSentAt ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : null}
                {formatRelative(eosSentAt)}
              </div>
              <Button
                onClick={() => requestSend("shift")}
                disabled={sendEos.isPending || !venueId}
                className="w-full"
              >
                {sendEos.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…
                  </>
                ) : (
                  <>Send End-of-Shift Report</>
                )}
              </Button>
            </div>

            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <MoonStar className="h-4 w-4 text-indigo-500" />
                <h3 className="font-semibold">End-of-Night</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Full close-of-business summary for tonight's service.
              </p>
              <p className="text-xs text-muted-foreground">
                Sent manually by a manager at end of night.
              </p>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                {eonSentAt ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : null}
                {formatRelative(eonSentAt)}
              </div>
              <Button
                onClick={() => requestSend("night")}
                disabled={sendEon.isPending || !venueId}
                className="w-full"
              >
                {sendEon.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…
                  </>
                ) : (
                  <>Send End-of-Night Report</>
                )}
              </Button>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <Label className="text-sm font-semibold">Recipients</Label>
                {!editing ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {recipients.length === 0 ? (
                      <span className="text-sm text-muted-foreground">Loading…</span>
                    ) : (
                      recipients.map((r) => (
                        <span
                          key={r}
                          className="px-2 py-1 text-xs rounded-md bg-muted text-foreground/80 font-mono"
                        >
                          {r}
                        </span>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <Input
                      value={recipientDraft}
                      onChange={(e) => setRecipientDraft(e.target.value)}
                      placeholder="email1@example.com, email2@example.com"
                    />
                    <p className="text-xs text-muted-foreground">Comma-separated email addresses.</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {!editing ? (
                  <Button variant="outline" size="sm" onClick={startEditingRecipients}>
                    Edit
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveRecipients}
                      disabled={updateRecipients.isPending}
                    >
                      {updateRecipients.isPending ? "Saving…" : "Save"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Sales, comps, and voids will populate automatically once the POS integration is connected.
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={confirmKind !== null} onOpenChange={(open) => !open && setConfirmKind(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send {confirmLabel} report?</AlertDialogTitle>
            <AlertDialogDescription>
              This will email today's report via Outlook to:
              <span className="block mt-2 font-mono text-xs text-foreground">
                {recipients.join(", ") || "(no recipients configured)"}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSend} disabled={recipients.length === 0}>
              Send report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
