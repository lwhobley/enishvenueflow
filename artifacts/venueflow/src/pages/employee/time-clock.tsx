import { useState, useEffect, useRef, useCallback } from "react";
import { useAppContext } from "@/hooks/use-app-context";
import {
  useListTimeClockEntries, getListTimeClockEntriesQueryKey,
  useListActiveClockIns, getListActiveClockInsQueryKey,
} from "@workspace/api-client-react";
import { format, formatDuration, intervalToDuration } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, Wifi, WifiOff, CheckCircle2, XCircle, Loader2, Clock4, CalendarCheck, AlertTriangle } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const VENUE_LAT  = 29.736002;
const VENUE_LNG  = -95.461831;
const MAX_FEET   = 10;
const MAX_M      = MAX_FEET * 0.3048;
const GPS_BUFFER = 25; // metres accuracy buffer

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toR(lat1))*Math.cos(toR(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function toFeet(m: number) { return (m * 3.28084).toFixed(0); }
function pad(n: number)    { return String(n).padStart(2, "0"); }

// ─── Geo state machine ────────────────────────────────────────────────────────
type GeoPhase = "idle" | "requesting" | "denied" | "inRange" | "outRange" | "error";
type ShiftPhase = "loading" | "scheduled" | "none";

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
  bg:      "#080C18",
  surface: "rgba(255,255,255,0.04)",
  border:  "rgba(255,255,255,0.07)",
  hi:      "#7B6FFF",   // indigo accent
  mint:    "#00D68F",   // success
  amber:   "#FFB347",   // warning
  rose:    "#FF4757",   // error
  text:    "#DDE1FF",
  sub:     "#6070A0",
};

// ─── Animated concentric rings ────────────────────────────────────────────────
function Rings({ color, count = 3 }: { color: string; count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `1px solid ${color}`,
            animation: `tc-ring ${1.6 + i * 0.5}s ease-out infinite`,
            animationDelay: `${i * 0.4}s`,
            opacity: 0,
          }}
        />
      ))}
    </>
  );
}

