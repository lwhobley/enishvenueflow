import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth, type AuthUser } from "@/contexts/auth-context";
import enoshLogo from "@assets/IMG_2588_1776205200027.png";
import igniteVideo from "@assets/Enish_Logo_Igniting_Video_Creation.mp4";

function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    type Orb = { x: number; y: number; vx: number; vy: number; r: number; color: [number, number, number] };
    const orbs: Orb[] = [
      { x: width * 0.2, y: height * 0.3, vx: 0.3, vy: 0.15, r: 320, color: [180, 18, 8] },
      { x: width * 0.8, y: height * 0.6, vx: -0.25, vy: 0.2, r: 280, color: [160, 90, 8] },
      { x: width * 0.5, y: height * 0.8, vx: 0.15, vy: -0.3, r: 240, color: [200, 30, 10] },
      { x: width * 0.1, y: height * 0.7, vx: 0.4, vy: -0.1, r: 200, color: [140, 60, 5] },
      { x: width * 0.9, y: height * 0.2, vx: -0.2, vy: 0.35, r: 260, color: [190, 15, 5] },
    ];

    type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number };
    const particles: Particle[] = [];

    function spawnParticle() {
      particles.push({
        x: Math.random() * width,
        y: height + 10,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -(Math.random() * 1.5 + 0.5),
        life: 0,
        maxLife: 80 + Math.random() * 120,
        size: Math.random() * 3 + 1,
      });
    }

    let frame = 0;
    let glitchTimer = 0;
    let animId: number;

    ctx.fillStyle = "#060404";
    ctx.fillRect(0, 0, width, height);

    function draw() {
      frame++;
      glitchTimer++;

      ctx.fillStyle = "rgba(6, 4, 4, 0.06)";
      ctx.fillRect(0, 0, width, height);

      for (const orb of orbs) {
        orb.x += orb.vx;
        orb.y += orb.vy;
        if (orb.x < -orb.r) orb.x = width + orb.r;
        if (orb.x > width + orb.r) orb.x = -orb.r;
        if (orb.y < -orb.r) orb.y = height + orb.r;
        if (orb.y > height + orb.r) orb.y = -orb.r;

        const g = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r);
        g.addColorStop(0, `rgba(${orb.color[0]},${orb.color[1]},${orb.color[2]},0.13)`);
        g.addColorStop(0.5, `rgba(${orb.color[0]},${orb.color[1]},${orb.color[2]},0.05)`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }

      if (frame % 3 === 0) spawnParticle();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
        if (p.life > p.maxLife) { particles.splice(i, 1); continue; }
        const t = p.life / p.maxLife;
        const alpha = t < 0.1 ? t * 10 * 0.4 : t > 0.8 ? (1 - t) * 5 * 0.4 : 0.4;
        const r = Math.round(220 + t * 35);
        const g = Math.round(60 - t * 50);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},0,${alpha})`;
        ctx.fill();
      }

      if (glitchTimer > 45 && Math.random() < 0.04) {
        glitchTimer = 0;
        const count = Math.floor(Math.random() * 4) + 1;
        for (let i = 0; i < count; i++) {
          const sy = Math.random() * height;
          const sh = Math.random() * 4 + 1;
          const dx = (Math.random() - 0.5) * 40;
          try {
            const data = ctx.getImageData(0, sy, width, sh);
            ctx.putImageData(data, dx, sy);
          } catch {}
        }
        ctx.fillStyle = `rgba(${Math.random() > 0.5 ? "200,50,0" : "180,130,0"},0.04)`;
        ctx.fillRect(0, Math.random() * height, width, Math.random() * 2 + 1);
      }

      if (frame % 2 === 0) {
        ctx.fillStyle = "rgba(0,0,0,0.025)";
        for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1);
      }

      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0 }}
    />
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

    // Try to play with audio (PIN confirm was a user gesture, so most browsers
    // allow it). If the browser still blocks unmuted autoplay, fall back to muted.
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
          // Can't play at all — don't trap the user on the transition.
          if (!cancelled) finish();
        }
      }
    };
    void tryPlay();

    // Hard safety net: if the video never fires "ended" (codec issue, stalled
    // network, etc.), advance anyway after its nominal duration + a small buffer.
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
        // `contain` keeps the whole frame in view on narrow phone
        // viewports — previously `cover` cropped the sides and made
        // the video feel clipped. The surrounding background is #000
        // so any letterbox bars blend in seamlessly.
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
    <div style={{ display: "flex", gap: 14, justifyContent: "center", margin: "20px 0" }}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: i < length ? "#CC1100" : "transparent",
            border: `2px solid ${i < length ? "#CC1100" : "rgba(201,162,39,0.45)"}`,
            transition: "all 0.12s ease",
            boxShadow: i < length ? "0 0 10px rgba(204,17,0,0.7), 0 0 20px rgba(204,17,0,0.3)" : "none",
          }}
        />
      ))}
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
        return (
          <button
            key={k}
            disabled={disabled}
            onClick={() => onPress(k)}
            style={{
              height: 58,
              borderRadius: 10,
              border: `1px solid ${isConfirm ? "rgba(204,17,0,0.45)" : "rgba(201,162,39,0.18)"}`,
              background: isConfirm
                ? "rgba(180,15,0,0.28)"
                : "rgba(201,162,39,0.07)",
              color: isAction ? (isConfirm ? "#FF4422" : "#C9A227") : "rgba(201,162,39,0.88)",
              fontSize: isAction ? 18 : 20,
              fontWeight: 700,
              cursor: disabled ? "default" : "pointer",
              backdropFilter: "blur(6px)",
              transition: "background 0.1s, transform 0.08s",
              fontFamily: "system-ui, sans-serif",
              opacity: disabled ? 0.4 : 1,
            }}
            onMouseDown={(e) => { (e.currentTarget.style.transform = "scale(0.94)"); }}
            onMouseUp={(e) => { (e.currentTarget.style.transform = "scale(1)"); }}
            onMouseLeave={(e) => { (e.currentTarget.style.transform = "scale(1)"); }}
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
        // Hand the user to the transition component; login() fires when the
        // ignite video finishes (or errors / times out).
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
    <div style={{ position: "fixed", inset: 0, zIndex: 50, overflow: "hidden" }}>
      <AuroraBackground />
      <LoginVideoTransition
        active={transitioning}
        onFinish={() => {
          if (pendingUser) login(pendingUser);
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 0,
          opacity: transitioning ? 0 : 1,
          transition: transitioning ? "opacity 0.4s ease" : "none",
        }}
      >
        {/* ENISH logo — base static + flame-clipped animated layer */}
        <div style={{ marginBottom: 36, position: "relative", display: "inline-block" }}>
          {/* Hidden SVG filter definitions */}
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

          {/* Static base — the full logo, always visible */}
          <img
            src={enoshLogo}
            alt="ENISH"
            className="auth-logo"
            style={{
              filter: "drop-shadow(0 0 28px rgba(201,162,39,0.4)) drop-shadow(0 0 10px rgba(204,17,0,0.25))",
            }}
          />

          {/* Animated flame layer — same image, clipped to the flame column, turbulence filter applied */}
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

        {/* Tagline */}
        <p
          style={{
            color: "rgba(201,162,39,0.45)",
            fontSize: 10,
            letterSpacing: 5,
            textTransform: "uppercase",
            marginBottom: 28,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Enter PIN to continue
        </p>

        {/* Card */}
        <div
          className={`pin-card${shake ? " pin-shake" : ""}`}
          style={{
            background: "rgba(12,6,4,0.72)",
            border: "1px solid rgba(201,162,39,0.15)",
            borderRadius: 16,
            padding: "24px 28px 28px",
            backdropFilter: "blur(20px)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,162,39,0.06)",
          }}
        >
          <PinDots length={pin.length} />

          {error ? (
            <p
              style={{
                color: "#FF4422",
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
      </div>
    </div>
  );
}
