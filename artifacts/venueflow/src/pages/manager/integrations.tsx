import { useCallback, useEffect, useState } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plug, Plug2, RefreshCw, AlertCircle, CheckCircle2, Clock } from "lucide-react";

type PosStatus = {
  venueId: string;
  connected: boolean;
  provider?: string;
  providerLabel?: string;
  externalId?: string | null;
  status?: string;
  lastSyncedAt?: string | null;
  lastError?: string | null;
};

type ProviderKey = "toast" | "square" | "aloha";

const PROVIDERS: Array<{
  key: ProviderKey;
  label: string;
  blurb: string;
  available: boolean;
}> = [
  { key: "toast",  label: "Toast",  blurb: "Pull live sales, comps, and voids into shift and nightly reports.", available: true  },
  { key: "square", label: "Square", blurb: "Square POS support is on the way.",                                  available: false },
  { key: "aloha",  label: "Aloha",  blurb: "NCR Aloha POS support is on the way.",                               available: false },
];

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function ManagerIntegrations() {
  const { activeVenue } = useAppContext();
  const venueId = activeVenue?.id;

  const [status, setStatus] = useState<PosStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [toastOpen, setToastOpen] = useState(false);
  const [toastForm, setToastForm] = useState({ clientId: "", clientSecret: "", restaurantGuid: "" });
  const [toastSaving, setToastSaving] = useState(false);
  const [toastError, setToastError] = useState("");

  const [comingSoon, setComingSoon] = useState<ProviderKey | null>(null);

  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const refresh = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/integrations/pos/status?venueId=${encodeURIComponent(venueId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load status");
      setStatus(data);
    } catch (e: unknown) {
      setLoadError((e as Error).message || "Failed to load POS status.");
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleConnectToast() {
    if (!venueId) return;
    if (!toastForm.clientId || !toastForm.clientSecret || !toastForm.restaurantGuid) {
      setToastError("All fields are required.");
      return;
    }
    setToastSaving(true);
    setToastError("");
    try {
      const res = await fetch("/api/integrations/toast/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, ...toastForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to connect to Toast");
      setToastOpen(false);
      setToastForm({ clientId: "", clientSecret: "", restaurantGuid: "" });
      await refresh();
    } catch (e: unknown) {
      setToastError((e as Error).message || "Failed to connect. Check your credentials.");
    } finally {
      setToastSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!venueId) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/integrations/pos?venueId=${encodeURIComponent(venueId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to disconnect");
      }
      setConfirmDisconnect(false);
      await refresh();
    } catch (e: unknown) {
      setLoadError((e as Error).message || "Failed to disconnect.");
    } finally {
      setDisconnecting(false);
    }
  }

  const connected = !!status?.connected;
  const providerLabel = status?.providerLabel ?? (status?.provider ? status.provider : "—");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight flex-1">Integrations</h1>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading || !venueId} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" /> Point of Sale
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!venueId ? (
            <p className="text-sm text-muted-foreground">Select a venue to manage POS integrations.</p>
          ) : loading && !status ? (
            <p className="text-sm text-muted-foreground">Loading status…</p>
          ) : (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  {connected ? (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <Plug2 className="h-3 w-3" /> Not connected
                    </Badge>
                  )}
                  <div>
                    <div className="font-medium">{connected ? providerLabel : "No POS connected"}</div>
                    {connected && status?.externalId && (
                      <div className="text-xs text-muted-foreground">ID: {status.externalId}</div>
                    )}
                  </div>
                </div>
                {connected && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDisconnect(true)}
                    disabled={disconnecting}
                  >
                    Disconnect
                  </Button>
                )}
              </div>

              {(status?.lastSyncedAt || status?.lastError) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {status?.lastSyncedAt && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>Last synced: {formatDateTime(status.lastSyncedAt)}</span>
                    </div>
                  )}
                  {status?.lastError && (
                    <div className="flex items-start gap-2 text-red-400 sm:col-span-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span className="break-words">{status.lastError}</span>
                    </div>
                  )}
                </div>
              )}
              {loadError && (
                <p className="text-sm text-red-400">{loadError}</p>
              )}
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold mb-2">Available providers</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {PROVIDERS.map(p => {
                const isCurrent = connected && status?.provider === p.key;
                return (
                  <div key={p.key} className="rounded-lg border p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{p.label}</div>
                      {isCurrent ? (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Connected</Badge>
                      ) : !p.available ? (
                        <Badge variant="secondary">Coming soon</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground flex-1">{p.blurb}</p>
                    <div className="flex justify-end">
                      {p.available ? (
                        <Button
                          size="sm"
                          variant={isCurrent ? "outline" : "default"}
                          disabled={!venueId}
                          onClick={() => {
                            if (p.key === "toast") {
                              setToastError("");
                              setToastOpen(true);
                            }
                          }}
                          style={isCurrent ? undefined : { background: "var(--gold)", color: "#0a0502" }}
                        >
                          {isCurrent ? "Reconnect" : "Connect"}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setComingSoon(p.key)}>
                          Learn more
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connect Toast */}
      <Dialog open={toastOpen} onOpenChange={v => { setToastOpen(v); if (!v) setToastError(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Toast POS</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Enter your Toast API credentials. We'll verify them and start pulling sales,
            comps, and voids into your shift and nightly reports. Credentials are saved
            to this venue and can be removed at any time.
          </p>
          <div className="space-y-3 py-2">
            <div>
              <Label>Client ID</Label>
              <Input
                placeholder="Toast API Client ID"
                value={toastForm.clientId}
                onChange={e => setToastForm(f => ({ ...f, clientId: e.target.value }))}
              />
            </div>
            <div>
              <Label>Client Secret</Label>
              <Input
                type="password"
                placeholder="Toast API Client Secret"
                value={toastForm.clientSecret}
                onChange={e => setToastForm(f => ({ ...f, clientSecret: e.target.value }))}
              />
            </div>
            <div>
              <Label>Restaurant GUID</Label>
              <Input
                placeholder="Your Toast Restaurant GUID"
                value={toastForm.restaurantGuid}
                onChange={e => setToastForm(f => ({ ...f, restaurantGuid: e.target.value }))}
              />
            </div>
            {toastError && <p className="text-sm text-red-400">{toastError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setToastOpen(false)} disabled={toastSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleConnectToast}
              disabled={toastSaving}
              style={{ background: "var(--gold)", color: "#0a0502" }}
            >
              {toastSaving ? "Connecting…" : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Coming soon */}
      <Dialog open={!!comingSoon} onOpenChange={v => { if (!v) setComingSoon(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {comingSoon ? PROVIDERS.find(p => p.key === comingSoon)?.label : ""} — Coming soon
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Support for this POS provider is on our roadmap. We'll let you know as soon as it's
            available. In the meantime you can connect Toast to start pulling live sales data.
          </p>
          <DialogFooter>
            <Button onClick={() => setComingSoon(null)} style={{ background: "var(--gold)", color: "#0a0502" }}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Disconnect */}
      <Dialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect {providerLabel}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Reports will stop pulling live POS data for this venue until you reconnect. Saved
            credentials will be removed.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDisconnect(false)} disabled={disconnecting}>
              Cancel
            </Button>
            <Button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
