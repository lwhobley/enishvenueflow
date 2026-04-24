import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth, type AuthUser } from "@/contexts/auth-context";
import enoshLogo from "@assets/IMG_2588_1776205200027.png";
import igniteVideo from "@assets/Enish_Logo_Igniting_Video_Creation.mp4";

// ── Light luxury palette — mirrors the rest of the app ────────────────────
const L = {
  pageTop:      "#FBF6E8",
  pageBottom:   "#F0E8D3",
  cream:        "#FFFDF7",
  parchment:    "#F0E8D3",
  gold:         "#B2882F",
  goldSoft:     "#D9B867",
  goldHair:     "rgba(178,136,47,0.14)",
  border:       "rgba(178,136,47,0.24)",
  espresso:     "#2A1F17",
  taupe:        "rgba(42,31,23,0.58)",
  taupeMuted:   "rgba(42,31,23,0.42)",
  rose:         "#8A3D3D",
};

function LogoFlame() {
  // SVG flame shaped to roughly fill where the "I" sits in the ENISH logo.
  // Three nested paths (outer/mid/core) with SMIL morph animations so the
  // flame breathes without any canvas overhead. CSS jitter on the wrapper
  // adds subtle rotation/scale so the whole thing feels alive.
  return (
    <svg
      viewBox="0 0 100 200"
      preserveAspectRatio="xMidYMax meet"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
        filter: "drop-shadow(0 0 18px rgba(255,120,0,0.55)) drop-shadow(0 0 6px rgba(255,60,0,0.45))",
        transformOrigin: "50% 100%",
        animation: "flame-sway 2.3s ease-in-out infinite",
      }}
      aria-hidden
    >
      <defs>
        <radialGradient id="flame-outer" cx="50%" cy="88%" r="62%">
          <stop offset="0%" stopColor="#FFC76B" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#E85D04" stopOpacity="0.85" />
          <stop offset="80%" stopColor="#9D0208" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#9D0208" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="flame-mid" cx="50%" cy="90%" r="55%">
          <stop offset="0%" stopColor="#FFF4B0" stopOpacity="1" />
          <stop offset="35%" stopColor="#FFD166" stopOpacity="0.95" />
          <stop offset="70%" stopColor="#FF8A00" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#FF4500" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="flame-core" cx="50%" cy="90%" r="35%">
          <stop offset="0%" stopColor="#FFFBEA" />
          <stop offset="60%" stopColor="#FFE28A" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#FFC76B" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Outer plume */}
      <path fill="url(#flame-outer)">
        <animate
          attributeName="d"
          dur="0.55s"
          repeatCount="indefinite"
          values="
            M50,200 C8,182 10,120 28,82 C36,58 46,30 50,0 C54,30 64,58 72,82 C90,120 92,182 50,200 Z;
            M50,200 C14,186 16,126 34,86 C42,62 48,34 50,6 C52,34 58,62 66,86 C84,126 86,186 50,200 Z;
            M50,200 C6,180 8,116 26,78 C34,54 44,26 50,-4 C56,26 66,54 74,78 C92,116 94,180 50,200 Z;
            M50,200 C8,182 10,120 28,82 C36,58 46,30 50,0 C54,30 64,58 72,82 C90,120 92,182 50,200 Z
          "
        />
      </path>

      {/* Middle body */}
      <path fill="url(#flame-mid)">
        <animate
          attributeName="d"
          dur="0.42s"
          repeatCount="indefinite"
          values="
            M50,196 C26,178 28,138 38,110 C42,90 47,62 50,36 C53,62 58,90 62,110 C72,138 74,178 50,196 Z;
            M50,196 C30,178 32,142 40,114 C44,94 48,66 50,42 C52,66 56,94 60,114 C68,142 70,178 50,196 Z;
            M50,196 C24,176 26,136 36,108 C41,88 46,60 50,32 C54,60 59,88 64,108 C74,136 76,176 50,196 Z;
            M50,196 C26,178 28,138 38,110 C42,90 47,62 50,36 C53,62 58,90 62,110 C72,138 74,178 50,196 Z
          "
        />
      </path>

      {/* Inner hot core */}
      <path fill="url(#flame-core)">
        <animate
          attributeName="d"
          dur="0.32s"
          repeatCount="indefinite"
          values="
            M50,190 C40,176 42,152 46,130 C48,110 49,88 50,76 C51,88 52,110 54,130 C58,152 60,176 50,190 Z;
            M50,190 C43,176 45,154 47,134 C48,116 50,96 50,82 C50,96 52,116 53,134 C55,154 57,176 50,190 Z;
            M50,190 C40,176 42,152 46,130 C48,110 49,88 50,76 C51,88 52,110 54,130 C58,152 60,176 50,190 Z
          "
        />
      </path>
    </svg>
  );
}