// ─── GPS dot ──────────────────────────────────────────────────────────────────
function GpsSignal({ phase }: { phase: GeoPhase }) {
  const color = phase === "inRange" ? C.mint : phase === "outRange" || phase === "denied" ? C.rose : C.amber;
  const label = {
    idle: "Tap to enable GPS",
    requesting: "Locating…",
    denied: "Location denied",
    inRange: "In range ✓",
    outRange: "Out of range",
    error: "GPS error",
  }[phase];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ position: "relative", width: 10, height: 10, display: "flex" }}>
        {phase === "requesting" ? (
          <Loader2 size={10} style={{ color: C.amber, animation: "spin 1s linear infinite" }} />
        ) : (
          <>
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, opacity: 0.35, animation: "tc-pulse 1.4s ease-out infinite" }} />
            <span style={{ position: "relative", width: "100%", height: "100%", borderRadius: "50%", background: color }} />
          </>
        )}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color }}>{label}</span>
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function Pill({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, padding: "14px 16px",
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      backdropFilter: "blur(12px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <Icon size={12} style={{ color: C.sub }} />
        <span style={{ fontSize: 10, color: C.sub, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      </div>
      <p style={{ fontSize: 13, fontWeight: 700, color, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function EmployeeTimeClock() {
  const { activeVenue, activeUser } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Live clock
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Geo
  const [geoPhase, setGeoPhase]     = useState<GeoPhase>("idle");
  const [distM, setDistM]           = useState<number | null>(null);
  const [geoPos, setGeoPos]         = useState<GeolocationPosition | null>(null);
  const watchRef                    = useRef<number | null>(null);

  // Shift check
  const [shiftPhase, setShiftPhase] = useState<ShiftPhase>("loading");
  const [shiftLabel, setShiftLabel] = useState("Checking…");

  // Action state
  const [acting, setActing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  // API data
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

  // Elapsed time while clocked in
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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const todayShifts = shifts.filter((s) => {
          const st = new Date(s.startTime);
          return st >= today && st < tomorrow;
        });
        if (todayShifts.length === 0) {
          setShiftPhase("none");
          setShiftLabel("No shifts today");
        } else {
          const next = todayShifts.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];
          setShiftPhase("scheduled");
          setShiftLabel(`${format(new Date(next.startTime), "h:mm a")} – ${format(new Date(next.endTime), "h:mm a")}`);
        }
      })
      .catch(() => { setShiftPhase("none"); setShiftLabel("Unknown"); });
  }, [venueId, userId]);

  // Geo watcher
  const startGeo = useCallback(() => {
    if (!navigator.geolocation) { setGeoPhase("error"); return; }
    setGeoPhase("requesting");
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoPos(pos);
        const d = haversineM(pos.coords.latitude, pos.coords.longitude, VENUE_LAT, VENUE_LNG);
        setDistM(d);
        const allowed = MAX_M + Math.min(pos.coords.accuracy, GPS_BUFFER);
        setGeoPhase(d <= allowed ? "inRange" : "outRange");
      },
      (err) => { setGeoPhase(err.code === 1 ? "denied" : "error"); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  }, []);

  useEffect(() => { return () => { if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); }; }, []);

  // ── Clock-in / out actions ──────────────────────────────────────────────────
  async function handleClockIn() {
    if (!venueId || !userId || acting) return;

    if (geoPhase !== "inRange") {
      if (geoPhase === "idle") { startGeo(); return; }
      toast({ title: "Location required", description: "You must be within 10 feet of the venue.", variant: "destructive" });
      return;
    }
    if (shiftPhase !== "scheduled") {
      toast({ title: "Not scheduled", description: "You are not scheduled to work right now.", variant: "destructive" });
      return;
    }

    setActing(true);
    try {
      const res = await fetch("/api/time-clock/in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId, venueId,
          lat: geoPos!.coords.latitude,
          lng: geoPos!.coords.longitude,
          accuracy: geoPos!.coords.accuracy,
          clientTimestamp: Date.now(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Clock-in failed", description: err.message, variant: "destructive" });
      } else {
        toast({ title: "Clocked in", description: "Your shift has started. Have a great day! 🎯" });
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
        toast({ title: "Clock-out failed", description: err.message, variant: "destructive" });
      } else {
        toast({ title: "Clocked out", description: "Great work today! 👏" });
        qc.invalidateQueries({ queryKey: getListActiveClockInsQueryKey({ venueId }) });
        qc.invalidateQueries({ queryKey: getListTimeClockEntriesQueryKey({ venueId, userId }) });
        refetchActive(); refetchHistory();
      }
    } finally { setActing(false); }
  }

  // ── Derived display values ──────────────────────────────────────────────────
  const H  = pad(now.getHours());
  const M  = pad(now.getMinutes());
  const S  = pad(now.getSeconds());
  const secPct = (now.getSeconds() / 60) * 100;

  const elapsedStr = (() => {
    if (!isClockedIn || elapsedMs <= 0) return null;
    const dur = intervalToDuration({ start: 0, end: elapsedMs });
    return `${pad(dur.hours ?? 0)}:${pad(dur.minutes ?? 0)}:${pad(dur.seconds ?? 0)}`;
  })();

  const distDisplay = distM !== null
    ? distM <= MAX_M + GPS_BUFFER
      ? `${toFeet(distM)} ft`
      : `${toFeet(distM)} ft away`
    : null;

  const btnColor = isClockedIn ? C.rose : shiftPhase === "scheduled" && geoPhase === "inRange" ? C.mint : C.hi;
  const btnLabel = acting ? "…" : isClockedIn ? "CLOCK OUT" : geoPhase === "idle" ? "TAP TO START" : geoPhase === "requesting" ? "LOCATING…" : "CLOCK IN";
  const canAct   = !acting && (isClockedIn || (geoPhase === "inRange" && shiftPhase === "scheduled"));

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100%", background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif", padding: "0 0 40px" }}>

      {/* Keyframes injected inline */}
      <style>{`
        @keyframes tc-ring {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes tc-pulse {
          0%, 100% { transform: scale(1);   opacity: 0.3; }
          50%      { transform: scale(2.2); opacity: 0; }
        }
        @keyframes tc-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes tc-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes tc-fadein {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ maxWidth: 440, margin: "0 auto", padding: "24px 16px 0" }}>

        {/* ── Live clock ── */}
        <div style={{ textAlign: "center", padding: "32px 0 24px", animation: "tc-fadein 0.4s ease" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4 }}>
            <span style={{ fontSize: 76, fontWeight: 800, letterSpacing: -4, fontVariantNumeric: "tabular-nums", lineHeight: 1, color: C.text }}>{H}:{M}</span>
            <span style={{ fontSize: 36, fontWeight: 600, letterSpacing: -2, color: C.hi, fontVariantNumeric: "tabular-nums", minWidth: 44 }}>{S}</span>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: C.sub, letterSpacing: 1 }}>
            {format(now, "EEEE, MMMM d, yyyy").toUpperCase()}
          </p>

          {/* Seconds progress bar */}
          <div style={{ height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 14, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${secPct}%`,
              background: `linear-gradient(90deg, ${C.hi}, ${C.mint})`,
              borderRadius: 2,
              transition: "width 0.98s linear",
            }} />
          </div>
        </div>

        {/* ── Status pills ── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 28, animation: "tc-fadein 0.4s ease 0.05s both" }}>
          <Pill
            icon={MapPin}
            label="GPS"
            value={
              geoPhase === "inRange"    ? distDisplay ?? "In range" :
              geoPhase === "outRange"   ? (distDisplay ?? "Out of range") :
              geoPhase === "requesting" ? "Scanning…" :
              geoPhase === "denied"     ? "Permission denied" :
              geoPhase === "error"      ? "GPS unavailable" :
              "Not started"
            }
            color={
              geoPhase === "inRange"  ? C.mint :
              geoPhase === "outRange" || geoPhase === "denied" || geoPhase === "error" ? C.rose :
              C.amber
            }
          />
          <Pill
            icon={CalendarCheck}
            label="Shift"
            value={shiftLabel}
            color={shiftPhase === "scheduled" ? C.mint : shiftPhase === "none" ? C.rose : C.sub}
          />
        </div>

        {/* ── Big action button ── */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 36, animation: "tc-fadein 0.4s ease 0.1s both" }}>
          <div style={{ position: "relative", width: 200, height: 200 }}>

            {/* Animated rings when clocked in */}
            {isClockedIn && <Rings color={C.rose} count={3} />}
            {geoPhase === "inRange" && !isClockedIn && <Rings color={C.mint} count={2} />}

            {/* Outer track ring */}
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }} viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
              <circle
                cx="100" cy="100" r="92" fill="none"
                stroke={btnColor}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 92}`}
                strokeDashoffset={`${2 * Math.PI * 92 * (1 - (isClockedIn ? secPct / 100 : (geoPhase === "inRange" ? 1 : 0.2)))}`}
                style={{ transition: "stroke-dashoffset 0.98s linear, stroke 0.4s ease" }}
              />
            </svg>

            {/* Button core */}
            <button
              onClick={isClockedIn ? handleClockOut : geoPhase === "idle" ? startGeo : handleClockIn}
              disabled={acting}
              style={{
                position: "absolute",
                inset: 12,
                borderRadius: "50%",
                border: `2px solid ${btnColor}40`,
                background: `radial-gradient(circle at 40% 35%, ${btnColor}22, ${btnColor}08)`,
                cursor: acting ? "default" : "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "all 0.25s ease",
                backdropFilter: "blur(12px)",
                boxShadow: `0 0 40px ${btnColor}18, inset 0 1px 0 rgba(255,255,255,0.08)`,
              }}
              onMouseEnter={(e) => { if (!acting) (e.currentTarget.style.transform = "scale(1.03)"); }}
              onMouseLeave={(e) => { (e.currentTarget.style.transform = "scale(1)"); }}
              onMouseDown={(e) => { (e.currentTarget.style.transform = "scale(0.97)"); }}
              onMouseUp={(e) => { (e.currentTarget.style.transform = "scale(1.03)"); }}
            >
              {acting ? (
                <Loader2 size={28} style={{ color: btnColor, animation: "tc-spin 1s linear infinite" }} />
              ) : isClockedIn ? (
                <>
                  <div style={{ width: 28, height: 28, background: C.rose, borderRadius: 6 }} />
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: C.rose }}>CLOCK OUT</span>
                </>
              ) : (
                <>
                  <Clock4 size={28} style={{ color: btnColor }} />
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: btnColor }}>{btnLabel}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Elapsed time while clocked in */}
        {isClockedIn && elapsedStr && (
          <div style={{
            textAlign: "center", marginBottom: 24, padding: "14px 20px",
            background: `${C.mint}10`, border: `1px solid ${C.mint}30`, borderRadius: 14,
            animation: "tc-fadein 0.3s ease",
          }}>
            <div style={{ fontSize: 11, color: C.mint, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>CLOCKED IN FOR</div>
            <div style={{ fontSize: 34, fontWeight: 800, color: C.mint, fontVariantNumeric: "tabular-nums", letterSpacing: -1 }}>{elapsedStr}</div>
            <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>
              Since {format(new Date(activeEntry!.clockIn), "h:mm a")}
            </div>
          </div>
        )}

        {/* GPS tip when idle or out of range */}
        {!isClockedIn && (geoPhase === "idle" || geoPhase === "outRange") && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 24,
            padding: "12px 16px",
            background: `${geoPhase === "idle" ? C.hi : C.rose}08`,
            border: `1px solid ${geoPhase === "idle" ? C.hi : C.rose}20`,
            borderRadius: 12,
            animation: "tc-fadein 0.3s ease",
          }}>
            {geoPhase === "idle"
              ? <MapPin size={15} style={{ color: C.hi, marginTop: 1, flexShrink: 0 }} />
              : <AlertTriangle size={15} style={{ color: C.rose, marginTop: 1, flexShrink: 0 }} />
            }
            <p style={{ margin: 0, fontSize: 12, color: C.sub, lineHeight: 1.5 }}>
              {geoPhase === "idle"
                ? "Tap the button above to start location check. You must be within 10 feet of 5851 Westheimer Rd to clock in."
                : `You are ${distDisplay ?? "too far"} from the venue. Move closer to 5851 Westheimer Rd, Houston, TX 77056 and wait for GPS to update.`
              }
            </p>
          </div>
        )}

        {/* ── Recent entries ── */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 16, overflow: "hidden",
          backdropFilter: "blur(12px)",
          animation: "tc-fadein 0.4s ease 0.15s both",
        }}>
          <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Recent Entries</span>
            <span style={{ fontSize: 11, color: C.sub }}>Last {Math.min(history?.length ?? 0, 7)} shifts</span>
          </div>

          {history && history.length > 0 ? (
            <div>
              {[...history].reverse().slice(0, 7).map((entry, i) => {
                const isActive = !entry.clockOut;
                return (
                  <div
                    key={entry.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 20px",
                      borderBottom: i < Math.min(history.length, 7) - 1 ? `1px solid ${C.border}` : "none",
                      transition: "background 0.15s",
                    }}
                  >
                    {/* Date column */}
                    <div style={{ width: 52, flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1 }}>
                        {format(new Date(entry.clockIn), "d")}
                      </div>
                      <div style={{ fontSize: 10, color: C.sub, fontWeight: 600, letterSpacing: 0.5 }}>
                        {format(new Date(entry.clockIn), "MMM EEE").toUpperCase()}
                      </div>
                    </div>

                    {/* Timeline bar */}
                    <div style={{ flex: 1, position: "relative" }}>
                      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                        <div style={{
                          height: "100%",
                          width: isActive ? "100%" : "100%",
                          background: isActive
                            ? `linear-gradient(90deg, ${C.mint}, ${C.hi})`
                            : `linear-gradient(90deg, ${C.hi}80, ${C.sub}40)`,
                          borderRadius: 2,
                          animation: isActive ? "tc-shimmer 2s linear infinite" : undefined,
                          backgroundSize: "200% auto",
                        }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                        <span style={{ fontSize: 11, color: C.sub }}>
                          {format(new Date(entry.clockIn), "h:mm a")}
                        </span>
                        <span style={{ fontSize: 11, color: isActive ? C.mint : C.sub }}>
                          {isActive ? "Active now" : entry.clockOut ? format(new Date(entry.clockOut), "h:mm a") : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Hours badge */}
                    <div style={{
                      width: 52, textAlign: "right", flexShrink: 0,
                    }}>
                      {isActive ? (
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: C.mint,
                          background: `${C.mint}15`, padding: "3px 7px", borderRadius: 20,
                        }}>LIVE</span>
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
                          {(entry.totalHours as number | null)?.toFixed(1) ?? "—"}
                          <span style={{ fontSize: 10, color: C.sub, marginLeft: 2 }}>h</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "32px 20px", textAlign: "center", color: C.sub, fontSize: 13 }}>
              No time entries yet.
            </div>
          )}
        </div>

        {/* GeoStatus row at bottom */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, padding: "0 4px" }}>
          <GpsSignal phase={geoPhase} />
          <span style={{ fontSize: 11, color: C.sub }}>5851 Westheimer Rd · Houston TX</span>
        </div>

      </div>
    </div>
  );
}
