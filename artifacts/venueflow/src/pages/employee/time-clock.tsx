import { useState, useEffect, useRef, useCallback } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import {
  useListTimeClockEntries, getListTimeClockEntriesQueryKey,
  useListActiveClockIns, getListActiveClockInsQueryKey,
} from "@workspace/api-client-react";
import { format, intervalToDuration } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, CalendarCheck, AlertTriangle, Loader2, Clock4, Fingerprint, Smartphone } from "lucide-react";

// ── Fine dining palette ───────────────────────────────────────────────────────
const G = {
  bg:      "#0C0806",
  surface: "rgba(201,168,75,0.04)",
  border:  "rgba(201,168,75,0.10)",
  borderHi:"rgba(201,168,75,0.22)",
  gold:    "#C9A84B",
  goldSoft:"rgba(201,168,75,0.55)",
  champ:   "#EAD9A4",
  sage:    "#85B878",      // warm sage green — success
  rose:    "#C84848",      // deep rose — error/clock-out
  amber:   "#C47C35",      // warm amber — warning
  text:    "#EAD9A4",
  sub:     "rgba(234,217,164,0.38)",
};

// ── Venue anchor fallbacks (used when the venue record has no GPS pin) ──────
// Manager sets the real pin + radius on Settings → Clock-in GPS Pin.
const FALLBACK_VENUE_LAT = 29.736002;
const FALLBACK_VENUE_LNG = -95.461831;
const DEFAULT_RADIUS_FEET = 800;
const FEET_PER_METER = 3.28084;
// Small GPS jitter cushion on top of the venue radius.
const GPS_BUFFER = 25;
// Phones sometimes return a coarse WiFi / cell-tower fix (accuracy in
// hundreds of metres) and treat it as a real location. Reject anything
// worse than this for clock-in decisions; the user will see the current
// accuracy on screen and either wait or step outside for a real GPS lock.
// 50 m (~164 ft) is still permissive of typical phone-GPS jitter but
// rejects Wi-Fi / cell-tower fallbacks cleanly.
const MAX_ACCEPTABLE_ACCURACY_M = 50;

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toR(lat1))*Math.cos(toR(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function toFeet(m: number) { return (m * 3.28084).toFixed(0); }
function pad(n: number)    { return String(n).padStart(2, "0"); }

type GeoPhase  = "idle" | "requesting" | "denied" | "inRange" | "outRange" | "lowAccuracy" | "error";
type ShiftPhase = "loading" | "scheduled" | "none";

// ── Animated rings ────────────────────────────────────────────────────────────
function Rings({ color, count = 3 }: { color: string; count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          border: `1px solid ${color}`,
          animation: `tc-ring ${2 + i * 0.6}s ease-out infinite`,
          animationDelay: `${i * 0.5}s`,
          opacity: 0,
        }} />
      ))}
    </>
  );
}

