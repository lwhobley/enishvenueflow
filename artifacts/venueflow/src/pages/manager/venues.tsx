import { useEffect, useState } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { useListVenues } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Plus, CheckCircle2, Target, Loader2, ExternalLink } from "lucide-react";

// Venue record shape that includes the GPS fields; the generated API client
// types don't know about the new columns yet, so we narrow via this type
// after casting.
type VenueWithGps = {
  id: string;
  name: string;
  address: string;
  timezone: string;
  subscriptionTier: string;
  isActive: boolean;
  latitude?: number | null;
  longitude?: number | null;
  clockInRadiusFeet?: number | null;
};

const DEFAULT_RADIUS_FEET = 1000;

export default function ManagerVenues() {
  const { activeVenue, setActiveVenue } = useAppContext();
  const { data: venues } = useListVenues();
  const [editingGps, setEditingGps] = useState<VenueWithGps | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">My Venues</h1>
        <Button>
          <Plus className="w-4 h-4 mr-2" /> Add Venue
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {venues?.map((v) => {
          const venue = v as unknown as VenueWithGps;
          const hasPin = venue.latitude != null && venue.longitude != null;
          const radius = venue.clockInRadiusFeet ?? DEFAULT_RADIUS_FEET;
          return (
            <Card
              key={venue.id}
              className={`cursor-pointer transition-all hover:shadow-md ${activeVenue?.id === venue.id ? "border-primary ring-1 ring-primary" : ""}`}
              onClick={() => setActiveVenue(v)}
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-xl flex items-center">
                    <MapPin className="w-5 h-5 mr-2 text-muted-foreground" />
                    {venue.name}
                  </CardTitle>
                  {activeVenue?.id === venue.id && (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  )}
                </div>
                <CardDescription>{venue.address}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant="outline" className="capitalize">{venue.subscriptionTier} Plan</Badge>
                  {venue.isActive ? (
                    <Badge className="bg-green-500 hover:bg-green-600 text-white border-transparent">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                  {hasPin ? (
                    <Badge variant="outline" className="gap-1"><Target className="w-3 h-3" /> {radius} ft</Badge>
                  ) : (
                    <Badge variant="destructive">No GPS pin</Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-4">
                  Timezone: {venue.timezone}
                </div>
                {hasPin ? (
                  <div className="text-xs text-muted-foreground mt-1 font-mono">
                    {Number(venue.latitude).toFixed(6)}, {Number(venue.longitude).toFixed(6)}
                  </div>
                ) : null}
              </CardContent>
              <CardFooter className="pt-0 pb-4 flex gap-2">
                <Button
                  variant={activeVenue?.id === venue.id ? "secondary" : "outline"}
                  className="flex-1"
                  onClick={(e) => { e.stopPropagation(); setActiveVenue(v); }}
                >
                  {activeVenue?.id === venue.id ? "Current Venue" : "Switch to Venue"}
                </Button>
                <Button
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); setEditingGps(venue); }}
                  title="Set clock-in GPS pin and radius"
                >
                  <Target className="w-4 h-4 mr-1.5" /> GPS pin
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <GpsPinDialog
        venue={editingGps}
        onOpenChange={(open) => { if (!open) setEditingGps(null); }}
      />
    </div>
  );
}

function GpsPinDialog({
  venue, onOpenChange,
}: {
  venue: VenueWithGps | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("1000");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (venue) {
      setLat(venue.latitude != null ? String(venue.latitude) : "");
      setLng(venue.longitude != null ? String(venue.longitude) : "");
      setRadius(String(venue.clockInRadiusFeet ?? DEFAULT_RADIUS_FEET));
    }
  }, [venue]);

  const parseCoord = (input: string): { lat: number; lng: number } | null => {
    // Accept "29.736002, -95.461831" pasted from Google Maps, or any whitespace-separated pair.
    const parts = input.split(/[,\s]+/).filter(Boolean);
    if (parts.length !== 2) return null;
    const la = Number(parts[0]);
    const ln = Number(parts[1]);
    if (Number.isNaN(la) || Number.isNaN(ln)) return null;
    if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
    return { lat: la, lng: ln };
  };

  const handlePasteBoth = () => {
    navigator.clipboard?.readText?.().then((text) => {
      const parsed = parseCoord(text);
      if (!parsed) {
        toast({ title: "Clipboard doesn't look like lat,lng", description: "Copy a pin from Google Maps (right-click the pin → click the coordinates).", variant: "destructive" });
        return;
      }
      setLat(String(parsed.lat));
      setLng(String(parsed.lng));
    }).catch(() => {
      toast({ title: "Clipboard unavailable", description: "Paste the coordinates manually.", variant: "destructive" });
    });
  };

  const openMapsSearch = () => {
    if (!venue?.address) return;
    window.open(`https://www.google.com/maps/search/${encodeURIComponent(venue.address)}`, "_blank", "noopener");
  };

  const handleSave = async () => {
    if (!venue) return;
    const la = Number(lat);
    const ln = Number(lng);
    const r = Math.round(Number(radius));
    if (Number.isNaN(la) || la < -90 || la > 90) {
      toast({ title: "Latitude must be between -90 and 90", variant: "destructive" }); return;
    }
    if (Number.isNaN(ln) || ln < -180 || ln > 180) {
      toast({ title: "Longitude must be between -180 and 180", variant: "destructive" }); return;
    }
    if (!Number.isFinite(r) || r < 10 || r > 5000) {
      toast({ title: "Radius must be between 10 and 5000 feet", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/venues/${venue.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: la, longitude: ln, clockInRadiusFeet: r }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(body.message ?? `Save failed (${res.status})`);
      toast({ title: "GPS pin saved", description: `Clock-in allowed within ${r} ft.` });
      qc.invalidateQueries({ queryKey: ["/venues"] });
      qc.invalidateQueries();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Failed to save", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!venue) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/venues/${venue.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: null, longitude: null, clockInRadiusFeet: null }),
      });
      if (!res.ok) throw new Error(`Clear failed (${res.status})`);
      toast({ title: "GPS pin cleared" });
      qc.invalidateQueries();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Failed to clear", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={venue !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Clock-in GPS pin</DialogTitle>
          <DialogDescription>
            {venue?.name ?? ""} · {venue?.address ?? ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-2">
            <div className="font-medium text-foreground">Get the pin from Google Maps</div>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open the venue on Google Maps.</li>
              <li>Right-click (or long-press on mobile) the exact spot.</li>
              <li>Click the latitude, longitude line at the top of the menu — it copies to your clipboard.</li>
              <li>Come back and click <span className="font-medium">Paste coordinates</span>.</li>
            </ol>
            {venue?.address ? (
              <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={openMapsSearch}>
                <ExternalLink className="w-3 h-3" /> Open address in Google Maps
              </Button>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" type="button" onClick={handlePasteBoth}>
              Paste coordinates
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gps-lat">Latitude</Label>
              <Input
                id="gps-lat"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                inputMode="decimal"
                placeholder="29.736002"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gps-lng">Longitude</Label>
              <Input
                id="gps-lng"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                inputMode="decimal"
                placeholder="-95.461831"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gps-radius">Clock-in radius (feet)</Label>
            <Input
              id="gps-radius"
              type="number"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              min={10}
              max={5000}
            />
            <p className="text-xs text-muted-foreground">
              Staff can clock in from within this many feet of the pin. 10–5000 ft. Default 1000.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" type="button" onClick={clear} disabled={saving}>
            Clear pin
          </Button>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? (<><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</>) : "Save pin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
