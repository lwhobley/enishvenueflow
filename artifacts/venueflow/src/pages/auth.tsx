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
        {/* ENISH logo — base static + flame-clipped animated layer */}
        <div style={{ marginBottom: 20, position: "relative", display: "inline-block" }}>
          <svg style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden>
            <defs>
              <filter id="flame-wobble" x="-20%" y="-30%" width="140%" height="160%" colorInterpolationFilters="sRGB">
                <feTurbulence type="turbulence" baseFrequency="0.018 0.08" numOctaves="3" seed="5" result="noise">
                  <animate attributeName="baseFrequency" values="0.018 0.08;0.032 0.12;0.022 0.09;0.014 0.07;0.028 0.11;0.018 0.08" dur="0.55s" repeatCount="indefinite" />
                  <animate attributeName="seed" values="5;12;7;19;3;5" dur="2.4s" repeatCount="indefinite" />
                </feTurbulence>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" result="displaced" />
                <feComposite in="displaced" in2="SourceGraphic" operator="atop" />
              </filter>
            </defs>
          </svg>

          <img
            src={enoshLogo}
            alt="ENISH"
            className="auth-logo"
            style={{
              filter: "drop-shadow(0 10px 24px rgba(42,31,23,0.18)) drop-shadow(0 0 18px rgba(217,184,103,0.35))",
            }}
          />

          <div
            style={{
              position: "absolute",
              inset: 0,
              clipPath: "inset(0 44% 0 37%)",
              pointerEvents: "none",
              overflow: "visible",
            }}
          >
            <img
              src={enoshLogo}
              alt=""
              aria-hidden
              className="auth-logo logo-flame-dance"
              style={{
                transformOrigin: "50% 88%",
              }}
            />
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