// ── GPS dot ───────────────────────────────────────────────────────────────────
function GpsSignal({ phase }: { phase: GeoPhase }) {
  const color = phase === "inRange" ? G.sage : phase === "outRange" || phase === "denied" ? G.rose : G.amber;
  const label = {
    idle: "Tap to enable GPS",
    requesting: "Locating…",
    denied: "Permission denied",
    inRange: "In range",
    outRange: "Out of range",
    lowAccuracy: "Improving GPS…",
    error: "GPS unavailable",
  }[phase];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ position: "relative", width: 8, height: 8, display: "flex" }}>
        {phase === "requesting"
          ? <Loader2 size={8} style={{ color: G.amber, animation: "tc-spin 1s linear infinite" }} />
          : <>
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, opacity: 0.3, animation: "tc-pulse 1.6s ease-out infinite" }} />
              <span style={{ width: "100%", height: "100%", borderRadius: "50%", background: color, position: "relative" }} />
            </>
        }
      </span>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color }}>{label}</span>
    </div>
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      padding: "14px 18px",
      background: G.surface,
      border: `1px solid ${G.border}`,
      borderRadius: 18,
      backdropFilter: "blur(16px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
        <Icon size={11} style={{ color: G.sub }} />
        <span style={{ fontSize: 9, color: G.sub, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{label}</span>
      </div>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: 0.3 }}>{value}</p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function EmployeeTimeClock() {
  const { activeVenue, activeUser } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  // GPS pin + radius resolved from the active venue; fall back to historical
  // defaults if the manager hasn't set a pin yet.
  const venueGps = activeVenue as unknown as {
    latitude?: number | null;
    longitude?: number | null;
    clockInRadiusFeet?: number | null;
  } | null;
  const venueLat = venueGps?.latitude != null ? Number(venueGps.latitude) : FALLBACK_VENUE_LAT;
  const venueLng = venueGps?.longitude != null ? Number(venueGps.longitude) : FALLBACK_VENUE_LNG;
  const radiusFeet = venueGps?.clockInRadiusFeet ?? DEFAULT_RADIUS_FEET;
  const radiusM = radiusFeet / FEET_PER_METER;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [geoPhase, setGeoPhase] = useState<GeoPhase>("idle");
  const [distM, setDistM]       = useState<number | null>(null);
  const [geoPos, setGeoPos]     = useState<GeolocationPosition | null>(null);
  const watchRef                = useRef<number | null>(null);

  const [shiftPhase, setShiftPhase] = useState<ShiftPhase>("loading");
  const [shiftLabel, setShiftLabel] = useState("Checking…");
  const [acting, setActing]         = useState(false);
  const [elapsedMs, setElapsedMs]   = useState(0);
  const [biometricAvail, setBiometricAvail] = useState(false);
  const [useBiometric, setUseBiometric]     = useState(false);

  // Detect platform biometric availability (Touch ID / Face ID / Android fingerprint)
  useEffect(() => {
    const w = window as Window & { PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } };
    const fn = w.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable;
    if (typeof fn !== "function") return;
    fn().then((ok: boolean) => setBiometricAvail(!!ok)).catch(() => setBiometricAvail(false));
  }, []);

  /**
   * UX-only biometric gate: triggers the device's Touch ID / Face ID / fingerprint
   * prompt so the user's clock-in can be tagged as phone_biometric. This is a
   * UX signal (the user consented to biometric verification on their device),
   * NOT a cryptographic auth factor — the server does not verify an assertion.
   *
   * We derive the WebAuthn user handle deterministically from activeUser.id so
   * the same credential record is reused across clock-ins instead of creating
   * a new passkey every time (avoids credential sprawl on the device).
   */
  async function verifyBiometric(): Promise<boolean> {
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      // Deterministic 32-byte user handle derived from activeUser.id
      const idBytes = new TextEncoder().encode(`venueflow:${activeUser?.id ?? "anon"}`);
      const hash = await crypto.subtle.digest("SHA-256", idBytes);
      const userHandle = new Uint8Array(hash);

      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "VenueFlow" },
          user: { id: userHandle, name: activeUser?.email ?? "employee", displayName: activeUser?.fullName ?? "Employee" },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
          timeout: 30000,
          attestation: "none",
        },
      });
      return !!cred;
    } catch {
      return false;
    }
  }

  const venueId = activeVenue?.id || "";
  const userId  = activeUser?.id  || "";

  const { data: activeEntries, refetch: refetchActive } = useListActiveClockIns(
    { venueId },
    { query: { enabled: !!venueId, queryKey: getListActiveClockInsQueryKey({ venueId }) } }
  );
  const { data: history, refetch: refetchHistory } = useListTimeClockEntries(
    { venueId, userId },
    { query: { enabled: !!venueId && !!userId, queryKey: getListTimeClockEntriesQueryKey({ venueId, userId }) } }
  );

  const activeEntry = activeEntries?.find((e) => e.userId === userId);
  const isClockedIn = !!activeEntry;

  useEffect(() => {
    if (!isClockedIn || !activeEntry) { setElapsedMs(0); return; }
    const update = () => setElapsedMs(Date.now() - new Date(activeEntry.clockIn).getTime());
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [isClockedIn, activeEntry]);

  // Shift check
  useEffect(() => {
    if (!venueId || !userId) return;
    setShiftPhase("loading");
    fetch(`/api/shifts?venueId=${venueId}&userId=${userId}`)
      .then((r) => r.json())
      .then((shifts: Array<{ startTime: string; endTime: string }>) => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const todayShifts = shifts.filter((s) => {
          const st = new Date(s.startTime);
          return st >= today && st < tomorrow;
        });
        if (todayShifts.length === 0) {
          setShiftPhase("none"); setShiftLabel("No shifts today");
        } else {
          const next = todayShifts.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];
          setShiftPhase("scheduled");
          setShiftLabel(`${format(new Date(next.startTime), "h:mm a")} – ${format(new Date(next.endTime), "h:mm a")}`);
        }
      })
      .catch(() => { setShiftPhase("none"); setShiftLabel("Unknown"); });
  }, [venueId, userId]);

  // Geo watcher — ignore coarse fixes. Phones routinely return a WiFi
  // / cell-tower fix first (accuracy 500 m–several km) before the real
  // GPS locks in. Using those for distance checks is how people end up
  // "thousands of feet off". We keep watching until we get a fix under
  // MAX_ACCEPTABLE_ACCURACY_M and only then classify in/out of range.
  const startGeo = useCallback(() => {
    if (!navigator.geolocation) { setGeoPhase("error"); return; }
    setGeoPhase("requesting");
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);

    // Belt-and-suspenders: kick off a one-shot request in parallel with the
    // watch. Some browsers deliver the first watch event from cache; the
    // explicit getCurrentPosition asks for a fresh high-accuracy fix.
    navigator.geolocation.getCurrentPosition(
      () => { /* no-op: the watcher below will pick up the fresh fix */ },
      () => { /* errors handled by the watcher's error callback */ },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const d = haversineM(pos.coords.latitude, pos.coords.longitude, venueLat, venueLng);
        if (pos.coords.accuracy > MAX_ACCEPTABLE_ACCURACY_M) {
          // Record the fix so the UI can show the current accuracy, but
          // don't commit to an in/out decision yet.
          setGeoPos(pos);
          setDistM(d);
          setGeoPhase("lowAccuracy");
          return;
        }
        setGeoPos(pos);
        setDistM(d);
        const allowed = radiusM + Math.min(pos.coords.accuracy, GPS_BUFFER);
        setGeoPhase(d <= allowed ? "inRange" : "outRange");
      },
      (err) => { setGeoPhase(err.code === 1 ? "denied" : "error"); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  }, [venueLat, venueLng, radiusM]);

  useEffect(() => {
    return () => { if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); };
  }, []);

  async function handleClockIn() {
    if (!venueId || !userId || acting) return;
    if (geoPhase === "idle") { startGeo(); return; }
    if (geoPhase === "lowAccuracy") {
      const accFt = geoPos ? toFeet(geoPos.coords.accuracy) : "?";
      toast({
        title: "GPS still acquiring",
        description: `Accuracy is ±${accFt} ft — step outside for a clear view of the sky and wait a moment.`,
        variant: "destructive",
      });
      return;
    }
    if (geoPhase !== "inRange") {
      toast({ title: "Location required", description: `You must be within ${radiusFeet} feet of the venue.`, variant: "destructive" }); return;
    }
    if (shiftPhase !== "scheduled") {
      toast({ title: "Not scheduled", description: "You are not scheduled to work right now.", variant: "destructive" }); return;
    }
    setActing(true);
    try {
      let bioVerified = false;
      if (useBiometric && biometricAvail) {
        bioVerified = await verifyBiometric();
        if (!bioVerified) {
          toast({ title: "Fingerprint not verified", description: "Falling back to mobile GPS clock-in.", variant: "destructive" });
        }
      }
      const res = await fetch("/api/time-clock/in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId, venueId,
          lat: geoPos!.coords.latitude,
          lng: geoPos!.coords.longitude,
          accuracy: geoPos!.coords.accuracy,
          clientTimestamp: Date.now(),
          source: bioVerified ? "phone_biometric" : "mobile_gps",
          biometricVerified: bioVerified,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Clock-in declined", description: err.message, variant: "destructive" });
      } else {
        toast({ title: "Welcome in", description: "Your shift has begun." });
        qc.invalidateQueries({ queryKey: getListActiveClockInsQueryKey({ venueId }) });
        qc.invalidateQueries({ queryKey: getListTimeClockEntriesQueryKey({ venueId, userId }) });
        refetchActive(); refetchHistory();
      }
    } finally { setActing(false); }
  }

  async function handleClockOut() {
    if (!venueId || !userId || acting) return;
    setActing(true);
    try {
      const res = await fetch("/api/time-clock/out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, venueId }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } else {
        toast({ title: "Shift complete", description: "Have a wonderful evening." });
        qc.invalidateQueries({ queryKey: getListActiveClockInsQueryKey({ venueId }) });
        qc.invalidateQueries({ queryKey: getListTimeClockEntriesQueryKey({ venueId, userId }) });
        refetchActive(); refetchHistory();
      }
    } finally { setActing(false); }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  // 12-hour clock with AM/PM. The classic noon-vs-midnight rule: hour 0 is
  // 12 AM, hour 12 is 12 PM, anything else is hour mod 12.
  const hour24 = now.getHours();
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const H = pad(hour12);
  const M = pad(now.getMinutes());
  const S = pad(now.getSeconds());
  const ampm = hour24 < 12 ? "AM" : "PM";
  const secPct = (now.getSeconds() / 60) * 100;

  const elapsedStr = (() => {
    if (!isClockedIn || elapsedMs <= 0) return null;
    const d = intervalToDuration({ start: 0, end: elapsedMs });
    return `${pad(d.hours ?? 0)}:${pad(d.minutes ?? 0)}:${pad(d.seconds ?? 0)}`;
  })();

  const distDisplay = distM !== null
    ? `${toFeet(distM)} ft`
    : null;
  const accFtDisplay = geoPos ? `${toFeet(geoPos.coords.accuracy)} ft` : null;

  const btnColor = isClockedIn ? G.rose : (geoPhase === "inRange" && shiftPhase === "scheduled") ? G.sage : G.gold;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100%", background: G.bg, color: G.text, fontFamily: "system-ui, sans-serif", paddingBottom: 48 }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "28px 20px 0" }}>

        {/* ── Live clock ─────────────────────────────────────────────── */}
        <div style={{ textAlign: "center", padding: "32px 0 28px", animation: "tc-fadein 0.5s ease" }}>

          {/* Decorative hairline */}
          <div style={{ width: 40, height: 1, background: `linear-gradient(90deg, transparent, ${G.goldSoft}, transparent)`, margin: "0 auto 24px" }} />

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 3 }}>
            <span style={{
              fontSize: 80, fontWeight: 300, letterSpacing: -3,
              fontVariantNumeric: "tabular-nums", lineHeight: 1,
              color: G.champ,
            }}>{H}:{M}</span>
            <span style={{
              fontSize: 36, fontWeight: 300, letterSpacing: -1,
              color: G.goldSoft, fontVariantNumeric: "tabular-nums",
              minWidth: 48,
            }}>{S}</span>
            <span style={{
              fontSize: 16, fontWeight: 600, letterSpacing: 2,
              color: G.goldSoft,
              marginLeft: 6,
              textTransform: "uppercase",
            }}>{ampm}</span>
          </div>

          <p style={{ margin: "10px 0 0", fontSize: 11, color: G.sub, letterSpacing: 3, textTransform: "uppercase" }}>
            {format(now, "EEEE · MMMM d, yyyy")}
          </p>

          {/* Seconds bar */}
          <div style={{ height: 1, background: "rgba(201,168,75,0.08)", borderRadius: 1, marginTop: 20, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${secPct}%`,
              background: `linear-gradient(90deg, ${G.goldSoft}, ${G.gold})`,
              transition: "width 0.98s linear",
            }} />
          </div>

          {/* Decorative hairline */}
          <div style={{ width: 40, height: 1, background: `linear-gradient(90deg, transparent, ${G.goldSoft}, transparent)`, margin: "20px auto 0" }} />
        </div>

        {/* ── Clock-in method toggle ─────────────────────────────────── */}
        {!isClockedIn && biometricAvail && (
          <div style={{
            display: "flex", gap: 8, marginBottom: 16,
            padding: 4, background: G.surface, border: `1px solid ${G.border}`, borderRadius: 14,
            animation: "tc-fadein 0.5s ease 0.03s both",
          }}>
            <button
              onClick={() => setUseBiometric(false)}
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 10,
                background: !useBiometric ? `${G.gold}18` : "transparent",
                border: `1px solid ${!useBiometric ? G.goldSoft : "transparent"}`,
                color: !useBiometric ? G.champ : G.sub,
                fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer",
                transition: "all 0.25s",
              }}
            >
              <Smartphone size={12} /> Mobile GPS
            </button>
            <button
              onClick={() => setUseBiometric(true)}
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 10,
                background: useBiometric ? `${G.sage}18` : "transparent",
                border: `1px solid ${useBiometric ? `${G.sage}80` : "transparent"}`,
                color: useBiometric ? G.sage : G.sub,
                fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer",
                transition: "all 0.25s",
              }}
            >
              <Fingerprint size={12} /> Fingerprint
            </button>
          </div>
        )}

        {/* ── Status pills ───────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 32, animation: "tc-fadein 0.5s ease 0.06s both" }}>
          <StatPill
            icon={MapPin}
            label="Location"
            value={
              geoPhase === "inRange"     ? (distDisplay ? `${distDisplay} away${accFtDisplay ? ` · ±${accFtDisplay}` : ""}` : "In range") :
              geoPhase === "outRange"    ? (distDisplay ?? "Out of range") :
              geoPhase === "lowAccuracy" ? (accFtDisplay ? `Locking on · ±${accFtDisplay}` : "Locking on…") :
              geoPhase === "requesting"  ? "Scanning…" :
              geoPhase === "denied"      ? "Access denied" :
              geoPhase === "error"       ? "Unavailable" :
              "Not started"
            }
            color={geoPhase === "inRange" ? G.sage : geoPhase === "outRange" || geoPhase === "denied" ? G.rose : G.amber}
          />
          <StatPill
            icon={CalendarCheck}
            label="Shift"
            value={shiftLabel}
            color={shiftPhase === "scheduled" ? G.champ : shiftPhase === "none" ? G.rose : G.sub}
          />
        </div>

        {/* ── Action button ──────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 36, animation: "tc-fadein 0.5s ease 0.12s both" }}>
          <div style={{ position: "relative", width: 200, height: 200 }}>

            {/* Rings */}
            {isClockedIn && <Rings color={G.rose} count={3} />}
            {!isClockedIn && geoPhase === "inRange" && <Rings color={G.sage} count={2} />}

            {/* SVG arc */}
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }} viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(201,168,75,0.06)" strokeWidth="1" />
              <circle
                cx="100" cy="100" r="90" fill="none"
                stroke={btnColor}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 90}`}
                strokeDashoffset={`${2 * Math.PI * 90 * (1 - (isClockedIn ? secPct / 100 : geoPhase === "inRange" ? 1 : 0.15))}`}
                style={{ transition: "stroke-dashoffset 0.98s linear, stroke 0.5s ease", opacity: 0.7 }}
              />
            </svg>

            {/* Button core */}
            <button
              onClick={isClockedIn ? handleClockOut : geoPhase === "idle" ? startGeo : handleClockIn}
              disabled={acting}
              style={{
                position: "absolute", inset: 16,
                borderRadius: "50%",
                border: `1px solid ${btnColor}30`,
                background: `radial-gradient(ellipse at 40% 35%, ${btnColor}14, ${btnColor}05)`,
                cursor: acting ? "default" : "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "all 0.35s ease",
                backdropFilter: "blur(16px)",
                boxShadow: `0 0 60px ${btnColor}10, inset 0 1px 0 rgba(255,255,255,0.04)`,
              }}
              onMouseEnter={(e) => { if (!acting) (e.currentTarget.style.transform = "scale(1.04)"); }}
              onMouseLeave={(e) => { (e.currentTarget.style.transform = "scale(1)"); }}
              onMouseDown={(e)  => { (e.currentTarget.style.transform = "scale(0.97)"); }}
              onMouseUp={(e)    => { (e.currentTarget.style.transform = "scale(1.04)"); }}
            >
              {acting ? (
                <Loader2 size={26} style={{ color: btnColor, animation: "tc-spin 1s linear infinite" }} />
              ) : isClockedIn ? (
                <>
                  <div style={{ width: 22, height: 22, background: G.rose, borderRadius: 6, opacity: 0.9 }} />
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: G.rose, textTransform: "uppercase" }}>Clock Out</span>
                </>
              ) : (
                <>
                  <Clock4 size={26} style={{ color: btnColor, opacity: 0.9 }} />
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: btnColor, textTransform: "uppercase" }}>
                    {geoPhase === "idle" ? "Begin" : geoPhase === "requesting" ? "Locating…" : "Clock In"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Elapsed timer ──────────────────────────────────────────── */}
        {isClockedIn && elapsedStr && (
          <div style={{
            textAlign: "center", marginBottom: 28,
            padding: "18px 24px",
            background: `${G.sage}08`,
            border: `1px solid ${G.sage}20`,
            borderRadius: 20,
            animation: "tc-fadein 0.4s ease",
          }}>
            <div style={{ fontSize: 9, color: G.sage, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>Time Elapsed</div>
            <div style={{ fontSize: 38, fontWeight: 200, color: G.champ, fontVariantNumeric: "tabular-nums", letterSpacing: -1 }}>{elapsedStr}</div>
            <div style={{ fontSize: 11, color: G.sub, marginTop: 5, letterSpacing: 1 }}>
              Since {format(new Date(activeEntry!.clockIn), "h:mm a")}
            </div>
          </div>
        )}

        {/* ── Location hint ──────────────────────────────────────────── */}
        {!isClockedIn && (geoPhase === "idle" || geoPhase === "outRange" || geoPhase === "lowAccuracy") && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 28,
            padding: "14px 18px",
            background: `${geoPhase === "idle" || geoPhase === "lowAccuracy" ? G.gold : G.rose}06`,
            border: `1px solid ${geoPhase === "idle" || geoPhase === "lowAccuracy" ? G.gold : G.rose}18`,
            borderRadius: 16,
            animation: "tc-fadein 0.4s ease",
          }}>
            {geoPhase === "outRange"
              ? <AlertTriangle size={14} style={{ color: G.rose, marginTop: 1, flexShrink: 0 }} />
              : <MapPin size={14} style={{ color: G.goldSoft, marginTop: 1, flexShrink: 0 }} />
            }
            <p style={{ margin: 0, fontSize: 12, color: G.sub, lineHeight: 1.7, letterSpacing: 0.3 }}>
              {geoPhase === "idle" && (
                <>Tap the clock above to begin location verification. You must be within {radiusFeet} feet of {activeVenue?.address ?? "the venue"}.</>
              )}
              {geoPhase === "lowAccuracy" && (
                <>Still locking onto GPS — currently accurate to <b>±{accFtDisplay ?? "?"}</b>. Step outside if you're in a back room, and make sure <b>Precise Location</b> is on in your phone's Settings → Privacy → Location Services → this app. We'll let you clock in once we have a real GPS lock.</>
              )}
              {geoPhase === "outRange" && (
                <>You are <b>{distDisplay ?? "too far"}</b> from the venue (GPS ±{accFtDisplay ?? "?"}). Move closer to {activeVenue?.address ?? "the venue"} and give GPS a moment to refresh.</>
              )}
            </p>
          </div>
        )}

        {/* ── Recent entries ─────────────────────────────────────────── */}
        <div style={{
          background: G.surface,
          border: `1px solid ${G.border}`,
          borderRadius: 22,
          overflow: "hidden",
          backdropFilter: "blur(16px)",
          animation: "tc-fadein 0.5s ease 0.18s both",
        }}>
          <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${G.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: G.goldSoft }}>Recent Shifts</span>
            <span style={{ fontSize: 10, color: G.sub, letterSpacing: 1 }}>{Math.min(history?.length ?? 0, 7)} entries</span>
          </div>

          {history && history.length > 0 ? (
            <div>
              {[...history].reverse().slice(0, 7).map((entry, i) => {
                const isActive = !entry.clockOut;
                return (
                  <div key={entry.id} style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 22px",
                    borderBottom: i < Math.min(history.length, 7) - 1 ? `1px solid ${G.border}` : "none",
                  }}>
                    {/* Date */}
                    <div style={{ width: 44, flexShrink: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 300, color: G.champ, lineHeight: 1 }}>
                        {format(new Date(entry.clockIn), "d")}
                      </div>
                      <div style={{ fontSize: 9, color: G.sub, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase" }}>
                        {format(new Date(entry.clockIn), "MMM")}
                      </div>
                    </div>

                    {/* Timeline bar */}
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 1, background: "rgba(201,168,75,0.08)", borderRadius: 1 }}>
                        <div style={{
                          height: "100%", width: "100%",
                          background: isActive
                            ? `linear-gradient(90deg, ${G.sage}, ${G.gold})`
                            : `linear-gradient(90deg, ${G.goldSoft}, rgba(201,168,75,0.12))`,
                          borderRadius: 1,
                          animation: isActive ? "tc-shimmer 2.5s linear infinite" : undefined,
                          backgroundSize: "200% auto",
                        }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7 }}>
                        <span style={{ fontSize: 11, color: G.sub, letterSpacing: 0.5 }}>
                          {format(new Date(entry.clockIn), "h:mm a")}
                        </span>
                        <span style={{ fontSize: 11, color: isActive ? G.sage : G.sub, letterSpacing: 0.5 }}>
                          {isActive ? "Active" : entry.clockOut ? format(new Date(entry.clockOut), "h:mm a") : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Hours */}
                    <div style={{ width: 44, textAlign: "right", flexShrink: 0 }}>
                      {isActive ? (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: G.sage,
                          background: `${G.sage}15`, padding: "3px 8px", borderRadius: 20,
                          letterSpacing: 1, textTransform: "uppercase",
                        }}>Live</span>
                      ) : (
                        <span style={{ fontSize: 16, fontWeight: 300, color: G.champ }}>
                          {(entry.totalHours as number | null)?.toFixed(1) ?? "—"}
                          <span style={{ fontSize: 10, color: G.sub }}> h</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "36px 22px", textAlign: "center", color: G.sub, fontSize: 13, letterSpacing: 0.5 }}>
              No time entries yet
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 22, padding: "0 2px" }}>
          <GpsSignal phase={geoPhase} />
          <span style={{ fontSize: 10, color: G.sub, letterSpacing: 1 }}>{activeVenue?.address ?? ""}</span>
        </div>

      </div>
    </div>
  );
}
