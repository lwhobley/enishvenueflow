import { useState, useEffect } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import { useListRoles, getListRolesQueryKey, getListVenuesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Target } from "lucide-react";

const DEFAULT_RADIUS_FEET = 800;

// Venue record shape with the GPS fields. The generated API client types
// don't know about latitude/longitude/clockInRadiusFeet yet, so we narrow
// via this type after casting.
type VenueWithGps = {
  id: string;
  name: string;
  address: string;
  timezone: string;
  latitude?: number | null;
  longitude?: number | null;
  clockInRadiusFeet?: number | null;
};

export default function ManagerSettings() {
  const { activeVenue } = useAppContext();
  const venue = activeVenue as unknown as VenueWithGps | null;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState(String(DEFAULT_RADIUS_FEET));
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingGps, setSavingGps] = useState(false);

  useEffect(() => {
    if (!venue) return;
    setName(venue.name);
    setAddress(venue.address);
    setTimezone(venue.timezone);
    setLat(venue.latitude != null ? String(venue.latitude) : "");
    setLng(venue.longitude != null ? String(venue.longitude) : "");
    setRadius(String(venue.clockInRadiusFeet ?? DEFAULT_RADIUS_FEET));
  }, [venue]);

  async function putVenue(body: Record<string, unknown>): Promise<void> {
    if (!venue) return;
    const res = await fetch(`/api/venues/${venue.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) throw new Error(json.message ?? `Save failed (${res.status})`);
    queryClient.invalidateQueries({ queryKey: getListVenuesQueryKey() });
  }

  const handleSaveDetails = async () => {
    if (!venue) return;
    setSavingDetails(true);
    try {
      await putVenue({ name, address, timezone });
      toast({ title: "Settings saved", description: "Venue details have been updated." });
    } catch (err) {
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingDetails(false);
    }
  };

  const parseCoord = (input: string): { lat: number; lng: number } | null => {
    const parts = input.split(/[,\s]+/).filter(Boolean);
    if (parts.length !== 2) return null;
    const la = Number(parts[0]);
    const ln = Number(parts[1]);
    if (Number.isNaN(la) || Number.isNaN(ln)) return null;
    if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
    return { lat: la, lng: ln };
  };

  const handlePasteCoords = () => {
    navigator.clipboard?.readText?.().then((text) => {
      const parsed = parseCoord(text);
      if (!parsed) {
        toast({
          title: "Clipboard doesn't look like lat,lng",
          description: "Right-click the pin in Google Maps and click the coordinates to copy them.",
          variant: "destructive",
        });
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

  const handleSaveGps = async () => {
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
    setSavingGps(true);
    try {
      await putVenue({ latitude: la, longitude: ln, clockInRadiusFeet: r });
      toast({ title: "GPS pin saved", description: `Clock-in allowed within ${r} ft.` });
    } catch (err) {
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingGps(false);
    }
  };

  const handleClearGps = async () => {
    setSavingGps(true);
    try {
      await putVenue({ latitude: null, longitude: null, clockInRadiusFeet: null });
      setLat("");
      setLng("");
      setRadius(String(DEFAULT_RADIUS_FEET));
      toast({ title: "GPS pin cleared" });
    } catch (err) {
      toast({
        title: "Failed to clear",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingGps(false);
    }
  };

  const { data: roles } = useListRoles(
    { venueId: venue?.id || "" },
    { query: { enabled: !!venue?.id, queryKey: getListRolesQueryKey({ venueId: venue?.id || "" }) } }
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Venue Details</CardTitle>
          <CardDescription>Update your venue's basic information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Venue Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Input value={timezone} onChange={e => setTimezone(e.target.value)} />
          </div>
        </CardContent>
        <CardFooter className="border-t px-6 py-4">
          <Button onClick={handleSaveDetails} disabled={savingDetails}>
            {savingDetails ? "Saving..." : "Save Changes"}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clock-in GPS Pin</CardTitle>
          <CardDescription>
            Set the venue's exact location and how close staff must be to clock in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          <div>
            <Button variant="outline" size="sm" type="button" onClick={handlePasteCoords}>
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
              Staff can clock in from within this many feet of the pin. 10–5000 ft. Default {DEFAULT_RADIUS_FEET}.
            </p>
          </div>
        </CardContent>
        <CardFooter className="border-t px-6 py-4 flex gap-2">
          <Button onClick={handleSaveGps} disabled={savingGps}>
            {savingGps ? (<><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</>) : (<><Target className="w-4 h-4 mr-1.5" /> Save Pin</>)}
          </Button>
          <Button variant="ghost" type="button" onClick={handleClearGps} disabled={savingGps}>
            Clear pin
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Role Management</CardTitle>
          <CardDescription>Roles define permissions and schedule colors for staff.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role Name</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles?.map(role => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">{role.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: role.color }}></div>
                      <span className="text-sm text-muted-foreground">{role.color}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">Edit</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!roles?.length && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                    No roles defined.
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
