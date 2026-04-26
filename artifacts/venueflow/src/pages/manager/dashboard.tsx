import { useState } from "react";
import { motion } from "framer-motion";
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
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CosmicInsightsCard } from "@/components/cosmic-insights-card";

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

function greetingForNow(timezone?: string): string {
  const hour = Number(
    new Date().toLocaleString("en-US", {
      timeZone: timezone || undefined,
      hour: "numeric",
      hour12: false,
    }),
  );
  if (hour < 5) return "Still serving";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Good night";
}

function formatToday(timezone?: string): string {
  return new Date().toLocaleDateString("en-US", {
    timeZone: timezone || undefined,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// ── VenueFlow brand palette — mirrors index.css / layout.tsx ───────────────
// Variable names kept (gold/cream/parchment etc.) so the rest of the file's
// many references resolve unchanged; the underlying colors moved from
// luxury gold + ivory to brand teal + soft cyan.
const L = {
  gold:     "#1F9CC2",                  // brand teal (was antique gold)
  goldSoft: "#7FE8C8",                  // mint accent (was champagne)
  espresso: "#142849",                  // brand navy (was espresso)
  taupe:    "rgba(20,40,73,0.56)",
  cream:    "#FFFFFF",                  // pure white card
  parchment:"#EAF4F8",                  // soft cyan well (was parchment)
  border:   "rgba(38,78,122,0.16)",
  blush:    "#D4F2E8",                  // mint tint
};

type StatTone = "gold" | "amber" | "rose" | "sage" | "ink" | "blush" | "sky" | "plum";

// Tone palettes for stat cards — each is (well, ring, icon). Re-tuned around
// the brand: teal/mint pairs do most of the work, with a couple of warm
// supporting tones (amber, rose) for "needs attention" stats.
const toneStyles: Record<StatTone, { well: string; ring: string; icon: string }> = {
  gold:  { well: "linear-gradient(135deg, #DDF1F8 0%, #B5E0EE 100%)", ring: "rgba(31,156,194,0.25)",   icon: "#1A8AAB" }, // brand teal
  amber: { well: "linear-gradient(135deg, #FFE7C2 0%, #F6C97A 100%)", ring: "rgba(193,126,53,0.25)",   icon: "#8A5320" },
  rose:  { well: "linear-gradient(135deg, #FBD9D2 0%, #F3B8A8 100%)", ring: "rgba(188,107,90,0.25)",   icon: "#8B4236" },
  sage:  { well: "linear-gradient(135deg, #D4F2E8 0%, #9FE0CA 100%)", ring: "rgba(78,207,170,0.30)",   icon: "#1F8466" }, // mint
  ink:   { well: "linear-gradient(135deg, #DCE5EE 0%, #B7C5D6 100%)", ring: "rgba(38,78,122,0.25)",    icon: "#142849" }, // navy
  blush: { well: "linear-gradient(135deg, #DDF1F8 0%, #C2E4F0 100%)", ring: "rgba(31,156,194,0.20)",   icon: "#1F9CC2" },
  sky:   { well: "linear-gradient(135deg, #D8EEF5 0%, #A7D7E6 100%)", ring: "rgba(60,140,170,0.25)",   icon: "#2C7A95" },
  plum:  { well: "linear-gradient(135deg, #DCE5EE 0%, #BCC9DA 100%)", ring: "rgba(38,78,122,0.25)",    icon: "#264E7A" },
};

type StatDef = {
  title: string;
  value: string | number;
  icon: LucideIcon;
  tone: StatTone;
  hint?: string;
};

function StatCard({ stat, index }: { stat: StatDef; index: number }) {
  const tone = toneStyles[stat.tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3 }}
      style={{
        background: L.cream,
        border: `1px solid ${L.border}`,
        borderRadius: 16,
        padding: 18,
        boxShadow: `0 1px 2px rgba(42,31,23,0.04), 0 8px 24px -12px rgba(42,31,23,0.08)`,
        transition: "box-shadow 0.25s ease",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow =
          `0 2px 4px rgba(42,31,23,0.06), 0 16px 40px -16px rgba(42,31,23,0.18)`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow =
          `0 1px 2px rgba(42,31,23,0.04), 0 8px 24px -12px rgba(42,31,23,0.08)`;
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: L.taupe,
            }}
          >
            {stat.title}
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: -0.4,
              color: L.espresso,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.05,
            }}
          >
            {stat.value}
          </div>
          {stat.hint ? (
            <div style={{ marginTop: 6, fontSize: 11, color: L.taupe }}>{stat.hint}</div>
          ) : null}
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: tone.well,
            boxShadow: `inset 0 0 0 1px ${tone.ring}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <stat.icon size={18} color={tone.icon} strokeWidth={2} />
        </div>
      </div>
      {/* hairline gold bloom on the bottom edge */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 18,
          right: 18,
          bottom: 0,
          height: 1,
          background: `linear-gradient(90deg, transparent, ${tone.ring}, transparent)`,
        }}
      />
    </motion.div>
  );
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

  const greeting = greetingForNow(activeVenue?.timezone);
  const today = formatToday(activeVenue?.timezone);
  const venueName = activeVenue?.name ?? "your venue";

  const Hero = () => (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 20,
        padding: "28px 32px",
        background: `linear-gradient(135deg, ${L.cream} 0%, ${L.parchment} 100%)`,
        border: `1px solid ${L.border}`,
        boxShadow: `0 1px 2px rgba(42,31,23,0.04), 0 12px 32px -18px rgba(42,31,23,0.14)`,
      }}
    >
      {/* soft gold orb */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -80,
          right: -60,
          width: 260,
          height: 260,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(217,184,103,0.35) 0%, rgba(217,184,103,0) 65%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: L.gold,
            fontWeight: 600,
          }}
        >
          {today}
        </div>
        <h1
          style={{
            marginTop: 8,
            marginBottom: 0,
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: -0.5,
            color: L.espresso,
            lineHeight: 1.15,
          }}
        >
          {greeting}
          <span style={{ color: L.taupe, fontWeight: 400 }}>, welcome to </span>
          <span style={{ color: L.gold }}>{venueName}</span>
        </h1>
        <p style={{ marginTop: 8, marginBottom: 0, fontSize: 14, color: L.taupe, maxWidth: 640 }}>
          A curated snapshot of tonight's service — staff on duty, bookings on the books, and labor at a glance.
        </p>
      </div>
    </motion.div>
  );

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <Hero />
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

  const statCards: StatDef[] = [
    { title: "Active Staff",        value: stats.activeStaffCount,    icon: Users,         tone: "gold",  hint: "Roster today" },
    { title: "Shifts Today",        value: stats.shiftsToday,         icon: Clock,         tone: "ink" },
    { title: "Open Shifts",         value: stats.openShifts,          icon: AlertCircle,   tone: "amber", hint: stats.openShifts > 0 ? "Needs coverage" : "All covered" },
    { title: "Labor %",             value: `${stats.laborPct}%`,      icon: BarChart3,     tone: "sage",  hint: "Of projected sales" },
    { title: "Waitlist",            value: stats.waitlistCount,       icon: UserPlus,      tone: "plum" },
    { title: "Reservations Today",  value: stats.reservationsToday,   icon: CalendarCheck, tone: "blush" },
    { title: "Clocked In Now",      value: stats.clockedInNow,        icon: Activity,      tone: "sage" },
    { title: "Pending Time Off",    value: stats.pendingTimeOff,      icon: FileClock,     tone: "rose" },
  ];

  const eosSentAt = lastSends?.end_of_shift?.sentAt;
  const eonSentAt = lastSends?.end_of_night?.sentAt;

  return (
    <div className="space-y-6">
      <Hero />

      <CosmicInsightsCard />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => (
          <StatCard key={stat.title} stat={stat} index={index} />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span
                    style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: toneStyles.gold.well,
                      boxShadow: `inset 0 0 0 1px ${toneStyles.gold.ring}`,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Mail className="h-4 w-4" style={{ color: toneStyles.gold.icon }} />
                  </span>
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
              <div
                style={{
                  border: `1px solid ${L.border}`,
                  borderRadius: 14,
                  padding: 18,
                  background: `linear-gradient(180deg, ${L.cream} 0%, ${L.parchment} 220%)`,
                }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2">
                  <Sun className="h-4 w-4" style={{ color: toneStyles.amber.icon }} />
                  <h3 className="font-semibold">End-of-Shift</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Snapshot of the business day so far — reservations, labor, tips.
                </p>
                <p className="text-xs text-muted-foreground">
                  Auto-sends at 5:00 PM and 10:00 PM CT. Use the button below to send now.
                </p>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  {eosSentAt ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : null}
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

              <div
                style={{
                  border: `1px solid ${L.border}`,
                  borderRadius: 14,
                  padding: 18,
                  background: `linear-gradient(180deg, ${L.cream} 0%, ${L.parchment} 220%)`,
                }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2">
                  <MoonStar className="h-4 w-4" style={{ color: toneStyles.plum.icon }} />
                  <h3 className="font-semibold">End-of-Night</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Full close-of-business summary for tonight's service.
                </p>
                <p className="text-xs text-muted-foreground">
                  Sent manually by a manager at end of night.
                </p>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  {eonSentAt ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : null}
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
      </motion.div>

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
