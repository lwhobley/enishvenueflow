import { useState, useEffect, useCallback } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { useListActiveClockIns, getListActiveClockInsQueryKey, useListTimeClockEntries, getListTimeClockEntriesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Smartphone, Fingerprint, Terminal, UserCog, CloudUpload, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

type Source = "mobile_gps" | "phone_biometric" | "terminal_biometric" | "manager_manual" | "adp_import";
type SyncStatus = "pending" | "synced" | "failed" | "not_required";

type AdpStatus = {
  configured: boolean;
  baseUrl: string | null;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasMtlsCert: boolean;
  pendingCount: number;
  failedCount: number;
};

function SourceBadge({ source, biometricVerified }: { source?: string; biometricVerified?: boolean }) {
  const s = (source ?? "mobile_gps") as Source;
  const cfg = {
    mobile_gps:          { label: "Mobile GPS",       Icon: Smartphone,  cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    phone_biometric:     { label: "Phone Fingerprint",Icon: Fingerprint, cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    terminal_biometric:  { label: "Terminal Fingerprint", Icon: Terminal,cls: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
    manager_manual:      { label: "Manual",           Icon: UserCog,     cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    adp_import:          { label: "ADP Imported",     Icon: CloudUpload, cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  }[s] ?? { label: s, Icon: Smartphone, cls: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30" };
  const Icon = cfg.Icon;
  return (
    <Badge variant="outline" className={`gap-1.5 ${cfg.cls}`}>
      <Icon size={11} />
      <span className="text-[10px] font-semibold tracking-wide">{cfg.label}</span>
      {biometricVerified && s !== "phone_biometric" && s !== "terminal_biometric" && (
        <span className="opacity-70 text-[10px]">·bio</span>
      )}
    </Badge>
  );
}

function AdpBadge({ status, externalId }: { status?: string; externalId?: string | null }) {
  const s = (status ?? "pending") as SyncStatus;
  const cfg = {
    pending:      { label: "Pending",       cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    synced:       { label: "Synced",        cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    failed:       { label: "Failed",        cls: "bg-red-500/15 text-red-400 border-red-500/30" },
    not_required: { label: "—",             cls: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30" },
  }[s];
  return (
    <Badge variant="outline" className={`gap-1.5 ${cfg.cls}`} title={externalId ? `ADP ID: ${externalId}` : undefined}>
      <span className="text-[10px] font-semibold tracking-wide">ADP · {cfg.label}</span>
    </Badge>
  );
}

export default function ManagerTimeClock() {
  const { activeVenue } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const venueId = activeVenue?.id || "";

  const { data: activeClockIns } = useListActiveClockIns(
    { venueId }, { query: { enabled: !!venueId, queryKey: getListActiveClockInsQueryKey({ venueId }) } }
  );
  const { data: history } = useListTimeClockEntries(
    { venueId }, { query: { enabled: !!venueId, queryKey: getListTimeClockEntriesQueryKey({ venueId }) } }
  );

  const [adp, setAdp] = useState<AdpStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refreshAdp = useCallback(async () => {
    try {
      const res = await fetch("/api/time-clock/adp-status");
      if (res.ok) setAdp(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshAdp(); }, [refreshAdp, history]);

  async function runSync() {
    if (!venueId || syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/time-clock/sync-adp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast({ title: "Sync failed", description: j.message ?? "Unable to sync with ADP", variant: "destructive" });
      } else if (!j.configured) {
        toast({ title: "ADP not configured", description: "Entries stay queued until ADP credentials are added.", variant: "destructive" });
      } else {
        toast({ title: "ADP sync complete", description: `Pushed ${j.pushed}, pulled ${j.pulled}` });
        qc.invalidateQueries({ queryKey: getListActiveClockInsQueryKey({ venueId }) });
        qc.invalidateQueries({ queryKey: getListTimeClockEntriesQueryKey({ venueId }) });
      }
      refreshAdp();
    } finally { setSyncing(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Time Clock</h1>
        <Button onClick={runSync} disabled={syncing || !venueId} className="gap-2">
          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing…" : "Sync with ADP"}
        </Button>
      </div>

      {/* ADP status panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CloudUpload size={16} /> ADP Integration
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!adp ? (
            <p className="text-sm text-muted-foreground">Loading status…</p>
          ) : adp.configured ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 gap-1.5">
                <CheckCircle2 size={12} /> Connected
              </Badge>
              <span className="text-muted-foreground">Base URL: <code className="text-xs">{adp.baseUrl}</code></span>
              <span className="text-muted-foreground">Pending: <strong className="text-amber-400">{adp.pendingCount}</strong></span>
              <span className="text-muted-foreground">Failed: <strong className="text-red-400">{adp.failedCount}</strong></span>
            </div>
          ) : (
            <div className="flex items-start gap-3 text-sm">
              <AlertCircle size={16} className="text-amber-400 mt-0.5" />
              <div className="space-y-2">
                <p className="font-medium">ADP credentials not configured.</p>
                <p className="text-muted-foreground">
                  Clock-ins are being captured and queued. They will sync automatically once these environment variables are set on the server:
                </p>
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-5">
                  <li><code>ADP_CLIENT_ID</code> <span className={adp.hasClientId ? "text-emerald-400" : "text-amber-400"}>({adp.hasClientId ? "set" : "missing"})</span></li>
                  <li><code>ADP_CLIENT_SECRET</code> <span className={adp.hasClientSecret ? "text-emerald-400" : "text-amber-400"}>({adp.hasClientSecret ? "set" : "missing"})</span></li>
                  <li><code>ADP_BASE_URL</code> <span className={adp.baseUrl ? "text-emerald-400" : "text-amber-400"}>({adp.baseUrl ? "set" : "missing"})</span></li>
                  <li><code>ADP_SSL_CERT_PEM</code> &amp; <code>ADP_SSL_KEY_PEM</code> <span className={adp.hasMtlsCert ? "text-emerald-400" : "text-amber-400"}>({adp.hasMtlsCert ? "set" : "missing"})</span></li>
                </ul>
                <p className="text-muted-foreground text-xs">
                  Physical biometric terminals can post events to <code>/api/time-clock/terminal</code> with header <code>X-Terminal-Key: $TERMINAL_API_KEY</code>.
                </p>
                <p className="text-amber-400/80 text-xs font-medium">{adp.pendingCount} queued · {adp.failedCount} failed</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active clock-ins */}
      <Card>
        <CardHeader>
          <CardTitle>Currently Clocked In</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Clock In Time</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>ADP</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeClockIns?.map(entry => {
                const e = entry as typeof entry & { source?: string; biometricVerified?: boolean; adpSyncStatus?: string; adpExternalId?: string | null };
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{entry.userName}</TableCell>
                    <TableCell>{format(new Date(entry.clockIn), 'PP pp')}</TableCell>
                    <TableCell><SourceBadge source={e.source} biometricVerified={e.biometricVerified} /></TableCell>
                    <TableCell><AdpBadge status={e.adpSyncStatus} externalId={e.adpExternalId} /></TableCell>
                    <TableCell><Badge className="bg-green-500">Active</Badge></TableCell>
                  </TableRow>
                );
              })}
              {!activeClockIns?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No employees currently clocked in.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Entry History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Clock In</TableHead>
                <TableHead>Clock Out</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>ADP</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history && [...history].reverse().map(entry => {
                const e = entry as typeof entry & { source?: string; biometricVerified?: boolean; adpSyncStatus?: string; adpExternalId?: string | null };
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{entry.userName}</TableCell>
                    <TableCell>{format(new Date(entry.clockIn), 'PP pp')}</TableCell>
                    <TableCell>{entry.clockOut ? format(new Date(entry.clockOut), 'PP pp') : '-'}</TableCell>
                    <TableCell>{entry.totalHours?.toFixed(2) || '-'}</TableCell>
                    <TableCell><SourceBadge source={e.source} biometricVerified={e.biometricVerified} /></TableCell>
                    <TableCell><AdpBadge status={e.adpSyncStatus} externalId={e.adpExternalId} /></TableCell>
                    <TableCell>
                      {entry.status === 'active'
                        ? <Badge className="bg-green-500">Active</Badge>
                        : <Badge variant="secondary">Completed</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!history?.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No time clock history.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
