import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Check, AlertCircle } from "lucide-react";

type Info = { venueId: string; venueName: string; positions: string[] };

const POSITION_LABELS: Record<string, string> = {
  bartender: "Bartender",
  server: "Server",
  dishwasher: "Dishwasher",
  busser: "Busser",
  cleaner: "Cleaner",
  host: "Host",
  cook: "Cook",
  "hookah tech": "Hookah Tech",
};

// VenueFlow brand palette — variable names kept.
const L = {
  cream: "#FFFFFF",
  parchment: "#EAF4F8",
  border: "rgba(38,78,122,0.16)",
  gold: "#1F9CC2",
  espresso: "#142849",
  taupe: "rgba(20,40,73,0.56)",
  rose: "#DC2626",
};

export default function EnrollPage() {
  const [, params] = useRoute<{ venueId: string; token: string }>("/enroll/:venueId/:token");

  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ fullName: string; venueName: string } | null>(null);

  useEffect(() => {
    if (!params) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/enroll/${params.venueId}/${params.token}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message ?? "Invalid enrollment link");
        }
        const data = (await res.json()) as Info;
        if (!cancelled) {
          setInfo(data);
          setPosition(data.positions[0] ?? "");
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load enrollment link");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params?.venueId, params?.token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!params || !info) return;
    setSubmitError(null);

    if (!/^\d{4,8}$/.test(pin)) {
      setSubmitError("PIN must be 4–8 digits");
      return;
    }
    if (pin !== pinConfirm) {
      setSubmitError("PIN and confirmation must match");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/enroll/${params.venueId}/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          position,
          pin,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; fullName?: string };
      if (!res.ok) {
        throw new Error(body.message ?? `Enrollment failed (${res.status})`);
      }
      setSuccess({ fullName: body.fullName ?? fullName.trim(), venueName: info.venueName });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Enrollment failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        background: `linear-gradient(135deg, #FFFFFF 0%, #EAF4F8 100%)`,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: "100%",
          maxWidth: 520,
          background: L.cream,
          border: `1px solid ${L.border}`,
          borderRadius: 20,
          padding: "32px 28px",
          boxShadow: "0 1px 2px rgba(42,31,23,0.04), 0 24px 56px -24px rgba(42,31,23,0.2)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute", top: -80, right: -80, width: 260, height: 260, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(217,184,103,0.35) 0%, rgba(217,184,103,0) 65%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: L.gold, fontWeight: 600 }}>
            Team Enrollment
          </div>

          {loading ? (
            <div className="flex items-center gap-2 mt-4 text-sm" style={{ color: L.taupe }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Loading your invitation…
            </div>
          ) : loadError ? (
            <InvalidLinkNotice message={loadError} />
          ) : success ? (
            <SuccessPanel fullName={success.fullName} venueName={success.venueName} />
          ) : info ? (
            <>
              <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.5, color: L.espresso, marginTop: 8, marginBottom: 0 }}>
                Welcome to <span style={{ color: L.gold }}>{info.venueName}</span>
              </h1>
              <p style={{ marginTop: 8, marginBottom: 20, fontSize: 14, color: L.taupe }}>
                Create your staff login. You'll use your PIN to sign in on the floor.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="en-name">Full name</Label>
                  <Input
                    id="en-name" value={fullName} onChange={(e) => setFullName(e.target.value)}
                    required autoComplete="name"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="en-email">Email</Label>
                    <Input
                      id="en-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      required autoComplete="email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="en-phone">Phone (optional)</Label>
                    <Input
                      id="en-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="en-pos">Position</Label>
                  <Select value={position} onValueChange={setPosition}>
                    <SelectTrigger id="en-pos"><SelectValue placeholder="Choose your position" /></SelectTrigger>
                    <SelectContent>
                      {info.positions.map((p) => (
                        <SelectItem key={p} value={p}>{POSITION_LABELS[p] ?? p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="en-pin">Create PIN (4–8 digits)</Label>
                    <Input
                      id="en-pin" type="password" inputMode="numeric" pattern="\d{4,8}"
                      value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      required autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="en-pin2">Confirm PIN</Label>
                    <Input
                      id="en-pin2" type="password" inputMode="numeric" pattern="\d{4,8}"
                      value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      required autoComplete="new-password"
                    />
                  </div>
                </div>

                {submitError ? (
                  <div
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 8,
                      padding: "10px 12px", borderRadius: 10,
                      background: "rgba(138,61,61,0.08)",
                      border: `1px solid rgba(138,61,61,0.26)`,
                      color: L.rose, fontSize: 13,
                    }}
                  >
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{submitError}</span>
                  </div>
                ) : null}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enrolling…</>
                  ) : (
                    <>Create account</>
                  )}
                </Button>

                <p style={{ fontSize: 11, color: L.taupe, textAlign: "center", marginTop: 4 }}>
                  By enrolling you'll be added as a team member. Manager and admin permissions are assigned separately.
                </p>
              </form>
            </>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}

function InvalidLinkNotice({ message }: { message: string }) {
  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 600, color: L.espresso, marginTop: 8, marginBottom: 0 }}>
        This invitation isn't valid
      </h1>
      <p style={{ marginTop: 8, fontSize: 14, color: L.taupe }}>{message}</p>
      <p style={{ marginTop: 12, fontSize: 13, color: L.taupe }}>
        Ask your manager for a current link.
      </p>
    </>
  );
}

function SuccessPanel({ fullName, venueName }: { fullName: string; venueName: string }) {
  return (
    <>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(135deg, #DDE5CC 0%, #C1CFA5 100%)",
        boxShadow: "inset 0 0 0 1px rgba(108,138,78,0.25)",
        marginTop: 8, marginBottom: 12,
      }}>
        <Check size={20} color="#4E6630" strokeWidth={2.5} />
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 600, color: L.espresso, marginBottom: 0 }}>
        You're on the team, {fullName.split(" ")[0]}.
      </h1>
      <p style={{ marginTop: 8, fontSize: 14, color: L.taupe }}>
        You've been added to <strong style={{ color: L.espresso }}>{venueName}</strong>. Head to the sign-in
        screen and enter the PIN you just created to log in.
      </p>
      <Link
        href="/"
        onClick={(e) => {
          // Force a full reload so the auth wall re-evaluates.
          e.preventDefault();
          window.location.href = "/";
        }}
      >
        <Button className="mt-6 w-full">Go to sign-in</Button>
      </Link>
    </>
  );
}
