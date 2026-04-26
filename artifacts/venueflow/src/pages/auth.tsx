import { useState, useEffect, useCallback } from "react";
import { useAuth, type AuthUser } from "@/contexts/auth-context";
import venueflowLogo from "@assets/venueflow_logo.svg";

// ── VenueFlow brand palette — navy + teal + mint on near-white ──────────────
const V = {
  pageTop:    "#FFFFFF",
  pageBottom: "#EAF4F8",       // soft cyan tint at the bottom
  card:       "#FFFFFF",
  navy:       "#142849",       // deep brand navy
  navyMid:    "#264E7A",
  teal:       "#1F9CC2",       // bright brand teal
  tealDeep:   "#1A8AAB",
  mint:       "#5EE3C2",       // accent
  text:       "#142849",
  textMuted:  "rgba(20,40,73,0.58)",
  textFaint:  "rgba(20,40,73,0.40)",
  border:     "rgba(38,78,122,0.16)",
  rose:       "#C53030",
};

function PinDots({ length }: { length: number }) {
  return (
    <div style={{ display: "flex", gap: 14, justifyContent: "center", margin: "4px 0 20px" }}>
      {[0, 1, 2, 3].map((i) => {
        const filled = i < length;
        return (
          <div
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: filled ? V.teal : "transparent",
              border: `2px solid ${filled ? V.teal : V.border}`,
              transition: "all 0.15s ease",
              boxShadow: filled ? `0 0 12px ${V.teal}55` : "none",
            }}
          />
        );
      })}
    </div>
  );
}

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "←", "0", "✓"];

function Keypad({ onPress, disabled }: { onPress: (k: string) => void; disabled: boolean }) {
  return (
    <div className="pin-keypad">
      {PAD_KEYS.map((k) => {
        const isAction = k === "←" || k === "✓";
        const isConfirm = k === "✓";
        const isBack = k === "←";
        return (
          <button
            key={k}
            disabled={disabled}
            onClick={() => onPress(k)}
            style={{
              height: 56,
              borderRadius: 12,
              border: `1px solid ${isConfirm ? V.teal : V.border}`,
              background: isConfirm
                ? `linear-gradient(135deg, ${V.teal} 0%, ${V.tealDeep} 100%)`
                : "#FFFFFF",
              color: isConfirm ? "#FFFFFF" : isBack ? V.textMuted : V.text,
              fontSize: isAction ? 18 : 20,
              fontWeight: 600,
              letterSpacing: isAction ? 0 : 0.5,
              cursor: disabled ? "default" : "pointer",
              transition: "background 0.12s, transform 0.08s, box-shadow 0.15s",
              fontFamily: "system-ui, sans-serif",
              opacity: disabled ? 0.4 : 1,
              boxShadow: isConfirm
                ? `0 6px 14px rgba(31,156,194,0.35), inset 0 1px 0 rgba(255,255,255,0.3)`
                : `0 1px 2px rgba(20,40,73,0.05)`,
              touchAction: "manipulation",
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.95)"; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            {k}
          </button>
        );
      })}
    </div>
  );
}

export default function AuthPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);
  const [shake, setShake] = useState(false);
  const { login } = useAuth();

  // Keep the brief "checking…" delay so the keypad fades on success — gives a
  // tactile sense the sign-in worked before the dashboard mounts.
  useEffect(() => {
    if (!pendingUser) return;
    const t = setTimeout(() => login(pendingUser), 350);
    return () => clearTimeout(t);
  }, [pendingUser, login]);

  const transitioning = pendingUser !== null;

  const verify = useCallback(async (pinToCheck: string) => {
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinToCheck }),
      });
      if (res.ok) {
        const user: AuthUser = await res.json();
        setPendingUser(user);
      } else {
        setError("Incorrect PIN — try again");
        setShake(true);
        setPin("");
        setTimeout(() => setShake(false), 500);
      }
    } catch {
      setError("Connection error");
      setPin("");
    }
  }, []);

  const handleKey = useCallback(async (k: string) => {
    if (transitioning) return;
    if (k === "←") { setPin((p) => p.slice(0, -1)); setError(""); return; }
    if (k === "✓") {
      if (pin.length !== 4) { setError("Enter all 4 digits"); return; }
      await verify(pin);
      return;
    }
    if (pin.length < 4) {
      const next = pin + k;
      setPin(next);
      setError("");
      if (next.length === 4) setTimeout(() => verify(next), 180);
    }
  }, [pin, transitioning, verify]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") handleKey(e.key);
      else if (e.key === "Backspace") handleKey("←");
      else if (e.key === "Enter") handleKey("✓");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleKey]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, overflow: "hidden",
      background: `linear-gradient(180deg, ${V.pageTop} 0%, ${V.pageBottom} 100%)`,
    }}>
      {/* Subtle mint glow lower-left + teal glow upper-right — keeps the
          page from feeling flat without competing with the logo. */}
      <div aria-hidden style={{
        position: "absolute", top: "-10%", right: "-15%",
        width: "60vmin", height: "60vmin",
        background: `radial-gradient(circle, rgba(46,190,213,0.18) 0%, rgba(46,190,213,0) 70%)`,
        pointerEvents: "none",
      }} />
      <div aria-hidden style={{
        position: "absolute", bottom: "-25%", left: "-15%",
        width: "70vmin", height: "70vmin",
        background: `radial-gradient(circle, rgba(127,232,200,0.20) 0%, rgba(127,232,200,0) 70%)`,
        pointerEvents: "none",
      }} />

      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100%",
          padding: "24px 20px",
          opacity: transitioning ? 0 : 1,
          transition: transitioning ? "opacity 0.4s ease" : "none",
        }}
      >
        {/* VenueFlow logo — full wordmark + tagline */}
        <img
          src={venueflowLogo}
          alt="VenueFlow"
          style={{
            display: "block",
            width: "clamp(220px, 50vw, 320px)",
            height: "auto",
            marginBottom: 8,
            filter: "drop-shadow(0 6px 18px rgba(20,40,73,0.10))",
          }}
        />

        {/* Workplace context — small, secondary */}
        <p style={{
          margin: "8px 0 28px",
          fontSize: 11,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: V.textMuted,
          fontFamily: "system-ui, sans-serif",
          fontWeight: 600,
        }}>
          ENISH staff portal · Enter your PIN
        </p>

        {/* Card */}
        <div
          className={`pin-card${shake ? " pin-shake" : ""}`}
          style={{
            background: V.card,
            border: `1px solid ${V.border}`,
            borderRadius: 20,
            padding: "24px 24px 28px",
            boxShadow: `0 1px 2px rgba(20,40,73,0.05), 0 24px 48px -20px rgba(20,40,73,0.18), inset 0 1px 0 rgba(255,255,255,0.6)`,
          }}
        >
          <PinDots length={pin.length} />

          {error ? (
            <p
              style={{
                color: V.rose,
                fontSize: 12,
                textAlign: "center",
                marginBottom: 14,
                marginTop: -4,
                fontFamily: "system-ui, sans-serif",
                minHeight: 18,
              }}
            >
              {error}
            </p>
          ) : (
            <div style={{ height: 18, marginBottom: 14 }} />
          )}

          <Keypad onPress={handleKey} disabled={transitioning} />
        </div>

        {/* Footer */}
        <p style={{
          marginTop: 22,
          fontSize: 10,
          letterSpacing: 2.5,
          textTransform: "uppercase",
          color: V.textFaint,
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}>
          Powered by VenueFlow · ENISH USA Hospitality
        </p>
      </div>
    </div>
  );
}