function LoginVideoTransition({ active, onFinish }: { active: boolean; onFinish: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    if (!active) return;
    const video = videoRef.current;
    if (!video) return;

    video.muted = false;
    video.volume = 1;
    let cancelled = false;

    const tryPlay = async () => {
      try {
        await video.play();
      } catch {
        if (cancelled) return;
        video.muted = true;
        try {
          await video.play();
        } catch {
          if (!cancelled) finish();
        }
      }
    };
    void tryPlay();

    const safetyTimer = window.setTimeout(finish, 10000);

    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
    };
  }, [active, finish]);

  if (!active) return null;
  return (
    <video
      ref={videoRef}
      src={igniteVideo}
      playsInline
      preload="auto"
      onEnded={finish}
      onError={finish}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        // Keep the full frame in view on phones — letterbox against the
        // dark transition background so the logo video never crops.
        objectFit: "contain",
        background: "#000",
        zIndex: 100,
        pointerEvents: "none",
      }}
    />
  );
}

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
              background: filled ? L.gold : "transparent",
              border: `2px solid ${filled ? L.gold : L.border}`,
              transition: "all 0.15s ease",
              boxShadow: filled ? `0 0 12px ${L.gold}55` : "none",
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
              border: `1px solid ${isConfirm ? L.gold : L.border}`,
              background: isConfirm
                ? `linear-gradient(135deg, ${L.gold} 0%, #9E7523 100%)`
                : L.cream,
              color: isConfirm ? L.cream : isBack ? L.taupeMuted : L.espresso,
              fontSize: isAction ? 18 : 20,
              fontWeight: 600,
              letterSpacing: isAction ? 0 : 0.5,
              cursor: disabled ? "default" : "pointer",
              transition: "background 0.12s, transform 0.08s, box-shadow 0.15s",
              fontFamily: "system-ui, sans-serif",
              opacity: disabled ? 0.4 : 1,
              boxShadow: isConfirm
                ? `0 6px 14px rgba(178,136,47,0.28), inset 0 1px 0 rgba(255,255,255,0.3)`
                : `0 1px 2px rgba(42,31,23,0.04)`,
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
      background: `linear-gradient(180deg, ${L.pageTop} 0%, ${L.pageBottom} 100%)`,
    }}>
      {/* Soft gold bloom — subtle luxury backdrop */}
      <div aria-hidden style={{
        position: "absolute",
        top: "-20%", left: "50%", transform: "translateX(-50%)",
        width: "140vmin", height: "140vmin",
        background: `radial-gradient(circle, rgba(217,184,103,0.32) 0%, rgba(217,184,103,0.12) 40%, rgba(217,184,103,0) 70%)`,
        pointerEvents: "none",
      }} />
      <div aria-hidden style={{
        position: "absolute",
        bottom: "-30%", right: "-10%",
        width: "80vmin", height: "80vmin",
        background: `radial-gradient(circle, rgba(240,217,198,0.5) 0%, rgba(240,217,198,0) 70%)`,
        pointerEvents: "none",
      }} />

      <LoginVideoTransition
        active={transitioning}
        onFinish={() => { if (pendingUser) login(pendingUser); }}
      />

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
        {/* ENISH logo — the "I" is hidden from the original artwork and
            replaced with a live SVG flame. Two copies of the logo with
            complementary clip-paths render the left (E, N) and right
            (S, H) halves; the flame fills the gap in between. */}
        <div style={{ marginBottom: 20, position: "relative", display: "inline-block" }}>
          <img
            src={enoshLogo}
            alt="ENISH"
            className="auth-logo"
            style={{
              display: "block",
              clipPath: "inset(0 63% 0 0)",
              filter: "drop-shadow(0 10px 24px rgba(42,31,23,0.18)) drop-shadow(0 0 18px rgba(217,184,103,0.35))",
            }}
          />
          <img
            src={enoshLogo}
            aria-hidden
            alt=""
            className="auth-logo"
            style={{
              display: "block",
              position: "absolute",
              top: 0,
              left: 0,
              clipPath: "inset(0 0 0 56%)",
              filter: "drop-shadow(0 10px 24px rgba(42,31,23,0.18)) drop-shadow(0 0 18px rgba(217,184,103,0.35))",
            }}
          />
          {/* Flame replaces the I column. Slightly taller + wider than the
              gap so the plume licks up past the top of the letters. */}
          <div
            style={{
              position: "absolute",
              left: "34%",
              width: "25%",
              top: "-15%",
              bottom: "-2%",
              pointerEvents: "none",
            }}
          >
            <LogoFlame />
          </div>
        </div>

        {/* Portal title */}
        <h1 style={{
          margin: "0 0 6px",
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: -0.3,
          color: L.espresso,
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}>
          Enish Employee Portal
        </h1>

        {/* Subtitle */}
        <p
          style={{
            color: L.gold,
            fontSize: 10,
            letterSpacing: 4,
            textTransform: "uppercase",
            marginTop: 0,
            marginBottom: 26,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 600,
          }}
        >
          Enter PIN to continue
        </p>

        {/* Card */}
        <div
          className={`pin-card${shake ? " pin-shake" : ""}`}
          style={{
            background: L.cream,
            border: `1px solid ${L.border}`,
            borderRadius: 20,
            padding: "24px 24px 28px",
            boxShadow: `0 1px 2px rgba(42,31,23,0.05), 0 24px 48px -20px rgba(42,31,23,0.2), inset 0 1px 0 rgba(255,255,255,0.6)`,
          }}
        >
          <PinDots length={pin.length} />

          {error ? (
            <p
              style={{
                color: L.rose,
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

        {/* Footer attribution */}
        <p style={{
          marginTop: 22,
          fontSize: 10,
          letterSpacing: 2.5,
          textTransform: "uppercase",
          color: L.taupeMuted,
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}>
          ENISH USA · Hospitality
        </p>
      </div>
    </div>
  );
}
