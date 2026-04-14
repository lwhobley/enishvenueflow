import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import enoshLogo from "@assets/IMG_2588_1776205200027.png";

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

function FireBurn({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const W = canvas.width;
    const H = canvas.height;

    type FireP = {
      x: number; y: number;
      vx: number; vy: number;
      size: number; life: number; maxLife: number;
    };

    const fireParticles: FireP[] = [];
    let progress = 0;
    let animId: number;

    function spawnFire(count: number) {
      for (let i = 0; i < count; i++) {
        const x = Math.random() * W;
        const startY = H - (progress * H * 1.2);
        fireParticles.push({
          x,
          y: startY + Math.random() * 60,
          vx: (Math.random() - 0.5) * 4,
          vy: -(Math.random() * 5 + 3),
          size: Math.random() * 28 + 8,
          life: 0,
          maxLife: 30 + Math.random() * 40,
        });
      }
    }

    function draw() {
      progress = Math.min(1, progress + 0.018);
      ctx.clearRect(0, 0, W, H);

      const burnY = H - progress * H * 1.3;

      if (burnY < H) {
        const grad = ctx.createLinearGradient(0, H, 0, burnY - 100);
        grad.addColorStop(0, "rgba(20,4,0,0.98)");
        grad.addColorStop(0.4, "rgba(120,20,0,0.95)");
        grad.addColorStop(0.7, "rgba(220,60,0,0.8)");
        grad.addColorStop(0.85, "rgba(255,160,0,0.6)");
        grad.addColorStop(1, "rgba(255,220,80,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, burnY - 100, W, H - burnY + 100);
      }

      spawnFire(Math.floor(progress * 25) + 5);

      for (let i = fireParticles.length - 1; i >= 0; i--) {
        const p = fireParticles[i];
        p.x += p.vx + Math.sin(p.life * 0.3) * 1.5;
        p.y += p.vy;
        p.vy += 0.08;
        p.size *= 0.965;
        p.life++;
        if (p.life > p.maxLife || p.size < 1) { fireParticles.splice(i, 1); continue; }

        const t = p.life / p.maxLife;
        const alpha = t < 0.15 ? t / 0.15 : 1 - t;
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        gradient.addColorStop(0, `rgba(255,240,100,${alpha * 0.9})`);
        gradient.addColorStop(0.3, `rgba(255,100,0,${alpha * 0.8})`);
        gradient.addColorStop(0.6, `rgba(200,20,0,${alpha * 0.5})`);
        gradient.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      if (progress < 1) {
        animId = requestAnimationFrame(draw);
      } else {
        ctx.fillStyle = "rgba(10,2,0,0.95)";
        ctx.fillRect(0, 0, W, H);
      }
    }

    draw();
    return () => cancelAnimationFrame(animId);
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 20, pointerEvents: "none" }}
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, width: 228, margin: "0 auto" }}>
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
  const [burning, setBurning] = useState(false);
  const [shake, setShake] = useState(false);
  const { login } = useAuth();

  const verify = useCallback(async (pinToCheck: string) => {
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinToCheck }),
      });
      if (res.ok) {
        const user = await res.json();
        setBurning(true);
        setTimeout(() => login(user), 1600);
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
  }, [login]);

  const handleKey = useCallback(async (k: string) => {
    if (burning) return;
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
  }, [pin, burning, verify]);

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
      <FireBurn active={burning} />

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
          opacity: burning ? 0 : 1,
          transition: burning ? "opacity 0.6s ease 0.6s" : "none",
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
            style={{
              height: 80,
              width: "auto",
              display: "block",
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
              className="logo-flame-dance"
              style={{
                height: 80,
                width: "auto",
                display: "block",
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
          className={shake ? "pin-shake" : ""}
          style={{
            background: "rgba(12,6,4,0.72)",
            border: "1px solid rgba(201,162,39,0.15)",
            borderRadius: 16,
            padding: "24px 28px 28px",
            backdropFilter: "blur(20px)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,162,39,0.06)",
            width: 284,
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

          <Keypad onPress={handleKey} disabled={burning} />
        </div>
      </div>
    </div>
  );
}
